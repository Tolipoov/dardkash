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

// Telegram Mini App (bot ichidagi ilova) `initData`sini tekshiradi.
// Login Widget'dan farqli algoritm: kalit = HMAC_SHA256("WebAppData", token),
// hash = HMAC_SHA256(kalit, data_check_string). Telegram keyinroq `signature`
// maydonini qo'shgan — u data_check_string'ga kiradimi, mijoz versiyasiga
// bog'liq, shuning uchun ikkala variant ham tekshiriladi (ikkalasi ham bot
// tokeni bilan imzolangan bo'lishi shart, xavfsizlik pasaymaydi).
// Qaytadi: Telegram foydalanuvchi ID'si yoki null.
export function verifyTelegramWebAppData(initData: string): string | null {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;

  const entries = [...params.entries()].filter(([key]) => key !== "hash");
  const checkString = (list: [string, string][]) =>
    list
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, value]) => `${key}=${value}`)
      .join("\n");
  const secretKey = crypto.createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
  const hashBuffer = Buffer.from(hash, "hex");

  const matches = (list: [string, string][]) => {
    const computed = crypto.createHmac("sha256", secretKey).update(checkString(list)).digest();
    return computed.length === hashBuffer.length && crypto.timingSafeEqual(computed, hashBuffer);
  };
  if (!matches([...entries]) && !matches(entries.filter(([key]) => key !== "signature"))) {
    return null;
  }

  const authDate = parseInt(params.get("auth_date") || "0", 10);
  if (Math.floor(Date.now() / 1000) - authDate > 86400) return null;

  try {
    const user = JSON.parse(params.get("user") || "null");
    return user?.id ? String(user.id) : null;
  } catch {
    return null;
  }
}
