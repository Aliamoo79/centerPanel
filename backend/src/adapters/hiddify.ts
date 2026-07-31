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

  async deleteUser(remoteId: string): Promise<void> {
    await this.client.delete(`/api/v2/admin/user/${remoteId}/`);
  }

  async getConfigs(remoteId: string): Promise<RemoteConfig[]> {
    // Hiddify exposes a per-user subscription page rather than discrete
    // URIs via this endpoint; the sub link itself already aggregates all
    // of that server's configs for the user.
    const subBase = (this.creds.baseUrl ?? "").replace(/\/$/, "");
    return [{ protocol: "hiddify-sub", uri: `${subBase}/${remoteId}/sub/`, label: remoteId }];
  }
}
