import { Router } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../db";
import { signAdminToken } from "../middleware/auth";
import { asyncHandler } from "../lib/asyncHandler";
import { logger } from "../lib/logger";

export const authRouter = Router();

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { username, password } = req.body ?? {};
    if (!username || !password) return res.status(400).json({ error: "نام کاربری و رمز عبور الزامی است" });

    const admin = await prisma.admin.findUnique({ where: { username } });
    const ok = admin && (await bcrypt.compare(password, admin.passwordHash));
    if (!ok) {
      logger.warn("login_failed", `تلاش ناموفق برای ورود: ${username}`, { username, ip: req.ip });
      return res.status(401).json({ error: "نام کاربری یا رمز عبور نادرست است" });
    }

    logger.info("login_success", `ورود موفق ادمین: ${admin.username}`, { adminId: admin.id, ip: req.ip });
    const token = signAdminToken({ id: admin.id, username: admin.username });
    res.json({ token, admin: { id: admin.id, username: admin.username } });
  })
);
