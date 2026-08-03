const TOKEN_KEY = "vpn_admin_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

function extractErrorMessage(body: any, status: number): string {
  const err = body?.error;
  if (typeof err === "string") return err;
  if (err && typeof err === "object") {
    // zod .flatten() shape: { formErrors: string[], fieldErrors: {...} }
    const fromField = Object.values(err.fieldErrors ?? {}).flat()[0];
    const fromForm = err.formErrors?.[0];
    if (fromField || fromForm) return String(fromField ?? fromForm);
  }
  return `درخواست ناموفق بود (کد ${status})`;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers ?? {}),
      },
    });
  } catch {
    throw new Error("ارتباط با سرور برقرار نشد — اتصال اینترنت یا آدرس سرور را بررسی کن");
  }

  if (res.status === 401) {
    clearToken();
    window.location.href = "/login";
    throw new Error("نشست شما منقضی شده — دوباره وارد شوید");
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err: any = new Error(extractErrorMessage(body, res.status));
    err.requestId = body?.requestId;
    err.status = res.status;
    throw err;
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  login: (username: string, password: string) =>
    request<{ token: string; admin: { id: string; username: string } }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),

  listServers: () => request<any[]>("/servers"),
  createServer: (data: any) => request<any>("/servers", { method: "POST", body: JSON.stringify(data) }),
  updateServer: (id: string, data: any) => request<any>(`/servers/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteServer: (id: string) => request<void>(`/servers/${id}`, { method: "DELETE" }),
  testServer: (id: string) => request<{ ok: boolean; message?: string }>(`/servers/${id}/test`, { method: "POST" }),

  listUsers: () => request<any[]>("/users"),
  refreshUserUsage: () => request<any[]>("/users/usage/refresh", { method: "POST" }),
  getUser: (id: string) => request<any>(`/users/${id}`),
  createUser: (data: any) => request<any>("/users", { method: "POST", body: JSON.stringify(data) }),
  updateUser: (id: string, data: any) => request<any>(`/users/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteUser: (id: string) => request<void>(`/users/${id}`, { method: "DELETE" }),
  addUserServer: (id: string, serverId: string) => request<any>(`/users/${id}/servers/${serverId}`, { method: "POST" }),
  removeUserServer: (id: string, serverId: string) => request<void>(`/users/${id}/servers/${serverId}`, { method: "DELETE" }),
  toggleUserServer: (id: string, serverId: string, enabled: boolean) =>
    request<any>(`/users/${id}/servers/${serverId}`, { method: "PATCH", body: JSON.stringify({ enabled }) }),

  listLogs: (params?: { level?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.level) qs.set("level", params.level);
    if (params?.limit) qs.set("limit", String(params.limit));
    const suffix = qs.toString() ? `?${qs}` : "";
    return request<{ entries: any[] }>(`/logs${suffix}`);
  },
};
