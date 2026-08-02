import React, { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api } from "../lib/api";
import { Card, Button, Input, Select, StatusDot, SignalGauge, Modal } from "../components/ui";
import { formatBytes, formatDate, panelLabel } from "../lib/format";
import { useToast } from "../lib/toast";

export default function UserDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const [user, setUser] = useState<any | null>(null);
  const [servers, setServers] = useState<any[] | null>(null);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  function reload() {
    if (!id) return;
    api
      .getUser(id)
      .then((u) => {
        setUser(u);
        setLoadError(null);
      })
      .catch((err) => setLoadError(err.message ?? "خطا در دریافت اطلاعات کاربر"));
  }
  useEffect(() => {
    reload();
    api.listServers().then(setServers).catch((err) => toast.error(err.message ?? "خطا در دریافت سرورها"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loadError) {
    return (
      <div className="text-center py-16">
        <p className="text-danger text-sm mb-3">{loadError}</p>
        <Button variant="ghost" onClick={reload}>تلاش دوباره</Button>
      </div>
    );
  }
  if (!user) return <p className="text-muted text-sm">در حال بارگذاری...</p>;

  const usage = user.usage;
  const totalBytes = user.dataLimitGB ? user.dataLimitGB * 1024 * 1024 * 1024 : null;
  const linkedServerIds = new Set(user.links.map((l: any) => l.serverId));
  const availableServers = (servers ?? []).filter((s) => !linkedServerIds.has(s.id));

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(user.subLink);
    } catch {
      try {
        const el = document.createElement("textarea");
        el.value = user.subLink;
        el.style.position = "fixed";
        el.style.opacity = "0";
        document.body.appendChild(el);
        el.select();
        document.execCommand("copy");
        document.body.removeChild(el);
      } catch {
        toast.error("کپی خودکار پشتیبانی نمی‌شود — لینک را دستی انتخاب و کپی کن");
        return;
      }
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function handleDelete() {
    if (!confirm(`کاربر «${user.displayName}» و همه‌ی اکانت‌هایش روی سرورها حذف شود؟`)) return;
    try {
      await api.deleteUser(user.id);
      toast.success("کاربر حذف شد");
      navigate("/users");
    } catch (err: any) {
      toast.error(err.message ?? "حذف کاربر ناموفق بود");
    }
  }

  async function addServer(serverId: string) {
    try {
      await api.addUserServer(user.id, serverId);
      reload();
      toast.success("کاربر به سرور جدید اضافه شد");
    } catch (err: any) {
      toast.error(err.message ?? "افزودن به سرور ناموفق بود");
    }
  }

  async function removeServer(serverId: string) {
    if (!confirm("این سرور از این کاربر جدا شود؟")) return;
    try {
      await api.removeUserServer(user.id, serverId);
      reload();
      toast.success("سرور از کاربر جدا شد");
    } catch (err: any) {
      toast.error(err.message ?? "جدا کردن سرور ناموفق بود");
    }
  }

  async function toggleServerLink(serverId: string, enabled: boolean) {
    try {
      await api.toggleUserServer(user.id, serverId, enabled);
      reload();
      toast.success(enabled ? "کانفیگ روی این سرور فعال شد" : "کانفیگ روی این سرور غیرفعال شد");
    } catch (err: any) {
      toast.error(err.message ?? "تغییر وضعیت کانفیگ ناموفق بود");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0">
          <Link to="/users" className="text-xs text-muted hover:text-white">
            ← بازگشت به کاربران
          </Link>
          <div className="flex items-center gap-2 mt-1">
            <h1 className="text-xl font-semibold truncate">{user.displayName}</h1>
          </div>
          {user.note && <p className="text-muted text-sm mt-1">{user.note}</p>}
          {user.referrer && <p className="text-muted text-sm mt-1">معرف: {user.referrer.displayName}</p>}
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setEditing((e) => !e)} className="flex-1 sm:flex-none">
            {editing ? "بستن ویرایش" : "ویرایش"}
          </Button>
          <Button variant="danger" onClick={handleDelete} className="flex-1 sm:flex-none">
            حذف کاربر
          </Button>
        </div>
      </div>

      <Modal open={editing} onClose={() => setEditing(false)} title="ویرایش کاربر">
        <EditUserForm
          user={user}
          onSaved={(failed) => {
            setEditing(false);
            reload();
            if (failed?.length) {
              toast.error(`به‌روزرسانی روی این سرورها ناموفق بود: ${failed.map((f: any) => `${f.server} (${f.error})`).join("، ")}`);
            } else {
              toast.success("تغییرات ذخیره شد");
            }
          }}
        />
      </Modal>

      <Card className="p-4 sm:p-5">
        <p className="text-xs text-muted mb-2">لینک Subscription — این را به کاربر بده</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex-1 bg-panel2 border border-line rounded-lg px-3 py-2.5 text-sm font-nums overflow-x-auto whitespace-nowrap" dir="ltr">
            {user.subLink}
          </div>
          <Button variant="ghost" onClick={copyLink}>
            {copied ? "کپی شد ✓" : "کپی لینک"}
          </Button>
        </div>
      </Card>

      <Card className="p-4 sm:p-5">
        <p className="text-xs text-muted mb-3">مصرف کل (همه‌ی سرورها)</p>
        <SignalGauge
          used={usage?.usedBytes ?? 0}
          total={totalBytes}
          labelUsed={formatBytes(usage?.usedBytes ?? 0)}
          labelTotal={totalBytes ? formatBytes(totalBytes) : ""}
        />
        <div className="flex flex-col sm:flex-row sm:justify-between gap-1 mt-4 text-xs text-muted">
          <span>تاریخ انقضا: <span className="font-nums text-white">{formatDate(user.expireAt)}</span></span>
          <span>وضعیت: <span className="font-nums text-white">{user.status}</span></span>
        </div>
      </Card>

      <div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
          <h2 className="text-sm font-medium text-muted">سرورهای متصل</h2>
          {availableServers.length > 0 && (
            <Select
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) addServer(e.target.value);
                e.target.value = "";
              }}
              className="w-full sm:w-56"
            >
              <option value="" disabled>
                + افزودن به سرور دیگر
              </option>
              {availableServers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          )}
        </div>

        <div className="space-y-2">
          {usage?.perServer?.map((ps: any) => (
            <Card key={ps.serverId} className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <StatusDot ok={!ps.error && ps.enabled} />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{ps.serverName}</p>
                  <p className="text-xs text-muted font-nums mt-0.5 truncate">
                    {ps.error ? `خطا: ${ps.error}` : formatBytes(ps.usedBytes)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="ghost"
                  onClick={() => toggleServerLink(ps.serverId, !ps.enabled)}
                  className={ps.enabled ? "" : "text-warn"}
                >
                  {ps.enabled ? "غیرفعال کردن" : "فعال کردن"}
                </Button>
                <Button variant="ghost" onClick={() => removeServer(ps.serverId)}>
                  جدا کردن
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

function EditUserForm({ user, onSaved }: { user: any; onSaved: (failed?: { server: string; error: string }[]) => void }) {
  const [dataLimitGB, setDataLimitGB] = useState(user.dataLimitGB?.toString() ?? "");
  const [expireAt, setExpireAt] = useState(user.expireAt ? user.expireAt.slice(0, 10) : "");
  const [ipLimit, setIpLimit] = useState(user.ipLimit?.toString() ?? "");
  const [status, setStatus] = useState(user.status);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await api.updateUser(user.id, {
        dataLimitGB: dataLimitGB ? Number(dataLimitGB) : null,
        expireAt: expireAt ? new Date(expireAt).toISOString() : null,
        ipLimit: ipLimit ? Number(ipLimit) : null,
        status,
      });
      onSaved(res.provisioningFailures);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-4 sm:p-5">
      <form onSubmit={onSubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
        <div>
          <label className="block text-xs text-muted mb-1.5">سقف مصرف (GB)</label>
          <Input type="number" value={dataLimitGB} onChange={(e) => setDataLimitGB(e.target.value)} dir="ltr" />
        </div>
        <div>
          <label className="block text-xs text-muted mb-1.5">تاریخ انقضا</label>
          <Input type="date" value={expireAt} onChange={(e) => setExpireAt(e.target.value)} dir="ltr" />
        </div>
        <div>
          <label className="block text-xs text-muted mb-1.5">محدودیت IP همزمان</label>
          <Input type="number" min="1" value={ipLimit} onChange={(e) => setIpLimit(e.target.value)} dir="ltr" placeholder="نامحدود" />
        </div>
        <div>
          <label className="block text-xs text-muted mb-1.5">وضعیت</label>
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="ACTIVE">فعال</option>
            <option value="DISABLED">غیرفعال</option>
          </Select>
        </div>
        {error && <p className="sm:col-span-2 lg:col-span-4 text-danger text-sm">{error}</p>}
        <div className="sm:col-span-2 lg:col-span-4">
          <Button type="submit" disabled={saving} className="w-full sm:w-auto">
            {saving ? "در حال ذخیره..." : "ذخیره تغییرات"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
