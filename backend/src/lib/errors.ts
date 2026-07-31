export class AppError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "AppError";
    this.status = status;
  }
}

/** Turns an axios/panel-adapter error into a short, admin-readable message. */
export function describePanelError(err: any): string {
  if (err?.response?.status) {
    const detail = err.response.data?.detail || err.response.data?.msg || err.response.data?.message || err.response.statusText;
    return `پنل با کد ${err.response.status} پاسخ داد${detail ? `: ${detail}` : ""}`;
  }
  if (err?.code === "ECONNREFUSED" || err?.code === "ENOTFOUND" || err?.code === "EAI_AGAIN") {
    return "اتصال به آدرس پنل برقرار نشد — آدرس یا وضعیت آنلاین‌بودن سرور را بررسی کن";
  }
  if (err?.code === "ECONNABORTED" || err?.message?.includes("timeout")) {
    return "پنل در زمان مناسب پاسخ نداد (timeout)";
  }
  return err?.message ?? "خطای نامشخص از پنل";
}
