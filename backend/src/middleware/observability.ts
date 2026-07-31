import { Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";
import { logger } from "../lib/logger";
import { AppError } from "../lib/errors";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  req.requestId = randomUUID();
  res.setHeader("x-request-id", req.requestId);

  res.on("finish", () => {
    const durationMs = Date.now() - start;
    const level = res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";
    logger[level](
      "http_request",
      `${req.method} ${req.originalUrl} → ${res.statusCode} (${durationMs}ms)`,
      {
        requestId: req.requestId,
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        durationMs,
        ip: req.ip,
        admin: (req as any).admin?.username,
      }
    );
  });

  next();
}

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: "مسیر مورد نظر پیدا نشد" });
}

// Must be registered LAST, after all routes. 4-arg signature is what
// tells Express this is an error-handling middleware.
export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction) {
  const requestId = req.requestId;

  if (err instanceof AppError) {
    logger.warn("app_error", err.message, { requestId, path: req.originalUrl, status: err.status });
    return res.status(err.status).json({ error: err.message, requestId });
  }

  // zod validation errors that slipped through without .safeParse handling
  if (err?.name === "ZodError") {
    logger.warn("validation_error", "ورودی نامعتبر", { requestId, path: req.originalUrl, issues: err.issues });
    return res.status(400).json({ error: "ورودی نامعتبر است", details: err.flatten?.() ?? err.issues, requestId });
  }

  logger.error("unhandled_error", err?.message ?? "Unknown error", {
    requestId,
    path: req.originalUrl,
    method: req.method,
    stack: err?.stack,
  });

  res.status(500).json({
    error: "خطای غیرمنتظره‌ای در سرور رخ داد. جزئیات در صفحه‌ی لاگ‌ها ثبت شد.",
    requestId,
  });
}
