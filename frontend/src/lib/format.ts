export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "۰ GB";
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb < 1) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
  return `${gb.toFixed(gb < 10 ? 2 : 1)} GB`;
}

export function formatDate(d: string | Date | null): string {
  if (!d) return "نامحدود";
  const date = new Date(d);
  return new Intl.DateTimeFormat("fa-IR", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function daysLeft(d: string | Date | null): number | null {
  if (!d) return null;
  const diff = new Date(d).getTime() - Date.now();
  return Math.ceil(diff / 86400000);
}

const PANEL_LABELS: Record<string, string> = {
  THREEXUI: "3x-ui",
  X4G: "X4G",
  NAHAN: "Nahan",
};
export function panelLabel(type: string): string {
  return PANEL_LABELS[type] ?? type;
}
