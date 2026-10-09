import { Request, Response, NextFunction } from "express";

// Oddiy xotiradagi (in-memory) "fixed window" cheklovchi. Server bitta
// konteynerda ishlaydi, shuning uchun Redis kabi tashqi ombor shart emas.
// Avval hech qanday cheklov yo'q edi — masalan /api/session/start'ni
// ketma-ket chaqirib, dardkashga cheksiz qo'ng'iroq va Telegram xabari
// yuborish mumkin edi.
export function rateLimit(options: {
  name: string;
  windowMs: number;
  max: number;
}) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  // Muddati o'tgan yozuvlarni vaqti-vaqti bilan tozalaymiz, xotira o'smasin.
  setInterval(() => {
    const now = Date.now();
    hits.forEach((entry, key) => {
      if (entry.resetAt <= now) hits.delete(key);
    });
  }, options.windowMs).unref();

  return (req: Request, res: Response, next: NextFunction) => {
    // Login qilgan bo'lsa — foydalanuvchi bo'yicha, aks holda IP bo'yicha.
    const key = req.userId || req.ip || "unknown";
    const now = Date.now();
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + options.windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;

    if (entry.count > options.max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.setHeader("Retry-After", String(retryAfter));
      console.warn(`Rate limit (${options.name}): ${key}`);
      return res.status(429).json({
        status: "error",
        message: "Juda ko'p so'rov yuborildi, birozdan keyin qayta urinib ko'ring",
      });
    }
    next();
  };
}
