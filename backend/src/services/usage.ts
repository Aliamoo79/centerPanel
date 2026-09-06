import { prisma } from "../db";
import { getAdapter } from "../adapters";
import { logger } from "../lib/logger";
import { describePanelError } from "../lib/errors";
import { RemoteUserState } from "../adapters/types";

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

export interface UsageSyncProgress {
  running: boolean;
  startedAt: string;
  servers: Record<string, { status: "pending" | "success" | "error"; error?: string }>;
}

const userSyncProgress = new Map<string, UsageSyncProgress>();
const activeUserSyncs = new Map<string, Promise<AggregatedUsage>>();
type PrefetchedState = { state?: RemoteUserState; error?: unknown };
type PrefetchedStates = Map<string, PrefetchedState>;

export function beginUserUsageSync(userId: string, serverIds: string[]): UsageSyncProgress {
  const current = userSyncProgress.get(userId);
  if (current?.running) return current;
  const progress: UsageSyncProgress = {
    running: true,
    startedAt: new Date().toISOString(),
    servers: Object.fromEntries(serverIds.map((serverId) => [serverId, { status: "pending" as const }])),
  };
  userSyncProgress.set(userId, progress);
  return progress;
}

export function getUserUsageSyncProgress(userId: string): UsageSyncProgress | null {
  return userSyncProgress.get(userId) ?? null;
}

/**
 * Pull live usage from every server a user is provisioned on, update the
 * cached snapshot in UserServerLink, and return an aggregated view.
 * Individual server failures don't fail the whole call — a server that's
 * temporarily down just gets flagged with `error` and its last-known
 * cached usedBytes is used instead.
 */
async function performUserUsageSync(userId: string, prefetchedStates?: PrefetchedStates): Promise<AggregatedUsage> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: { links: { include: { server: true } } },
  });
  const progress = userSyncProgress.get(userId)?.running
    ? userSyncProgress.get(userId)!
    : beginUserUsageSync(userId, user.links.map((link) => link.serverId));

  const perServer: AggregatedUsage["perServer"] = [];
  let totalUsed = 0;
  const countedRemoteAccounts = new Set<string>();

  const saveLinkState = async (link: any, state: any, error?: any) => {
    try {
      if (error) throw error;
      if (!state) throw new Error(`No usage state returned for ${link.remoteId}`);
      await prisma.userServerLink.update({
        where: { id: link.id },
        data: { usedBytes: state.usedBytes, lastSyncedAt: new Date() },
      });
      progress.servers[link.serverId] = { status: "success" };

      // A modern 3x-ui client has one shared traffic row across every inbound.
      // Two local server records pointing to the same panel/client must display
      // that state on both rows without counting it twice toward the total.
      const remoteAccountKey = link.server.panelType === "THREEXUI"
        ? `THREEXUI:${link.server.baseUrl.replace(/\/$/, "").toLowerCase()}:${link.remoteId}`
        : `${link.server.id}:${link.remoteId}`;
      if (!countedRemoteAccounts.has(remoteAccountKey)) {
        totalUsed += state.usedBytes;
        countedRemoteAccounts.add(remoteAccountKey);
      }
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
      progress.servers[link.serverId] = { status: "error", error: message };
      logger.warn("usage_sync_failed", `دریافت مصرف «${user.username}» از سرور «${link.server.name}» ناموفق بود: ${message}`, {
        userId: user.id,
        serverId: link.server.id,
        serverName: link.server.name,
      });
      const remoteAccountKey = link.server.panelType === "THREEXUI"
        ? `THREEXUI:${link.server.baseUrl.replace(/\/$/, "").toLowerCase()}:${link.remoteId}`
        : `${link.server.id}:${link.remoteId}`;
      if (!countedRemoteAccounts.has(remoteAccountKey)) {
        totalUsed += link.usedBytes; // fall back to last cached value
        countedRemoteAccounts.add(remoteAccountKey);
      }
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
  };

  // Batch-capable adapters are called once per server (and, for 3x-ui, once
  // per distinct inbound), instead of once per user. Other panel adapters
  // retain their existing per-user behavior.
  const linksByServer = new Map<string, any[]>();
  for (const link of user.links) {
    // A server-level disabled link must not trigger any remote polling. Keep
    // its last local snapshot below, but only batch active links.
    if (!link.enabled || link.server.status !== "ACTIVE") continue;
    const group = linksByServer.get(link.serverId) ?? [];
    group.push(link);
    linksByServer.set(link.serverId, group);
  }

  await Promise.all([...linksByServer.values()].map(async (links) => {
    const first = links[0];
    const adapter = getAdapter(first.server.panelType as any, first.server);
    const batch = adapter.getUsersState;

    if (batch) {
      const prefetched = links.map((link) => prefetchedStates?.get(link.id));
      if (prefetchedStates && prefetched.every((item) => item !== undefined)) {
        await Promise.all(links.map((link, index) => {
          const item = prefetched[index]!;
          return saveLinkState(link, item.state, item.error);
        }));
        return;
      }
      try {
        const states = await batch.call(adapter, links.map((link) => ({
          remoteId: link.remoteId,
          remoteExtra: link.remoteExtra ? JSON.parse(link.remoteExtra) : null,
        })));
        await Promise.all(links.map((link) => saveLinkState(link, states[link.remoteId])));
      } catch (err: any) {
        await Promise.all(links.map((link) => saveLinkState(link, null, err)));
      }
      return;
    }

    await Promise.all(links.map(async (link) => {
      try {
        const remoteExtra = link.remoteExtra ? JSON.parse(link.remoteExtra) : null;
        await saveLinkState(link, await adapter.getUserState(link.remoteId, remoteExtra));
      } catch (err: any) {
        await saveLinkState(link, null, err);
      }
    }));
  }));

  // Disabled links retain their last known usage for display and aggregation,
  // without contacting their panel.
  for (const link of user.links.filter((item) => !item.enabled || item.server.status !== "ACTIVE")) {
    const remoteAccountKey = link.server.panelType === "THREEXUI"
      ? `THREEXUI:${link.server.baseUrl.replace(/\/$/, "").toLowerCase()}:${link.remoteId}`
      : `${link.server.id}:${link.remoteId}`;
    if (!countedRemoteAccounts.has(remoteAccountKey)) {
      totalUsed += link.usedBytes;
      countedRemoteAccounts.add(remoteAccountKey);
    }
    perServer.push({
      serverId: link.server.id,
      serverName: link.server.name,
      usedBytes: link.usedBytes,
      dataLimitBytes: null,
      expireAt: null,
      enabled: link.enabled && link.server.status === "ACTIVE",
    });
  }

  const dataLimitBytes = user.dataLimitGB ? user.dataLimitGB * 1024 * 1024 * 1024 : null;

  if (dataLimitBytes !== null && totalUsed >= dataLimitBytes) {
    const linksToDisable = user.links.filter((link) => link.enabled && link.server.status === "ACTIVE");
    const results = await Promise.allSettled(
      linksToDisable.map(async (link) => {
        const adapter = getAdapter(link.server.panelType as any, link.server);
        const remoteExtra = link.remoteExtra ? JSON.parse(link.remoteExtra) : null;
        await adapter.setEnabled(link.remoteId, false, remoteExtra);
        await prisma.userServerLink.update({ where: { id: link.id }, data: { enabled: false } });
        const snapshot = perServer.find((item) => item.serverId === link.serverId);
        if (snapshot) snapshot.enabled = false;
      })
    );

    await prisma.user.update({ where: { id: user.id }, data: { status: "EXPIRED" } });

    const failures = results
      .map((result, index) => result.status === "rejected"
        ? { server: linksToDisable[index].server.name, error: describePanelError(result.reason) }
        : null)
      .filter(Boolean);

    if (user.status !== "EXPIRED" || linksToDisable.length > 0) {
      logger.warn("user_total_quota_exceeded", `Combined usage limit reached for '${user.username}'; all server configs were disabled`, {
        userId: user.id,
        usedBytes: totalUsed,
        dataLimitBytes,
        failures,
      });
    }
  }

  progress.running = false;
  return {
    usedBytes: totalUsed,
    dataLimitBytes,
    expireAt: user.expireAt,
    perServer,
  };
}

export function syncUserUsage(userId: string, prefetchedStates?: PrefetchedStates): Promise<AggregatedUsage> {
  const active = activeUserSyncs.get(userId);
  if (active) return active;
  const run = performUserUsageSync(userId, prefetchedStates).finally(() => {
    const progress = userSyncProgress.get(userId);
    if (progress) progress.running = false;
    activeUserSyncs.delete(userId);
  });
  activeUserSyncs.set(userId, run);
  return run;
}

let allUsersSync: Promise<void> | null = null;

async function prefetchBatchStates(users: any[]): Promise<PrefetchedStates> {
  const result: PrefetchedStates = new Map();
  const linksByServer = new Map<string, any[]>();

  for (const user of users) {
    for (const link of user.links) {
      if (!link.enabled || link.server.status !== "ACTIVE") continue;
      const group = linksByServer.get(link.serverId) ?? [];
      group.push(link);
      linksByServer.set(link.serverId, group);
    }
  }

  await Promise.all([...linksByServer.values()].map(async (links) => {
    const first = links[0];
    const adapter = getAdapter(first.server.panelType as any, first.server);
    if (!adapter.getUsersState) return;

    try {
      const states = await adapter.getUsersState(links.map((link) => ({
        remoteId: link.remoteId,
        remoteExtra: link.remoteExtra ? JSON.parse(link.remoteExtra) : null,
      })));
      for (const link of links) {
        result.set(link.id, { state: states[link.remoteId] });
      }
    } catch (error) {
      for (const link of links) result.set(link.id, { error });
    }
  }));

  return result;
}

/** Refresh every cached usage snapshot without duplicating overlapping runs. */
export function syncAllUserUsage(concurrency = 5): Promise<void> {
  if (allUsersSync) return allUsersSync;

  allUsersSync = (async () => {
    const users = await prisma.user.findMany({
      include: { links: { include: { server: true } } },
    });
    const prefetchedStates = await prefetchBatchStates(users);
    let nextIndex = 0;

    async function worker() {
      while (nextIndex < users.length) {
        const user = users[nextIndex++];
        await syncUserUsage(user.id, prefetchedStates).catch((err) => {
          logger.warn("user_usage_background_sync_failed", describePanelError(err), { userId: user.id });
        });
      }
    }

    await Promise.all(Array.from({ length: Math.min(concurrency, users.length) }, worker));
  })().finally(() => {
    allUsersSync = null;
  });

  return allUsersSync;
}
