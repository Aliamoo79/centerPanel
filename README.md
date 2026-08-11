# پلتفرم Subscription برای فروش VPN

## Production installation (Ubuntu/Debian)

Clone the repository into `/opt/centerpanel` or a normal user's home directory, then run:

```bash
sudo bash install.sh
```

The interactive installer asks for every required deployment value: public domain or IP, HTTPS and Let's Encrypt email, initial admin credentials, backend port, Git branch, usage refresh interval, and Linux service user. It installs Node.js 20, Nginx and optional Certbot, creates the environment file, initializes SQLite, builds both applications, and installs a systemd service. The internal JWT secret is generated securely.

For every later update, run:

```bash
sudo bash deploy.sh
```

Redeploy pulls the saved branch, makes a timestamped SQLite backup in `backups/`, installs locked dependencies, applies migrations, rebuilds both applications, and restarts the service. Backups older than 30 days are removed automatically.

To change the installed domain and issue a new HTTPS certificate, first point the new domain's DNS record to the server and run:

```bash
sudo ./change-domain.sh
```

The script asks for the new domain and Let's Encrypt email, updates `PUBLIC_BASE_URL`, safely replaces the Nginx site, requests the certificate, and restarts CenterPanel.

یک سیستم مدیریت ری‌سلری برای چند سرور VPN (Marzban / 3x-ui / Hiddify) با:
- داشبورد ادمین برای افزودن سرور، افزودن کاربر، مشاهده‌ی مصرف و زمان باقی‌مانده
- برای هر کاربر یک **لینک subscription** که همه‌ی کانفیگ‌های او از همه‌ی سرورها را جمع می‌کند و در برنامه‌های v2rayNG / NekoBox / Hiddify App / Streisand و غیره باز می‌شود
- امکان تغییر آدرس/اطلاعات هر سرور بدون نیاز به تغییر لینک کاربران

---

## ساختار پروژه

```
vpn-platform/
  backend/    ← API (Node.js + TypeScript + Express + Prisma)
  frontend/   ← داشبورد (React + Vite + Tailwind)
```

---

## ۱) راه‌اندازی Backend

```bash
cd backend
npm install
cp .env.example .env
```

فایل `.env` را باز کن و این‌ها را تنظیم کن:

| متغیر | توضیح |
|---|---|
| `JWT_SECRET` | یک رشته‌ی تصادفی طولانی برای امضای توکن ادمین |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | حساب ادمین اولیه‌ی داشبورد |
| `PUBLIC_BASE_URL` | آدرسی که این API از بیرون در دسترس است، مثلاً `https://api.yourdomain.com` (همین آدرس در لینک subscription کاربران استفاده می‌شود) |
| `DATABASE_URL` | پیش‌فرض SQLite است (`file:./dev.db`) و نیاز به تنظیم اضافه ندارد. برای Postgres در پروداکشن، این را عوض کن و `provider` را در `prisma/schema.prisma` به `postgresql` تغییر بده. |

سپس دیتابیس را بساز و حساب ادمین را ایجاد کن:

```bash
npx prisma migrate dev --name init
npm run seed
```

اجرا:

```bash
npm run dev       # حالت توسعه با ری‌استارت خودکار
# یا برای پروداکشن:
npm run build && npm start
```

API روی `http://localhost:4000` بالا می‌آید.

> **نکته:** در محیطی که این کد ساخته شده، دسترسی به سرور دانلود باینری Prisma مسدود بود، برای همین `prisma generate` به‌طور کامل تست نشد. روی سیستم خودت (با دسترسی اینترنت عادی) مرحله‌ی `npx prisma migrate dev` این را خودکار انجام می‌دهد و مشکلی نباید پیش بیاید. اگر خطا دیدی، اول `npx prisma generate` را جدا اجرا کن.

---

## ۲) راه‌اندازی Frontend

```bash
cd frontend
npm install
npm run dev
```

داشبورد روی `http://localhost:5173` بالا می‌آید و درخواست‌های `/api` و `/sub` را خودکار به بک‌اند (پورت ۴۰۰۰) پروکسی می‌کند (تنظیم‌شده در `vite.config.ts`).

برای build نهایی جهت آپلود روی هاست:

```bash
npm run build
```

خروجی در `frontend/dist` قرار می‌گیرد؛ آن را پشت هر وب‌سروری (Nginx و غیره) سرو کن و مسیرهای `/api` و `/sub` را reverse-proxy کن به بک‌اند.

---

## ۳) اضافه کردن اولین سرور

۱. با حساب ادمین وارد داشبورد شو.
۲. برو به «سرورها» → «افزودن سرور».
۳. نوع پنل، آدرس (`baseUrl`)، نام کاربری و رمز/کلید API پنل را وارد کن:

| نوع پنل | نام کاربری | رمز/کلید |
|---|---|---|
| Marzban / Marzneshin | یوزرنیم ادمین پنل | پسورد ادمین پنل |
| 3x-ui | یوزرنیم لاگین پنل | پسورد لاگین پنل — و «شناسه Inbound» که کلاینت‌های جدید داخلش ساخته می‌شوند را هم وارد کن |
| Hiddify Manager | هرچیزی (استفاده نمی‌شود) | کلید API ادمین پنل (Hiddify-API-Key) |

۴. روی «تست اتصال» بزن تا مطمئن شوی پنل در دسترس است.

## ۴) ساخت کاربر جدید

در «کاربران» → «افزودن کاربر»، نام کاربری، سقف مصرف (GB)، مدت اعتبار (روز) و سرورهایی که کاربر باید رویشان اکانت داشته باشد را انتخاب کن. سیستم به‌صورت موازی روی همه‌ی سرورهای انتخابی اکانت واقعی می‌سازد.

بعد از ساخت، وارد صفحه‌ی جزئیات کاربر شو — لینک subscription آماده‌ی کپی همان‌جاست.

---

## نکات فنی مهم

- **تغییر آدرس سرور:** چون هر لینک کاربر فقط به `serverId` داخلی وصل است نه به آدرس واقعی، کافی‌ست از صفحه‌ی «سرورها» → «ویرایش» آدرس/رمز پنل را عوض کنی؛ همه‌ی کاربران آن سرور بدون هیچ تغییری در لینک‌شان به‌روز می‌شوند.
- **معماری Adapter:** فایل `backend/src/adapters/types.ts` قرارداد مشترک همه‌ی پنل‌هاست. هر پنل جدید = یک فایل adapter تازه + یک خط در `backend/src/adapters/index.ts`.
- **دقت API پنل‌ها:** مسیرهای API در سه ادپتور (Marzban/3x-ui/Hiddify) بر اساس نسخه‌های رایج این پنل‌ها نوشته شده. اگر نسخه‌ی پنل‌های تو قدیمی/سفارشی است و در تست اتصال یا ساخت کاربر خطا گرفتی، نسخه‌ی دقیق پنل را بگو تا مسیرها را تنظیم کنم.
- **امنیت:** رمز/کلید پنل‌ها در دیتابیس به‌صورت متن ساده ذخیره می‌شود (برای سادگی MVP). برای پروداکشن جدی توصیه می‌شود این مقادیر رمزنگاری شوند یا در یک secrets manager نگه داشته شوند.
