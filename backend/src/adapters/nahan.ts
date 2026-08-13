import axios, { AxiosInstance } from "axios";
import { randomUUID } from "crypto";
import {
  PanelAdapter,
  CreateRemoteUserParams,
  RemoteUserState,
  RemoteConfig,
  ServerCredentials,
} from "./types";

// Adapter for Nahan (https://github.com/itsyebekhe/nahan) — a single
// Cloudflare Worker acting as a VLESS/Trojan gateway, config stored in a
// D1/KV binding. IMPORTANT: this is architecturally very different from
// 3x-ui/X4G, which are multi-tenant panels with
// per-user REST resources. Nahan is a *single worker* whose entire
// config (protocol, clean IPs, and an optional `users` array of extra
// "profiles") lives in one JSON blob, and every save (`/api/sync`)
// overwrites that blob wholesale. There's no per-user CRUD endpoint —
// so this adapter fetches the whole config, edits the `users` array
// in memory, and writes the whole thing back on every operation.
//
// Concretely, `remoteId` here is a profile's `id` (a UUID) inside
// `config.users`, and `username` becomes that profile's `name`.
//
// Auth is a single stateless "master key" sent as `{ key }` in the body
// of every request (no session/cookie) — store it in the Server row's
// `password` field; `username` isn't used, same as X4G.
//
// Known limitations of the underlying panel (not adapter bugs):
//  - No per-profile "enabled" flag exists. A profile only disappears
//    from the subscription output once it's expired or over its data
//    cap. setEnabled() below simulates a toggle by stashing the real
//    expiry and force-expiring the profile, then restoring it — the
//    same trick an admin would do by hand.
//  - No per-profile simultaneous-IP limit at all, so `ipLimit` passed
//    in is accepted and ignored.
//  - Usage (`usedBytes`) comes from Nahan's own best-effort in-memory
//    counter periodically flushed to storage — treat it as approximate,
//    not a metered billing-grade figure.
//
// Server-level `extra.apiRoute` lets you point this adapter at a
// worker whose admin route was changed from the "sync" default (Nahan
// calls this its "hidden path" — Settings → API Route in its dashboard).
export class NahanAdapter implements PanelAdapter {
  private client: AxiosInstance;
  private apiRoute: string;

  constructor(private creds: ServerCredentials) {
    this.client = axios.create({ baseURL: creds.baseUrl.replace(/\/+$/, ""), timeout: 15000 });
    this.apiRoute = (creds.extra?.apiRoute as string) || "sync";
  }

  private authPath(): string {
    return `/${this.apiRoute}/api/auth`;
  }

  private syncPath(): string {
    return `/${this.apiRoute}/api/sync`;
  }

  private hashUuid(uuid: string): string {
    return uuid.replace(/-/g, "").toLowerCase();
  }

  private async fetchState(): Promise<{ config: Record<string, any>; usage: Record<string, { b: number }> }> {
    const res = await this.client.post(this.authPath(), { key: this.creds.password });
    if (!res.data?.success) throw new Error("Nahan authentication failed — check the master key");
    return { config: res.data.config ?? {}, usage: res.data.sysUsage ?? {} };
  }

  // Nahan merges `data.config` shallowly onto its stored config
  // (`{ ...sysConfig, ...data.config }`), so we only need to send the
  // `users` array we want to replace — every other setting (clean IPs,
  // protocol, master key, etc.) is left untouched server-side.
  private async saveUsers(users: any[]): Promise<void> {
    const res = await this.client.post(this.syncPath(), { key: this.creds.password, config: { users } });
    if (!res.data?.success) throw new Error("Nahan config sync failed");
  }

  async testConnection(): Promise<{ ok: boolean; message?: string }> {
    try {
      await this.fetchState();
      return { ok: true };
    } catch (err: any) {
      return { ok: false, message: err?.response?.data?.msg ?? err.message };
    }
  }

  async createUser(params: CreateRemoteUserParams): Promise<{ remoteId: string; remoteExtra?: Record<string, unknown> }> {
    const { config } = await this.fetchState();
    const users: any[] = Array.isArray(config.users) ? [...config.users] : [];
    const id = randomUUID();
    users.push({
      id,
      name: params.username,
      limitGb: params.dataLimitBytes ? params.dataLimitBytes / (1024 * 1024 * 1024) : null,
      expiryMs: params.expireAt ? params.expireAt.getTime() : null,
      createdAt: Date.now(),
    });
    await this.saveUsers(users);
    return { remoteId: id };
  }

  async getUserState(remoteId: string): Promise<RemoteUserState> {
    const { config, usage } = await this.fetchState();
    const users: any[] = config.users ?? [];
    const u = users.find((x) => x.id === remoteId);
    if (!u) throw new Error(`Nahan profile ${remoteId} not found`);

    const usedBytes = usage[this.hashUuid(remoteId)]?.b ?? 0;
    const dataLimitBytes = u.limitGb ? u.limitGb * 1024 * 1024 * 1024 : null;
    const now = Date.now();
    const expired = !!(u.expiryMs && now > u.expiryMs);
    const overLimit = !!(dataLimitBytes && usedBytes >= dataLimitBytes);

    return {
      remoteId,
      usedBytes,
      dataLimitBytes,
      // report the real (stashed) expiry even mid-"disable" so the UI
      // doesn't show the synthetic force-expiry we use to pause a profile
      expireAt: u._disabled ? (u._savedExpiryMs ? new Date(u._savedExpiryMs) : null) : u.expiryMs ? new Date(u.expiryMs) : null,
      enabled: !u._disabled && !expired && !overLimit,
      ipLimit: null, // Nahan has no per-profile connection-IP limiting
    };
  }

  async updateUser(remoteId: string, params: Partial<CreateRemoteUserParams>): Promise<void> {
    const { config } = await this.fetchState();
    const users: any[] = Array.isArray(config.users) ? [...config.users] : [];
    const idx = users.findIndex((x) => x.id === remoteId);
    if (idx === -1) throw new Error(`Nahan profile ${remoteId} not found`);

    const u = { ...users[idx] };
    if (params.username !== undefined) u.name = params.username;
    if (params.dataLimitBytes !== undefined) {
      u.limitGb = params.dataLimitBytes ? params.dataLimitBytes / (1024 * 1024 * 1024) : null;
    }
    if (params.expireAt !== undefined) {
      const newExpiry = params.expireAt ? params.expireAt.getTime() : null;
      if (u._disabled) {
        // still paused — update the stashed value, restore on next enable
        u._savedExpiryMs = newExpiry;
      } else {
        u.expiryMs = newExpiry;
      }
    }
    users[idx] = u;
    await this.saveUsers(users);
  }

  async setEnabled(remoteId: string, enabled: boolean): Promise<void> {
    const { config } = await this.fetchState();
    const users: any[] = Array.isArray(config.users) ? [...config.users] : [];
    const idx = users.findIndex((x) => x.id === remoteId);
    if (idx === -1) throw new Error(`Nahan profile ${remoteId} not found`);

    const u = { ...users[idx] };
    if (!enabled) {
      if (!u._disabled) {
        u._savedExpiryMs = u.expiryMs ?? null;
        u._disabled = true;
      }
      u.expiryMs = Date.now() - 1000; // force-expired = excluded from subscription output
    } else if (u._disabled) {
      u.expiryMs = u._savedExpiryMs ?? null;
      delete u._savedExpiryMs;
      delete u._disabled;
    }
    users[idx] = u;
    await this.saveUsers(users);
  }

  async resetUsage(_remoteId: string): Promise<void> {
    // Nahan exposes its counters as a read-only sysUsage snapshot and has
    // no per-profile reset operation in its admin API.
    throw new Error("This Nahan server does not support resetting usage per user");
  }

  async deleteUser(remoteId: string): Promise<void> {
    const { config } = await this.fetchState();
    const users: any[] = (config.users ?? []).filter((x: any) => x.id !== remoteId);
    await this.saveUsers(users);
  }

  async getConfigs(remoteId: string): Promise<RemoteConfig[]> {
    const { config } = await this.fetchState();
    const hostName = new URL(this.creds.baseUrl).hostname;
    const ips: string[] = config.cleanIps
      ? String(config.cleanIps).split(/[\r\n,;]+/).map((s: string) => s.trim()).filter(Boolean)
      : [hostName];
    const port = config.socketPort || "443";
    const security = ["80", "8080", "8880", "2052", "2082", "2086", "2095"].includes(String(port)) ? "none" : "tls";
    const path = encodeURI(`/${this.apiRoute}`);
    const fp = config.agent || "chrome";
    let ext = `encryption=none&security=${security}&sni=${hostName}&fp=${fp}&type=ws&host=${hostName}&path=${path}`;
    if (config.enableOpt2) ext += `&pbk=enabled`;

    const configs: RemoteConfig[] = [];
    for (const ip of ips) {
      const label = `Nahan-${ip}`;
      configs.push({ protocol: "vless", uri: `vless://${remoteId}@${ip}:${port}?${ext}#${encodeURIComponent(label)}`, label });
      configs.push({ protocol: "trojan", uri: `trojan://${remoteId}@${ip}:${port}?${ext}#${encodeURIComponent(label)}`, label });
    }
    return configs;
  }
}
