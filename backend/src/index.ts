import "dotenv/config";
import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth";
import { serversRouter } from "./routes/servers";
import { usersRouter } from "./routes/users";
import { subscriptionRouter } from "./routes/subscription";
import { logsRouter } from "./routes/logs";
import { backupRouter } from "./routes/backup";
import { requestLogger, notFoundHandler, errorHandler } from "./middleware/observability";
import { logger } from "./lib/logger";
import { syncAllUserUsage } from "./services/usage";

const app = express();
app.use(cors());
// Full user/server backup imports can be larger than Express's 100 KB default.
app.use(express.json({ limit: "25mb" }));
app.use(requestLogger);

// Public: the actual subscription links handed to end customers
app.use("/sub", subscriptionRouter);

// Admin-facing API (all require a Bearer token except /api/auth/login)
app.use("/api/auth", authRouter);
app.use("/api/servers", serversRouter);
app.use("/api/users", usersRouter);
app.use("/api/logs", logsRouter);
app.use("/api/backup", backupRouter);

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.use(notFoundHandler);
app.use(errorHandler);

// Catch anything that slips past Express entirely (e.g. errors thrown
// outside a request context) so the process never dies silently.
process.on("unhandledRejection", (reason: any) => {
  logger.error("unhandled_rejection", reason?.message ?? String(reason), { stack: reason?.stack });
});
process.on("uncaughtException", (err) => {
  logger.error("uncaught_exception", err.message, { stack: err.stack });
});

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => {
  logger.info("startup", `VPN platform API listening on :${port}`);

  const configuredInterval = Number(process.env.USAGE_SYNC_INTERVAL_MS ?? 60_000);
  const intervalMs = Number.isFinite(configuredInterval) ? Math.max(15_000, configuredInterval) : 60_000;
  const refreshUsage = () => {
    void syncAllUserUsage().catch((err: any) => {
      logger.error("usage_background_sync_failed", err?.message ?? String(err));
    });
  };

  refreshUsage();
  setInterval(refreshUsage, intervalMs).unref();
});
