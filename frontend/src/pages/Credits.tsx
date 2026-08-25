import { useEffect, useState } from "react";
import { api, getRole } from "../lib/api";
import { Button, Card, Input, LoadingRegion, Skeleton } from "../components/ui";
import { useToast } from "../lib/toast";

const packageLabels: Record<string, string> = {
  "1M_1U": "۱ ماه / ۱ کاربر",
  "1M_2U": "۱ ماه / ۲ کاربر",
  "2M_1U": "۲ ماه / ۱ کاربر",
  "2M_2U": "۲ ماه / ۲ کاربر",
};

export default function Credits() {
  const toast = useToast();
  const [data, setData] = useState<any | null>(null);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const isAdmin = getRole() === "ADMIN";

  function reload() {
    api.getCredits().then(setData).catch((err) => toast.error(err.message));
  }
  useEffect(reload, []);

  if (!data) return <LoadingRegion label="در حال دریافت اعتبار"><Skeleton className="h-32 w-full" /></LoadingRegion>;

  const packages = data.pricing.packages;
  async function savePricing(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const form = new FormData(event.currentTarget);
    try {
      await api.updateCreditPricing({
        creditsPerGB: Number(form.get("creditsPerGB")),
        packages: Object.fromEntries(Object.keys(packageLabels).map((code) => [code, Number(form.get(code))])),
      });
      reload();
      toast.success("قیمت‌ها ذخیره شد");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function deposit(event: React.FormEvent) {
    event.preventDefault();
    try {
      await api.addCredits({ amount: Number(amount), description: description || undefined });
      setAmount("");
      setDescription("");
      reload();
      toast.success("اعتبار اضافه شد");
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">اعتبار فروش</h1>
        <p className="text-muted text-sm mt-1">موجودی جهانی و قیمت بسته‌های ساخت کاربر</p>
      </div>
      <Card className="p-5">
        <p className="text-xs text-muted">موجودی فعلی</p>
        <p className="font-nums text-3xl font-bold text-signal mt-2" dir="ltr">{data.balance.toLocaleString("fa-IR")}</p>
        <p className="text-xs text-muted mt-1">Unit: thousand toman</p>
        {isAdmin ? <form onSubmit={deposit} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 mt-5">
          <Input type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="مقدار اعتبار" dir="ltr" required />
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="توضیح (اختیاری)" />
          <Button type="submit">افزایش اعتبار</Button>
        </form> : <p className="text-xs text-muted mt-4">Ø­Ø³Ø§Ø¨ ÙØ±ÙˆØ´ ÙÙ‚Ø· Ø§Ù…Ú©Ø§Ù† Ù…Ø´Ø§Ù‡Ø¯Ù‡ Ø§ÛŒÙ† Ø¨Ø®Ø´ Ø±Ø§ Ø¯Ø§Ø±Ø¯.</p>}
      </Card>
      <Card className="p-5">
        <h2 className="font-medium">قیمت‌گذاری</h2>
        {isAdmin && <form onSubmit={savePricing} className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          <div className="sm:col-span-2">
            <label className="block text-xs text-muted mb-1.5">هزینه هر GB در طرح کاربر نامحدود</label>
            <Input name="creditsPerGB" type="number" min="1" defaultValue={data.pricing.creditsPerGB} dir="ltr" required />
          </div>
          {Object.entries(packageLabels).map(([code, label]) => (
            <div key={code}>
              <label className="block text-xs text-muted mb-1.5">{label}</label>
              <Input name={code} type="number" min="0" defaultValue={packages[code]} dir="ltr" required />
            </div>
          ))}
          <div className="sm:col-span-2"><Button type="submit" disabled={saving}>{saving ? "در حال ذخیره..." : "ذخیره قیمت‌ها"}</Button></div>
        </form>}
        {!isAdmin && <p className="text-xs text-muted mt-3">Ù‚ÛŒÙ…Øªâ€ŒÙ‡Ø§ ØªÙˆØ³Ø· Ù…Ø¯ÛŒØ± ØªÙ†Ø¸ÛŒÙ… Ù…ÛŒâ€ŒØ´ÙˆÙ†Ø¯.</p>}
      </Card>
      <Card className="overflow-hidden">
        <div className="p-5 border-b border-line"><h2 className="font-medium">تراکنش‌های اخیر</h2></div>
        <div className="divide-y divide-line">
          {data.transactions.map((tx: any) => (
            <div key={tx.id} className="p-4 flex items-center justify-between gap-4">
              <div className="min-w-0"><p className="text-sm truncate">{tx.description || tx.type}</p><p className="text-xs text-muted mt-1">{tx.user?.displayName || "مدیریت اعتبار"}</p></div>
              <span className={`font-nums shrink-0 ${tx.amount < 0 ? "text-danger" : "text-mint"}`} dir="ltr">{tx.amount > 0 ? "+" : ""}{tx.amount.toLocaleString("fa-IR")}</span>
            </div>
          ))}
          {data.transactions.length === 0 && <p className="p-5 text-sm text-muted">هنوز تراکنشی ثبت نشده است.</p>}
        </div>
      </Card>
    </div>
  );
}
