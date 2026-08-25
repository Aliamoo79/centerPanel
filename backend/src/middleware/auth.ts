import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET ?? "insecure-dev-secret";

export interface AuthedRequest extends Request {
  admin?: { id: string; username: string; role: "ADMIN" | "SELLER" };
}

export function signAdminToken(admin: { id: string; username: string; role: "ADMIN" | "SELLER" }): string {
  return jwt.sign(admin, JWT_SECRET, { expiresIn: "7d" });
}

export function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing bearer token" });
  }
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET) as { id: string; username: string; role?: string };
    if (payload.role !== "ADMIN" && payload.role !== "SELLER") return res.status(401).json({ error: "Invalid session role" });
    req.admin = { id: payload.id, username: payload.username, role: payload.role };
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function requireRole(...roles: Array<"ADMIN" | "SELLER">) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.admin || !roles.includes(req.admin.role)) return res.status(403).json({ error: "این عملیات فقط برای مدیر مجاز است" });
    next();
  };
}
