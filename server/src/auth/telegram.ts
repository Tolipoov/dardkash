import crypto from "crypto";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN as string;

interface TelegramAuthData {
  id: string;
  first_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: string;
  hash: string;
  [key: string]: string | undefined;
}

// Telegram yuborgan ma'lumotni "hash" orqali tekshiramiz — bu ma'lumot
// haqiqatan ham Telegram'dan kelganini, soxta ekanligini tasdiqlaydi.
export function verifyTelegramAuth(data: TelegramAuthData): boolean {
  const { hash, ...rest } = data;

  const checkString = Object.keys(rest)
    .filter((key) => rest[key] !== undefined)
    .sort()
    .map((key) => `${key}=${rest[key]}`)
    .join("\n");

  const secretKey = crypto.createHash("sha256").update(BOT_TOKEN).digest();
  const computedHash = crypto
    .createHmac("sha256", secretKey)
    .update(checkString)
    .digest("hex");

  // Oddiy "!==" o'rniga timing-safe solishtirish — aks holda hash'ni
  // belgima-belgi topib olishga urinish (timing attack) mumkin bo'lardi.
  const computedBuffer = Buffer.from(computedHash, "hex");
  const hashBuffer = Buffer.from(hash || "", "hex");
  if (
    computedBuffer.length !== hashBuffer.length ||
    !crypto.timingSafeEqual(computedBuffer, hashBuffer)
  ) {
    return false;
  }

  // 1 kundan eski havolalarni rad etamiz (xavfsizlik uchun)
  const authDate = parseInt(data.auth_date, 10);
  const now = Math.floor(Date.now() / 1000);
  if (now - authDate > 86400) return false;

  return true;
}
