import axios, { AxiosInstance } from "axios";
import {
  PanelAdapter,
  CreateRemoteUserParams,
  RemoteUserState,
  RemoteConfig,
  ServerCredentials,
} from "./types";

// Adapter for Marzban (https://github.com/Gozargah/Marzban) panels.
// Marzban already has native multi-protocol users + its own subscription
// links, so this adapter is fairly thin: we just drive its REST API.
//
// NOTE: Marzban's API has changed slightly across versions. This targets
// the widely-deployed 0.x REST API (JWT bearer auth, /api/user endpoints).
// If your instance is on a different version and something 401s or 404s,
// tell me the exact version and I'll adjust the paths.
export class MarzbanAdapter implements PanelAdapter {
  private client: AxiosInstance;
  private token: string | null = null;
  private tokenExpiresAt = 0;

  constructor(private creds: ServerCredentials) {
    this.client = axios.create({ baseURL: creds.baseUrl, timeout: 15000 });
  }

  private async authenticate(): Promise<void> {
    if (this.token && Date.now() < this.tokenExpiresAt) return;
    const form = new URLSearchParams();
    form.append("username", this.creds.username!);
    form.append("password", this.creds.password!);
    const res = await this.client.post("/api/admin/token", form, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    this.token = res.data.access_token;
    // Marzban tokens are typically long-lived; refresh hourly to be safe.
    this.tokenExpiresAt = Date.now() + 55 * 60 * 1000;
  }

  private async authedClient(): Promise<AxiosInstance> {
    await this.authenticate();
    this.client.defaults.headers.common["Authorization"] = `Bearer ${this.token}`;
    return this.client;
  }

  async testConnection(): Promise<{ ok: boolean; message?: string }> {
    try {
      const c = await this.authedClient();
      await c.get("/api/system");
      return { ok: true };
    } catch (err: any) {
      return { ok: false, message: err?.response?.data?.detail ?? err.message };
    }
  }

  async createUser(params: CreateRemoteUserParams): Promise<{ remoteId: string; remoteExtra?: Record<string, unknown> }> {
    const c = await this.authedClient();
    const body = {
      username: params.username,
      // Marzban wants ALL enabled proxy protocols + inbounds; "proxies: {}"
      // with empty settings lets Marzban auto-generate per-protocol configs
      // for every inbound tagged on the server. Adjust here if you only
      // want specific protocols.
      proxies: { vless: {}, vmess: {}, trojan: {} },
      inbounds: {},
      data_limit: params.dataLimitBytes ?? 0, // 0 = unlimited in Marzban
      expire: params.expireAt ? Math.floor(params.expireAt.getTime() / 1000) : 0,
      status: "active",
    };
    const res = await c.post("/api/user", body);
    return {
      remoteId: res.data.username,
      remoteExtra: { subscription_url: res.data.subscription_url },
    };
  }

  async getUserState(remoteId: string): Promise<RemoteUserState> {
    const c = await this.authedClient();
    const res = await c.get(`/api/user/${encodeURIComponent(remoteId)}`);
    const d = res.data;
    return {
      remoteId,
      usedBytes: d.used_traffic ?? 0,
      dataLimitBytes: d.data_limit ? d.data_limit : null,
      expireAt: d.expire ? new Date(d.expire * 1000) : null,
      enabled: d.status === "active",
      // Marzban core has no native per-user simultaneous-IP limit field
      // (it's deliberately excluded upstream — see Gozargah/Marzban
      // discussion #491). ipLimit passed to createUser/updateUser is
      // silently ignored for this panel.
      ipLimit: null,
    };
  }

  async updateUser(remoteId: string, params: Partial<CreateRemoteUserParams>): Promise<void> {
    const c = await this.authedClient();
    const body: Record<string, unknown> = {};
    if (params.dataLimitBytes !== undefined) body.data_limit = params.dataLimitBytes ?? 0;
    if (params.expireAt !== undefined) body.expire = params.expireAt ? Math.floor(params.expireAt.getTime() / 1000) : 0;
    await c.put(`/api/user/${encodeURIComponent(remoteId)}`, body);
  }

  async setEnabled(remoteId: string, enabled: boolean): Promise<void> {
    const c = await this.authedClient();
    await c.put(`/api/user/${encodeURIComponent(remoteId)}`, { status: enabled ? "active" : "disabled" });
  }

  async resetUsage(remoteId: string): Promise<void> {
    const c = await this.authedClient();
    await c.post(`/api/user/${encodeURIComponent(remoteId)}/reset`);
  }

  async deleteUser(remoteId: string): Promise<void> {
    const c = await this.authedClient();
    await c.delete(`/api/user/${encodeURIComponent(remoteId)}`);
  }

  async getConfigs(remoteId: string): Promise<RemoteConfig[]> {
    const c = await this.authedClient();
    const res = await c.get(`/api/user/${encodeURIComponent(remoteId)}`);
    const links: string[] = res.data.links ?? [];
    return links.map((uri) => ({
      protocol: uri.split("://")[0] ?? "unknown",
      uri,
      label: decodeURIComponent(uri.split("#")[1] ?? remoteId),
    }));
  }
}
