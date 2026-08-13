import axios, { AxiosInstance } from "axios";
import { randomUUID } from "crypto";
import {
  PanelAdapter,
  CreateRemoteUserParams,
  RemoteUserState,
  RemoteConfig,
  ServerCredentials,
} from "./types";

// Adapter for Hiddify Manager (https://github.com/hiddify/Hiddify-Manager).
// Hiddify's admin API is key-based (no login flow): pass the admin API key
// via the "Hiddify-API-Key" header. Store that key in the Server row's
// `password` field when adding a Hiddify server (username can be left as
// "admin" — it isn't used for this panel).
//
// NOTE: like Marzban/3x-ui, exact paths can shift between Hiddify
// releases. This targets the /api/v2/admin/user/ surface. Tell me your
// version if something 404s and I'll line it up.
export class HiddifyAdapter implements PanelAdapter {
  private client: AxiosInstance;

  constructor(private creds: ServerCredentials) {
    this.client = axios.create({
      baseURL: creds.baseUrl,
      timeout: 15000,
      headers: { "Hiddify-API-Key": creds.password! },
    });
  }

  async testConnection(): Promise<{ ok: boolean; message?: string }> {
    try {
      await this.client.get("/api/v2/admin/user/");
      return { ok: true };
    } catch (err: any) {
      return { ok: false, message: err?.response?.data?.detail ?? err.message };
    }
  }

  async createUser(params: CreateRemoteUserParams): Promise<{ remoteId: string; remoteExtra?: Record<string, unknown> }> {
    const uuid = randomUUID();
    const body = {
      uuid,
      name: params.username,
      usage_limit_GB: params.dataLimitBytes ? params.dataLimitBytes / (1024 * 1024 * 1024) : 0,
      package_days: params.expireAt
        ? Math.max(1, Math.ceil((params.expireAt.getTime() - Date.now()) / 86400000))
        : 0,
      mode: "no_reset",
      enable: true,
    };
    await this.client.post("/api/v2/admin/user/", body);
    return { remoteId: uuid, remoteExtra: { uuid } };
  }

  async getUserState(remoteId: string): Promise<RemoteUserState> {
    const res = await this.client.get(`/api/v2/admin/user/${remoteId}/`);
    const d = res.data;
    return {
      remoteId,
      usedBytes: (d.current_usage_GB ?? 0) * 1024 * 1024 * 1024,
      dataLimitBytes: d.usage_limit_GB ? d.usage_limit_GB * 1024 * 1024 * 1024 : null,
      expireAt: d.start_date && d.package_days
        ? new Date(new Date(d.start_date).getTime() + d.package_days * 86400000)
        : null,
      enabled: d.enable ?? true,
      // Hiddify Manager doesn't expose a per-user connected-IP-limit
      // field on this API surface, so ipLimit passed in is ignored here.
      ipLimit: null,
    };
  }

  async updateUser(remoteId: string, params: Partial<CreateRemoteUserParams>): Promise<void> {
    const body: Record<string, unknown> = {};
    if (params.dataLimitBytes !== undefined) {
      body.usage_limit_GB = params.dataLimitBytes ? params.dataLimitBytes / (1024 * 1024 * 1024) : 0;
    }
    if (params.expireAt !== undefined) {
      body.package_days = params.expireAt
        ? Math.max(1, Math.ceil((params.expireAt.getTime() - Date.now()) / 86400000))
        : 0;
    }
    await this.client.patch(`/api/v2/admin/user/${remoteId}/`, body);
  }

  async setEnabled(remoteId: string, enabled: boolean): Promise<void> {
    await this.client.patch(`/api/v2/admin/user/${remoteId}/`, { enable: enabled });
  }

  async resetUsage(remoteId: string): Promise<void> {
    await this.client.patch(`/api/v2/admin/user/${remoteId}/`, { current_usage_GB: 0 });
  }

  async deleteUser(remoteId: string): Promise<void> {
    await this.client.delete(`/api/v2/admin/user/${remoteId}/`);
  }

  async getConfigs(remoteId: string): Promise<RemoteConfig[]> {
    // Hiddify exposes a nested subscription URL. Resolve it here: emitting
    // that HTTPS URL as a config line makes clients treat it as a proxy URI
    // and can cause the entire aggregate subscription import to fail.
    const subBase = (this.creds.baseUrl ?? "").replace(/\/$/, "");
    const response = await axios.get<string>(`${subBase}/${remoteId}/sub/`, {
      timeout: 10000,
      responseType: "text",
      headers: { Accept: "*/*", "User-Agent": "v2rayNG" },
    });
    const body = String(response.data ?? "").trim();
    const decoded = /^[A-Za-z0-9+/=_\r\n-]+$/.test(body)
      ? Buffer.from(body.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8")
      : body;
    const supported = /^(vless|vmess|trojan|ss|socks|hysteria2|hy2):\/\//i;
    return decoded
      .split(/\r?\n/)
      .map((uri) => uri.trim())
      .filter((uri) => supported.test(uri))
      .map((uri, index) => ({
        protocol: uri.slice(0, uri.indexOf(":")),
        uri,
        label: `${remoteId}-${index + 1}`,
      }));
  }
}
