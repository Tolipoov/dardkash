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
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.dardkash_session;
  if (!token) {
    return res.status(401).json({ status: "error", message: "Login qilinmagan" });
  }

  const session = verifySession(token);
  if (!session) {
    return res.status(401).json({ status: "error", message: "Sessiya yaroqsiz yoki muddati o'tgan" });
  }

  // JWT imzosi to'g'ri bo'lsa ham, foydalanuvchi bazadan o'chirilgan
  // bo'lishi mumkin — avval bunday cookie bilan so'rovlar "login qilgan"
  // deb o'tib, keyin FK xatosi bilan 500 qaytarardi (masalan profil
  // saqlashda profiles_user_id_fkey).
  try {
    const exists = await pool.query("SELECT 1 FROM users WHERE id = $1", [session.userId]);
    if (exists.rows.length === 0) {
      res.clearCookie("dardkash_session");
      return res.status(401).json({ status: "error", message: "Hisob topilmadi, qayta kiring" });
    }
  } catch (err) {
    return next(err);
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
