import React from "react";

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-panel border border-line rounded-xl ${className}`}>{children}</div>
  );
}

export function StatusDot({ ok, pulse = false }: { ok: boolean; pulse?: boolean }) {
  return (
    <span className="relative inline-flex h-2.5 w-2.5">
      {pulse && ok && (
        <span className="absolute inline-flex h-full w-full rounded-full bg-mint opacity-60 animate-ping" />
      )}
      <span
        className={`relative inline-flex rounded-full h-2.5 w-2.5 ${ok ? "bg-mint" : "bg-danger"}`}
      />
    </span>
  );
}

export function Button({
  children,
  variant = "primary",
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" }) {
  const base = "px-4 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]";
  const styles = {
    primary: "bg-signal text-white hover:bg-signal/90",
    ghost: "bg-transparent border border-line text-white hover:bg-panel2",
    danger: "bg-danger/10 border border-danger/40 text-danger hover:bg-danger/20",
  }[variant];
  return (
    <button className={`${base} ${styles} ${className}`} {...rest}>
      {children}
    </button>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      // text-[16px] on mobile prevents iOS from auto-zooming on focus
      className={`w-full bg-panel2 border border-line rounded-lg px-3 py-2.5 text-[16px] sm:text-sm text-white placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-signal/50 ${props.className ?? ""}`}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`w-full bg-panel2 border border-line rounded-lg px-3 py-2.5 text-[16px] sm:text-sm text-white focus:outline-none focus:ring-2 focus:ring-signal/50 ${props.className ?? ""}`}
    />
  );
}

// Signature element: a segmented "signal" gauge used for both usage (GB)
// and time-remaining — reads like a fuel gauge on network gear rather
// than a generic progress bar.
export function SignalGauge({
  used,
  total,
  labelUsed,
  labelTotal,
  tone = "mint",
}: {
  used: number;
  total: number | null; // null = unlimited
  labelUsed: string;
  labelTotal: string;
  tone?: "mint" | "signal" | "warn" | "danger";
}) {
  const pct = total ? Math.min(100, (used / total) * 100) : 0;
  const segments = 24;
  const filledSegments = total ? Math.round((pct / 100) * segments) : segments;
  const color = { mint: "bg-mint", signal: "bg-signal", warn: "bg-warn", danger: "bg-danger" }[tone];

  const dangerZone = total !== null && pct > 90;
  const actualColor = dangerZone ? "bg-danger" : color;

  return (
    <div className="w-full">
      <div className="flex gap-[3px]">
        {Array.from({ length: segments }).map((_, i) => (
          <div
            key={i}
            className={`h-2.5 flex-1 rounded-[2px] ${
              total === null ? "bg-signal/40" : i < filledSegments ? actualColor : "bg-line"
            }`}
          />
        ))}
      </div>
      <div className="flex justify-between mt-1.5 text-xs">
        <span className="font-nums text-white">{labelUsed}</span>
        <span className="font-nums text-muted">{total === null ? "نامحدود" : labelTotal}</span>
      </div>
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="text-center py-16">
      <p className="text-white/80 font-medium">{title}</p>
      {hint && <p className="text-muted text-sm mt-1">{hint}</p>}
    </div>
  );
}

/**
 * Responsive dialog: full-height bottom sheet on phones (thumb-reachable),
 * centered modal on sm+ screens. Esc and backdrop tap close it.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div
        className="relative w-full sm:max-w-lg bg-panel border-t sm:border border-line rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[92dvh] overflow-y-auto animate-sheet-in"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        role="dialog"
        aria-modal="true"
      >
        {title && (
          <div className="sticky top-0 z-10 flex items-center justify-between px-4 sm:px-5 py-3 bg-panel border-b border-line">
            <p className="text-sm font-medium">{title}</p>
            <button
              onClick={onClose}
              aria-label="بستن"
              className="h-9 w-9 flex items-center justify-center rounded-lg text-muted hover:text-white hover:bg-panel2 active:scale-95 transition"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M4.5 4.5l9 9M13.5 4.5l-9 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
