import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { Card, Button, Input, EmptyState, SignalGauge, Modal } from "../components/ui";
import { formatBytes, formatDate } from "../lib/format";
import { useToast } from "../lib/toast";

export default function Users() {
  const toast = useToast();
  const [users, setUsers] = useState<any[] | null>(null);
  const [servers, setServers] = useState<any[] | null>(null);
  const [showForm, setShowForm] = useState(false);

  function reload() {
    api.listUsers().then(setUsers).catch((err) => toast.error(err.message ?? "خطا در دریافت کاربران"));
  }
  useEffect(() => {
    reload();
    api.listServers().then(setServers).catch((err) => toast.error(err.message ?? "خطا در دریافت سرورها"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">کاربران</h1>
          <p className="text-muted text-sm mt-1">مشترکین سرویس و لینک‌های subscription</p>
        </div>
        <Button onClick={() => setShowForm(true)} className="w-full sm:w-auto">
          + افزودن کاربر
        </Button>
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title="افزودن کاربر جدید">
        <CreateUserForm
          servers={servers ?? []}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            reload();
            toast.success("کاربر با موفقیت ساخته شد");
          }}
        />
      </Modal>

      <div className="space-y-3">
        {users?.map((u) => {
          const used = u.links?.reduce((s: number, l: any) => s + (l.usedBytes ?? 0), 0) ?? 0;
          const totalBytes = u.dataLimitGB ? u.dataLimitGB * 1024 * 1024 * 1024 : null;
          return (
            <Link key={u.id} to={`/users/${u.id}`}>
              <Card className="p-4 sm:p-5 hover:border-signal/40 transition-colors">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <p className="font-medium text-sm truncate">{u.username}</p>
                    <StatusBadge status={u.status} expireAt={u.expireAt} />
                  </div>
                  <span className="text-xs text-muted font-nums shrink-0">
                    {u.links?.length ?? 0} سرور · انقضا {formatDate(u.expireAt)}
                  </span>
                </div>
                <SignalGauge
                  used={used}
                  total={totalBytes}
                  labelUsed={formatBytes(used)}
                  labelTotal={totalBytes ? formatBytes(totalBytes) : ""}
                />
              </Card>
            </Link>
          );
        })}
        {users?.length === 0 && <EmptyState title="هنوز کاربری نساخته‌ای" hint="با «افزودن کاربر» شروع کن." />}
      </div>
    </div>
  );
}

function StatusBadge({ status, expireAt }: { status: string; expireAt: string | null }) {
  const expired = expireAt && new Date(expireAt).getTime() < Date.now();
  const effective = expired ? "EXPIRED" : status;
  const styles: Record<string, string> = {
    ACTIVE: "bg-mint/10 text-mint border-mint/30",
    DISABLED: "bg-muted/10 text-muted border-line",
    EXPIRED: "bg-danger/10 text-danger border-danger/30",
  };
  const labels: Record<string, string> = { ACTIVE: "فعال", DISABLED: "غیرفعال", EXPIRED: "منقضی" };
  return <span className={`text-[11px] px-2 py-0.5 rounded-full border shrink-0 ${styles[effective]}`}>{labels[effective]}</span>;
}

function CreateUserForm({ servers, onClose, onSaved }: { servers: any[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [username, setUsername] = useState("");
  const [note, setNote] = useState("");
  const [dataLimitGB, setDataLimitGB] = useState("");
  const [expireDays, setExpireDays] = useState("30");
  const [ipLimit, setIpLimit] = useState("");
  const [selectedServers, setSelectedServers] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleServer(id: string) {
    setSelectedServers((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (selectedServers.length === 0) throw new Error("حداقل یک سرور انتخاب کن");
      const expireAt = expireDays ? new Date(Date.now() + Number(expireDays) * 86400000).toISOString() : null;
      const res = await api.createUser({
        username,
        note: note || undefined,
        dataLimitGB: dataLimitGB ? Number(dataLimitGB) : null,
        expireAt,
        ipLimit: ipLimit ? Number(ipLimit) : null,
        serverIds: selectedServers,
      });
      if (res.provisioningFailures?.length) {
        const msg = `کاربر ساخته شد ولی روی این سرورها با خطا مواجه شد: ${res.provisioningFailures
          .map((f: any) => `${f.server} (${f.error})`)
          .join("، ")}`;
        toast.error(msg);
        setTimeout(onSaved, 300);
      } else {
        onSaved();
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-4 sm:p-5">
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-muted mb-1.5">نام کاربری</label>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} dir="ltr" required />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1.5">یادداشت (اختیاری)</label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثلاً شماره تماس مشتری" />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1.5">سقف مصرف (GB) — خالی = نامحدود</label>
            <Input type="number" value={dataLimitGB} onChange={(e) => setDataLimitGB(e.target.value)} dir="ltr" />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1.5">مدت اعتبار (روز) — خالی = نامحدود</label>
            <Input type="number" value={expireDays} onChange={(e) => setExpireDays(e.target.value)} dir="ltr" />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1.5">محدودیت IP همزمان — خالی = نامحدود</label>
            <Input type="number" min="1" value={ipLimit} onChange={(e) => setIpLimit(e.target.value)} dir="ltr" placeholder="مثلاً 2" />
            <p className="text-[11px] text-muted mt-1">فقط روی پنل‌های 3x-ui و X4G اعمال می‌شود</p>
          </div>
        </div>

        <div>
          <label className="block text-xs text-muted mb-2">سرورها</label>
          <div className="flex flex-wrap gap-2">
            {servers.map((s) => (
              <button
                type="button"
                key={s.id}
                onClick={() => toggleServer(s.id)}
                className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
                  selectedServers.includes(s.id)
                    ? "bg-signal/15 border-signal/50 text-white"
                    : "border-line text-muted hover:text-white"
                }`}
              >
                {s.name}
              </button>
            ))}
            {servers.length === 0 && <p className="text-muted text-xs">اول باید یک سرور اضافه کنی.</p>}
          </div>
        </div>

        {error && <p className="text-danger text-sm">{error}</p>}
        <div className="flex gap-2 pt-1">
          <Button type="submit" disabled={saving} className="flex-1 sm:flex-none">
            {saving ? "در حال ساخت..." : "ساخت کاربر"}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose} className="flex-1 sm:flex-none">
            انصراف
          </Button>
        </div>
      </form>
    </Card>
  );
}
