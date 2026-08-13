import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Card, Button, Input, Select, StatusDot, EmptyState, Modal, Skeleton, LoadingRegion } from "../components/ui";
import { panelLabel } from "../lib/format";
import { useToast } from "../lib/toast";

const PANEL_TYPES = [
  { value: "THREEXUI", label: "3x-ui" },
  { value: "X4G", label: "X4G" },
  { value: "NAHAN", label: "Nahan (Cloudflare Worker)" },
];

const X4G_PROTOCOLS = [
  { value: "vless-ws", label: "VLESS over WebSocket" },
  { value: "xhttp-packet-up", label: "XHTTP – packet-up" },
  { value: "xhttp-stream-up", label: "XHTTP – stream-up" },
  { value: "xhttp-stream-one", label: "XHTTP – stream-one" },
];

export default function Servers() {
  const toast = useToast();
  const [servers, setServers] = useState<any[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; message?: string }>>({});

  function reload() {
    api.listServers().then(setServers).catch((err) => toast.error(err.message ?? "خطا در دریافت سرورها"));
  }
  useEffect(reload, []);

  async function handleTest(id: string) {
    setTestResults((r) => ({ ...r, [id]: { ok: false, message: "در حال بررسی..." } }));
    const result = await api.testServer(id).catch((e) => ({ ok: false, message: e.message }));
    setTestResults((r) => ({ ...r, [id]: result }));
    if (!result.ok) toast.error(`اتصال به سرور برقرار نشد: ${result.message ?? ""}`);
  }

  async function handleDelete(id: string) {
    if (!confirm("این سرور حذف شود؟ کاربرانی که روی این سرور کانفیگ دارند دیگر از این سرور سرویس نمی‌گیرند.")) return;
    try {
      await api.deleteServer(id);
      reload();
      toast.success("سرور حذف شد");
    } catch (err: any) {
      toast.error(err.message ?? "حذف سرور ناموفق بود");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">سرورها</h1>
          <p className="text-muted text-sm mt-1">پنل‌های VPN متصل به سیستم</p>
        </div>
        <Button
          className="w-full sm:w-auto"
          onClick={() => {
            setEditing(null);
            setShowForm(true);
          }}
        >
          + افزودن سرور
        </Button>
      </div>

      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editing ? "ویرایش سرور" : "افزودن سرور جدید"}
      >
        <ServerForm
          initial={editing}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            reload();
            toast.success(editing ? "سرور به‌روزرسانی شد" : "سرور اضافه شد");
          }}
        />
      </Modal>

      <div className="space-y-3">
        {servers === null && (
          <LoadingRegion label="در حال دریافت سرورها" className="space-y-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <Card key={index} className="p-4 sm:p-5">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="flex items-center gap-3 flex-1"><Skeleton className="h-2.5 w-2.5 rounded-full" /><div className="space-y-2 flex-1"><Skeleton className="h-4 w-36" /><Skeleton className="h-3 w-full max-w-sm" /></div></div>
                  <div className="flex gap-2"><Skeleton className="h-10 w-24" /><Skeleton className="h-10 w-16" /><Skeleton className="h-10 w-16" /></div>
                </div>
              </Card>
            ))}
          </LoadingRegion>
        )}
        {servers?.map((s) => (
          <Card key={s.id} className="p-4 sm:p-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <StatusDot ok={testResults[s.id]?.ok ?? s.status === "ACTIVE"} pulse />
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{s.name}</p>
                  <p className="text-xs text-muted font-nums mt-0.5 truncate">
                    {panelLabel(s.panelType)} · {s.baseUrl} · {s._count?.links ?? 0} کاربر
                    {s.remarkPrefix && <> · remark: {s.remarkPrefix}-name</>}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {testResults[s.id] && (
                  <span className={`text-xs font-nums ${testResults[s.id].ok ? "text-mint" : "text-danger"}`}>
                    {testResults[s.id].ok ? "متصل" : testResults[s.id].message}
                  </span>
                )}
                <Button variant="ghost" onClick={() => handleTest(s.id)}>
                  تست اتصال
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setEditing(s);
                    setShowForm(true);
                  }}
                >
                  ویرایش
                </Button>
                <Button variant="danger" onClick={() => handleDelete(s.id)}>
                  حذف
                </Button>
              </div>
            </div>
          </Card>
        ))}
        {servers?.length === 0 && <EmptyState title="هنوز سروری اضافه نکرده‌ای" hint="با «افزودن سرور» شروع کن." />}
      </div>
    </div>
  );
}

function ServerForm({ initial, onClose, onSaved }: { initial: any | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [panelType, setPanelType] = useState(initial?.panelType ?? "THREEXUI");
  const [baseUrl, setBaseUrl] = useState(initial?.baseUrl ?? "");
  const [remarkPrefix, setRemarkPrefix] = useState(initial?.remarkPrefix ?? "");
  const [username, setUsername] = useState(initial?.username ?? "");
  const [password, setPassword] = useState("");
  const [extraInboundId, setExtraInboundId] = useState(
    initial?.extra?.inboundId !== undefined ? String(initial.extra.inboundId) : ""
  );
  const [useToken, setUseToken] = useState(initial?.extra?.authMethod === "token");
  const [x4gProtocol, setX4gProtocol] = useState(initial?.extra?.protocol ?? "vless-ws");
  const [x4gPort, setX4gPort] = useState(initial?.extra?.port ? String(initial.extra.port) : "");
  const [x4gFingerprint, setX4gFingerprint] = useState(initial?.extra?.fingerprint ?? "");
  const [nahanApiRoute, setNahanApiRoute] = useState(initial?.extra?.apiRoute ?? "sync");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const extra: Record<string, any> = {};
      if (panelType === "THREEXUI") {
        if (extraInboundId) extra.inboundId = Number(extraInboundId);
        if (useToken) extra.authMethod = "token";
      }
      if (panelType === "X4G") {
        if (x4gProtocol) extra.protocol = x4gProtocol;
        if (x4gPort) extra.port = Number(x4gPort);
        if (x4gFingerprint) extra.fingerprint = x4gFingerprint;
      }
      if (panelType === "NAHAN") {
        if (nahanApiRoute) extra.apiRoute = nahanApiRoute;
      }
      const payload: any = { name, panelType, baseUrl, extra, remarkPrefix };
      if (panelType !== "X4G" && panelType !== "NAHAN" && !useToken && username) payload.username = username;
      if (password) payload.password = password;

      if (initial) {
        await api.updateServer(initial.id, payload);
      } else {
        if (!password) throw new Error(useToken || panelType === "X4G" || panelType === "NAHAN" ? "رمز عبور/توکن پنل الزامی است" : "رمز عبور پنل الزامی است");
        await api.createServer(payload);
      }
      onSaved();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-5">
      <form onSubmit={onSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-muted mb-1.5">نام سرور (دلخواه)</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً Germany-1" required />
        </div>
        <div>
          <label className="block text-xs text-muted mb-1.5">نوع پنل</label>
          <Select value={panelType} onChange={(e) => setPanelType(e.target.value)}>
            {PANEL_TYPES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs text-muted mb-1.5">آدرس پنل (Base URL)</label>
          <Input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://panel.example.com:8000"
            required
            dir="ltr"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs text-muted mb-1.5">پیشوند نام کانفیگ (Remark) — اختیاری</label>
          <Input
            value={remarkPrefix}
            onChange={(e) => setRemarkPrefix(e.target.value)}
            placeholder="مثلاً mci-x4g"
            dir="ltr"
          />
          <p className="text-[11px] text-muted mt-1">
            اگر پر شود، نام هر کانفیگ این سرور در اپ کاربر به‌صورت «{remarkPrefix || "prefix"}-نام‌کاربری» نمایش داده می‌شود، به‌جای نامی که خود پنل تولید می‌کند. خالی بگذار تا نام پیش‌فرض پنل حفظ شود.
          </p>
        </div>
        {panelType === "THREEXUI" && (
          <div className="sm:col-span-2 flex items-center gap-3 py-1">
            <label className="text-xs text-muted">روش احراز هویت:</label>
            <label className="flex items-center gap-1.5 text-sm">
              <input type="radio" name="authMethod" checked={!useToken} onChange={() => setUseToken(false)} />
              نام کاربری + رمز عبور
            </label>
            <label className="flex items-center gap-1.5 text-sm">
              <input type="radio" name="authMethod" checked={useToken} onChange={() => setUseToken(true)} />
              توکن API
            </label>
          </div>
        )}
        {panelType === "X4G" || panelType === "NAHAN" ? (
          <div className="sm:col-span-2">
            <label className="block text-xs text-muted mb-1.5">
              {panelType === "NAHAN" ? "Master Key پنل" : "رمز عبور ادمین پنل"}
              {initial && <span className="text-muted"> {initial.hasPassword ? "(ذخیره شده؛ برای تغییر پر کن)" : "(ثبت نشده)"}</span>}
            </label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} dir="ltr" />
          </div>
        ) : useToken ? (
          <div className="sm:col-span-2">
            <label className="block text-xs text-muted mb-1.5">
              توکن API پنل
              {initial && <span className="text-muted"> (برای تغییر پر کن)</span>}
            </label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} dir="ltr" />
          </div>
        ) : (
          <>
            <div>
              <label className="block text-xs text-muted mb-1.5">
                نام کاربری پنل
              </label>
              <Input value={username} onChange={(e) => setUsername(e.target.value)} required={!useToken} dir="ltr" />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1.5">
                رمز عبور پنل
                {initial && <span className="text-muted"> {initial.hasPassword ? "(ذخیره شده؛ برای تغییر پر کن)" : "(ثبت نشده)"}</span>}
              </label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} dir="ltr" />
            </div>
          </>
        )}
        {panelType === "THREEXUI" && (
          <div className="sm:col-span-2">
            <label className="block text-xs text-muted mb-1.5">شناسه Inbound برای ساخت کاربر جدید</label>
            <Input value={extraInboundId} onChange={(e) => setExtraInboundId(e.target.value)} placeholder="مثلاً 1" dir="ltr" />
          </div>
        )}
        {panelType === "X4G" && (
          <>
            <div>
              <label className="block text-xs text-muted mb-1.5">پروتکل پیش‌فرض کانفیگ‌ها</label>
              <Select value={x4gProtocol} onChange={(e) => setX4gProtocol(e.target.value)}>
                {X4G_PROTOCOLS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="block text-xs text-muted mb-1.5">پورت اتصال (اختیاری، پیش‌فرض 443)</label>
              <Input value={x4gPort} onChange={(e) => setX4gPort(e.target.value)} placeholder="443" dir="ltr" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-muted mb-1.5">Fingerprint (uTLS) — اختیاری، پیش‌فرض chrome</label>
              <Input value={x4gFingerprint} onChange={(e) => setX4gFingerprint(e.target.value)} placeholder="chrome" dir="ltr" />
            </div>
          </>
        )}
        {panelType === "NAHAN" && (
          <div className="sm:col-span-2">
            <label className="block text-xs text-muted mb-1.5">
              مسیر مخفی API (API Route) — پیش‌فرض «sync»
            </label>
            <Input value={nahanApiRoute} onChange={(e) => setNahanApiRoute(e.target.value)} placeholder="sync" dir="ltr" />
            <p className="text-[11px] text-muted mt-1">
              همان مقداری که در تب System پنل Nahan زیر «API Route» تنظیم کرده‌ای. این پنل، برخلاف بقیه، محدودیت IP همزمان و وضعیت فعال/غیرفعال واقعی ندارد — غیرفعال‌سازی با منقضی‌کردن موقت پروفایل شبیه‌سازی می‌شود.
            </p>
          </div>
        )}
        {error && <p className="sm:col-span-2 text-danger text-sm">{error}</p>}
        <div className="sm:col-span-2 flex gap-2 pt-2">
          <Button type="submit" disabled={saving}>
            {saving ? "در حال ذخیره..." : "ذخیره"}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            انصراف
          </Button>
        </div>
      </form>
    </Card>
  );
}
