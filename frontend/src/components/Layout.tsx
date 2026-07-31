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

  function logout() {
    clearToken();
    navigate("/login");
  }

  return (
    <div className="min-h-screen flex bg-ink">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 shrink-0 border-l border-line bg-panel flex-col">
        <Brand />
        <nav className="flex-1 px-3 py-4 space-y-1">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  isActive ? "bg-signal/10 text-white border border-signal/30" : "text-muted hover:text-white hover:bg-panel2"
                }`
              }
            >
              <item.icon />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="px-3 py-4 border-t border-line">
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-muted hover:text-danger hover:bg-danger/10 transition-colors"
          >
            <LogoutIcon />
            خروج
          </button>
        </div>
      </aside>

      {/* Mobile top bar (respects the notch / status bar) */}
      <header
        className="md:hidden fixed top-0 inset-x-0 z-40 bg-panel border-b border-line"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="h-14 flex items-center justify-between px-4">
          <BrandCompact />
          <button
            onClick={logout}
            aria-label="خروج از حساب"
            className="h-10 w-10 flex items-center justify-center rounded-lg text-muted hover:text-danger hover:bg-danger/10 active:scale-95 transition"
          >
            <LogoutIcon />
          </button>
        </div>
      </header>

      <main className="flex-1 min-w-0">
        <div className="max-w-6xl mx-auto px-4 py-6 pt-[calc(4.5rem+env(safe-area-inset-top))] pb-24 md:px-8 md:py-8 md:pt-8 md:pb-8">{children}</div>
      </main>

      {/* Mobile bottom tab bar */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-panel border-t border-line flex"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {nav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center gap-1 min-h-[58px] justify-center text-[11px] transition-colors ${
                isActive ? "text-signal" : "text-muted"
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span className={`flex items-center justify-center rounded-full px-3 py-0.5 transition-colors ${isActive ? "bg-signal/10" : ""}`}>
                  <item.icon />
                </span>
                {item.label}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

function Brand() {
  return (
    <div className="px-5 py-5 border-b border-line">
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 rounded-lg bg-signal/15 border border-signal/30 flex items-center justify-center">
          <div className="h-2.5 w-2.5 rounded-full bg-signal" />
        </div>
        <div>
          <p className="font-semibold text-sm leading-none">مرکز کنترل VPN</p>
          <p className="text-xs text-muted mt-1">پنل ری‌سلر</p>
        </div>
      </div>
    </div>
  );
}

function BrandCompact() {
  return (
    <div className="flex items-center gap-2">
      <div className="h-7 w-7 rounded-lg bg-signal/15 border border-signal/30 flex items-center justify-center">
        <div className="h-2 w-2 rounded-full bg-signal" />
      </div>
      <p className="font-semibold text-sm">مرکز کنترل VPN</p>
    </div>
  );
}

function OverviewIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="2" y="2" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="10" y="2" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="2" y="10" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="10" y="10" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
function ServerIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="2" y="3" width="14" height="4.5" rx="1.2" stroke="currentColor" strokeWidth="1.5" />
      <rect x="2" y="10.5" width="14" height="4.5" rx="1.2" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="5" cy="5.25" r="0.75" fill="currentColor" />
      <circle cx="5" cy="12.75" r="0.75" fill="currentColor" />
    </svg>
  );
}
function UsersIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="6.5" cy="6" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M2 15c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="13" cy="5.5" r="2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M11.5 9.2c1.9.2 3.5 1.6 3.5 3.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}
function LogsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="2.5" y="2" width="13" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5.5 6h7M5.5 9h7M5.5 12h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
function LogoutIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M7 3H4a1 1 0 00-1 1v10a1 1 0 001 1h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M11 12l4-3-4-3M15 9H7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
