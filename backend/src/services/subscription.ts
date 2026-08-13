import { prisma } from "../db";
import { getAdapter } from "../adapters";
import { logger } from "../lib/logger";
import { describePanelError } from "../lib/errors";

const SUPPORTED_CONFIG_URI = /^(vless|vmess|trojan|ss|socks|hysteria2|hy2):\/\//i;
const CONFIG_FETCH_TIMEOUT_MS = 12000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Config fetch timed out after ${timeoutMs} ms`)), timeoutMs);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); }
    );
  });
}

/**
 * Replace the remark (display name) of a share URI with a custom one.
 * - vless:// / trojan:// / etc: the remark is the `#fragment` at the end.
 * - vmess://: the whole URI is base64(JSON), and the remark lives inside
 *   that JSON as the `ps` field — there's no fragment to touch, so we
 *   have to decode, patch `ps`, and re-encode instead.
 */
function withRemark(uri: string, remark: string): string {
  if (uri.startsWith("vmess://")) {
    try {
      const json = JSON.parse(Buffer.from(uri.slice("vmess://".length), "base64").toString("utf-8"));
      json.ps = remark;
      return `vmess://${Buffer.from(JSON.stringify(json)).toString("base64")}`;
    } catch {
      return uri; // malformed vmess payload — leave it untouched rather than corrupt it further
    }
  }
  const hashIdx = uri.indexOf("#");
  const base = hashIdx === -1 ? uri : uri.slice(0, hashIdx);
  return `${base}#${encodeURIComponent(remark)}`;
}

export interface SubscriptionPayload {
  /** Raw newline-separated share URIs (vless://, vmess://, trojan://, ...) */
  rawConfigs: string[];
  /** Same list, base64-encoded as one blob — the format most VPN clients expect */
  base64Body: string;
  /** Value for the `subscription-userinfo` response header (widely supported convention) */
  userInfoHeader: string;
  status: "ACTIVE" | "DISABLED" | "EXPIRED";
}

/**
 * Build everything needed to answer a GET on /sub/:token — this is what
 * makes "یک لینک subscription که همه کانفیگ‌ها براش آپدیت بشه" work: it
 * fans out to every server the user is on, live, every time the client
 * refreshes.
 */
export async function buildSubscription(token: string): Promise<SubscriptionPayload | null> {
  const user = await prisma.user.findUnique({
    where: { subToken: token },
    include: { links: { include: { server: true } } },
  });
  if (!user) return null;

  // Subscription refresh must not depend on every panel being online. Usage
  // is refreshed and quota is enforced by the background sync; use that
  // cached snapshot here so one unreachable server cannot fail the response.
  let usedBytes = 0;
  const countedRemoteAccounts = new Set<string>();
  for (const link of user.links) {
    const remoteAccountKey = link.server.panelType === "THREEXUI"
      ? `THREEXUI:${link.server.baseUrl.replace(/\/$/, "").toLowerCase()}:${link.remoteId}`
      : `${link.serverId}:${link.remoteId}`;
    if (countedRemoteAccounts.has(remoteAccountKey)) continue;
    countedRemoteAccounts.add(remoteAccountKey);
    usedBytes += link.usedBytes;
  }
  const dataLimitBytes = user.dataLimitGB ? user.dataLimitGB * 1024 ** 3 : null;
  const quotaExceeded = dataLimitBytes !== null && usedBytes >= dataLimitBytes;

  // Compute effective status (expiry check happens live, not just off the stored flag)
  let status = user.status as "ACTIVE" | "DISABLED" | "EXPIRED";
  if (quotaExceeded) status = "EXPIRED";
  if (user.expireAt && user.expireAt.getTime() < Date.now()) status = "EXPIRED";

  const rawConfigs: string[] = [];
  const seenConfigUris = new Set<string>();

  if (status === "ACTIVE") {
    const enabledLinks = user.links.filter((link) => link.enabled);
    const results = await Promise.all(enabledLinks.map(async (link) => {
      try {
        const adapter = getAdapter(link.server.panelType as any, link.server);
        const remoteExtra = link.remoteExtra ? JSON.parse(link.remoteExtra) : null;
        const configs = await withTimeout(adapter.getConfigs(link.remoteId, remoteExtra), CONFIG_FETCH_TIMEOUT_MS);
        const prefix = (link.server as any).remarkPrefix as string | null;
        return configs
          .filter((cfg) => SUPPORTED_CONFIG_URI.test(cfg.uri))
          .map((cfg, i) => {
          if (prefix) {
            // Base remark is "{prefix}-{username}"; if a server hands back
            // more than one config (e.g. multiple clean IPs), a numeric
            // suffix keeps them distinguishable in the client's config list
            // instead of colliding on the exact same name.
            const remark = i === 0 ? `${prefix}-${user.displayName}` : `${prefix}-${user.displayName}-${i + 1}`;
            return withRemark(cfg.uri, remark);
          }
          return cfg.uri;
        });
      } catch (err: any) {
        logger.warn("sub_configs_fetch_failed", `دریافت کانفیگ «${user.username}» از سرور «${link.server.name}» ناموفق بود: ${describePanelError(err)}`, {
          userId: user.id,
          serverId: link.serverId,
        });
        return [];
      }
    }));

    for (const configs of results) {
      for (const uri of configs) {
        // Multiple local rows may return the same remote config.
        if (seenConfigUris.has(uri)) continue;
        seenConfigUris.add(uri);
        rawConfigs.push(uri);
      }
    }
  }

  const total = dataLimitBytes ?? 0; // 0 conventionally means unlimited to most clients
  const expireEpoch = user.expireAt ? Math.floor(user.expireAt.getTime() / 1000) : 0;
  const userInfoHeader = `upload=0; download=${Math.floor(usedBytes)}; total=${Math.floor(total)}; expire=${expireEpoch}`;

  const base64Body = Buffer.from(rawConfigs.join("\n"), "utf-8").toString("base64");

  return { rawConfigs, base64Body, userInfoHeader, status };
}
