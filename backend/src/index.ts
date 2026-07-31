import "dotenv/config";
import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth";
import { serversRouter } from "./routes/servers";
import { usersRouter } from "./routes/users";
import { subscriptionRouter } from "./routes/subscription";
import { logsRouter } from "./routes/logs";
import { requestLogger, notFoundHandler, errorHandler } from "./middleware/observability";
import { logger } from "./lib/logger";

const app = express();
app.use(cors());
app.use(express.json());
app.use(requestLogger);

// Public: the actual subscription links handed to end customers
app.use("/sub", subscriptionRouter);

// Admin-facing API (all require a Bearer token except /api/auth/login)
app.use("/api/auth", authRouter);
app.use("/api/servers", serversRouter);
app.use("/api/users", usersRouter);
app.use("/api/logs", logsRouter);

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
});
