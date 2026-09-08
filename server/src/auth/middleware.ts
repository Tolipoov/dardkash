import { Request, Response, NextFunction } from "express";
import { verifySession } from "./jwt";
import { pool } from "../db";

// req ob'ektiga userId qo'shish uchun TypeScript'ga xabar beramiz
declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

// 1-qatlam: foydalanuvchi umuman login qilganmi?
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.dardkash_session;
  if (!token) {
    return res.status(401).json({ status: "error", message: "Login qilinmagan" });
  }

  const session = verifySession(token);
  if (!session) {
    return res.status(401).json({ status: "error", message: "Sessiya yaroqsiz yoki muddati o'tgan" });
  }

  req.userId = session.userId;
  next();
}

// 2-qatlam: foydalanuvchining roli kerakli ro'yxatda bormi?
// requireAuth'dan KEYIN ishlatiladi (req.userId allaqachon bor bo'lishi kerak)
export function requireRole(allowedRoles: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const result = await pool.query(
      "SELECT role FROM profiles WHERE user_id = $1",
      [req.userId]
    );

    const role = result.rows[0]?.role ?? "user";
    if (!allowedRoles.includes(role)) {
      return res.status(403).json({ status: "error", message: "Bu amal uchun ruxsatingiz yo'q" });
    }
    next();
  };
}
