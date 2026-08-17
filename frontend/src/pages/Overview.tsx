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

    <NetworkPulse servers={servers} users={users} failed={serverError || userError} />

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

function NetworkPulse({ servers, users, failed }: { servers: any[] | null; users: any[] | null; failed: boolean }) {
  const visibleServers = servers?.slice(0, 6) ?? [];
  const positions = [
    { x: 112, y: 66 }, { x: 360, y: 34 }, { x: 608, y: 66 },
    { x: 608, y: 194 }, { x: 360, y: 226 }, { x: 112, y: 194 },
  ];

  return <section className="network-pulse ops-surface border border-line rounded-[14px] overflow-hidden" aria-labelledby="network-pulse-title">
    <div className="flex items-center justify-between gap-4 px-4 sm:px-5 py-4 border-b border-line">
      <div><h2 id="network-pulse-title" className="font-semibold">نقشه زنده شبکه</h2><p className="text-xs text-muted mt-1">ارتباط واقعی سرورها با فضای کاربران</p></div>
      <Link to="/servers" className="text-xs text-signal hover:underline shrink-0">مشاهده سرورها</Link>
    </div>
    {failed ? <div className="h-48 grid place-items-center text-center px-5"><div><p className="text-sm font-medium text-warn">نقشه شبکه کامل نیست</p><p className="text-xs text-muted mt-1">پس از برقراری ارتباط، مسیرها دوباره نمایش داده می‌شوند.</p></div></div> : servers === null || users === null ? <LoadingRegion label="در حال ترسیم نقشه شبکه" className="h-48 sm:h-64 grid place-items-center"><div className="network-loader" aria-hidden="true"><span /><span /><span /></div></LoadingRegion> : visibleServers.length === 0 ? <div className="h-48 grid place-items-center text-center px-5"><div><p className="text-sm font-medium">شبکه هنوز نقطه‌ای ندارد</p><p className="text-xs text-muted mt-1 mb-3">اولین سرور را اضافه کنید تا نقشه عملیاتی شکل بگیرد.</p><Link to="/servers" className="text-sm text-signal hover:underline">افزودن سرور</Link></div></div> :
      <div className="relative px-2 py-2 sm:px-5 sm:py-3" dir="ltr">
        <svg className="w-full h-auto min-h-[190px] max-h-[270px]" viewBox="0 0 720 260" role="img" aria-label={`${visibleServers.length} سرور و ${users.length} کاربر در نقشه شبکه`}>
          <defs><filter id="pulse-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
          {visibleServers.map((server, index) => {
            const point = positions[index];
            const healthy = server.status === "ACTIVE";
            return <g key={server.id}>
              <line className={`network-link ${healthy ? "is-healthy" : "is-offline"}`} x1="360" y1="130" x2={point.x} y2={point.y} style={{ animationDelay: `${index * 55}ms` }} />
              <circle className={`network-node ${healthy ? "is-healthy" : "is-offline"}`} cx={point.x} cy={point.y} r="17" />
              <circle className="network-node-core" cx={point.x} cy={point.y} r="5" />
              <text className="network-label" x={point.x} y={point.y + (point.y < 130 ? -25 : 32)} textAnchor="middle">{server.name}</text>
              <text className="network-count" x={point.x} y={point.y + 4} textAnchor="middle">{server._count?.links ?? 0}</text>
            </g>;
          })}
          <circle className="network-hub-ring" cx="360" cy="130" r="48" />
          <circle className="network-hub" cx="360" cy="130" r="35" filter="url(#pulse-glow)" />
          <text className="network-hub-value" x="360" y="127" textAnchor="middle">{users.length}</text>
          <text className="network-hub-label" x="360" y="145" textAnchor="middle">USERS</text>
        </svg>
      </div>}
  </section>;
}

function isExpiredUser(user: any) { return user.status === "EXPIRED" || (user.expireAt && new Date(user.expireAt).getTime() < Date.now()); }
