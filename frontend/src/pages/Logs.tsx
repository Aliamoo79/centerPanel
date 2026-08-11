import React, { useEffect, useState, useCallback } from "react";
import { api } from "../lib/api";
import { Card, Button, Select, Skeleton, LoadingRegion } from "../components/ui";
import { useToast } from "../lib/toast";

interface LogEntry {
  id: number;
  ts: string;
  level: "info" | "warn" | "error";
  event: string;
  message: string;
  meta?: Record<string, unknown>;
}

const LEVEL_STYLE: Record<string, string> = {
  info: "bg-signal/10 text-signal border-signal/30",
  warn: "bg-warn/10 text-warn border-warn/30",
  error: "bg-danger/10 text-danger border-danger/30",
};
const LEVEL_LABEL: Record<string, string> = { info: "اطلاع", warn: "هشدار", error: "خطا" };

export default function Logs() {
  const toast = useToast();
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [level, setLevel] = useState("");
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.listLogs({ level: level || undefined, limit: 300 });
      setEntries(res.entries);
    } catch (err: any) {
      toast.error(err.message ?? "خطا در دریافت لاگ‌ها");
    } finally {
      setLoading(false);
    }
  }, [level, toast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [autoRefresh, load]);

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-white">لاگ‌های سیستم</h1>
          <p className="text-sm text-muted mt-1">رویدادها، خطاهای پنل‌ها و درخواست‌ها به‌صورت زنده</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={level} onChange={(e) => setLevel(e.target.value)} className="w-full sm:w-32">
            <option value="">همه سطوح</option>
            <option value="error">فقط خطا</option>
            <option value="warn">فقط هشدار</option>
            <option value="info">فقط اطلاع</option>
          </Select>
          <Button variant="ghost" onClick={() => setAutoRefresh((v) => !v)} className="flex-1 sm:flex-none">
            {autoRefresh ? "توقف به‌روزرسانی خودکار" : "شروع به‌روزرسانی خودکار"}
          </Button>
          <Button variant="ghost" onClick={load} className="flex-1 sm:flex-none">
            بازخوانی
          </Button>
        </div>
      </div>

      <Card className="divide-y divide-line overflow-hidden">
        {loading ? (
          <LoadingRegion label="در حال دریافت لاگ‌ها">
            {Array.from({ length: 9 }).map((_, index) => (
              <div key={index} className="px-4 py-3 flex items-start gap-3 border-b border-line last:border-0">
                <Skeleton className="h-6 w-12 shrink-0" />
                <div className="space-y-2 flex-1"><Skeleton className={`h-4 ${index % 3 === 0 ? "w-3/5" : "w-4/5"}`} /><Skeleton className="h-3 w-40" /></div>
              </div>
            ))}
          </LoadingRegion>
        ) : entries.length === 0 ? (
          <p className="text-center text-muted py-12 text-sm">لاگی برای نمایش وجود ندارد</p>
        ) : (
          entries.map((e) => (
            <div key={e.id} className="px-4 py-3">
              <button
                className="w-full flex items-start gap-3 text-right"
                onClick={() => setExpandedId(expandedId === e.id ? null : e.id)}
              >
                <span className={`shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-md border mt-0.5 ${LEVEL_STYLE[e.level]}`}>
                  {LEVEL_LABEL[e.level]}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="text-sm text-white block break-words">{e.message}</span>
                  <span className="text-xs text-muted font-nums mt-0.5 block">
                    {new Date(e.ts).toLocaleString("fa-IR")} · {e.event}
                  </span>
                </span>
              </button>
              {expandedId === e.id && e.meta && (
                <pre className="mt-2 bg-panel2 border border-line rounded-lg p-3 text-xs text-muted overflow-x-auto font-nums" dir="ltr">
                  {JSON.stringify(e.meta, null, 2)}
                </pre>
              )}
            </div>
          ))
        )}
      </Card>
    </div>
  );
}
