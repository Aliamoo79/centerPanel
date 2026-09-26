import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { requireAdmin, requireRole, AuthedRequest } from "../middleware/auth";
import { getAdapter } from "../adapters";
import { asyncHandler } from "../lib/asyncHandler";
import { logger } from "../lib/logger";
import { describePanelError } from "../lib/errors";
import { ThreeXUIAdapter } from "../adapters/threexui";

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
  alternateConfigHosts: z.string().max(2048).optional(),
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

function inboundIdsFromExtra(extra: string | Record<string, any> | null | undefined): number[] {
  let parsed: any = extra;
  if (typeof extra === "string") {
    try { parsed = JSON.parse(extra); } catch { parsed = null; }
  }
  const raw = Array.isArray(parsed?.inboundIds) ? parsed.inboundIds : [parsed?.inboundId];
  const values = raw.map((id: any) => Number(id)).filter((id: number) => Number.isInteger(id) && id > 0) as number[];
  return [...new Set<number>(values)];
}

function cleanAlternateConfigHosts(value?: string): string | null {
  if (value === undefined) return null;
  const hosts = [...new Set(value.split(/[\s,;]+/).map((host) => host.trim().toLowerCase()).filter(Boolean))];
  return hosts.length > 0 ? JSON.stringify(hosts) : null;
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
  let alternateConfigHosts: string[] = [];
  if (rest.alternateConfigHosts) {
    try {
      const parsed = typeof rest.alternateConfigHosts === "string" ? JSON.parse(rest.alternateConfigHosts) : rest.alternateConfigHosts;
      alternateConfigHosts = Array.isArray(parsed) ? parsed.filter((host): host is string => typeof host === "string") : [];
    } catch {
      alternateConfigHosts = [];
    }
  }
  return { ...rest, extra, alternateConfigHosts, hasPassword: Boolean(password) };
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

// Load selectable inbounds for the server form. A new server sends its
// credentials; an edit can use the already stored credentials via serverId.
serversRouter.post(
  "/inbounds",
  requireRole("ADMIN"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const lookupSchema = z.object({
      serverId: z.string().optional(),
      panelType: z.literal("THREEXUI").optional(),
      baseUrl: z.string().url().optional(),
      username: z.string().optional(),
      password: z.string().optional(),
      extra: z.record(z.any()).optional(),
    });
    const parsed = lookupSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const existing = parsed.data.serverId
      ? await prisma.server.findUnique({ where: { id: parsed.data.serverId } })
      : null;
    if (parsed.data.serverId && !existing) return res.status(404).json({ error: "سرور مورد نظر پیدا نشد" });
    const credentials = existing
      ? {
          baseUrl: parsed.data.baseUrl ?? existing.baseUrl,
          username: parsed.data.username ?? existing.username,
          password: parsed.data.password || existing.password,
          extra: parsed.data.extra ?? (existing.extra ? JSON.parse(existing.extra) : null),
        }
      : {
          baseUrl: parsed.data.baseUrl,
          username: parsed.data.username,
          password: parsed.data.password,
          extra: parsed.data.extra,
        };
    if (!credentials.baseUrl) return res.status(400).json({ error: "آدرس پنل الزامی است" });
    const adapter = new ThreeXUIAdapter({
      baseUrl: credentials.baseUrl,
      username: credentials.username ?? "",
      password: credentials.password ?? "",
      extra: credentials.extra ?? null,
    });
    if (!adapter.listInbounds) return res.status(400).json({ error: "این پنل امکان دریافت inboundها را ندارد" });
    res.json(await adapter.listInbounds());
  })
);

serversRouter.post(
  "/",
  requireRole("ADMIN"),
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
        alternateConfigHosts: cleanAlternateConfigHosts(parsed.data.alternateConfigHosts),
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
  requireRole("ADMIN"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const existing = await prisma.server.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: "سرور مورد نظر پیدا نشد" });

    const parsed = serverSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const { extra, ...rest } = parsed.data;
    const inboundSelectionChanged = (rest.panelType === "THREEXUI" || (rest.panelType === undefined && existing.panelType === "THREEXUI"))
      && (extra?.inboundIds !== undefined || extra?.inboundId !== undefined);
    const nextInboundIds = inboundSelectionChanged ? inboundIdsFromExtra(extra) : [];
    const inboundIdsChanged = inboundSelectionChanged && JSON.stringify(inboundIdsFromExtra(existing.extra)) !== JSON.stringify(nextInboundIds);
    const server = await prisma.server.update({
      where: { id: req.params.id },
      data: {
        ...(rest.name !== undefined ? { name: rest.name } : {}),
        ...(rest.panelType !== undefined ? { panelType: rest.panelType } : {}),
        ...(rest.baseUrl !== undefined ? { baseUrl: rest.baseUrl } : {}),
        ...(rest.username !== undefined ? { username: rest.username } : {}),
        ...(rest.password !== undefined ? { password: rest.password } : {}),
        ...(rest.remarkPrefix !== undefined ? { remarkPrefix: rest.remarkPrefix || null } : {}),
        ...(rest.alternateConfigHosts !== undefined ? { alternateConfigHosts: cleanAlternateConfigHosts(rest.alternateConfigHosts) } : {}),
        ...(extra !== undefined ? { extra: cleanExtra(extra) } : {}),
      },
    });
    logger.info("server_updated", `سرور «${server.name}» ویرایش شد`, { serverId: server.id, admin: req.admin?.username });
    const inboundSyncFailures: { userLinkId: string; error: string }[] = [];
    if (inboundIdsChanged && nextInboundIds.length > 0) {
      const links = await prisma.userServerLink.findMany({ where: { serverId: server.id } });
      const adapter = getAdapter("THREEXUI", server);
      for (const link of links) {
        try {
          const remoteExtra = link.remoteExtra ? JSON.parse(link.remoteExtra) : null;
          if (adapter.syncUserInbounds) await adapter.syncUserInbounds(link.remoteId, nextInboundIds, remoteExtra);
          await prisma.userServerLink.update({
            where: { id: link.id },
            data: { remoteExtra: JSON.stringify({ ...(remoteExtra ?? {}), inboundIds: nextInboundIds, inboundId: nextInboundIds[0] }) },
          });
        } catch (err: any) {
          inboundSyncFailures.push({ userLinkId: link.id, error: describePanelError(err) });
        }
      }
    }
    res.json({ ...toPublic(server), inboundSyncFailures });
  })
);

// Temporarily disable or restore every user configuration attached to this
// server. The per-user link preference is kept intact so re-enabling the
// server does not restore users who were individually disabled.
serversRouter.patch(
  "/:id/status",
  requireRole("ADMIN"),
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

// Provision this server for every user that is not already linked to it.
serversRouter.post(
  "/:id/users",
  requireRole("ADMIN"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const server = await prisma.server.findUnique({ where: { id: req.params.id } });
    if (!server) return res.status(404).json({ error: "سرور مورد نظر پیدا نشد" });
    if (server.status !== "ACTIVE") return res.status(400).json({ error: "ابتدا سرور را فعال کنید" });

    const [users, existingLinks] = await Promise.all([
      prisma.user.findMany({ orderBy: { createdAt: "asc" } }),
      prisma.userServerLink.findMany({ where: { serverId: server.id }, select: { userId: true } }),
    ]);
    const linkedUserIds = new Set(existingLinks.map((link) => link.userId));
    const adapter = getAdapter(server.panelType as any, server);
    const added: string[] = [];
    const skipped: string[] = [];
    const failed: { user: string; error: string }[] = [];

    for (const user of users) {
      if (linkedUserIds.has(user.id)) {
        skipped.push(user.username);
        continue;
      }
      try {
        const { remoteId, remoteExtra } = await adapter.createUser({
          username: user.username,
          dataLimitBytes: user.dataLimitGB ? user.dataLimitGB * 1024 * 1024 * 1024 : null,
          expireAt: user.expireAt,
          ipLimit: user.ipLimit ?? null,
        });
        await prisma.userServerLink.create({
          data: {
            userId: user.id,
            serverId: server.id,
            remoteId,
            remoteExtra: remoteExtra ? JSON.stringify(remoteExtra) : null,
          },
        });
        added.push(user.username);
      } catch (err: any) {
        failed.push({ user: user.username, error: describePanelError(err) });
      }
    }

    logger.info("server_added_to_all_users", `سرور «${server.name}» برای کاربران provision شد`, {
      serverId: server.id,
      addedCount: added.length,
      skippedCount: skipped.length,
      failedCount: failed.length,
      admin: req.admin?.username,
    });
    res.json({ added, skipped, failed });
  })
);

// Remove this server from every user without deleting the server definition.
serversRouter.delete(
  "/:id/users",
  requireRole("ADMIN"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const server = await prisma.server.findUnique({ where: { id: req.params.id } });
    if (!server) return res.status(404).json({ error: "سرور مورد نظر پیدا نشد" });

    const links = await prisma.userServerLink.findMany({
      where: { serverId: server.id },
      include: { user: { include: { links: { include: { server: true } } } } },
    });
    const adapter = getAdapter(server.panelType as any, server);
    const removed: string[] = [];
    const failed: { user: string; error: string }[] = [];

    for (const link of links) {
      try {
        const remoteAccountStillUsed = link.user.links.some((other) => {
          if (other.id === link.id) return false;
          if (other.server.panelType !== server.panelType) return false;
          if (other.server.baseUrl.replace(/\/$/, "").toLowerCase() !== server.baseUrl.replace(/\/$/, "").toLowerCase()) return false;
          return other.remoteId === link.remoteId;
        });
        if (!remoteAccountStillUsed) {
          const remoteExtra = link.remoteExtra ? JSON.parse(link.remoteExtra) : null;
          await adapter.deleteUser(link.remoteId, remoteExtra);
        }
        await prisma.userServerLink.delete({ where: { id: link.id } });
        removed.push(link.user.username);
      } catch (err: any) {
        failed.push({ user: link.user.username, error: describePanelError(err) });
      }
    }

    logger.info("server_removed_from_all_users", `سرور «${server.name}» از کاربران حذف شد`, {
      serverId: server.id,
      removedCount: removed.length,
      failedCount: failed.length,
      admin: req.admin?.username,
    });
    res.json({ removed, failed });
  })
);

serversRouter.delete(
  "/:id",
  requireRole("ADMIN"),
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
  requireRole("ADMIN"),
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
