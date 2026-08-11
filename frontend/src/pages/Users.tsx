import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { Card, Button, Input, EmptyState, Modal, Select, Skeleton } from "../components/ui";
import { formatBytes, formatDate } from "../lib/format";
import { useToast } from "../lib/toast";

export default function Users() {
  const toast = useToast();
  const navigate = useNavigate();
  const [users, setUsers] = useState<any[] | null>(null);
  const [servers, setServers] = useState<any[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [serverFilter, setServerFilter] = useState("ALL");
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const importInput = useRef<HTMLInputElement>(null);

  async function exportBackup() {
    setExporting(true);
    try {
      const backup = await api.exportBackup();
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `vpn-center-backup-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success("نسخه پشتیبان دانلود شد");
    } catch (err: any) {
      toast.error(err.message ?? "دریافت نسخه پشتیبان ناموفق بود");
    } finally {
      setExporting(false);
    }
  }

  async function importBackup(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!confirm("همه کاربران و سرورهای فعلی با اطلاعات این فایل جایگزین شوند؟ این کار قابل بازگشت نیست.")) return;
    setImporting(true);
    try {
      const backup = JSON.parse(await file.text());
      const result = await api.importBackup(backup);
      await Promise.all([api.listUsers().then(setUsers), api.listServers().then(setServers)]);
      toast.success(`${result.users} کاربر و ${result.servers} سرور بازیابی شد`);
    } catch (err: any) {
      const message = err instanceof SyntaxError ? "فایل انتخاب‌شده JSON معتبر نیست" : err.message;
      toast.error(message ?? "بازیابی نسخه پشتیبان ناموفق بود");
    } finally {
      setImporting(false);
    }
  }

  function reload(showError = true) {
    api.listUsers().then(setUsers).catch((err) => {
      if (showError) toast.error(err.message ?? "خطا در دریافت کاربران");
    });
  }
  function refreshUsage(showError = false) {
    api.refreshUserUsage().catch((err) => {
      if (showError) toast.error(err.message ?? "خطا در به‌روزرسانی مصرف کاربران");
    });
  }
  useEffect(() => {
    reload();
    refreshUsage();
    const cacheRefresh = window.setInterval(() => reload(false), 5_000);
    const usageRefresh = window.setInterval(() => refreshUsage(), 30_000);
    api.listServers().then(setServers).catch((err) => toast.error(err.message ?? "خطا در دریافت سرورها"));
    return () => {
      window.clearInterval(cacheRefresh);
      window.clearInterval(usageRefresh);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => setPage(1), [search, statusFilter, serverFilter]);

  const filteredUsers = (users ?? []).filter((user) => {
    const needle = search.trim().toLocaleLowerCase();
    const matchesSearch = !needle || [user.displayName, user.username, user.note, user.referrer?.displayName]
      .some((value) => String(value ?? "").toLocaleLowerCase().includes(needle));
    const matchesStatus = statusFilter === "ALL" || effectiveStatus(user.status, user.expireAt) === statusFilter;
    const matchesServer = serverFilter === "ALL" || user.links?.some((link: any) => link.serverId === serverFilter);
    return matchesSearch && matchesStatus && matchesServer;
  });
  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(filteredUsers.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visibleUsers = filteredUsers.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">کاربران</h1>
          <p className="text-muted text-sm mt-1">مشترکین سرویس و لینک‌های subscription</p>
        </div>
        <div className="grid grid-cols-2 sm:flex gap-2">
          <input ref={importInput} type="file" accept="application/json,.json" onChange={importBackup} className="hidden" />
          <Button variant="ghost" onClick={exportBackup} disabled={exporting || importing}>
            {exporting ? "در حال دریافت..." : "خروجی پشتیبان"}
          </Button>
          <Button variant="ghost" onClick={() => importInput.current?.click()} disabled={importing || exporting}>
            {importing ? "در حال بازیابی..." : "ورودی پشتیبان"}
          </Button>
          <Button onClick={() => setShowForm(true)} className="col-span-2 sm:col-span-1">
            + افزودن کاربر
          </Button>
        </div>
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title="افزودن کاربر جدید">
        <CreateUserForm
          servers={servers ?? []}
          users={users ?? []}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            reload();
            toast.success("کاربر با موفقیت ساخته شد");
          }}
        />
      </Modal>

      <Card className="p-4 sm:p-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="جستجو نام، یادداشت یا معرف..." />
          <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="ALL">همه وضعیت‌ها</option>
            <option value="ACTIVE">فعال</option>
            <option value="DISABLED">غیرفعال</option>
            <option value="EXPIRED">منقضی</option>
          </Select>
          <Select value={serverFilter} onChange={(event) => setServerFilter(event.target.value)}>
            <option value="ALL">همه سرورها</option>
            {(servers ?? []).map((server) => <option key={server.id} value={server.id}>{server.name}</option>)}
          </Select>
        </div>

        <div className="overflow-x-auto">
          <table dir="rtl" className="w-full min-w-[850px] text-sm text-right">
            <thead>
              <tr className="text-muted border-b border-line">
                <th dir="rtl" className="text-right px-2 py-3">کاربر</th>
                <th dir="rtl" className="text-right px-2 py-3">وضعیت</th>
                <th dir="rtl" className="text-right px-2 py-3">مصرف کل</th>
                <th dir="rtl" className="text-right px-2 py-3">سرورها</th>
                <th dir="rtl" className="text-right px-2 py-3">معرف</th>
                <th dir="rtl" className="text-right px-2 py-3">انقضا</th>
              </tr>
            </thead>
            <tbody aria-busy={users === null}>
              {users === null && Array.from({ length: 8 }).map((_, index) => (
                <tr key={index} className="border-b border-line/50 last:border-0">
                  <td className="px-2 py-4"><Skeleton className="h-4 w-28" /><Skeleton className="h-3 w-20 mt-2" /></td>
                  <td className="px-2 py-4"><Skeleton className="h-6 w-14 rounded-full" /></td>
                  <td className="px-2 py-4"><Skeleton className="h-4 w-32" /></td>
                  <td className="px-2 py-4"><Skeleton className="h-4 w-8" /></td>
                  <td className="px-2 py-4"><Skeleton className="h-4 w-20" /></td>
                  <td className="px-2 py-4"><Skeleton className="h-4 w-24" /></td>
                </tr>
              ))}
              {visibleUsers.map((user) => {
                const used = user.links?.reduce((sum: number, link: any) => sum + (link.usedBytes ?? 0), 0) ?? 0;
                const total = user.dataLimitGB ? user.dataLimitGB * 1024 * 1024 * 1024 : null;
                return (
                  <tr
                    key={user.id}
                    role="link"
                    tabIndex={0}
                    aria-label={`باز کردن کاربر ${user.displayName}`}
                    onClick={() => navigate(`/users/${user.id}`)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        navigate(`/users/${user.id}`);
                      }
                    }}
                    className="group cursor-pointer border-b border-line/50 last:border-0 hover:bg-panel2/60 focus:bg-panel2/60 focus:outline-none transition-colors"
                  >
                    <td dir="rtl" className="text-right px-2 py-3">
                      <span className="font-medium group-hover:text-signal">{user.displayName}</span>
                      {user.note && <p className="text-xs text-muted mt-0.5 max-w-48 truncate">{user.note}</p>}
                    </td>
                    <td dir="rtl" className="text-right px-2 py-3"><StatusBadge status={user.status} expireAt={user.expireAt} /></td>
                    <td dir="rtl" className="text-right px-2 py-3 font-nums whitespace-nowrap">
                      {formatBytes(used)} <span className="text-muted">/ {total ? formatBytes(total) : "نامحدود"}</span>
                    </td>
                    <td dir="rtl" className="text-right px-2 py-3 text-muted">{user.links?.length ?? 0}</td>
                    <td dir="rtl" className="text-right px-2 py-3 text-muted">{user.referrer?.displayName ?? "—"}</td>
                    <td dir="rtl" className="text-right px-2 py-3 text-muted font-nums whitespace-nowrap">{formatDate(user.expireAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {users?.length === 0 && <EmptyState title="هنوز کاربری نساخته‌ای" hint="با «افزودن کاربر» شروع کن." />}
        {users && users.length > 0 && filteredUsers.length === 0 && <EmptyState title="کاربری با این فیلترها پیدا نشد" />}

        {filteredUsers.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4 pt-4 border-t border-line">
            <p className="text-xs text-muted">نمایش {(currentPage - 1) * pageSize + 1} تا {Math.min(currentPage * pageSize, filteredUsers.length)} از {filteredUsers.length} کاربر</p>
            <div className="flex items-center gap-2">
              <Button variant="ghost" disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>قبلی</Button>
              <span className="text-sm font-nums px-2">{currentPage} / {pageCount}</span>
              <Button variant="ghost" disabled={currentPage === pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>بعدی</Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

function StatusBadge({ status, expireAt }: { status: string; expireAt: string | null }) {
  const effective = effectiveStatus(status, expireAt);
  const styles: Record<string, string> = {
    ACTIVE: "bg-mint/10 text-mint border-mint/30",
    DISABLED: "bg-muted/10 text-muted border-line",
    EXPIRED: "bg-danger/10 text-danger border-danger/30",
  };
  const labels: Record<string, string> = { ACTIVE: "فعال", DISABLED: "غیرفعال", EXPIRED: "منقضی" };
  return <span className={`text-[11px] px-2 py-0.5 rounded-full border shrink-0 ${styles[effective]}`}>{labels[effective]}</span>;
}

function effectiveStatus(status: string, expireAt: string | null) {
  return expireAt && new Date(expireAt).getTime() < Date.now() ? "EXPIRED" : status;
}

function CreateUserForm({ servers, users, onClose, onSaved }: { servers: any[]; users: any[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [username, setUsername] = useState("");
  const [note, setNote] = useState("");
  const [dataLimitGB, setDataLimitGB] = useState("");
  const [expireDays, setExpireDays] = useState("30");
  const [ipLimit, setIpLimit] = useState("");
  const [referrerId, setReferrerId] = useState("");
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
        referrerId: referrerId || null,
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
            <label className="block text-xs text-muted mb-1.5">نام کاربر</label>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} dir="ltr" required />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1.5">یادداشت (اختیاری)</label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثلاً شماره تماس مشتری" />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1.5">معرف (اختیاری)</label>
            <select className="w-full bg-panel2 border border-line rounded-lg px-3 py-2 text-sm" value={referrerId} onChange={(e) => setReferrerId(e.target.value)}>
              <option value="">بدون معرف</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.displayName}</option>)}
            </select>
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
