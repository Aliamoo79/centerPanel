import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { requireAdmin, AuthedRequest } from "../middleware/auth";
import { getAdapter } from "../adapters";
import { syncAllUserUsage, syncUserUsage } from "../services/usage";
import { asyncHandler } from "../lib/asyncHandler";
import { logger } from "../lib/logger";
import { describePanelError } from "../lib/errors";
import { randomInt } from "crypto";

export const usersRouter = Router();
usersRouter.use(requireAdmin);

const createUserSchema = z.object({
  username: z.string().trim().min(3),
  referrerId: z.string().nullable().optional(),
  note: z.string().optional(),
  dataLimitGB: z.number().positive().nullable().optional(),
  expireAt: z.string().datetime().nullable().optional(), // ISO string
  ipLimit: z.number().int().positive().nullable().optional(),
  serverIds: z.array(z.string()).min(1, "حداقل یک سرور باید انتخاب شود"),
});

function publicBaseUrl() {
  return process.env.PUBLIC_BASE_URL ?? "http://localhost:4000";
}

function toPublicUser(user: any) {
  return { ...user, subLink: `${publicBaseUrl()}/sub/${user.subToken}` };
}

async function makeInternalUsername(displayName: string) {
  const base = displayName.trim().replace(/\s+/g, "_");
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = `${base}-${randomInt(100000, 1000000)}`;
    const existing = await prisma.user.findUnique({ where: { username: candidate }, select: { id: true } });
    if (!existing) return candidate;
  }
  throw new Error("Could not generate a unique panel username");
}

usersRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    await syncAllUserUsage();
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      include: { referrer: { select: { id: true, displayName: true } }, links: { include: { server: true } } },
    });
    res.json(users.map(toPublicUser));
  })
);

usersRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: { referrer: { select: { id: true, displayName: true } }, referrals: { select: { id: true, displayName: true } }, links: { include: { server: true } } },
    });
    if (!user) return res.status(404).json({ error: "کاربر مورد نظر پیدا نشد" });

    const usage = await syncUserUsage(user.id);
    res.json({ ...toPublicUser(user), usage });
  })
);

// Creates the platform user AND provisions a real account on every
// selected server, in parallel. If one server fails to provision, the
// user is still created with whichever servers succeeded, and the
// response reports which ones failed so you can retry per-server.
usersRouter.post(
  "/",
  asyncHandler(async (req: AuthedRequest, res) => {
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { username: enteredName, referrerId, note, dataLimitGB, expireAt, ipLimit, serverIds } = parsed.data;
    const displayName = enteredName.trim();
    const username = await makeInternalUsername(displayName);

    if (referrerId) {
      const referrer = await prisma.user.findUnique({ where: { id: referrerId }, select: { id: true } });
      if (!referrer) return res.status(400).json({ error: "Referrer not found" });
    }

    const servers = await prisma.server.findMany({ where: { id: { in: serverIds } } });
    if (servers.length === 0) return res.status(400).json({ error: "هیچ سروری پیدا نشد" });

    const user = await prisma.user.create({
      data: {
        username,
        displayName,
        referrerId: referrerId ?? null,
        note,
        dataLimitGB: dataLimitGB ?? null,
        expireAt: expireAt ? new Date(expireAt) : null,
        ipLimit: ipLimit ?? null,
      },
    });

    const dataLimitBytes = dataLimitGB ? dataLimitGB * 1024 * 1024 * 1024 : null;
    const expireDate = expireAt ? new Date(expireAt) : null;

    const results = await Promise.allSettled(
      servers.map(async (server: (typeof servers)[number]) => {
        const adapter = getAdapter(server.panelType as any, server);
        const { remoteId, remoteExtra } = await adapter.createUser({
          username,
          dataLimitBytes,
          expireAt: expireDate,
          ipLimit: ipLimit ?? null,
        });
        await prisma.userServerLink.create({
          data: {
            userId: user.id,
            serverId: server.id,
            remoteId,
            remoteExtra: remoteExtra ? JSON.stringify(remoteExtra) : null,
          },
        });
        return server.name;
      })
    );

    const failed = results
      .map((r, i) =>
        r.status === "rejected"
          ? { server: servers[i].name, error: describePanelError((r as any).reason) }
          : null
      )
      .filter(Boolean) as { server: string; error: string }[];

    if (failed.length > 0) {
      logger.warn("user_provision_partial_failure", `ساخت کاربر «${username}» روی برخی سرورها ناموفق بود`, {
        userId: user.id,
        username,
        failed,
        admin: req.admin?.username,
      });
    }
    logger.info("user_created", `کاربر «${username}» ساخته شد (${servers.length - failed.length}/${servers.length} سرور موفق)`, {
      userId: user.id,
      username,
      admin: req.admin?.username,
    });

    const fresh = await prisma.user.findUnique({
      where: { id: user.id },
      include: { referrer: { select: { id: true, displayName: true } }, links: { include: { server: true } } },
    });

    res.status(201).json({ ...toPublicUser(fresh), provisioningFailures: failed });
  })
);

const updateUserSchema = z.object({
  note: z.string().optional(),
  referrerId: z.string().nullable().optional(),
  dataLimitGB: z.number().positive().nullable().optional(),
  expireAt: z.string().datetime().nullable().optional(),
  ipLimit: z.number().int().positive().nullable().optional(),
  status: z.enum(["ACTIVE", "DISABLED", "EXPIRED"]).optional(),
});

usersRouter.patch(
  "/:id",
  asyncHandler(async (req: AuthedRequest, res) => {
    const parsed = updateUserSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const user = await prisma.user.findUnique({ where: { id: req.params.id }, include: { links: { include: { server: true } } } });
    if (!user) return res.status(404).json({ error: "کاربر مورد نظر پیدا نشد" });

    const { dataLimitGB, expireAt, ipLimit, status, note, referrerId } = parsed.data;
    if (referrerId === user.id) return res.status(400).json({ error: "A user cannot refer themselves" });
    if (referrerId) {
      const referrer = await prisma.user.findUnique({ where: { id: referrerId }, select: { id: true } });
      if (!referrer) return res.status(400).json({ error: "Referrer not found" });
    }
    const dataLimitBytes = dataLimitGB === undefined ? undefined : dataLimitGB ? dataLimitGB * 1024 * 1024 * 1024 : null;
    const expireDate = expireAt === undefined ? undefined : expireAt ? new Date(expireAt) : null;

    // propagate limit/expiry/ip-limit/enable changes to every provisioned server
    const results = await Promise.allSettled(
      user.links.map(async (link: any) => {
        const adapter = getAdapter(link.server.panelType as any, link.server);
        const remoteExtra = link.remoteExtra ? JSON.parse(link.remoteExtra) : null;
        if (dataLimitBytes !== undefined || expireDate !== undefined || ipLimit !== undefined) {
          await adapter.updateUser(link.remoteId, { dataLimitBytes, expireAt: expireDate, ipLimit }, remoteExtra);
        }
        if (status !== undefined) {
          await adapter.setEnabled(link.remoteId, status === "ACTIVE", remoteExtra);
        }
        return link.server.name;
      })
    );

    const failed = results
      .map((r, i) =>
        r.status === "rejected"
          ? { server: user.links[i].server.name, error: describePanelError((r as any).reason) }
          : null
      )
      .filter(Boolean) as { server: string; error: string }[];

    if (failed.length > 0) {
      logger.warn("user_update_partial_failure", `به‌روزرسانی کاربر «${user.username}» روی برخی سرورها ناموفق بود`, {
        userId: user.id,
        failed,
        admin: req.admin?.username,
      });
    }

    const updated = await prisma.user.update({
      where: { id: req.params.id },
      data: {
        note,
        ...(dataLimitBytes !== undefined ? { dataLimitGB: dataLimitBytes === null ? null : dataLimitBytes / (1024 * 1024 * 1024) } : {}),
        ...(expireDate !== undefined ? { expireAt: expireDate } : {}),
        ...(ipLimit !== undefined ? { ipLimit } : {}),
        ...(status !== undefined ? { status } : {}),
        ...(referrerId !== undefined ? { referrerId } : {}),
      },
    });

    logger.info("user_updated", `کاربر «${updated.username}» ویرایش شد`, { userId: updated.id, admin: req.admin?.username });
    res.json({ ...toPublicUser(updated), provisioningFailures: failed });
  })
);

usersRouter.delete(
  "/:id",
  asyncHandler(async (req: AuthedRequest, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.params.id }, include: { links: { include: { server: true } } } });
    if (!user) return res.status(404).json({ error: "کاربر مورد نظر پیدا نشد" });

    const results = await Promise.allSettled(
      user.links.map(async (link: any) => {
        const adapter = getAdapter(link.server.panelType as any, link.server);
        const remoteExtra = link.remoteExtra ? JSON.parse(link.remoteExtra) : null;
        await adapter.deleteUser(link.remoteId, remoteExtra);
      })
    );

    const failed = results.filter((r) => r.status === "rejected");
    if (failed.length > 0) {
      logger.warn("user_delete_panel_cleanup_failed", `حذف کاربر «${user.username}» از برخی پنل‌ها ناموفق بود (رکورد محلی حذف شد)`, {
        userId: user.id,
        failedCount: failed.length,
      });
    }

    await prisma.user.delete({ where: { id: req.params.id } });
    logger.info("user_deleted", `کاربر «${user.username}» حذف شد`, { userId: user.id, admin: req.admin?.username });
    res.status(204).end();
  })
);

// Add this user to another server after the fact (e.g. after you add a new node)
usersRouter.post(
  "/:id/servers/:serverId",
  asyncHandler(async (req: AuthedRequest, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    const server = await prisma.server.findUnique({ where: { id: req.params.serverId } });
    if (!user || !server) return res.status(404).json({ error: "کاربر یا سرور مورد نظر پیدا نشد" });

    const adapter = getAdapter(server.panelType as any, server);
    const { remoteId, remoteExtra } = await adapter.createUser({
      username: user.username,
      dataLimitBytes: user.dataLimitGB ? user.dataLimitGB * 1024 * 1024 * 1024 : null,
      expireAt: user.expireAt,
      ipLimit: user.ipLimit ?? null,
    });
    const link = await prisma.userServerLink.create({
      data: { userId: user.id, serverId: server.id, remoteId, remoteExtra: remoteExtra ? JSON.stringify(remoteExtra) : null },
    });
    logger.info("user_added_to_server", `کاربر «${user.username}» به سرور «${server.name}» اضافه شد`, {
      userId: user.id,
      serverId: server.id,
      admin: req.admin?.username,
    });
    res.status(201).json(link);
  })
);

usersRouter.delete(
  "/:id/servers/:serverId",
  asyncHandler(async (req: AuthedRequest, res) => {
    const link = await prisma.userServerLink.findUnique({
      where: { userId_serverId: { userId: req.params.id, serverId: req.params.serverId } },
      include: { server: true, user: true },
    });
    if (!link) return res.status(404).json({ error: "این کاربر روی این سرور پیدا نشد" });

    const adapter = getAdapter(link.server.panelType as any, link.server);
    const remoteExtra = link.remoteExtra ? JSON.parse(link.remoteExtra) : null;
    await adapter.deleteUser(link.remoteId, remoteExtra).catch((err) => {
      logger.warn("user_remove_from_server_panel_failed", `حذف «${link.user.username}» از پنل «${link.server.name}» ناموفق بود (رکورد محلی حذف شد)`, {
        error: describePanelError(err),
      });
    });
    await prisma.userServerLink.delete({ where: { id: link.id } });
    logger.info("user_removed_from_server", `کاربر «${link.user.username}» از سرور «${link.server.name}» حذف شد`, {
      admin: req.admin?.username,
    });
    res.status(204).end();
  })
);

// Enable/disable this user's config on ONE specific server, independent of
// the user's overall status. Useful for temporarily cutting off a single
// server (e.g. it's overloaded) without touching the user's other configs.
const toggleLinkSchema = z.object({ enabled: z.boolean() });

usersRouter.patch(
  "/:id/servers/:serverId",
  asyncHandler(async (req: AuthedRequest, res) => {
    const parsed = toggleLinkSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const link = await prisma.userServerLink.findUnique({
      where: { userId_serverId: { userId: req.params.id, serverId: req.params.serverId } },
      include: { server: true, user: true },
    });
    if (!link) return res.status(404).json({ error: "این کاربر روی این سرور پیدا نشد" });

    const adapter = getAdapter(link.server.panelType as any, link.server);
    const remoteExtra = link.remoteExtra ? JSON.parse(link.remoteExtra) : null;
    await adapter.setEnabled(link.remoteId, parsed.data.enabled, remoteExtra);

    const updated = await prisma.userServerLink.update({
      where: { id: link.id },
      data: { enabled: parsed.data.enabled },
    });
    logger.info(
      "user_server_config_toggled",
      `کانفیگ «${link.user.username}» روی سرور «${link.server.name}» ${parsed.data.enabled ? "فعال" : "غیرفعال"} شد`,
      { userId: link.userId, serverId: link.serverId, admin: req.admin?.username }
    );
    res.json(updated);
  })
);
