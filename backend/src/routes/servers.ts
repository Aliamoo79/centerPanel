import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { requireAdmin, AuthedRequest } from "../middleware/auth";
import { getAdapter } from "../adapters";
import { asyncHandler } from "../lib/asyncHandler";
import { logger } from "../lib/logger";
import { describePanelError } from "../lib/errors";

export const serversRouter = Router();
serversRouter.use(requireAdmin);

const serverSchema = z.object({
  name: z.string().min(1),
  panelType: z.enum(["THREEXUI", "X4G", "NAHAN"]),
  baseUrl: z.string().url(),
  username: z.string().optional(),
  password: z.string().optional(),
  extra: z.record(z.any()).optional(),
  // Custom remark shown to the user for every config from this server, e.g.
  // "mci-x4g" -> configs are labeled "mci-x4g-<username>". Empty/omitted
  // keeps whatever remark the panel itself generated.
  remarkPrefix: z.string().trim().max(64).optional(),
});

function validateCredentials(data: { panelType: string; username?: string; password?: string; extra?: Record<string, any> }): string | null {
  if (data.panelType === "THREEXUI" && data.extra?.authMethod === "token") return null;
  if (data.panelType === "X4G" || data.panelType === "NAHAN") {
    if (!data.password) return "رمز عبور/کلید پنل الزامی است";
    return null;
  }
  if (!data.username || !data.password) return "نام کاربری و رمز عبور برای این نوع پنل الزامی است";
  return null;
}

function cleanExtra(extra?: Record<string, any>): string | null {
  if (!extra || Object.keys(extra).length === 0) return null;
  return JSON.stringify(extra);
}

function toPublic(server: any) {
  // never send the panel password back to the client
  const { password, ...rest } = server;
  let extra: Record<string, any> | null = null;
  if (rest.extra) {
    try {
      extra = typeof rest.extra === "string" ? JSON.parse(rest.extra) : rest.extra;
    } catch {
      extra = null;
    }
  }
  return { ...rest, extra, hasPassword: Boolean(password) };
}

serversRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const servers = await prisma.server.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { links: true } } },
    });
    res.json(servers.map(toPublic));
  })
);

serversRouter.post(
  "/",
  asyncHandler(async (req: AuthedRequest, res) => {
    const parsed = serverSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const credErr = validateCredentials(parsed.data);
    if (credErr) return res.status(400).json({ error: credErr });

    const server = await prisma.server.create({
      data: {
        name: parsed.data.name,
        panelType: parsed.data.panelType,
        baseUrl: parsed.data.baseUrl,
        username: parsed.data.username ?? "",
        password: parsed.data.password ?? "",
        extra: cleanExtra(parsed.data.extra),
        remarkPrefix: parsed.data.remarkPrefix || null,
      },
    });
    logger.info("server_created", `سرور «${server.name}» (${server.panelType}) اضافه شد`, {
      serverId: server.id,
      admin: req.admin?.username,
    });
    res.status(201).json(toPublic(server));
  })
);

// Update a server — this is the "تعویض آدرس سرور" endpoint. Because every
// user's link only stores serverId + remoteId, changing baseUrl (or
// credentials, or even panelType) here immediately applies to every user
// on that server with zero other changes needed.
serversRouter.patch(
  "/:id",
  asyncHandler(async (req: AuthedRequest, res) => {
    const existing = await prisma.server.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: "سرور مورد نظر پیدا نشد" });

    const parsed = serverSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const { extra, ...rest } = parsed.data;
    const server = await prisma.server.update({
      where: { id: req.params.id },
      data: {
        ...(rest.name !== undefined ? { name: rest.name } : {}),
        ...(rest.panelType !== undefined ? { panelType: rest.panelType } : {}),
        ...(rest.baseUrl !== undefined ? { baseUrl: rest.baseUrl } : {}),
        ...(rest.username !== undefined ? { username: rest.username } : {}),
        ...(rest.password !== undefined ? { password: rest.password } : {}),
        ...(rest.remarkPrefix !== undefined ? { remarkPrefix: rest.remarkPrefix || null } : {}),
        ...(extra !== undefined ? { extra: cleanExtra(extra) } : {}),
      },
    });
    logger.info("server_updated", `سرور «${server.name}» ویرایش شد`, { serverId: server.id, admin: req.admin?.username });
    res.json(toPublic(server));
  })
);

// Temporarily disable or restore every user configuration attached to this
// server. The per-user link preference is kept intact so re-enabling the
// server does not restore users who were individually disabled.
serversRouter.patch(
  "/:id/status",
  asyncHandler(async (req: AuthedRequest, res) => {
    const parsed = z.object({ enabled: z.boolean() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const server = await prisma.server.findUnique({
      where: { id: req.params.id },
      include: { links: true },
    });
    if (!server) return res.status(404).json({ error: "سرور مورد نظر پیدا نشد" });

    const enable = parsed.data.enabled;
    const targetStatus = enable ? "ACTIVE" : "DISABLED";
    const links = server.links.filter((link) => link.enabled);

    // Block new polling/config requests immediately while remote state is
    // being fanned out to every linked account.
    if (!enable) {
      await prisma.server.update({ where: { id: server.id }, data: { status: targetStatus } });
    }

    const results = await Promise.allSettled(links.map(async (link) => {
      const adapter = getAdapter(server.panelType as any, server);
      const remoteExtra = link.remoteExtra ? JSON.parse(link.remoteExtra) : null;
      await adapter.setEnabled(link.remoteId, enable, remoteExtra);
    }));
    const failures = results
      .map((result, index) => result.status === "rejected"
        ? { userLinkId: links[index].id, error: describePanelError(result.reason) }
        : null)
      .filter(Boolean);

    if (enable && failures.length > 0) {
      return res.status(502).json({
        error: "برخی کاربران روی پنل فعال نشدند؛ سرور همچنان غیرفعال است",
        failures,
      });
    }

    const updated = await prisma.server.update({
      where: { id: server.id },
      data: { status: targetStatus },
    });
    logger.info(
      enable ? "server_enabled" : "server_disabled",
      `سرور «${server.name}» برای ${links.length} کاربر ${enable ? "فعال" : "غیرفعال"} شد`,
      { serverId: server.id, failedCount: failures.length, admin: req.admin?.username },
    );
    res.json({ ...toPublic(updated), failures });
  })
);

serversRouter.delete(
  "/:id",
  asyncHandler(async (req: AuthedRequest, res) => {
    const existing = await prisma.server.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: "سرور مورد نظر پیدا نشد" });

    await prisma.server.delete({ where: { id: req.params.id } });
    logger.warn("server_deleted", `سرور «${existing.name}» حذف شد`, { serverId: existing.id, admin: req.admin?.username });
    res.status(204).end();
  })
);

serversRouter.post(
  "/:id/test",
  asyncHandler(async (req, res) => {
    const server = await prisma.server.findUnique({ where: { id: req.params.id } });
    if (!server) return res.status(404).json({ error: "سرور مورد نظر پیدا نشد" });

    const adapter = getAdapter(server.panelType as any, server);
    const result = await adapter.testConnection();
    if (!result.ok) {
      logger.warn("server_test_failed", `تست اتصال به «${server.name}» ناموفق بود: ${result.message ?? ""}`, {
        serverId: server.id,
        panelType: server.panelType,
      });
    }
    res.json(result);
  })
);
