import { Router } from "express";
import { requireAdmin } from "../middleware/auth";
import { logger, LogLevel } from "../lib/logger";
import { asyncHandler } from "../lib/asyncHandler";

export const logsRouter = Router();
logsRouter.use(requireAdmin);

logsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const limit = Math.min(500, Number(req.query.limit) || 200);
    const level = ["info", "warn", "error"].includes(String(req.query.level))
      ? (req.query.level as LogLevel)
      : undefined;
    res.json({ entries: logger.recent(limit, level) });
  })
);
