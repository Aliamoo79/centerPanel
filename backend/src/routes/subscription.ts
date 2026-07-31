import { Router } from "express";
import { prisma } from "../db";
import { buildSubscription } from "../services/subscription";
import { syncUserUsage } from "../services/usage";
import { asyncHandler } from "../lib/asyncHandler";
import { logger } from "../lib/logger";

export const subscriptionRouter = Router();

function formatGB(bytes: number): string {
  return (bytes / 1024 ** 3).toLocaleString("fa-IR", { maximumFractionDigits: 2 });
}

function htmlPage(user: any, usage: { usedBytes: number; dataLimitBytes: number | null }) {
  const unlimited = !usage.dataLimitBytes;
  const remainingBytes = unlimited ? null : Math.max(0, usage.dataLimitBytes! - usage.usedBytes);
  const remainingLabel = unlimited ? "نامحدود" : `${formatGB(remainingBytes!)} GB`;
  const totalLabel = unlimited ? "نامحدود" : `${formatGB(usage.dataLimitBytes!)} GB`;
  const pct = unlimited || !usage.dataLimitBytes ? 0 : Math.min(100, (usage.usedBytes / usage.dataLimitBytes) * 100);
  const barColor = pct > 90 ? "#ef4444" : pct > 70 ? "#f59e0b" : "#22c55e";

  const expireDate = user.expireAt ? new Date(user.expireAt).toLocaleDateString("fa-IR") : "هرگز";
  const isExpired = user.expireAt ? new Date(user.expireAt).getTime() <= Date.now() : false;
  const isOverLimit = !unlimited && remainingBytes === 0;
  const active = user.status === "ACTIVE" && !isExpired && !isOverLimit;

  return `<!DOCTYPE html>
<html dir="rtl" lang="fa">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<title>وضعیت اشتراک - ${user.username}</title>
<style>
*{box-sizing:border-box}
body{font-family:system-ui,-apple-system,"Segoe UI",Tahoma,sans-serif;background:#0f172a;color:#e2e8f0;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px}
.card{background:#1e293b;border-radius:18px;padding:28px 24px;max-width:420px;width:100%;box-shadow:0 4px 24px rgba(0,0,0,.4)}
h1{font-size:19px;margin:0 0 2px;color:#f1f5f9;word-break:break-all}
.sub{color:#94a3b8;font-size:13px;margin-bottom:20px}
.gauge-wrap{margin-bottom:20px}
.gauge-track{background:#334155;border-radius:999px;height:10px;overflow:hidden}
.gauge-fill{height:100%;border-radius:999px;background:${barColor};width:${unlimited ? 100 : pct}%;${unlimited ? "opacity:.35" : ""}}
.gauge-labels{display:flex;justify-content:space-between;margin-top:8px;font-size:12px;color:#94a3b8}
.gauge-labels b{color:#f1f5f9;font-weight:700}
.row{display:flex;justify-content:space-between;align-items:center;padding:11px 0;border-bottom:1px solid #334155;font-size:14px}
.row:last-of-type{border:0}
.label{color:#94a3b8}
.val{font-weight:600;direction:ltr;text-align:left}
.status-active{color:#22c55e}
.status-inactive{color:#ef4444}
.badge{display:block;text-align:center;background:#334155;color:#94a3b8;border-radius:10px;padding:10px;font-size:12.5px;margin-top:18px;line-height:1.7}
</style></head>
<body>
<div class="card">
<h1>${user.username}</h1>
<div class="sub">وضعیت اشتراک VPN</div>

<div class="gauge-wrap">
  <div class="gauge-track"><div class="gauge-fill"></div></div>
  <div class="gauge-labels">
    <span>باقی‌مانده: <b>${remainingLabel}</b></span>
    <span>از ${totalLabel}</span>
  </div>
</div>

<div class="row"><span class="label">وضعیت</span><span class="val status-${active ? "active" : "inactive"}">${active ? "فعال" : "غیرفعال"}</span></div>
<div class="row"><span class="label">تاریخ انقضا</span><span class="val">${expireDate}</span></div>
<div class="row"><span class="label">تعداد کانفیگ</span><span class="val">${user._configCount ?? 0}</span></div>

<div class="badge">این لینک را در v2rayNG / NekoBox / Hiddify / Streisand باز کنید</div>
</div>
</body></html>`;
}

subscriptionRouter.get(
  "/:token",
  asyncHandler(async (req, res) => {
    let user = await prisma.user.findUnique({ where: { subToken: req.params.token }, include: { links: true } });
    if (!user) user = await prisma.user.findUnique({ where: { username: req.params.token }, include: { links: true } });
    if (!user) {
      logger.warn("sub_link_not_found", `درخواست لینک ساب با توکن/نام‌کاربری نامعتبر: ${req.params.token}`, {
        token: req.params.token,
        ip: req.ip,
        userAgent: req.headers["user-agent"],
      });
      return res.status(404).send("Not found");
    }

    const ua = (req.headers["user-agent"] ?? "").toLowerCase();
    const accept = (req.headers["accept"] ?? "").toLowerCase();

    // Serve the human-facing HTML page only to real browsers: they request
    // text/html. VPN clients (v2rayNG, MahsaNG, ...) ask for */* (or nothing)
    // and must always get the base64 config, no matter how browser-like their
    // User-Agent looks.
    const isBrowser = accept.includes("text/html") && (ua.includes("mozilla") || ua.includes("chrome") || ua.includes("safari") || ua.includes("firefox") || ua.includes("edge"));

    if (isBrowser) {
      const usage = await syncUserUsage(user.id);
      const enrichedLinks = user.links.filter((l: any) => l.enabled).length;
      const enriched = { ...user, _configCount: enrichedLinks };
      return res.type("html").send(htmlPage(enriched, usage));
    }

    const payload = await buildSubscription(user.subToken);
    if (!payload) return res.status(404).send("Not found");

    logger.info("sub_fetched", `کلاینت کانفیگ‌های «${user.username}» را دریافت کرد`, {
      userId: user.id,
      username: user.username,
      status: payload.status,
      userAgent: req.headers["user-agent"],
      ip: req.ip,
    });

    res.setHeader("subscription-userinfo", payload.userInfoHeader);
    res.setHeader("profile-update-interval", "6");
    res.setHeader("content-type", "text/plain; charset=utf-8");
    res.setHeader("cache-control", "no-store");

    if (payload.status !== "ACTIVE") return res.send("");
    res.send(payload.base64Body);
  })
);
