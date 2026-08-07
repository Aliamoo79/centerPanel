import axios, { AxiosInstance } from "axios";
import {
  PanelAdapter,
  CreateRemoteUserParams,
  RemoteUserState,
  RemoteConfig,
  ServerCredentials,
} from "./types";

// Adapter for 3x-ui (MHSanaei/3x-ui, and its x-ui ancestors).
//
// All client lifecycle operations go through the modern clients API (v3):
//   POST /panel/api/clients/add            { client: {...}, inboundIds: [..] }
//   GET  /panel/api/clients/get/:email     ->  obj.client (full record) + inboundIds
//   POST /panel/api/clients/update/:email  body: full model.Client JSON
//   POST /panel/api/clients/del/:email?keepTraffic=0
//   GET  /panel/api/clients/traffic/:email ->  obj: ClientTraffic { up, down, total, expiryTime, enable }
//   GET  /panel/api/clients/links/:email   ->  obj: [vless://..., vmess://...]
// The create call attaches the client to every inbound in `inboundIds` and
// generates the per-protocol secret server-side when it's omitted (UUID
// for vless/vmess, password for trojan/shadowsocks, auth for hysteria),
// so the caller only sends the minimal fields above. The create response
// is just an ack, so the generated secret is read back afterwards via
// `clients/get/:email` and stored in remoteExtra as `clientId`.
//
// The old inbound-scoped endpoints (inbounds/updateClient/:cid,
// inbounds/:id/delClient/:cid, inbounds/getClientTraffics/:email) were
// removed in v3 — everything now keys on the client email. The update
// endpoint *replaces* the stored row, so every update here first fetches
// the current client record, merges in the change, and resends the whole
// thing to avoid wiping fields like flow/security/limitIp.
//
// Inbound reads (for building share URIs) still go through
//   GET /panel/api/inbounds/get/:id
// whose obj.settings/obj.streamSettings come back already-parsed as JSON
// objects in v3 (legacy panels send JSON strings) — handle both.
//
// There is no "get share links" API at all — 3x-ui only exposes a
// separate, optionally-enabled subscription HTTP server whose
// host/port/path varies per install. Instead, getConfigs() builds the
// vless/vmess/trojan share URI directly from the inbound's own
// streamSettings (network/security/ws/grpc/reality/tls), which is
// reliable regardless of whether that subscription server is even on.
export class ThreeXUIAdapter implements PanelAdapter {
  private client: AxiosInstance;
  private cookie: string | null = null;
  private inboundId: number;
  private useToken: boolean;
  private inboundCache: any | null = null;

  constructor(private creds: ServerCredentials) {
    this.client = axios.create({ baseURL: creds.baseUrl, timeout: 15000, withCredentials: true });
    const raw = creds.extra?.inboundId;
    this.inboundId = Number(Array.isArray(raw) ? raw[0] : raw) || 1;
    this.useToken = creds.extra?.authMethod === "token";
    if (this.useToken && creds.password) {
      this.client.defaults.headers.common["Authorization"] = `Bearer ${creds.password}`;
    }
  }

  private async authenticate(): Promise<void> {
    if (this.useToken) return;
    if (this.cookie) return;
    const res = await this.client.post(
      "/login",
      { username: this.creds.username, password: this.creds.password },
      { headers: { "Content-Type": "application/json" } }
    );
    if (res.data && res.data.success === false) {
      throw new Error(res.data.msg ?? "ورود به پنل 3x-ui ناموفق بود");
    }
    const setCookie = res.headers["set-cookie"];
    if (!setCookie || !setCookie[0]) throw new Error("3x-ui login did not return a session cookie");
    this.cookie = setCookie[0].split(";")[0];
    this.client.defaults.headers.common["Cookie"] = this.cookie;
  }

  private async authedClient(): Promise<AxiosInstance> {
    await this.authenticate();
    return this.client;
  }

  /** Fetches the target inbound (protocol, port, streamSettings, and its live client list). Cached per adapter instance. */
  private async getInbound(inboundId: number, fresh = false): Promise<any> {
    if (this.inboundCache && this.inboundCache.id === inboundId && !fresh) return this.inboundCache;
    const c = await this.authedClient();
    let payload: any;
    try {
      const res = await c.get(`/panel/api/inbounds/get/${inboundId}`);
      payload = res.data;
    } catch (err: any) {
      // Some 3x-ui releases do not expose the single-inbound endpoint even
      // though the list endpoint is available. Fall back to the list instead.
      if (err?.response?.status !== 404) throw err;
      const listRes = await c.get("/panel/api/inbounds/list");
      const items = Array.isArray(listRes.data?.obj) ? listRes.data.obj : [];
      const inbound = items.find((item: any) => Number(item.id) === inboundId);
      payload = inbound ? { success: true, obj: inbound } : listRes.data;
    }
    if (!payload?.success || !payload.obj || Array.isArray(payload.obj)) {
      throw new Error(payload?.msg ?? `Inbound ${inboundId} was not found in the 3x-ui panel`);
    }
    const obj = payload.obj;
    const settings = typeof obj.settings === "string" ? JSON.parse(obj.settings || "{}") : (obj.settings ?? {});
    const streamSettings =
      typeof obj.streamSettings === "string" ? JSON.parse(obj.streamSettings || "{}") : (obj.streamSettings ?? {});
    const inbound = { ...obj, clients: settings.clients ?? [], streamSettings };
    this.inboundCache = inbound;
    return inbound;
  }

  private findClient(inbound: any, clientId: string): any | null {
    return inbound.clients.find((c: any) => c.id === clientId || c.password === clientId || c.auth === clientId) ?? null;
  }

  /** Fetches the stored client record (incl. the server-generated secret) by email. */
  private async getClientRecord(email: string): Promise<any> {
    const c = await this.authedClient();
    const res = await c.get(`/panel/api/clients/get/${encodeURIComponent(email)}`);
    if (!res.data?.success || !res.data?.obj?.client) {
      throw new Error(res.data?.msg ?? `کاربر ${email} روی پنل 3x-ui پیدا نشد`);
    }
    return res.data.obj.client;
  }

  async testConnection(): Promise<{ ok: boolean; message?: string }> {
    try {
      const c = await this.authedClient();
      await c.get("/panel/api/inbounds/list");
      return { ok: true };
    } catch (err: any) {
      return { ok: false, message: err?.response?.data?.msg ?? err.message };
    }
  }

  async createUser(params: CreateRemoteUserParams): Promise<{ remoteId: string; remoteExtra?: Record<string, unknown> }> {
    const inbound = await this.getInbound(this.inboundId, true);
    const protocol = inbound.protocol as string;
    const network = inbound.streamSettings?.network ?? "tcp";
    const security = inbound.streamSettings?.security ?? "none";
    const useVision = protocol === "vless" && network === "tcp" && (security === "tls" || security === "reality");

    // Per-protocol secrets (UUID/password/auth) are generated server-side
    // when omitted, so we only send the minimal client fields — exactly the
    // shape the modern /panel/api/clients/add endpoint expects.
    const client: Record<string, any> = {
      email: params.username,
      totalGB: params.dataLimitBytes ?? 0,
      expiryTime: params.expireAt ? params.expireAt.getTime() : 0,
      tgId: 0,
      limitIp: params.ipLimit ?? 0,
      enable: true,
    };
    if (useVision) client.flow = "xtls-rprx-vision";

    const c = await this.authedClient();
    const res = await c.post("/panel/api/clients/add", {
      client,
      inboundIds: [this.inboundId],
    });
    if (!res.data || res.data.success === false) {
      throw new Error(res.data?.msg ?? "افزودن کاربر در 3x-ui ناموفق بود");
    }
    this.inboundCache = null; // invalidate — the inbound's client list just changed

    // The create ack doesn't echo the client, so read the record back to
    // learn the server-generated secret and subscription id.
    const rec = await this.getClientRecord(params.username);
    const clientId = rec.uuid || rec.password || rec.auth;

    return {
      remoteId: params.username,
      remoteExtra: { clientId, inboundId: this.inboundId, protocol, subId: rec.subId },
    };
  }

  async getUserState(remoteId: string, remoteExtra?: Record<string, unknown> | null): Promise<RemoteUserState> {
    const c = await this.authedClient();
    const res = await c.get(`/panel/api/clients/traffic/${encodeURIComponent(remoteId)}`);
    const d = res.data?.obj ?? {};

    // limitIp lives on the client record (not the traffic counters), so fetch
    // it from the record itself. Non-fatal: traffic above is still valid.
    let ipLimit: number | null = null;
    try {
      const rec = await this.getClientRecord(remoteId);
      if (rec.limitIp) ipLimit = rec.limitIp;
    } catch {
      // keep traffic data even if the record read fails
    }

    return {
      remoteId,
      usedBytes: (d.up ?? 0) + (d.down ?? 0),
      dataLimitBytes: d.total ? d.total : null,
      expireAt: d.expiryTime ? new Date(d.expiryTime) : null,
      enabled: d.enable ?? true,
      ipLimit,
    };
  }

  private async mergeAndPush(
    remoteId: string,
    changes: Record<string, any>
  ): Promise<void> {
    // The v3 update endpoint replaces the stored row, so pull the current
    // record and layer the change on top — otherwise untouched fields like
    // flow/security/limitIp would be wiped.
    const rec = await this.getClientRecord(remoteId);
    const merged = {
      id: rec.uuid,
      email: rec.email,
      password: rec.password,
      auth: rec.auth,
      flow: rec.flow,
      // Newer 3x-ui releases keep the VLESS encryption mode on the client
      // record. The update endpoint replaces the whole record, so omitting
      // this field silently resets it on unrelated user updates.
      encryption: rec.encryption,
      security: rec.security,
      subId: rec.subId,
      limitIp: rec.limitIp,
      totalGB: rec.totalGB,
      expiryTime: rec.expiryTime,
      enable: rec.enable,
      tgId: rec.tgId,
      group: rec.group,
      comment: rec.comment,
      reset: rec.reset,
      ...changes,
    };
    const c = await this.authedClient();
    const res = await c.post(`/panel/api/clients/update/${encodeURIComponent(remoteId)}`, merged);
    if (!res.data || res.data.success === false) {
      throw new Error(res.data?.msg ?? "به‌روزرسانی کاربر در 3x-ui ناموفق بود");
    }
    this.inboundCache = null;
  }

  async updateUser(
    remoteId: string,
    params: Partial<CreateRemoteUserParams>,
    remoteExtra?: Record<string, unknown> | null
  ): Promise<void> {
    const changes: Record<string, any> = {};
    if (params.username !== undefined) changes.email = params.username;
    if (params.dataLimitBytes !== undefined) changes.totalGB = params.dataLimitBytes ?? 0;
    if (params.expireAt !== undefined) changes.expiryTime = params.expireAt ? params.expireAt.getTime() : 0;
    if (params.ipLimit !== undefined) changes.limitIp = params.ipLimit ?? 0;
    if (Object.keys(changes).length === 0) return;
    await this.mergeAndPush(remoteId, changes);
  }

  async setEnabled(remoteId: string, enabled: boolean, remoteExtra?: Record<string, unknown> | null): Promise<void> {
    await this.mergeAndPush(remoteId, { enable: enabled });
  }

  async deleteUser(remoteId: string, remoteExtra?: Record<string, unknown> | null): Promise<void> {
    const c = await this.authedClient();
    await c.post(`/panel/api/clients/del/${encodeURIComponent(remoteId)}?keepTraffic=0`);
    this.inboundCache = null;
  }

  async getConfigs(remoteId: string, remoteExtra?: Record<string, unknown> | null): Promise<RemoteConfig[]> {
    const inboundId = (remoteExtra?.inboundId as number) ?? this.inboundId;
    const clientId = remoteExtra?.clientId as string | undefined;
    const inbound = await this.getInbound(inboundId, true);
    const client = clientId ? this.findClient(inbound, clientId) : inbound.clients.find((c: any) => c.email === remoteId);
    if (!client) throw new Error(`کاربر ${remoteId} روی اینباند 3x-ui پیدا نشد`);

    const host = new URL(this.creds.baseUrl).hostname;
    const uri = buildThreeXUIUri(inbound, client, host);
    return [{ protocol: inbound.protocol, uri, label: client.email ?? remoteId }];
  }
}

function buildThreeXUIUri(inbound: any, client: any, host: string): string {
  const ss = inbound.streamSettings ?? {};
  const network: string = ss.network ?? "tcp";
  const security: string = ss.security ?? "none";
  const port = inbound.port;
  const remark = client.email || inbound.remark || "config";

  const params = new URLSearchParams();
  params.set("type", network);

  if (security === "reality") {
    const rs = ss.realitySettings ?? {};
    const inner = rs.settings ?? {};
    params.set("security", "reality");
    params.set("pbk", inner.publicKey ?? "");
    params.set("fp", inner.fingerprint || "chrome");
    params.set("sni", (rs.serverNames && rs.serverNames[0]) || "");
    if (rs.shortIds && rs.shortIds[0]) params.set("sid", rs.shortIds[0]);
    if (inner.spiderX) params.set("spx", inner.spiderX);
  } else if (security === "tls") {
    const ts = ss.tlsSettings ?? {};
    params.set("security", "tls");
    if (ts.serverName) params.set("sni", ts.serverName);
    if (ts.alpn?.length) params.set("alpn", ts.alpn.join(","));
    params.set("fp", ts.settings?.fingerprint || "chrome");
  } else {
    params.set("security", "none");
  }

  if (network === "ws") {
    const ws = ss.wsSettings ?? {};
    if (ws.path) params.set("path", ws.path);
    if (ws.headers?.Host) params.set("host", ws.headers.Host);
  } else if (network === "grpc") {
    const grpc = ss.grpcSettings ?? {};
    if (grpc.serviceName) params.set("serviceName", grpc.serviceName);
    if (grpc.multiMode) params.set("mode", "multi");
  } else if (network === "tcp" && ss.tcpSettings?.header?.type === "http") {
    const req = ss.tcpSettings.header.request;
    if (req?.headers?.Host?.[0]) params.set("host", req.headers.Host[0]);
    if (req?.path?.[0]) params.set("path", req.path[0]);
    params.set("headerType", "http");
  }

  if (inbound.protocol === "vless") {
    // VLESS share URIs require the encryption query field. Read the value
    // returned by 3x-ui and retain compatibility with older panels, which
    // omit it because VLESS historically only supported `none`.
    params.set("encryption", client.encryption || "none");
    if (client.flow) params.set("flow", client.flow);
    return `vless://${client.id}@${host}:${port}?${params.toString()}#${encodeURIComponent(remark)}`;
  }
  if (inbound.protocol === "trojan") {
    return `trojan://${client.password}@${host}:${port}?${params.toString()}#${encodeURIComponent(remark)}`;
  }
  if (inbound.protocol === "vmess") {
    const vmessObj = {
      v: "2",
      ps: remark,
      add: host,
      port: String(port),
      id: client.id,
      aid: "0",
      scy: client.security || "auto",
      net: network,
      type: ss.tcpSettings?.header?.type ?? "none",
      host: ss.wsSettings?.headers?.Host ?? "",
      path: ss.wsSettings?.path ?? "",
      tls: security === "tls" ? "tls" : "",
      sni: ss.tlsSettings?.serverName ?? "",
    };
    return `vmess://${Buffer.from(JSON.stringify(vmessObj)).toString("base64")}`;
  }
  // shadowsocks and anything else: best-effort generic form
  return `${inbound.protocol}://${client.password ?? client.id}@${host}:${port}?${params.toString()}#${encodeURIComponent(remark)}`;
}
