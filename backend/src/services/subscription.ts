import { prisma } from "../db";
import { getAdapter } from "../adapters";
import { syncUserUsage } from "./usage";
import { logger } from "../lib/logger";
import { describePanelError } from "../lib/errors";

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

  // Compute effective status (expiry check happens live, not just off the stored flag)
  let status = user.status as "ACTIVE" | "DISABLED" | "EXPIRED";
  if (user.expireAt && user.expireAt.getTime() < Date.now()) status = "EXPIRED";

  const rawConfigs: string[] = [];

  if (status === "ACTIVE") {
    for (const link of user.links) {
      if (!link.enabled) continue; // this specific server's config was turned off by the admin
      try {
        const adapter = getAdapter(link.server.panelType as any, link.server);
        const remoteExtra = link.remoteExtra ? JSON.parse(link.remoteExtra) : null;
        const configs = await adapter.getConfigs(link.remoteId, remoteExtra);
        const prefix = (link.server as any).remarkPrefix as string | null;
        configs.forEach((cfg, i) => {
          if (prefix) {
            // Base remark is "{prefix}-{username}"; if a server hands back
            // more than one config (e.g. multiple clean IPs), a numeric
            // suffix keeps them distinguishable in the client's config list
            // instead of colliding on the exact same name.
            const remark = i === 0 ? `${prefix}-${user.displayName}` : `${prefix}-${user.displayName}-${i + 1}`;
            rawConfigs.push(withRemark(cfg.uri, remark));
          } else {
            rawConfigs.push(cfg.uri);
          }
        });
      } catch (err: any) {
        logger.warn("sub_configs_fetch_failed", `دریافت کانفیگ «${user.username}» از سرور «${link.server.name}» ناموفق بود: ${describePanelError(err)}`, {
          userId: user.id,
          serverId: link.serverId,
        });
      }
    }
  }

  const usage = await syncUserUsage(user.id);
  const total = usage.dataLimitBytes ?? 0; // 0 conventionally means unlimited to most clients
  const expireEpoch = user.expireAt ? Math.floor(user.expireAt.getTime() / 1000) : 0;
  const userInfoHeader = `upload=0; download=${Math.floor(usage.usedBytes)}; total=${Math.floor(total)}; expire=${expireEpoch}`;

  const base64Body = Buffer.from(rawConfigs.join("\n"), "utf-8").toString("base64");

  return { rawConfigs, base64Body, userInfoHeader, status };
}
