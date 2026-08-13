import axios, { AxiosInstance } from "axios";
import {
  PanelAdapter,
  CreateRemoteUserParams,
  RemoteUserState,
  RemoteConfig,
  ServerCredentials,
} from "./types";

// Adapter for X4G (https://github.com/x4gKing/X4G) — a lightweight VLESS
// over WebSocket/XHTTP gateway with an in-memory/JSON-file "links" store.
//
// Unlike 3x-ui, X4G has no concept of a "user" with a
// username — it only has share-links ("لینک‌ها"). Each link IS the
// account: one UUID, one VLESS config, an optional traffic cap and
// expiry. So here `remoteId` is the link's uuid, and `username` from
// CreateRemoteUserParams is only used as the link's display label.
//
// Auth is cookie-based (POST /api/login sets an httponly session cookie),
// not a bearer token, so this adapter keeps a small manual cookie jar and
// re-authenticates transparently if a request comes back 401.
//
// Server-level `extra` (set on the Server row / add-server form) can
// optionally carry defaults applied to every link created on this server:
//   { protocol?: "vless-ws" | "xhttp-packet-up" | "xhttp-stream-up" | "xhttp-stream-one",
//     fingerprint?: string, alpn?: string, port?: number }
export class X4GAdapter implements PanelAdapter {
  private client: AxiosInstance;
  private cookie: string | null = null;

  constructor(private creds: ServerCredentials) {
    this.client = axios.create({ baseURL: creds.baseUrl, timeout: 15000 });
  }

  private extra(): Record<string, any> {
    return this.creds.extra ?? {};
  }

  private async login(): Promise<void> {
    const res = await this.client.post("/api/login", { password: this.creds.password });
    const setCookie = res.headers["set-cookie"];
    if (!setCookie || setCookie.length === 0) {
      throw new Error("X4G login did not return a session cookie");
    }
    this.cookie = setCookie[0].split(";")[0];
  }

  // Runs `fn` with an authenticated request config; logs in first if we
  // don't have a session yet, and retries once after a fresh login if the
  // panel responds 401 (e.g. cookie expired / panel restarted, since X4G
  // sessions live in memory and are wiped on redeploy).
  private async authed<T>(fn: (headers: Record<string, string>) => Promise<T>): Promise<T> {
    if (!this.cookie) await this.login();
    try {
      return await fn({ Cookie: this.cookie! });
    } catch (err: any) {
      if (err?.response?.status === 401) {
        await this.login();
        return await fn({ Cookie: this.cookie! });
      }
      throw err;
    }
  }

  private async listLinks(): Promise<any[]> {
    const res = await this.authed((headers) => this.client.get("/api/links", { headers }));
    return res.data.links ?? [];
  }

  private async findLink(remoteId: string): Promise<any> {
    const links = await this.listLinks();
    const link = links.find((l) => l.uuid === remoteId);
    if (!link) throw new Error(`X4G link ${remoteId} not found`);
    return link;
  }

  private expireAtToDays(expireAt?: Date | null): number {
    if (!expireAt) return 0; // 0 = never expires, per X4G semantics
    const days = Math.ceil((expireAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
    return Math.max(1, days);
  }

  async testConnection(): Promise<{ ok: boolean; message?: string }> {
    try {
      await this.login();
      await this.listLinks();
      return { ok: true };
    } catch (err: any) {
      return { ok: false, message: err?.response?.data?.detail ?? err.message };
    }
  }

  async createUser(params: CreateRemoteUserParams): Promise<{ remoteId: string; remoteExtra?: Record<string, unknown> }> {
    const ex = this.extra();
    const body: Record<string, any> = {
      label: params.username,
      // X4G's "B" unit isn't one of its parsed units (GB/MB/KB), so its
      // parser falls through to treating limit_value as raw bytes — this
      // lets us pass exact byte caps instead of lossy GB rounding.
      limit_value: params.dataLimitBytes ?? 0,
      limit_unit: "B",
      expires_days: this.expireAtToDays(params.expireAt),
    };
    if (params.ipLimit) body.ip_limit = params.ipLimit;
    if (ex.protocol) body.protocol = ex.protocol;
    if (ex.fingerprint) body.fingerprint = ex.fingerprint;
    if (ex.alpn) body.alpn = ex.alpn;
    if (ex.port) body.port = ex.port;

    const res = await this.authed((headers) => this.client.post("/api/links", body, { headers }));
    return {
      remoteId: res.data.uuid,
      remoteExtra: { sub_url: res.data.sub_url },
    };
  }

  async getUserState(remoteId: string): Promise<RemoteUserState> {
    const link = await this.findLink(remoteId);
    return {
      remoteId,
      usedBytes: link.used_bytes ?? 0,
      dataLimitBytes: link.limit_bytes ? link.limit_bytes : null,
      expireAt: link.expires_at ? new Date(link.expires_at) : null,
      enabled: !!link.active,
      ipLimit: link.ip_limit ? link.ip_limit : null,
    };
  }

  async updateUser(remoteId: string, params: Partial<CreateRemoteUserParams>): Promise<void> {
    const body: Record<string, any> = {};
    if (params.username !== undefined) body.label = params.username;
    if (params.dataLimitBytes !== undefined) {
      body.limit_value = params.dataLimitBytes ?? 0;
      body.limit_unit = "B";
    }
    if (params.expireAt !== undefined) {
      body.expires_days = this.expireAtToDays(params.expireAt);
    }
    if (params.ipLimit !== undefined) {
      body.ip_limit = params.ipLimit ?? 0;
    }
    await this.authed((headers) => this.client.patch(`/api/links/${encodeURIComponent(remoteId)}`, body, { headers }));
  }

  async setEnabled(remoteId: string, enabled: boolean): Promise<void> {
    await this.authed((headers) =>
      this.client.patch(`/api/links/${encodeURIComponent(remoteId)}`, { active: enabled }, { headers })
    );
  }

  async resetUsage(remoteId: string): Promise<void> {
    await this.authed((headers) =>
      this.client.patch(`/api/links/${encodeURIComponent(remoteId)}`, { used_bytes: 0 }, { headers })
    );
  }

  async deleteUser(remoteId: string): Promise<void> {
    await this.authed((headers) => this.client.delete(`/api/links/${encodeURIComponent(remoteId)}`, { headers }));
  }

  async getConfigs(remoteId: string): Promise<RemoteConfig[]> {
    const link = await this.findLink(remoteId);
    return [
      {
        protocol: "vless",
        uri: link.vless_link,
        label: link.label ?? remoteId,
      },
    ];
  }
}
