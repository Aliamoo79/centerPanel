import { prisma } from "../db";
import { getAdapter } from "../adapters";
import { logger } from "../lib/logger";
import { describePanelError } from "../lib/errors";

export interface AggregatedUsage {
  usedBytes: number;
  dataLimitBytes: number | null; // null = unlimited
  expireAt: Date | null; // earliest expiry across servers, or the user's own if set
  perServer: {
    serverId: string;
    serverName: string;
    usedBytes: number;
    dataLimitBytes: number | null;
    expireAt: Date | null;
    enabled: boolean;
    error?: string;
  }[];
}

/**
 * Pull live usage from every server a user is provisioned on, update the
 * cached snapshot in UserServerLink, and return an aggregated view.
 * Individual server failures don't fail the whole call — a server that's
 * temporarily down just gets flagged with `error` and its last-known
 * cached usedBytes is used instead.
 */
export async function syncUserUsage(userId: string): Promise<AggregatedUsage> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: { links: { include: { server: true } } },
  });

  const perServer: AggregatedUsage["perServer"] = [];
  let totalUsed = 0;

  for (const link of user.links) {
    try {
      const adapter = getAdapter(link.server.panelType as any, link.server);
      const remoteExtra = link.remoteExtra ? JSON.parse(link.remoteExtra) : null;
      const state = await adapter.getUserState(link.remoteId, remoteExtra);

      await prisma.userServerLink.update({
        where: { id: link.id },
        data: { usedBytes: state.usedBytes, lastSyncedAt: new Date() },
      });

      totalUsed += state.usedBytes;
      perServer.push({
        serverId: link.server.id,
        serverName: link.server.name,
        usedBytes: state.usedBytes,
        dataLimitBytes: state.dataLimitBytes,
        expireAt: state.expireAt,
        enabled: state.enabled,
      });
    } catch (err: any) {
      const message = describePanelError(err);
      logger.warn("usage_sync_failed", `دریافت مصرف «${user.username}» از سرور «${link.server.name}» ناموفق بود: ${message}`, {
        userId: user.id,
        serverId: link.server.id,
        serverName: link.server.name,
      });
      totalUsed += link.usedBytes; // fall back to last cached value
      perServer.push({
        serverId: link.server.id,
        serverName: link.server.name,
        usedBytes: link.usedBytes,
        dataLimitBytes: null,
        expireAt: null,
        enabled: link.enabled,
        error: message,
      });
    }
  }

  return {
    usedBytes: totalUsed,
    dataLimitBytes: user.dataLimitGB ? user.dataLimitGB * 1024 * 1024 * 1024 : null,
    expireAt: user.expireAt,
    perServer,
  };
}
