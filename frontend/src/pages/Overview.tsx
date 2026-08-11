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

  useEffect(() => {
    api.listServers().then(setServers).catch((err) => toast.error(err.message ?? "خطا در دریافت سرورها"));
    const reloadUsers = (showError = true) => api.listUsers().then(setUsers).catch((err) => {
      if (showError) toast.error(err.message ?? "خطا در دریافت کاربران");
    });
    reloadUsers();
    api.refreshUserUsage().catch(() => undefined);
    const cacheRefresh = window.setInterval(() => reloadUsers(false), 5_000);
    const usageRefresh = window.setInterval(() => {
      api.refreshUserUsage().catch(() => undefined);
    }, 30_000);
    return () => {
      window.clearInterval(cacheRefresh);
      window.clearInterval(usageRefresh);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalUsage = users?.reduce((sum, u) => sum + (u.links?.reduce((s: number, l: any) => s + (l.usedBytes ?? 0), 0) ?? 0), 0) ?? 0;
  const expiredUsers = users?.filter((u) => isExpiredUser(u)) ?? [];
  const expiringSoon = users?.filter((u) => {
    const d = daysLeft(u.expireAt);
    return !isExpiredUser(u) && d !== null && d <= 3 && d >= 0;
  }) ?? [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">نمای کلی</h1>
        <p className="text-muted text-sm mt-1">وضعیت زنده‌ی سرورها و کاربران</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-5">
          <p className="text-muted text-xs mb-2">تعداد سرورها</p>
          {servers === null ? <Skeleton className="h-8 w-16" /> : <p className="text-2xl font-nums font-semibold">{servers.length}</p>}
        </Card>
        <Card className="p-5">
          <p className="text-muted text-xs mb-2">تعداد کاربران</p>
          {users === null ? <Skeleton className="h-8 w-16" /> : <p className="text-2xl font-nums font-semibold">{users.length}</p>}
        </Card>
        <Card className="p-5">
          <p className="text-muted text-xs mb-2">مجموع مصرف</p>
          {users === null ? <Skeleton className="h-8 w-28" /> : <p className="text-2xl font-nums font-semibold">{formatBytes(totalUsage)}</p>}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {expiredUsers.length > 0 && (
          <Card className="p-5 border-danger/30">
            <p className="text-sm font-medium text-danger mb-3">منقضی‌شده‌ها</p>
            <div className="space-y-2">
              {expiredUsers.map((u) => (
                <Link key={u.id} to={`/users/${u.id}`} className="flex items-center justify-between text-sm hover:text-danger transition-colors">
                  <span>{u.displayName}</span>
                  <span className="text-danger">منقضی</span>
                </Link>
              ))}
            </div>
          </Card>
        )}

        {expiringSoon.length > 0 && (
          <Card className="p-5 border-warn/30">
            <p className="text-sm font-medium text-warn mb-3">در حال انقضا (کمتر از ۳ روز)</p>
            <div className="space-y-2">
              {expiringSoon.map((u) => (
                <Link key={u.id} to={`/users/${u.id}`} className="flex items-center justify-between text-sm hover:text-warn transition-colors">
                  <span>{u.displayName}</span>
                  <span className="font-nums text-muted">{daysLeft(u.expireAt)} روز مانده</span>
                </Link>
              ))}
            </div>
          </Card>
        )}
      </div>

      <div>
        <h2 className="text-sm font-medium text-muted mb-3">سرورها</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {servers === null && (
            <LoadingRegion label="در حال دریافت سرورها" className="contents">
              <div className="contents">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Card key={index} className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1"><Skeleton className="h-2.5 w-2.5 rounded-full" /><div className="space-y-2 flex-1"><Skeleton className="h-4 w-28" /><Skeleton className="h-3 w-16" /></div></div>
                    <Skeleton className="h-3 w-14" />
                  </Card>
                ))}
              </div>
            </LoadingRegion>
          )}
          {servers?.map((s) => (
            <Card key={s.id} className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <StatusDot ok={s.status === "ACTIVE"} pulse />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{s.name}</p>
                  <p className="text-xs text-muted font-nums">{panelLabel(s.panelType)}</p>
                </div>
              </div>
              <span className="text-xs text-muted font-nums shrink-0">{s._count?.links ?? 0} کاربر</span>
            </Card>
          ))}
          {servers?.length === 0 && <p className="text-muted text-sm">هنوز سروری اضافه نشده.</p>}
        </div>
      </div>
    </div>
  );
}

function isExpiredUser(user: any) {
  return user.status === "EXPIRED" || (user.expireAt && new Date(user.expireAt).getTime() < Date.now());
}
