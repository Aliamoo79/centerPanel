import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { Card, StatusDot, Skeleton, LoadingRegion } from "../components/ui";
import { formatBytes, daysLeft, panelLabel } from "../lib/format";
import { useToast } from "../lib/toast";

export default function Overview() {
  const toast = useToast();
  const [servers, setServers] = useState<any[] | null>(null);
  const [users, setUsers] = useState<any[] | null>(null);
  const [serverError, setServerError] = useState(false);
  const [userError, setUserError] = useState(false);

  const loadServers = () => {
    setServerError(false);
    api.listServers().then(setServers).catch((err) => { setServerError(true); toast.error(err.message ?? "خطا در دریافت سرورها"); });
  };
  const reloadUsers = (showError = true) => {
    setUserError(false);
    return api.listUsers().then(setUsers).catch((err) => { setUserError(true); if (showError) toast.error(err.message ?? "خطا در دریافت کاربران"); });
  };

  useEffect(() => {
    loadServers(); reloadUsers(); api.refreshUserUsage().catch(() => undefined);
    const cacheRefresh = window.setInterval(() => reloadUsers(false), 5_000);
    const usageRefresh = window.setInterval(() => api.refreshUserUsage().catch(() => undefined), 30_000);
    return () => { window.clearInterval(cacheRefresh); window.clearInterval(usageRefresh); };
  }, []);

  const totalUsage = users?.reduce((sum, u) => sum + (u.links?.reduce((s: number, l: any) => s + (l.usedBytes ?? 0), 0) ?? 0), 0) ?? 0;
  const expired = users?.filter(isExpiredUser) ?? [];
  const expiring = users?.filter((u) => { const d = daysLeft(u.expireAt); return !isExpiredUser(u) && d !== null && d <= 3 && d >= 0; }) ?? [];
  const attention = [...expired.map((u) => ({ ...u, issue: "منقضی شده", tone: "danger" })), ...expiring.map((u) => ({ ...u, issue: `${daysLeft(u.expireAt)} روز مانده`, tone: "warn" }))];
  const activeServers = servers?.filter((s) => s.status === "ACTIVE").length ?? 0;

  return <div className="space-y-8">
    <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
      <div><h1 className="text-2xl sm:text-3xl font-bold tracking-[-.02em]">وضعیت عملیات</h1><p className="text-muted text-sm mt-2">تصویر زنده سرویس‌ها و مواردی که به اقدام تیم نیاز دارند</p></div>
      <div className="flex items-center gap-2 text-xs text-muted"><span className={`h-2 w-2 rounded-full ${serverError || userError ? "bg-warn" : servers === null || users === null ? "bg-muted animate-pulse" : "bg-mint"}`} />{serverError || userError ? "دریافت بخشی از اطلاعات ناموفق بود" : servers === null || users === null ? "در حال بررسی وضعیت" : "اطلاعات به‌روز است"}</div>
    </header>

    <section className="ops-surface border border-line rounded-[14px] overflow-hidden">
      <div className="grid grid-cols-2 lg:grid-cols-4 divide-x-reverse divide-x divide-line">
        <Metric label="سرور فعال" value={serverError ? "—" : servers === null ? null : `${activeServers} / ${servers.length}`} tone="mint" />
        <Metric label="کاربر" value={userError ? "—" : users === null ? null : String(users.length)} />
        <Metric label="مصرف کل" value={userError ? "—" : users === null ? null : formatBytes(totalUsage)} />
        <Metric label="نیازمند رسیدگی" value={userError ? "—" : users === null ? null : String(attention.length)} tone={attention.length ? "warn" : "mint"} />
      </div>
    </section>

    <div className="grid lg:grid-cols-[minmax(0,1.55fr)_minmax(19rem,.75fr)] gap-5 items-start">
      <section>
        <div className="flex items-center justify-between mb-3"><h2 className="font-semibold">وضعیت سرورها</h2><Link to="/servers" className="text-xs text-signal hover:underline">مدیریت سرورها</Link></div>
        <Card className="overflow-hidden">
          {serverError && servers === null ? <ErrorRegion resource="سرورها" onRetry={loadServers} /> : servers === null ? <LoadingRegion label="در حال دریافت سرورها">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="p-4 border-b border-line last:border-0 flex gap-3"><Skeleton className="h-2.5 w-2.5 rounded-full"/><Skeleton className="h-4 w-40"/></div>)}</LoadingRegion> : servers.length === 0 ? <p className="text-muted text-sm p-8 text-center">هنوز سروری اضافه نشده است.</p> : servers.map((s) => <div key={s.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 sm:px-5 py-4 border-b border-line last:border-0 hover:bg-white/[.025] transition-colors">
            <StatusDot ok={s.status === "ACTIVE"} pulse />
            <div className="min-w-0"><p className="text-sm font-semibold truncate">{s.name}</p><p className="text-xs text-muted mt-1 font-nums">{panelLabel(s.panelType)}</p></div>
            <div className="text-left"><p className="font-nums text-sm">{s._count?.links ?? 0}</p><p className="text-[11px] text-muted">کاربر</p></div>
          </div>)}
        </Card>
      </section>

      <section>
        <div className="flex items-center justify-between mb-3"><h2 className="font-semibold">صف رسیدگی</h2><span className="font-nums text-xs text-muted">{attention.length}</span></div>
        <Card className="overflow-hidden">
          {userError && users === null ? <ErrorRegion resource="کاربران" onRetry={() => reloadUsers()} /> : users === null ? <div className="p-5 space-y-4"><Skeleton className="h-4 w-full"/><Skeleton className="h-4 w-4/5"/><Skeleton className="h-4 w-3/5"/></div> : attention.length === 0 ? <div className="p-8 text-center"><span className="inline-grid place-items-center h-9 w-9 rounded-full bg-mint/10 text-mint mb-3">✓</span><p className="text-sm font-medium">صف رسیدگی خالی است</p><p className="text-xs text-muted mt-1">مورد فوری برای پیگیری وجود ندارد.</p></div> : attention.slice(0, 8).map((u) => <Link key={u.id} to={`/users/${u.id}`} className="flex items-center justify-between gap-3 px-4 py-3.5 border-b border-line last:border-0 hover:bg-white/[.025] transition-colors"><span className="text-sm truncate">{u.displayName}</span><span className={`text-xs shrink-0 ${u.tone === "danger" ? "text-danger" : "text-warn"}`}>{u.issue}</span></Link>)}
        </Card>
      </section>
    </div>
  </div>;
}

function Metric({ label, value, tone = "default" }: { label: string; value: string | null; tone?: "default" | "mint" | "warn" }) {
  return <div className="p-5 sm:p-6 min-h-[112px] flex flex-col justify-between"><p className="text-xs text-muted">{label}</p>{value === null ? <Skeleton className="h-7 w-20" /> : <p className={`font-nums text-2xl font-semibold tracking-[-.03em] ${tone === "mint" ? "text-mint" : tone === "warn" ? "text-warn" : "text-white"}`}>{value}</p>}</div>;
}
function ErrorRegion({ resource, onRetry }: { resource: string; onRetry: () => void }) { return <div role="alert" className="p-6 text-center"><p className="text-sm font-medium">دریافت {resource} ناموفق بود</p><p className="text-xs text-muted mt-1 mb-4">اتصال شبکه یا نشانی سرور را بررسی کنید.</p><button onClick={onRetry} className="text-sm font-semibold text-signal hover:underline">تلاش دوباره</button></div>; }
function isExpiredUser(user: any) { return user.status === "EXPIRED" || (user.expireAt && new Date(user.expireAt).getTime() < Date.now()); }
