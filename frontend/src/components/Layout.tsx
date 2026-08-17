import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { clearToken } from "../lib/api";

const nav = [
  { to: "/", label: "نمای کلی", icon: OverviewIcon },
  { to: "/servers", label: "سرورها", icon: ServerIcon },
  { to: "/users", label: "کاربران", icon: UsersIcon },
  { to: "/logs", label: "لاگ‌ها", icon: LogsIcon },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const logout = () => { clearToken(); navigate("/login"); };

  return (
    <div className="min-h-screen flex bg-ink text-white">
      <aside className="hidden md:flex w-[17.5rem] shrink-0 border-l border-line bg-[#101713] flex-col sticky top-0 h-screen">
        <Brand />
        <div className="px-5 pt-5 pb-2 flex items-center justify-between text-[11px] text-muted">
          <span>مرکز عملیات</span>
          <span className="font-nums text-muted">PANEL</span>
        </div>
        <nav className="flex-1 px-3 py-2 space-y-1.5">
          {nav.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === "/"} className={({ isActive }) =>
              `group flex items-center gap-3 px-3.5 py-3 rounded-[10px] text-sm transition-all ${isActive ? "bg-signal text-ink font-semibold shadow-[0_10px_28px_rgba(198,243,106,.1)]" : "text-muted hover:text-white hover:bg-panel2"}`
            }>
              <item.icon />{item.label}
            </NavLink>
          ))}
        </nav>
        <div className="mx-3 mb-3 px-3 py-3 border border-line rounded-[12px] bg-[#0D1210]">
          <p className="text-[11px] text-muted mb-2">نشست مدیریت</p>
          <button onClick={logout} className="w-full flex items-center gap-3 px-2 py-2 rounded-lg text-sm text-muted hover:text-danger hover:bg-danger/10 transition-colors">
            <LogoutIcon />خروج از حساب
          </button>
        </div>
      </aside>

      <header className="md:hidden fixed top-0 inset-x-0 z-40 bg-[#101713]/95 backdrop-blur-md border-b border-line" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <div className="h-14 flex items-center justify-between px-4">
          <BrandCompact />
          <button onClick={logout} aria-label="خروج از حساب" className="h-10 w-10 flex items-center justify-center rounded-lg text-muted hover:text-danger hover:bg-danger/10 active:scale-95 transition"><LogoutIcon /></button>
        </div>
      </header>

      <main className="flex-1 min-w-0 relative">
        <div className="hidden md:flex h-16 border-b border-line px-8 items-center justify-between text-xs text-muted">
          <span>Panel / فضای کاری تیم فروش</span>
          <span>محیط مدیریت تیم</span>
        </div>
        <div className="page-enter max-w-[88rem] mx-auto px-4 py-6 pt-[calc(4.5rem+env(safe-area-inset-top))] pb-24 md:px-10 md:py-9 md:pt-9 md:pb-12">{children}</div>
      </main>

      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-[#101713]/95 backdrop-blur-md border-t border-line flex" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        {nav.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.to === "/"} className={({ isActive }) => `flex-1 flex flex-col items-center gap-1 min-h-[60px] justify-center text-[11px] transition-colors ${isActive ? "text-signal" : "text-muted"}`}>
            {({ isActive }) => <><span className={`flex items-center justify-center rounded-full px-3 py-0.5 transition-colors ${isActive ? "bg-signal/10" : ""}`}><item.icon /></span>{item.label}</>}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

function Brand() {
  return <div className="px-5 py-[1.15rem] border-b border-line"><div className="flex items-center gap-3">
    <div className="relative h-9 w-9 rounded-[10px] bg-signal flex items-center justify-center text-ink shadow-[0_8px_24px_rgba(198,243,106,.12)]"><SignalMark /><span className="absolute -top-0.5 -left-0.5 h-2 w-2 rounded-full bg-mint border-2 border-[#101713]" /></div>
    <div><p className="font-bold text-base leading-none">Panel</p><p className="text-[11px] text-muted mt-1.5">کنترل یکپارچه فروش</p></div>
  </div></div>;
}

function BrandCompact() { return <div className="flex items-center gap-2"><div className="h-8 w-8 rounded-[9px] bg-signal text-ink flex items-center justify-center"><SignalMark /></div><p className="font-bold text-sm">Panel</p></div>; }
function SignalMark() { return <svg width="19" height="19" viewBox="0 0 19 19" fill="none" aria-hidden="true"><path d="M3 13.5h3V16H3v-2.5Zm5-4h3V16H8V9.5Zm5-4h3V16h-3V5.5Z" fill="currentColor"/><path d="M3 3h13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>; }
function OverviewIcon() { return <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M3 4h12M3 9h8M3 14h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><circle cx="14" cy="9" r="1.5" fill="currentColor"/></svg>; }
function ServerIcon() { return <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="2" y="3" width="14" height="4.5" rx="1.2" stroke="currentColor" strokeWidth="1.5"/><rect x="2" y="10.5" width="14" height="4.5" rx="1.2" stroke="currentColor" strokeWidth="1.5"/><circle cx="5" cy="5.25" r=".75" fill="currentColor"/><circle cx="5" cy="12.75" r=".75" fill="currentColor"/></svg>; }
function UsersIcon() { return <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="6.5" cy="6" r="2.5" stroke="currentColor" strokeWidth="1.5"/><path d="M2 15c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><circle cx="13" cy="5.5" r="2" stroke="currentColor" strokeWidth="1.3"/><path d="M11.5 9.2c1.9.2 3.5 1.6 3.5 3.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>; }
function LogsIcon() { return <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M3 3.5h12M3 7.5h9M3 11.5h12M3 15.5h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>; }
function LogoutIcon() { return <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M7 3H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3M11 12l4-3-4-3M15 9H7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
