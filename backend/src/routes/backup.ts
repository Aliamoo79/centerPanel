import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { requireAdmin, AuthedRequest } from "../middleware/auth";
import { asyncHandler } from "../lib/asyncHandler";
import { logger } from "../lib/logger";

export const backupRouter = Router();
backupRouter.use(requireAdmin);

const dateValue = z.string().datetime().nullable();
const serverSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  panelType: z.enum(["MARZBAN", "THREEXUI", "HIDDIFY", "X4G", "NAHAN"]),
  baseUrl: z.string(),
  username: z.string(),
  password: z.string(),
  extra: z.string().nullable(),
  remarkPrefix: z.string().nullable(),
  status: z.enum(["ACTIVE", "DISABLED"]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
const userSchema = z.object({
  id: z.string().min(1),
  username: z.string(),
  displayName: z.string(),
  referrerId: z.string().nullable(),
  note: z.string().nullable(),
  subToken: z.string(),
  dataLimitGB: z.number().nullable(),
  ipLimit: z.number().int().nullable(),
  expireAt: dateValue,
  status: z.enum(["ACTIVE", "DISABLED", "EXPIRED"]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
const linkSchema = z.object({
  id: z.string().min(1),
  userId: z.string(),
  serverId: z.string(),
  remoteId: z.string(),
  remoteExtra: z.string().nullable(),
  usedBytes: z.number(),
  lastSyncedAt: dateValue,
  enabled: z.boolean(),
});
const backupSchema = z.object({
  format: z.literal("vpn-center-backup"),
  version: z.literal(1),
  exportedAt: z.string().datetime(),
  data: z.object({
    servers: z.array(serverSchema),
    users: z.array(userSchema),
    links: z.array(linkSchema),
  }),
});

backupRouter.get(
  "/export",
  asyncHandler(async (_req, res) => {
    const [servers, users, links] = await Promise.all([
      prisma.server.findMany({ orderBy: { createdAt: "asc" } }),
      prisma.user.findMany({ orderBy: { createdAt: "asc" } }),
      prisma.userServerLink.findMany(),
    ]);
    res.setHeader("Content-Disposition", `attachment; filename="vpn-center-backup-${new Date().toISOString().slice(0, 10)}.json"`);
    res.json({ format: "vpn-center-backup", version: 1, exportedAt: new Date().toISOString(), data: { servers, users, links } });
  })
);

backupRouter.post(
  "/import",
  asyncHandler(async (req: AuthedRequest, res) => {
    const parsed = backupSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid or unsupported backup file" });
    const { servers, users, links } = parsed.data.data;
    const serverIds = new Set(servers.map((server) => server.id));
    const userIds = new Set(users.map((user) => user.id));
    const invalidReferral = users.some((user) => user.referrerId && !userIds.has(user.referrerId));
    const invalidLink = links.some((link) => !userIds.has(link.userId) || !serverIds.has(link.serverId));
    if (invalidReferral || invalidLink) return res.status(400).json({ error: "Backup contains broken user or server references" });

    await prisma.$transaction(async (tx) => {
      await tx.userServerLink.deleteMany();
      await tx.user.deleteMany();
      await tx.server.deleteMany();
      for (const server of servers) {
        await tx.server.create({ data: { ...server, createdAt: new Date(server.createdAt), updatedAt: new Date(server.updatedAt) } });
      }
      for (const user of users) {
        await tx.user.create({
          data: {
            ...user,
            referrerId: null,
            expireAt: user.expireAt ? new Date(user.expireAt) : null,
            createdAt: new Date(user.createdAt),
            updatedAt: new Date(user.updatedAt),
          },
        });
      }
      for (const user of users) {
        if (user.referrerId) await tx.user.update({ where: { id: user.id }, data: { referrerId: user.referrerId } });
      }
      for (const link of links) {
        await tx.userServerLink.create({
          data: { ...link, lastSyncedAt: link.lastSyncedAt ? new Date(link.lastSyncedAt) : null },
        });
      }
    });

    logger.warn("database_backup_imported", `Users and servers were restored from a backup`, {
      servers: servers.length,
      users: users.length,
      links: links.length,
      admin: req.admin?.username,
    });
    res.json({ servers: servers.length, users: users.length, links: links.length });
  })
);
