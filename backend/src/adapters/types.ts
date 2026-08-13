// Common contract every panel adapter (3x-ui / X4G / Nahan) must
// implement. The rest of the app (routes, subscription builder, usage
// aggregator) only ever talks to this interface — never to a specific
// panel's API directly. That's what lets you swap a server's address,
// or even its panel software, without touching business logic.

export interface CreateRemoteUserParams {
  /** Local username to mirror on the remote panel (must be unique per-server) */
  username: string;
  /** Data cap in bytes, or null/undefined for unlimited */
  dataLimitBytes?: number | null;
  /** Absolute expiry timestamp, or null/undefined for never */
  expireAt?: Date | null;
  /**
   * Max simultaneous connection/device IPs, or null/undefined for
   * unlimited. Only enforced by panels that natively support it
   * (3x-ui, X4G). Adapters without this feature silently ignore it.
   */
  ipLimit?: number | null;
}

export interface RemoteUserState {
  remoteId: string;
  /** Bytes used so far, as reported by the panel */
  usedBytes: number;
  /** Bytes allowed, or null if unlimited */
  dataLimitBytes: number | null;
  expireAt: Date | null;
  enabled: boolean;
  /** Max simultaneous IPs as reported by the panel, or null if unlimited/unsupported */
  ipLimit?: number | null;
}

export interface RemoteConfig {
  /** e.g. "vless", "vmess", "trojan", "shadowsocks" */
  protocol: string;
  /** Ready-to-use share URI, e.g. "vless://...#label" */
  uri: string;
  /** Human label, e.g. server name + inbound remark */
  label: string;
}

export interface PanelAdapter {
  /** Verify the stored credentials can reach and authenticate to the panel */
  testConnection(): Promise<{ ok: boolean; message?: string }>;

  /** Provision a new account on this panel for a platform user */
  createUser(params: CreateRemoteUserParams): Promise<{ remoteId: string; remoteExtra?: Record<string, unknown> }>;

  /** Fetch current usage / limit / expiry / enabled state for an existing account */
  getUserState(remoteId: string, remoteExtra?: Record<string, unknown> | null): Promise<RemoteUserState>;

  /** Update data limit and/or expiry on an existing account */
  updateUser(
    remoteId: string,
    params: Partial<CreateRemoteUserParams>,
    remoteExtra?: Record<string, unknown> | null
  ): Promise<void>;

  /** Enable/disable an account without deleting it */
  setEnabled(remoteId: string, enabled: boolean, remoteExtra?: Record<string, unknown> | null): Promise<void>;

  /** Reset the panel's traffic counters for an existing account */
  resetUsage(remoteId: string, remoteExtra?: Record<string, unknown> | null): Promise<void>;

  /** Permanently remove the account from the panel */
  deleteUser(remoteId: string, remoteExtra?: Record<string, unknown> | null): Promise<void>;

  /** Get the actual client config URIs (vless://, vmess://, ...) for this account */
  getConfigs(remoteId: string, remoteExtra?: Record<string, unknown> | null): Promise<RemoteConfig[]>;
}

export interface ServerCredentials {
  baseUrl: string;
  username?: string;
  password?: string;
  extra?: Record<string, unknown> | null;
}
