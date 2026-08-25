import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Card, Button, Input } from "./ui";
import { useToast } from "../lib/toast";

const packageOptions = [
  ["1M_1U", "۱ ماه / ۱ کاربر", 3],
  ["1M_2U", "۱ ماه / ۲ کاربر", 5],
  ["2M_1U", "۲ ماه / ۱ کاربر", 3],
  ["2M_2U", "۲ ماه / ۲ کاربر", 5],
] as const;

export default function SalesCreateUserForm({ servers, users, onClose, onSaved }: { servers: any[]; users: any[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [planType, setPlanType] = useState<"UNLIMITED_USER" | "UNLIMITED_USAGE">("UNLIMITED_USER");
  const [packageCode, setPackageCode] = useState("1M_1U");
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [dataLimitGB, setDataLimitGB] = useState("");
  const [durationDays, setDurationDays] = useState("30");
  const [referrerId, setReferrerId] = useState("");
  const [pricing, setPricing] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getCredits().then((value) => setPricing(value.pricing)).catch((err) => setError(err.message));
  }, []);

  const cost = planType === "UNLIMITED_USER"
    ? Math.ceil(Number(dataLimitGB || 0) * Number(pricing?.creditsPerGB || 0))
    : Number(pricing?.packages?.[packageCode] || 0);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (servers.length === 0) throw new Error("حداقل یک سرور فعال لازم است");
      const result = await api.createUser({
        username: name,
        note: note || undefined,
        referrerId: referrerId || null,
        planType,
        packageCode: planType === "UNLIMITED_USAGE" ? packageCode : undefined,
        dataLimitGB: planType === "UNLIMITED_USER" ? Number(dataLimitGB) : null,
        durationDays: planType === "UNLIMITED_USER" ? Number(durationDays) : undefined,
      });
      if (result.provisioningFailures?.length) toast.error(`کاربر ساخته شد اما ${result.provisioningFailures.length} سرور خطا داشت`);
      onSaved();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-4 sm:p-5">
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><label className="block text-xs text-muted mb-1.5">نام کاربر</label><Input value={name} onChange={(e) => setName(e.target.value)} dir="ltr" required /></div>
          <div><label className="block text-xs text-muted mb-1.5">یادداشت (اختیاری)</label><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثلاً شماره تماس مشتری" /></div>
          <div>
            <label className="block text-xs text-muted mb-1.5">معرف (اختیاری)</label>
            <select className="w-full bg-panel2 border border-line rounded-lg px-3 py-2 text-sm" value={referrerId} onChange={(e) => setReferrerId(e.target.value)}>
              <option value="">بدون معرف</option>{users.map((user) => <option key={user.id} value={user.id}>{user.displayName}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs text-muted mb-2">نوع بسته</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button type="button" onClick={() => setPlanType("UNLIMITED_USER")} className={`text-right p-3 rounded-[10px] border ${planType === "UNLIMITED_USER" ? "border-signal bg-signal/15 text-white" : "border-line text-muted"}`}>
              <span className="block text-sm font-medium">کاربر نامحدود</span><span className="block text-xs mt-1">هزینه بر اساس GB و روز</span>
            </button>
            <button type="button" onClick={() => setPlanType("UNLIMITED_USAGE")} className={`text-right p-3 rounded-[10px] border ${planType === "UNLIMITED_USAGE" ? "border-signal bg-signal/15 text-white" : "border-line text-muted"}`}>
              <span className="block text-sm font-medium">مصرف نامحدود</span><span className="block text-xs mt-1">بسته زمانی و تعداد کاربر</span>
            </button>
          </div>
        </div>

        {planType === "UNLIMITED_USER" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className="block text-xs text-muted mb-1.5">حجم مصرف (GB)</label><Input type="number" min="1" step="0.1" value={dataLimitGB} onChange={(e) => setDataLimitGB(e.target.value)} dir="ltr" required /></div>
            <div><label className="block text-xs text-muted mb-1.5">مدت اعتبار (روز)</label><Input type="number" min="1" value={durationDays} onChange={(e) => setDurationDays(e.target.value)} dir="ltr" required /></div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {packageOptions.map(([code, label, ipLimit]) => <button type="button" key={code} onClick={() => setPackageCode(code)} className={`text-right p-3 rounded-[10px] border ${packageCode === code ? "border-signal bg-signal/15 text-white" : "border-line text-muted"}`}><span className="block text-sm font-medium">{label}</span><span className="block text-xs mt-1">IP همزمان: {ipLimit}</span></button>)}
          </div>
        )}

        <div className="rounded-lg border border-line bg-panel2/60 px-3 py-2 text-sm flex flex-wrap justify-between gap-2">
          <span className="text-muted">ساخت روی همه سرورهای فعال ({servers.length})</span>
          <span className="font-nums text-signal" dir="ltr">هزینه: {cost.toLocaleString("fa-IR")} اعتبار</span>
        </div>
        <p className="text-[11px] text-muted">Ù…Ø¨Ù„Øº Ù‡Ø§ Ø¨Ø± Ø§Ø³Ø§Ø³ Ù‡Ø²Ø§Ø± ØªÙˆÙ…Ø§Ù† Ø­Ø³Ø§Ø¨ Ù…ÛŒâ€ŒØ´ÙˆÙ†Ø¯.</p>
        {error && <p className="text-danger text-sm">{error}</p>}
        <div className="sticky bottom-0 z-10 -mx-4 sm:-mx-5 flex gap-2 border-t border-line bg-panel/95 px-4 sm:px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
          <Button type="submit" disabled={saving || !pricing} className="flex-1 sm:flex-none">{saving ? "در حال ساخت..." : "ساخت کاربر"}</Button>
          <Button type="button" variant="ghost" onClick={onClose} className="flex-1 sm:flex-none">انصراف</Button>
        </div>
      </form>
    </Card>
  );
}
