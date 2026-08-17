import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, setToken } from "../lib/api";
import { Button, Input } from "../components/ui";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault(); setError(null); setLoading(true);
    try { const { token } = await api.login(username, password); setToken(token); navigate("/"); }
    catch (err: any) { setError(err.message ?? "ورود ناموفق بود. اطلاعات حساب را بررسی کنید."); }
    finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen bg-ink px-4 py-8 flex items-center justify-center relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none opacity-70" style={{ background: "linear-gradient(120deg, transparent 55%, rgba(198,243,106,.055) 55%)" }} />
      <div className="relative w-full max-w-5xl grid lg:grid-cols-[1.2fr_.8fr] border border-line rounded-2xl overflow-hidden shadow-[0_35px_100px_rgba(0,0,0,.38)]">
        <section className="hidden lg:flex min-h-[610px] p-12 bg-[#101713] flex-col justify-between border-l border-line">
          <div className="flex items-center gap-3"><div className="h-10 w-10 rounded-[10px] bg-signal text-ink grid place-items-center font-black">P</div><div><p className="font-bold text-lg">Panel</p><p className="text-xs text-muted">مرکز عملیات تیم فروش</p></div></div>
          <div className="max-w-md">
            <div className="flex items-center gap-2 text-xs text-mint mb-5"><span className="h-2 w-2 rounded-full bg-mint" />سامانه آماده عملیات است</div>
            <h1 className="text-4xl leading-[1.35] font-bold">همه سرورها، کاربران و وضعیت سرویس در یک نمای روشن.</h1>
            <p className="text-muted leading-7 mt-5">فضای کاری یکپارچه برای مدیریت سریع اشتراک‌ها و رسیدگی به مواردی که به توجه تیم نیاز دارند.</p>
          </div>
          <div className="grid grid-cols-3 gap-px bg-line border border-line rounded-xl overflow-hidden text-center">
            {['کنترل متمرکز','وضعیت زنده','مدیریت تیمی'].map((item) => <div key={item} className="bg-[#0D1210] px-3 py-4 text-xs text-muted">{item}</div>)}
          </div>
        </section>
        <section className="bg-panel p-6 sm:p-10 lg:p-12 flex flex-col justify-center min-h-[520px]">
          <div className="lg:hidden flex items-center gap-3 mb-12"><div className="h-10 w-10 rounded-[10px] bg-signal text-ink grid place-items-center font-black">P</div><p className="font-bold text-lg">Panel</p></div>
          <div className="mb-8"><h2 className="text-2xl font-bold">ورود به پنل</h2><p className="text-sm text-muted mt-2">برای ادامه، اطلاعات حساب مدیریت را وارد کنید.</p></div>
          <form onSubmit={onSubmit} className="space-y-5">
            <div><label className="block text-xs text-muted mb-2">نام کاربری</label><Input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus autoComplete="username" /></div>
            <div><label className="block text-xs text-muted mb-2">رمز عبور</label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></div>
            {error && <p className="text-danger text-sm bg-danger/10 border border-danger/30 rounded-[10px] px-3 py-2.5">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>{loading ? "در حال ورود..." : "ورود به فضای کاری"}</Button>
          </form>
        </section>
      </div>
    </div>
  );
}
