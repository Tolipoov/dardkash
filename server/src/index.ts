import cookieParser from "cookie-parser";
import cors from "cors";
import crypto from "crypto";
import "dotenv/config";
import express from "express";
import { createServer } from "http";
import {
  buildGoogleAuthUrl,
  exchangeCodeForToken,
  fetchGoogleUserInfo,
} from "./auth/google";
import { signSession } from "./auth/jwt";
import { createLiveKitToken } from "./auth/livekit";
import { requireAuth, requireRole } from "./auth/middleware";
import { verifyTelegramAuth, verifyTelegramWebAppData } from "./auth/telegram";
import { createChatWebSocketServer } from "./chat-ws";
import { findOrCreateGoogleUser, findOrCreateTelegramUser, pool } from "./db";
import { parseListLimit } from "./pagination";
import { createLettersRouter, handleLetterAdminAction } from "./letters";
import {
  approveListener,
  askRejectReason,
  handleRejectReason,
  rejectListener,
  sendWelcome,
} from "./listener-review";
import { runMigrations } from "./migrate";
import { pushIfOffline, pushPublicKey } from "./push";
import { confirmTelegramMove, handleTelegramConflict } from "./telegram-move";
import {
  handleTelegramChatReply,
  handleTelegramPendingReply,
  saveChatMessage,
  startTelegramReply,
} from "./session-chat";
import {
  banUser,
  fileReport,
  isBanned,
  REPORT_REASON_LABELS,
  resolveReport,
  unbanUser,
} from "./moderation";
import { createNotifyWebSocketServer, isUserConnected, notifyUser } from "./notify-ws";
import {
  inviteStatusText,
  notifyIncomingCall,
  resolveInviteTelegram,
} from "./call-notify";
import { rateLimit } from "./rate-limit";
import { nextAvailable, parseAvailability } from "./availability";
import { startSessionSweeper } from "./session-sweeper";
import {
  cancelWaitlist,
  getMyWaiting,
  joinWaitlist,
  listWaitingFor,
  sessionUrl,
  takeWaitlist,
} from "./waitlist";
import {
  answerCallbackQuery,
  editTelegramMessage,
  escapeHtml,
  sendTelegramMessage,
} from "./telegram/bot";

const REQUIRED_ENV = [
  "JWT_SECRET",
  "APP_BASE_URL",
  "DATABASE_URL",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REDIRECT_URI",
  "TELEGRAM_BOT_TOKEN",
  "LIVEKIT_API_KEY",
  "LIVEKIT_API_SECRET",
];
const missingEnv = REQUIRED_ENV.filter((key) => !process.env[key]);
if (missingEnv.length > 0) {
  console.error(
    `Kerakli .env o'zgaruvchilari yo'q, server to'xtatildi: ${missingEnv.join(", ")}`,
  );
  process.exit(1);
}

const isProduction = process.env.NODE_ENV === "production";

const app = express();
// Backend faqat 127.0.0.1:4000'da tinglaydi va oldida bitta nginx turadi —
// shuning uchun X-Forwarded-For'ning oxirgi (nginx qo'shgan) qiymatiga
// ishonamiz. Busiz req.ip har doim nginx manzili bo'lardi va IP bo'yicha
// rate limit hammani bitta foydalanuvchi deb hisoblardi.
app.set("trust proxy", 1);
app.use(cors({ origin: process.env.APP_BASE_URL, credentials: true }));
app.use(express.json());

// Noto'g'ri formatdagi sessionId Postgres'ga yetib borib "invalid input
// syntax for type uuid" bilan 500 qaytarardi — endi darhol 404.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
app.param("sessionId", (_req, res, next, value) => {
  if (!UUID_RE.test(String(value))) {
    return res.status(404).json({ status: "error", message: "Suhbat topilmadi" });
  }
  next();
});
for (const name of ["userId", "reportId"]) {
  app.param(name, (_req, res, next, value) => {
    if (!UUID_RE.test(String(value))) {
      return res.status(404).json({ status: "error", message: "Topilmadi" });
    }
    next();
  });
}

const authLimiter = rateLimit({ name: "auth", windowMs: 10 * 60 * 1000, max: 30 });
const callLimiter = rateLimit({ name: "call", windowMs: 60 * 1000, max: 10 });
const messageLimiter = rateLimit({ name: "message", windowMs: 60 * 1000, max: 40 });
const reportLimiter = rateLimit({ name: "report", windowMs: 10 * 60 * 1000, max: 10 });
app.use(cookieParser());

app.get("/health", async (_req, res) => {
  try {
    const result = await pool.query("SELECT NOW() as db_time");
    res.json({
      status: "ok",
      message: "Backend ishlayapti va bazaga ulandi",
      db_time: result.rows[0].db_time,
    });
  } catch (err) {
    console.error("DB xatosi:", err);
    res.status(500).json({ status: "error", message: "Bazaga ulana olmadi" });
  }
});

// Login'dan keyingi qaytish manzili faqat shu saytning ichki yo'li bo'lishi
// mumkin. Aks holda `?next=@evil.com` → `https://dardkash.uz@evil.com`
// kabi manzil orqali foydalanuvchini begona saytga yuborish (open redirect)
// mumkin bo'lardi.
function safeNext(value: unknown): string {
  if (typeof value !== "string") return "/dashboard";
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return "/dashboard";
  }
  return value;
}

// Login'dan keyin qayerga: profili yo'q (yangi) odam — darhol ro'yxatdan
// o'tish formasiga (til prefiksi va tanlangan rol saqlanadi). Avval u
// /dashboard'ga tushib, kabinet bir lahza ko'rinib, keyin formaga sakrardi.
async function postLoginRedirect(userId: string, next: string): Promise<string> {
  const profile = await pool.query("SELECT 1 FROM profiles WHERE user_id = $1", [userId]);
  if (profile.rows.length > 0) return next;
  if (/^\/(ru\/)?onboarding(\?|$)/.test(next)) return next;
  const prefix = next.startsWith("/ru/") || next === "/ru" ? "/ru" : "";
  const role = next.match(/[?&]role=(speaker|listener|both)\b/)?.[1];
  return `${prefix}/onboarding${role ? `?role=${role}` : ""}`;
}

app.get("/api/auth/google/start", authLimiter, (req, res) => {
  const state = crypto.randomBytes(16).toString("hex");
  res.cookie("google_oauth_state", state, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    maxAge: 10 * 60 * 1000,
  });

  const next = safeNext(req.query.next);
  res.cookie("post_login_redirect", next, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    maxAge: 10 * 60 * 1000,
  });

  res.redirect(buildGoogleAuthUrl(state));
});

app.get("/api/auth/google/callback", authLimiter, async (req, res) => {
  try {
    const code = req.query.code as string;
    const returnedState = req.query.state as string | undefined;
    const expectedState = req.cookies?.google_oauth_state as string | undefined;
    res.clearCookie("google_oauth_state");

    if (!returnedState || !expectedState || returnedState !== expectedState) {
      return res.status(400).json({
        status: "error",
        message: "So'rov muddati o'tgan yoki noto'g'ri, qayta urinib ko'ring",
      });
    }
    if (!code) return res.status(400).json({ error: "code topilmadi" });

    const tokenData = await exchangeCodeForToken(code);
    const googleUser = await fetchGoogleUserInfo(tokenData.access_token);
    const userId = await findOrCreateGoogleUser(
      googleUser.id,
      googleUser.email,
    );
    if (await isBanned(userId)) {
      res.clearCookie("post_login_redirect");
      return res.redirect(`${process.env.APP_BASE_URL}/auth?blocked=1`);
    }
    const sessionToken = signSession(userId);

    res.cookie("dardkash_session", sessionToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    const redirectTo = await postLoginRedirect(userId, safeNext(req.cookies?.post_login_redirect));
    res.clearCookie("post_login_redirect");
    res.redirect(`${process.env.APP_BASE_URL}${redirectTo}`);
  } catch (err) {
    console.error("Google login xatosi:", err);
    res
      .status(500)
      .json({ status: "error", message: "Google login muvaffaqiyatsiz" });
  }
});

app.get("/api/auth/telegram/callback", authLimiter, async (req, res) => {
  try {
    const { next: nextParam, ...data } = req.query as any;
    if (!verifyTelegramAuth(data)) {
      return res
        .status(401)
        .json({ status: "error", message: "Tekshiruvdan o'tmadi" });
    }

    const userId = await findOrCreateTelegramUser(data.id);
    if (await isBanned(userId)) {
      return res.redirect(`${process.env.APP_BASE_URL}/auth?blocked=1`);
    }
    const sessionToken = signSession(userId);

    res.cookie("dardkash_session", sessionToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    // Telegram widget `next`ni to'g'ridan-to'g'ri callback URL'ida
    // qaytaradi (Google'dagi kabi cookie orqali emas) — avval bu e'tiborsiz
    // qolib, "Dardkash bo'lish" orqali kirgan har kim /dashboard'ga tushardi.
    const redirectTo = await postLoginRedirect(
      userId,
      safeNext(nextParam ?? req.cookies?.post_login_redirect),
    );
    res.clearCookie("post_login_redirect");
    res.redirect(`${process.env.APP_BASE_URL}${redirectTo}`);
  } catch (err) {
    console.error("Telegram login xatosi:", err);
    res
      .status(500)
      .json({ status: "error", message: "Telegram login muvaffaqiyatsiz" });
  }
});

// Telegram Mini App ichida ochilganda: alohida "Kirish" sahifasisiz, Telegram
// bergan imzolangan `initData` orqali avtomatik login (mobil/desktop
// Telegram ilovalari saytni oddiy webview'da ochadi — cookie birinchi tomon).
app.post("/api/auth/telegram-webapp", authLimiter, async (req, res) => {
  try {
    const initData = req.body?.initData;
    const telegramId =
      typeof initData === "string" && initData.length < 4096
        ? verifyTelegramWebAppData(initData)
        : null;
    if (!telegramId) {
      return res.status(401).json({ status: "error", message: "Tekshiruvdan o'tmadi" });
    }
    const userId = await findOrCreateTelegramUser(telegramId);
    if (await isBanned(userId)) {
      return res.status(401).json({ status: "error", code: "banned" });
    }
    res.cookie("dardkash_session", signSession(userId), {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
    const profile = await pool.query("SELECT 1 FROM profiles WHERE user_id = $1", [userId]);
    res.json({ status: "ok", hasProfile: profile.rows.length > 0 });
  } catch (err) {
    console.error("Telegram Mini App login xatosi:", err);
    res.status(500).json({ status: "error", message: "Kirib bo'lmadi" });
  }
});

app.post("/api/auth/logout", (_req, res) => {
  res.clearCookie("dardkash_session");
  res.json({ status: "ok" });
});

app.get("/api/me", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.email, u.telegram_id, p.nickname, p.avatar, p.role, p.phone, p.wants, lp.status AS listener_status,
              (lp.status = 'approved' AND lp.welcome_seen_at IS NULL) AS listener_welcome
       FROM users u
       LEFT JOIN profiles p ON p.user_id = u.id
       LEFT JOIN listener_profiles lp ON lp.user_id = u.id
       WHERE u.id = $1`,
      [req.userId],
    );
    res.json({ status: "ok", user: result.rows[0] });
  } catch (err) {
    console.error("Foydalanuvchini olishda xato:", err);
    res
      .status(500)
      .json({ status: "error", message: "Ma'lumotni olib bo'lmadi" });
  }
});

app.get(
  "/api/admin/ping",
  requireAuth,
  requireRole(["admin", "moderator"]),
  (_req, res) => {
    res.json({
      status: "ok",
      message: "Siz admin/moderator ekansiz, kirish ruxsat etildi",
    });
  },
);

// Qo'ng'iroq/taklif/xabar faqat profili bor odamdan. Google'dan birinchi
// marta qaytgan yangi foydalanuvchi profilsiz kabinetga tushib, "Suhbatni
// boshlash"ni bosishi mumkin edi — suhbat yaratilardi-yu, sahifasi 404
// berardi (profiles bilan JOIN). Frontend profilsizni /onboarding'ga
// yuboradi; bu esa backend'dagi kafolat.
async function requireProfile(req: express.Request, res: express.Response, next: express.NextFunction) {
  try {
    const result = await pool.query("SELECT 1 FROM profiles WHERE user_id = $1", [req.userId]);
    if (result.rows.length === 0) {
      return res
        .status(400)
        .json({ status: "error", code: "no_profile", message: "Avval profilni to'ldiring" });
    }
    next();
  } catch (err) {
    next(err);
  }
}

const VALID_WANTS = ["speaker", "listener", "both"];
const VALID_GENDERS = ["male", "female", "skip"];
const VALID_LANGUAGES = ["uz", "ru"];
// "45+" — eski forma qiymati (endi "45-54" va "55+"ga bo'lingan); keshlangan
// eski sahifadan kelgan so'rov rad etilmasligi uchun qabul qilinaveradi.
const VALID_AGE_RANGES = ["18-24", "25-34", "35-44", "45-54", "55+", "45+"];
const VALID_PREFERRED_GENDERS = ["any", "male", "female"];
// src/lib/avatars.ts bilan bir xil.
const AVATAR_CODES = [
  "tree", "leaf", "sprout", "flower", "sun", "moon",
  "star", "cloud", "mountain", "waves", "bird", "feather",
];
// Chegara bo'lmasa, hamma mavzuni belgilagan dardkash moslashtirishda
// ("mavzular kesishishi" mezoni) doim yutib chiqadi.
const MAX_TOPICS = 5;
const MIN_BIO_LENGTH = 30;

// Bo'sh qiymat (yoki maydonga bosilganda paydo bo'ladigan yolg'iz "+998")
// → null. To'liq O'zbekiston raqami → bir xil ko'rinishda. Boshqasi →
// undefined (noto'g'ri).
function normalizePhone(value: unknown): string | null | undefined {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits === "" || digits === "998") return null;
  if (!/^998\d{9}$/.test(digits)) return undefined;
  return `+998 ${digits.slice(3, 5)} ${digits.slice(5, 8)} ${digits.slice(8, 10)} ${digits.slice(10, 12)}`;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

function sameSet(a: string[], b: string[]): boolean {
  const setB = new Set(b);
  return a.length === setB.size && a.every((v) => setB.has(v));
}

app.get("/api/profile", requireAuth, async (req, res) => {
  try {
    const profileResult = await pool.query(
      `SELECT nickname, age_range, gender, phone, wants, languages, preferred_listener_gender,
              avatar, about
       FROM profiles WHERE user_id = $1`,
      [req.userId],
    );
    // Forma dardkash arizachisiga "Telegram'ni ulang" qadamini ko'rsatishi uchun.
    const telegramResult = await pool.query("SELECT telegram_id FROM users WHERE id = $1", [
      req.userId,
    ]);
    const telegramLinked = Boolean(telegramResult.rows[0]?.telegram_id);
    if (profileResult.rows.length === 0) {
      return res.json({ status: "ok", profile: null, telegramLinked });
    }

    const topicsResult = await pool.query(
      "SELECT topic_code FROM profile_topics WHERE user_id = $1",
      [req.userId],
    );
    const listenTopicsResult = await pool.query(
      "SELECT topic_code FROM listener_topics WHERE user_id = $1",
      [req.userId],
    );
    const bioResult = await pool.query(
      `SELECT bio, status, available_days, available_from, available_to
       FROM listener_profiles WHERE user_id = $1`,
      [req.userId],
    );
    const listenerRow = bioResult.rows[0];

    res.json({
      status: "ok",
      telegramLinked,
      profile: {
        ...profileResult.rows[0],
        topics: topicsResult.rows.map((r) => r.topic_code),
        listen_topics: listenTopicsResult.rows.map((r) => r.topic_code),
        bio: bioResult.rows[0]?.bio || "",
        listener_status: bioResult.rows[0]?.status || null,
        availability: listenerRow?.available_days?.length
          ? {
              days: listenerRow.available_days,
              from: listenerRow.available_from,
              to: listenerRow.available_to,
            }
          : null,
      },
    });
  } catch (err) {
    console.error("Profilni olishda xato:", err);
    res
      .status(500)
      .json({ status: "error", message: "Profilni olib bo'lmadi" });
  }
});

app.post("/api/profile", requireAuth, async (req, res) => {
  const {
    nickname,
    ageRange,
    gender,
    wants,
    bio,
    language,
    languages,
    preferredListenerGender,
  } = req.body;

  // `code` — frontend xabarni foydalanuvchi tilida ko'rsatishi uchun
  // (`onboarding.errors.<code>`); `message` — log/eski mijozlar uchun.
  const fail = (code: string, message: string, status = 400) =>
    res.status(status).json({ status: "error", code, message });

  // Uzunlik Postgres'dagi `char_length` kabi (belgi bo'yicha) sanaladi —
  // JS'ning `.length`i emoji'ni 2 deb sanaydi, shuning uchun "🗿" bu
  // tekshiruvdan o'tib, bazaning CHECK'ida 500 bilan yiqilardi.
  const nicknameLength =
    typeof nickname === "string" ? [...nickname.trim()].length : 0;
  if (nicknameLength < 2 || nicknameLength > 40) {
    return fail("nickname_length", "Taxallus 2-40 belgidan iborat bo'lishi kerak");
  }
  if (typeof ageRange !== "string" || !VALID_AGE_RANGES.includes(ageRange)) {
    return fail("age_required", "Yosh oralig'ini tanlang");
  }
  if (gender && !VALID_GENDERS.includes(gender)) {
    return fail("gender_invalid", "Noto'g'ri jins qiymati");
  }
  if (language && !VALID_LANGUAGES.includes(language)) {
    return fail("language_invalid", "Noto'g'ri til qiymati");
  }
  if (
    languages !== undefined &&
    (!isStringArray(languages) ||
      languages.length === 0 ||
      !languages.every((l) => VALID_LANGUAGES.includes(l)))
  ) {
    return fail("languages_required", "Kamida bitta suhbat tilini tanlang");
  }
  if (
    preferredListenerGender !== undefined &&
    !VALID_PREFERRED_GENDERS.includes(preferredListenerGender)
  ) {
    return fail("gender_invalid", "Noto'g'ri jins qiymati");
  }
  if (!VALID_WANTS.includes(wants)) {
    return fail("role_invalid", "Noto'g'ri rol tanlandi");
  }
  if (!isStringArray(req.body.topics) || req.body.topics.length === 0) {
    return fail("topics_required", "Kamida bitta mavzu tanlang");
  }
  const topics = [...new Set(req.body.topics as string[])];
  const wantsListener = wants === "listener" || wants === "both";

  // `listenTopics` — dardkash sifatida tinglay oladigan mavzular. Berilmasa
  // (faqat "listener" roli yoki eski mijoz) — `topics`ning o'zi.
  let listenTopics = topics;
  if (wantsListener && req.body.listenTopics !== undefined) {
    if (
      !isStringArray(req.body.listenTopics) ||
      req.body.listenTopics.length === 0
    ) {
      return fail("topics_required", "Kamida bitta mavzu tanlang");
    }
    listenTopics = [...new Set(req.body.listenTopics as string[])];
  }

  if (
    wantsListener &&
    (typeof bio !== "string" || bio.trim().length === 0 || bio.length > 300)
  ) {
    return fail("bio_length", "Bio 1-300 belgidan iborat bo'lishi kerak");
  }
  const phone = normalizePhone(req.body.phone);
  if (phone === undefined) {
    return fail("phone_invalid", "Telefon raqami noto'g'ri");
  }
  // Tayyor avatar (yoki null — olib tashlash); berilmasa o'zgarmaydi.
  const avatar = req.body.avatar;
  if (avatar !== undefined && avatar !== null && !AVATAR_CODES.includes(avatar)) {
    return fail("avatar_invalid", "Noto'g'ri avatar");
  }
  // "O'zim haqimda" — faqat aloqadagi dardkashga ko'rinadi; berilmasa o'zgarmaydi.
  const about =
    req.body.about === undefined
      ? undefined
      : typeof req.body.about === "string" && req.body.about.trim()
        ? req.body.about.trim()
        : null;
  if (about && [...about].length > 200) {
    return fail("about_length", "Ko'pi bilan 200 belgi");
  }
  // Berilmasa (eski mijoz) — saqlangan bo'sh vaqt o'zgarmaydi.
  const availability =
    req.body.availability === undefined ? undefined : parseAvailability(req.body.availability);
  if (req.body.availability !== undefined && availability === undefined) {
    return fail("availability_invalid", "Bo'sh vaqt noto'g'ri");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Birinchi marta yaratilayaptimi — Telegram'da xush kelibsiz xabari uchun.
    const profileExisted =
      (await client.query("SELECT 1 FROM profiles WHERE user_id = $1", [req.userId])).rows
        .length > 0;

    const allCodes = [...new Set([...topics, ...listenTopics])];
    const validTopics = await client.query(
      "SELECT code FROM topics WHERE code = ANY($1::text[])",
      [allCodes],
    );
    if (validTopics.rows.length !== allCodes.length) {
      await client.query("ROLLBACK");
      return fail("topics_invalid", "Noto'g'ri mavzu kodi");
    }

    // Yangi cheklovlar (mavzular soni, bio uzunligi) qo'shilishidan OLDIN
    // saqlangan qiymatlar o'zgarmagan bo'lsa, o'tkazib yuboriladi — aks
    // holda eski foydalanuvchi profilining boshqa maydonini ham tahrirlay
    // olmay qolardi.
    const storedTopics = await client.query(
      "SELECT topic_code FROM profile_topics WHERE user_id = $1",
      [req.userId],
    );
    const storedListenTopics = await client.query(
      "SELECT topic_code FROM listener_topics WHERE user_id = $1",
      [req.userId],
    );
    const existingListener = await client.query(
      "SELECT status, bio FROM listener_profiles WHERE user_id = $1",
      [req.userId],
    );
    const previousStatus = existingListener.rows[0]?.status as
      | string
      | undefined;
    const previousBio = existingListener.rows[0]?.bio as string | undefined;

    const tooMany = (next: string[], stored: { topic_code: string }[]) =>
      next.length > MAX_TOPICS &&
      !sameSet(
        next,
        stored.map((r) => r.topic_code),
      );
    if (
      tooMany(topics, storedTopics.rows) ||
      (wantsListener && tooMany(listenTopics, storedListenTopics.rows))
    ) {
      await client.query("ROLLBACK");
      return fail("topics_max", `Ko'pi bilan ${MAX_TOPICS} ta mavzu tanlang`);
    }
    if (
      wantsListener &&
      bio.trim().length < MIN_BIO_LENGTH &&
      bio !== previousBio
    ) {
      await client.query("ROLLBACK");
      return fail(
        "bio_short",
        `Bio kamida ${MIN_BIO_LENGTH} belgidan iborat bo'lishi kerak`,
      );
    }

    const nicknameTaken = await client.query(
      "SELECT 1 FROM profiles WHERE lower(nickname) = lower($1) AND user_id != $2 LIMIT 1",
      [nickname.trim(), req.userId],
    );
    if (nicknameTaken.rows.length > 0) {
      await client.query("ROLLBACK");
      return fail("nickname_taken", "Bu taxallus band", 409);
    }

    // `languages`/`preferred_listener_gender` yuborilmasa (eski mijoz),
    // saqlangan qiymat o'zgarmaydi; yangi profil uchun esa interfeys tili
    // va "farqi yo'q" olinadi.
    await client.query(
      `INSERT INTO profiles (user_id, nickname, age_range, gender, phone, wants, language,
                             languages, preferred_listener_gender)
       VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, 'uz'),
               COALESCE($8::text[], ARRAY[COALESCE($7, 'uz')]), COALESCE($9, 'any'))
       ON CONFLICT (user_id) DO UPDATE
       SET nickname = $2, age_range = $3, gender = $4, phone = $5, wants = $6,
           language = COALESCE($7, profiles.language),
           languages = COALESCE($8::text[], profiles.languages),
           preferred_listener_gender = COALESCE($9, profiles.preferred_listener_gender),
           updated_at = now()`,
      [
        req.userId,
        nickname.trim(),
        ageRange,
        gender || null,
        phone,
        wants,
        language || null,
        languages ? [...new Set(languages as string[])] : null,
        preferredListenerGender ?? null,
      ],
    );

    if (avatar !== undefined) {
      await client.query("UPDATE profiles SET avatar = $2 WHERE user_id = $1", [
        req.userId,
        avatar,
      ]);
    }
    if (about !== undefined) {
      await client.query("UPDATE profiles SET about = $2 WHERE user_id = $1", [req.userId, about]);
    }

    await client.query("DELETE FROM profile_topics WHERE user_id = $1", [
      req.userId,
    ]);
    for (const topicCode of topics) {
      await client.query(
        "INSERT INTO profile_topics (user_id, topic_code) VALUES ($1, $2)",
        [req.userId, topicCode],
      );
    }

    // Ariza faqat HAQIQATAN yangi bo'lsa (avval umuman ariza bo'lmagan) yoki
    // avval rad etilgan bo'lsa (qayta ko'rib chiqish uchun navbatga qaytadi)
    // admin'ga bildirishnoma yuboriladi — aks holda allaqachon tasdiqlangan
    // dardkash faqat bio'sini tahrirlasa ham, admin har safar "yangi ariza"
    // deb bezovta qilinardi.
    let shouldNotifyAdmin = false;
    if (wantsListener) {
      shouldNotifyAdmin =
        previousStatus === undefined || previousStatus === "rejected";

      await client.query("DELETE FROM listener_topics WHERE user_id = $1", [
        req.userId,
      ]);
      for (const topicCode of listenTopics) {
        await client.query(
          "INSERT INTO listener_topics (user_id, topic_code) VALUES ($1, $2)",
          [req.userId, topicCode],
        );
      }

      await client.query(
        `INSERT INTO listener_profiles (user_id, bio, status)
         VALUES ($1, $2, 'pending')
         ON CONFLICT (user_id) DO UPDATE
         SET bio = $2,
             status = CASE WHEN listener_profiles.status = 'rejected'
                           THEN 'pending' ELSE listener_profiles.status END,
             reviewed_at = CASE WHEN listener_profiles.status = 'rejected'
                                THEN NULL ELSE listener_profiles.reviewed_at END`,
        [req.userId, bio],
      );
      if (availability !== undefined) {
        await client.query(
          `UPDATE listener_profiles
           SET available_days = $2, available_from = $3, available_to = $4
           WHERE user_id = $1`,
          [
            req.userId,
            availability?.days ?? [],
            availability?.from ?? null,
            availability?.to ?? null,
          ],
        );
      }
    }

    await client.query("COMMIT");
    if (!profileExisted) {
      sendWelcome(req.userId!, wantsListener).catch((err) =>
        console.error("Xush kelibsiz xabarida xato:", err),
      );
    }

    if (shouldNotifyAdmin && process.env.ADMIN_TELEGRAM_CHAT_ID) {
      const topicsText = listenTopics.join(", ");
      await sendTelegramMessage(
        process.env.ADMIN_TELEGRAM_CHAT_ID,
        `🆕 <b>Yangi dardkash arizasi</b>\n\n👤 Ism: ${escapeHtml(nickname.trim())}\n📞 Tel: ${escapeHtml(phone || "—")}\n📝 Bio: ${escapeHtml(bio)}\n🏷 Mavzular: ${escapeHtml(topicsText)}`,
        [
          [
            { text: "✅ Tasdiqlash", callback_data: `approve:${req.userId}` },
            { text: "❌ Rad etish", callback_data: `reject:${req.userId}` },
          ],
        ],
      );
    }

    res.json({ status: "ok", wantsListener });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Profil saqlashda xato:", err);
    res
      .status(500)
      .json({ status: "error", message: "Profilni saqlab bo'lmadi" });
  } finally {
    client.release();
  }
});

// Dardkash onlayn bo'lganda uni saqlagan odamlarga (saytda bo'lsa) xabar.
// Bir odamga bir dardkash haqida ko'pi bilan har 6 soatda bir marta.
const FAVORITE_ONLINE_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const favoriteOnlineSent = new Map<string, number>();

async function notifyFavoritersOnline(listenerId: string) {
  const result = await pool.query(
    `SELECT f.user_id, p.nickname
     FROM favorite_listeners f
     JOIN profiles p ON p.user_id = f.listener_id
     JOIN users u ON u.id = f.listener_id
     WHERE f.listener_id = $1 AND u.banned_at IS NULL`,
    [listenerId],
  );
  const now = Date.now();
  for (const { user_id, nickname } of result.rows) {
    const key = `${user_id}:${listenerId}`;
    if (now - (favoriteOnlineSent.get(key) ?? 0) < FAVORITE_ONLINE_COOLDOWN_MS) continue;
    if (!isUserConnected(user_id)) continue;
    favoriteOnlineSent.set(key, now);
    notifyUser(user_id, { type: "favorite_online", listenerId, nickname });
  }
}

app.get("/api/favorites", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT listener_id FROM favorite_listeners WHERE user_id = $1",
      [req.userId],
    );
    res.json({ status: "ok", listenerIds: result.rows.map((r) => r.listener_id) });
  } catch (err) {
    console.error("Saqlanganlarni olishda xato:", err);
    res.status(500).json({ status: "error", message: "Ro'yxatni olib bo'lmadi" });
  }
});

app.post("/api/favorites/:listenerId", requireAuth, async (req, res) => {
  const { listenerId } = req.params;
  if (!UUID_RE.test(listenerId) || listenerId === req.userId) {
    return res.status(400).json({ status: "error", message: "Noto'g'ri dardkash" });
  }
  try {
    const result = await pool.query(
      `INSERT INTO favorite_listeners (user_id, listener_id)
       SELECT $1, lp.user_id FROM listener_profiles lp
       WHERE lp.user_id = $2 AND lp.status = 'approved'
       ON CONFLICT DO NOTHING
       RETURNING listener_id`,
      [req.userId, listenerId],
    );
    if (result.rows.length === 0) {
      const exists = await pool.query(
        "SELECT 1 FROM favorite_listeners WHERE user_id = $1 AND listener_id = $2",
        [req.userId, listenerId],
      );
      if (exists.rows.length === 0) {
        return res.status(404).json({ status: "error", message: "Dardkash topilmadi" });
      }
    }
    res.json({ status: "ok" });
  } catch (err) {
    console.error("Saqlashda xato:", err);
    res.status(500).json({ status: "error", message: "Saqlab bo'lmadi" });
  }
});

app.delete("/api/favorites/:listenerId", requireAuth, async (req, res) => {
  if (!UUID_RE.test(req.params.listenerId)) {
    return res.status(400).json({ status: "error", message: "Noto'g'ri dardkash" });
  }
  try {
    await pool.query(
      "DELETE FROM favorite_listeners WHERE user_id = $1 AND listener_id = $2",
      [req.userId, req.params.listenerId],
    );
    res.json({ status: "ok" });
  } catch (err) {
    console.error("Saqlanganlardan olib tashlashda xato:", err);
    res.status(500).json({ status: "error", message: "Olib tashlab bo'lmadi" });
  }
});

app.post("/api/listeners/presence", requireAuth, async (req, res) => {
  const { online } = req.body;
  if (typeof online !== "boolean") {
    return res
      .status(400)
      .json({ status: "error", message: "online (true/false) kerak" });
  }
  try {
    if (!online) {
      await pool.query("UPDATE listener_profiles SET is_online = false WHERE user_id = $1", [
        req.userId,
      ]);
      return res.json({ status: "ok" });
    }
    // Heartbeat har 30 soniyada keladi; oldin oflayn hisoblangan bo'lsa
    // (90 soniyadan ko'p jim turgan) — bu "endi onlayn bo'ldi" degani.
    const result = await pool.query(
      `WITH prev AS (
         SELECT (is_online AND last_seen_at > now() - interval '90 seconds') AS was_online
         FROM listener_profiles WHERE user_id = $1
       )
       UPDATE listener_profiles lp SET is_online = true, last_seen_at = now()
       FROM prev
       WHERE lp.user_id = $1
       RETURNING NOT COALESCE(prev.was_online, false) AS came_online, lp.status`,
      [req.userId],
    );
    const row = result.rows[0];
    if (row?.came_online && row.status === "approved") {
      notifyFavoritersOnline(req.userId!).catch((err) =>
        console.error("Saqlaganlarga xabar berishda xato:", err),
      );
    }
    res.json({ status: "ok" });
  } catch (err) {
    console.error("Holatni yangilashda xato:", err);
    res
      .status(500)
      .json({ status: "error", message: "Holatni yangilab bo'lmadi" });
  }
});

// Bosh sahifa uchun ochiq (login'siz) ma'lumot: jonli raqamlar va bir nechta
// haqiqiy dardkash kartochkasi. Faqat ommaviy maydonlar (taxallus, mavzular,
// reyting, bo'sh vaqt) — bio, yosh, telefon yo'q. Har so'rovda bazaga
// bormaslik uchun 30 soniya keshlanadi.
const PUBLIC_OVERVIEW_TTL_MS = 30 * 1000;
// Bosh sahifada shuncha kartochka ko'rsatiladi — ortig'ini ochiq API ham bermaydi.
const PUBLIC_LISTENERS_LIMIT = 3;
let publicOverviewCache: { at: number; data: unknown } | null = null;
const publicLimiter = rateLimit({ name: "public", windowMs: 60 * 1000, max: 60 });

app.get("/api/public/overview", publicLimiter, async (_req, res) => {
  try {
    if (!publicOverviewCache || Date.now() - publicOverviewCache.at > PUBLIC_OVERVIEW_TTL_MS) {
      const listeners = await pool.query(
        `SELECT p.nickname, p.avatar, p.languages, lp.rating_avg, lp.sessions_count,
                lp.available_days, lp.available_from, lp.available_to,
                (lp.is_online AND lp.last_seen_at > now() - interval '90 seconds') AS is_online,
                COALESCE(array_agg(lt.topic_code) FILTER (WHERE lt.topic_code IS NOT NULL), '{}') AS topics
         FROM listener_profiles lp
         JOIN profiles p ON p.user_id = lp.user_id
         JOIN users u ON u.id = lp.user_id
         LEFT JOIN listener_topics lt ON lt.user_id = lp.user_id
         WHERE lp.status = 'approved' AND u.banned_at IS NULL
         GROUP BY lp.user_id, p.nickname, p.avatar, p.languages, lp.rating_avg, lp.sessions_count,
                  lp.available_days, lp.available_from, lp.available_to, lp.is_online, lp.last_seen_at`,
      );
      const rows = listeners.rows;
      const sessions = await pool.query(
        "SELECT COUNT(*)::int AS n FROM sessions WHERE status = 'ended' AND started_at IS NOT NULL",
      );
      // Dardini aytuvchilarning suhbatdan keyingi kayfiyati.
      const moods = await pool.query(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE r.mood IN ('better', 'much_better'))::int AS better
         FROM session_ratings r
         JOIN sessions s ON s.id = r.session_id AND r.rated_by = s.speaker_id
         WHERE r.mood IS NOT NULL`,
      );
      const withAvailability = rows
        .filter((r) => r.available_days?.length && r.available_from !== null && r.available_to !== null)
        .map((r) => ({ days: r.available_days, from: r.available_from, to: r.available_to }));
      const sorted = [...rows].sort(
        (a, b) =>
          Number(b.is_online) - Number(a.is_online) ||
          Number(b.rating_avg) - Number(a.rating_avg) ||
          b.sessions_count - a.sessions_count,
      );
      publicOverviewCache = {
        at: Date.now(),
        data: {
          approvedListeners: rows.length,
          onlineListeners: rows.filter((r) => r.is_online).length,
          completedSessions: sessions.rows[0].n,
          moodRatings: moods.rows[0].total,
          moodBetter: moods.rows[0].better,
          next: nextAvailable(withAvailability),
          listeners: sorted.slice(0, PUBLIC_LISTENERS_LIMIT).map((r) => ({
            nickname: r.nickname,
            avatar: r.avatar,
            languages: r.languages,
            topics: r.topics,
            rating: Number(r.rating_avg),
            sessionsCount: r.sessions_count,
            online: r.is_online,
            availability:
              r.available_days?.length && r.available_from !== null && r.available_to !== null
                ? { days: r.available_days, from: r.available_from, to: r.available_to }
                : null,
          })),
        },
      };
    }
    res.set("Cache-Control", "public, max-age=30");
    res.json({ status: "ok", ...(publicOverviewCache.data as object) });
  } catch (err) {
    console.error("Ochiq statistikani olishda xato:", err);
    res.status(500).json({ status: "error", message: "Ma'lumotni olib bo'lmadi" });
  }
});

// Onlayn dardkash topilmaganda: "dardkashlar odatda bugun 20:00 dan bo'sh".
app.get("/api/listeners/next-available", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT lp.available_days AS days, lp.available_from AS "from", lp.available_to AS "to"
       FROM listener_profiles lp
       JOIN users u ON u.id = lp.user_id
       WHERE lp.status = 'approved' AND u.banned_at IS NULL AND lp.user_id <> $1
         AND cardinality(lp.available_days) > 0
         AND lp.available_from IS NOT NULL AND lp.available_to IS NOT NULL`,
      [req.userId],
    );
    res.json({ status: "ok", next: nextAvailable(result.rows) });
  } catch (err) {
    console.error("Bo'sh vaqtni hisoblashda xato:", err);
    res.status(500).json({ status: "error", message: "Hisoblab bo'lmadi" });
  }
});

// Dardkash profili (taxallusiga bosilganda) — tasdiqlangan dardkashlar
// ochiq: bio, mavzular, tillar, bo'sh vaqt, reyting, rahmat xatlari SONI
// (matnlari emas). Yosh/jins/telefon yo'q.
app.get("/api/listeners/:listenerId/profile", requireAuth, async (req, res) => {
  if (!UUID_RE.test(req.params.listenerId)) {
    return res.status(404).json({ status: "error", message: "Topilmadi" });
  }
  try {
    const result = await pool.query(
      `SELECT u.id AS user_id, p.nickname, p.avatar, p.age_range, p.languages,
              lp.bio, lp.rating_avg, lp.sessions_count,
              lp.available_days, lp.available_from, lp.available_to,
              (lp.is_online AND lp.last_seen_at > now() - interval '90 seconds') AS is_online,
              EXISTS (SELECT 1 FROM favorite_listeners f
                      WHERE f.user_id = $2 AND f.listener_id = u.id) AS is_favorite,
              COALESCE((SELECT array_agg(lt.topic_code) FROM listener_topics lt
                        WHERE lt.user_id = u.id), '{}') AS topics,
              (SELECT COUNT(*)::int FROM session_ratings r JOIN sessions s ON s.id = r.session_id
               WHERE s.listener_id = u.id AND r.rated_by = s.speaker_id
                 AND r.thanks IS NOT NULL) AS thanks_count
       FROM listener_profiles lp
       JOIN profiles p ON p.user_id = lp.user_id
       JOIN users u ON u.id = lp.user_id
       WHERE lp.user_id = $1 AND lp.status = 'approved' AND u.banned_at IS NULL`,
      [req.params.listenerId, req.userId],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ status: "error", message: "Dardkash topilmadi" });
    }
    res.json({ status: "ok", profile: result.rows[0] });
  } catch (err) {
    console.error("Dardkash profilini olishda xato:", err);
    res.status(500).json({ status: "error", message: "Profilni olib bo'lmadi" });
  }
});

// Dardini aytuvchining mini-profili — FAQAT u bilan aloqadagi dardkashga
// (taklif, yozishma, suhbat yoki navbat orqali, oxirgi 60 kun). Ommaviy
// sahifa yo'q: anonimlik — dardini aytuvchi uchun asosiy va'da.
app.get("/api/users/:userId/mini-profile", requireAuth, async (req, res) => {
  if (!UUID_RE.test(req.params.userId)) {
    return res.status(404).json({ status: "error", message: "Topilmadi" });
  }
  try {
    const allowed = await pool.query(
      `SELECT 1 FROM listener_profiles me
       WHERE me.user_id = $1 AND me.status = 'approved'
         AND (
           EXISTS (SELECT 1 FROM sessions s
                   WHERE s.speaker_id = $2 AND s.listener_id = $1
                     AND s.created_at > now() - interval '60 days')
           OR EXISTS (SELECT 1 FROM letters l
                      WHERE l.author_id = $2 AND l.listener_id = $1)
           OR EXISTS (SELECT 1 FROM waitlist w
                      WHERE w.speaker_id = $2 AND w.status = 'waiting')
         )`,
      [req.userId, req.params.userId],
    );
    if (allowed.rows.length === 0) {
      return res.status(404).json({ status: "error", message: "Topilmadi" });
    }
    const result = await pool.query(
      `SELECT p.nickname, p.avatar, p.age_range, p.languages, p.about,
              COALESCE((SELECT array_agg(pt.topic_code) FROM profile_topics pt
                        WHERE pt.user_id = p.user_id), '{}') AS topics
       FROM profiles p JOIN users u ON u.id = p.user_id
       WHERE p.user_id = $1 AND u.banned_at IS NULL`,
      [req.params.userId],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ status: "error", message: "Topilmadi" });
    }
    res.json({ status: "ok", profile: result.rows[0] });
  } catch (err) {
    console.error("Mini-profilni olishda xato:", err);
    res.status(500).json({ status: "error", message: "Profilni olib bo'lmadi" });
  }
});

app.get("/api/listeners", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
        u.id AS user_id,
        p.nickname,
        p.avatar,
        p.age_range,
        lp.rating_avg,
        lp.sessions_count,
        lp.available_days,
        lp.available_from,
        lp.available_to,
        (lp.is_online AND lp.last_seen_at > now() - interval '90 seconds') AS is_online,
        EXISTS (
          SELECT 1 FROM favorite_listeners f WHERE f.user_id = $1 AND f.listener_id = u.id
        ) AS is_favorite,
        COALESCE(array_agg(pt.topic_code) FILTER (WHERE pt.topic_code IS NOT NULL), '{}') AS topics
      FROM listener_profiles lp
      JOIN profiles p ON p.user_id = lp.user_id
      JOIN users u ON u.id = lp.user_id
      LEFT JOIN listener_topics pt ON pt.user_id = lp.user_id
      WHERE lp.status = 'approved' AND lp.user_id != $1 AND u.banned_at IS NULL
      GROUP BY u.id, p.nickname, p.avatar, p.age_range, lp.rating_avg, lp.sessions_count, lp.is_online, lp.last_seen_at,
               lp.available_days, lp.available_from, lp.available_to`,
      [req.userId],
    );
    res.json({ status: "ok", listeners: result.rows });
  } catch (err) {
    console.error("Dardkashlar ro'yxatini olishda xato:", err);
    res
      .status(500)
      .json({ status: "error", message: "Ro'yxatni olib bo'lmadi" });
  }
});

app.get(
  "/api/admin/listeners/pending",
  requireAuth,
  requireRole(["admin", "moderator"]),
  async (_req, res) => {
    try {
      const result = await pool.query(`
      SELECT
        u.id AS user_id,
        p.nickname,
        p.avatar,
        p.phone,
        lp.bio,
        COALESCE(array_agg(pt.topic_code) FILTER (WHERE pt.topic_code IS NOT NULL), '{}') AS topics
      FROM listener_profiles lp
      JOIN profiles p ON p.user_id = lp.user_id
      JOIN users u ON u.id = lp.user_id
      LEFT JOIN listener_topics pt ON pt.user_id = lp.user_id
      WHERE lp.status = 'pending'
      GROUP BY u.id, p.nickname, p.avatar, p.phone, lp.bio, lp.created_at
      ORDER BY lp.created_at ASC
    `);
      res.json({ status: "ok", pending: result.rows });
    } catch (err) {
      console.error("Kutayotganlar ro'yxatini olishda xato:", err);
      res
        .status(500)
        .json({ status: "error", message: "Ro'yxatni olib bo'lmadi" });
    }
  },
);

app.post(
  "/api/admin/listeners/:userId/approve",
  requireAuth,
  requireRole(["admin", "moderator"]),
  async (req, res) => {
    try {
      await approveListener(req.params.userId, req.userId!);
      res.json({ status: "ok" });
    } catch (err) {
      console.error("Tasdiqlashda xato:", err);
      res.status(500).json({ status: "error", message: "Tasdiqlab bo'lmadi" });
    }
  },
);

app.post(
  "/api/admin/listeners/:userId/reject",
  requireAuth,
  requireRole(["admin", "moderator"]),
  async (req, res) => {
    try {
      const { reason } = req.body;
      const reasonText = typeof reason === "string" && reason.trim() ? reason.trim() : null;
      await rejectListener(req.params.userId, reasonText, req.userId!);
      res.json({ status: "ok" });
    } catch (err) {
      console.error("Rad etishda xato:", err);
      res.status(500).json({ status: "error", message: "Rad etib bo'lmadi" });
    }
  },
);

app.get(
  "/api/admin/reports",
  requireAuth,
  requireRole(["admin", "moderator"]),
  async (_req, res) => {
    try {
      const result = await pool.query(`
        SELECT r.id, r.reason, r.details, r.created_at, r.reported_user,
               rp.nickname AS reporter_nickname,
               tp.nickname AS reported_nickname,
               (tu.banned_at IS NOT NULL) AS reported_banned,
               (SELECT COUNT(*)::int FROM reports x
                WHERE x.reported_user = r.reported_user) AS reported_total
        FROM reports r
        LEFT JOIN profiles rp ON rp.user_id = r.reported_by
        LEFT JOIN profiles tp ON tp.user_id = r.reported_user
        LEFT JOIN users tu ON tu.id = r.reported_user
        WHERE NOT r.resolved
        ORDER BY r.created_at ASC
      `);
      res.json({ status: "ok", reports: result.rows });
    } catch (err) {
      console.error("Shikoyatlarni olishda xato:", err);
      res
        .status(500)
        .json({ status: "error", message: "Ro'yxatni olib bo'lmadi" });
    }
  },
);

app.post(
  "/api/admin/reports/:reportId/resolve",
  requireAuth,
  requireRole(["admin", "moderator"]),
  async (req, res) => {
    try {
      const outcome = await resolveReport(
        req.params.reportId,
        req.userId!,
        req.body?.ban === true,
      );
      if (!outcome) {
        return res
          .status(404)
          .json({ status: "error", message: "Shikoyat topilmadi" });
      }
      res.json({ status: "ok", banned: outcome.banned });
    } catch (err) {
      console.error("Shikoyatni yopishda xato:", err);
      res.status(500).json({ status: "error", message: "Amalni bajarib bo'lmadi" });
    }
  },
);

app.get(
  "/api/admin/users/banned",
  requireAuth,
  requireRole(["admin", "moderator"]),
  async (_req, res) => {
    try {
      const result = await pool.query(`
        SELECT u.id AS user_id, u.banned_at, p.nickname
        FROM users u
        LEFT JOIN profiles p ON p.user_id = u.id
        WHERE u.banned_at IS NOT NULL
        ORDER BY u.banned_at DESC
      `);
      res.json({ status: "ok", banned: result.rows });
    } catch (err) {
      console.error("Bloklanganlar ro'yxatini olishda xato:", err);
      res
        .status(500)
        .json({ status: "error", message: "Ro'yxatni olib bo'lmadi" });
    }
  },
);

app.post(
  "/api/admin/users/:userId/ban",
  requireAuth,
  requireRole(["admin", "moderator"]),
  async (req, res) => {
    try {
      const banned = await banUser(req.params.userId, req.userId!, "manual");
      if (!banned) {
        return res.status(400).json({
          status: "error",
          message: "Bu foydalanuvchini bloklab bo'lmaydi",
        });
      }
      res.json({ status: "ok" });
    } catch (err) {
      console.error("Bloklashda xato:", err);
      res.status(500).json({ status: "error", message: "Bloklab bo'lmadi" });
    }
  },
);

app.post(
  "/api/admin/users/:userId/unban",
  requireAuth,
  requireRole(["admin", "moderator"]),
  async (req, res) => {
    try {
      await unbanUser(req.params.userId);
      res.json({ status: "ok" });
    } catch (err) {
      console.error("Blokdan chiqarishda xato:", err);
      res.status(500).json({ status: "error", message: "Amalni bajarib bo'lmadi" });
    }
  },
);

// Suhbatning joriy holatini qaytaradi — frontend shunga qarab
// "kutilmoqda" yoki "faol" ekranini ko'rsatadi.
app.get("/api/session/:sessionId", requireAuth, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const result = await pool.query(
      `SELECT s.id, s.status, s.speaker_id, s.listener_id, s.mood_before,
              COALESCE(sp.nickname, '—') AS speaker_nickname, COALESCE(lp.nickname, '—') AS listener_nickname,
              sp.avatar AS speaker_avatar, lp.avatar AS listener_avatar
       FROM sessions s
       LEFT JOIN profiles sp ON sp.user_id = s.speaker_id
       LEFT JOIN profiles lp ON lp.user_id = s.listener_id
       WHERE s.id = $1 AND (s.speaker_id = $2 OR s.listener_id = $2)`,
      [sessionId, req.userId],
    );
    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "error", message: "Suhbat topilmadi" });
    }
    res.json({ status: "ok", session: result.rows[0] });
  } catch (err) {
    console.error("Suhbat holatini olishda xato:", err);
    res
      .status(500)
      .json({ status: "error", message: "Ma'lumotni olib bo'lmadi" });
  }
});

// Dardini aytuvchi suhbat boshida kayfiyatini belgilaydi (1..5).
app.post("/api/session/:sessionId/mood-before", requireAuth, async (req, res) => {
  const mood = req.body?.mood;
  if (!Number.isInteger(mood) || mood < 1 || mood > 5) {
    return res.status(400).json({ status: "error", message: "Kayfiyat 1-5 bo'lishi kerak" });
  }
  try {
    const result = await pool.query(
      `UPDATE sessions SET mood_before = $3
       WHERE id = $1 AND speaker_id = $2 AND status IN ('scheduled', 'active')
       RETURNING id`,
      [req.params.sessionId, req.userId, mood],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ status: "error", message: "Suhbat topilmadi" });
    }
    res.json({ status: "ok" });
  } catch (err) {
    console.error("Kayfiyatni saqlashda xato:", err);
    res.status(500).json({ status: "error", message: "Saqlab bo'lmadi" });
  }
});

app.get("/api/session/:sessionId/token", requireAuth, async (req, res) => {
  try {
    const { sessionId } = req.params;

    const check = await pool.query(
      "SELECT * FROM sessions WHERE id = $1 AND (speaker_id = $2 OR listener_id = $2)",
      [sessionId, req.userId],
    );
    if (check.rows.length === 0) {
      return res
        .status(403)
        .json({ status: "error", message: "Bu suhbatga aloqangiz yo'q" });
    }
    if (check.rows[0].status !== "active") {
      return res
        .status(400)
        .json({ status: "error", message: "Suhbat hali boshlanmagan" });
    }

    const profileResult = await pool.query(
      "SELECT nickname FROM profiles WHERE user_id = $1",
      [req.userId],
    );
    const nickname = profileResult.rows[0]?.nickname || "Foydalanuvchi";

    const token = await createLiveKitToken(sessionId, req.userId!, nickname);
    res.json({ status: "ok", token });
  } catch (err) {
    console.error("Token yaratishda xato:", err);
    res
      .status(500)
      .json({ status: "error", message: "Token yaratib bo'lmadi" });
  }
});

app.post("/api/invites", requireAuth, requireProfile, callLimiter, async (req, res) => {
  try {
    const { listenerId } = req.body;
    // Ixtiyoriy qisqa xabar — dardkashga saytda va Telegram'da ko'rinadi.
    const inviteMessage =
      typeof req.body.message === "string" && req.body.message.trim()
        ? req.body.message.trim()
        : null;
    if (inviteMessage && [...inviteMessage].length > 300) {
      return res
        .status(400)
        .json({ status: "error", code: "message_length", message: "Xabar 300 belgidan oshmasin" });
    }
    if (!listenerId) {
      return res
        .status(400)
        .json({ status: "error", message: "listenerId kerak" });
    }
    if (listenerId === req.userId) {
      return res.status(400).json({
        status: "error",
        message: "O'zingizga taklif yubora olmaysiz",
      });
    }

    const listenerCheck = await pool.query(
      `SELECT lp.user_id FROM listener_profiles lp
       JOIN users u ON u.id = lp.user_id
       WHERE lp.user_id = $1 AND lp.status = 'approved' AND u.banned_at IS NULL`,
      [listenerId],
    );
    if (listenerCheck.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "error", message: "Dardkash topilmadi" });
    }

    const existingSession = await pool.query(
      `SELECT id FROM sessions
       WHERE speaker_id = $1 AND listener_id = $2 AND status IN ('scheduled', 'active')
       ORDER BY created_at DESC LIMIT 1`,
      [req.userId, listenerId],
    );

    let sessionId: string;
    if (existingSession.rows.length > 0) {
      sessionId = existingSession.rows[0].id;
      if (inviteMessage) {
        await pool.query("UPDATE sessions SET invite_message = $2 WHERE id = $1", [
          sessionId,
          inviteMessage,
        ]);
      }
    } else {
      const inserted = await pool.query(
        `INSERT INTO sessions (speaker_id, listener_id, status, invite_message)
         VALUES ($1, $2, 'scheduled', $3)
         RETURNING id`,
        [req.userId, listenerId, inviteMessage],
      );
      sessionId = inserted.rows[0].id;
    }

    const speakerResult = await pool.query(
      "SELECT nickname FROM profiles WHERE user_id = $1",
      [req.userId],
    );
    const speakerName = speakerResult.rows[0]?.nickname || "Kimdir";

    // Xabar taklif yozishmasining birinchi qatori ham bo'ladi — dardkash
    // unga saytda yoki Telegram'dan (Reply) javob qaytara oladi.
    if (inviteMessage) {
      await saveChatMessage(sessionId, req.userId!, inviteMessage, { notify: false });
    }

    await notifyIncomingCall({
      listenerId,
      sessionId,
      speakerName,
      kind: "new_invite",
      message: inviteMessage,
    });

    res.json({ status: "ok", sessionId });
  } catch (err) {
    console.error("Taklif yuborishda xato:", err);
    res
      .status(500)
      .json({ status: "error", message: "Taklif yuborib bo'lmadi" });
  }
});

app.get("/api/invites/incoming", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT s.id, s.status, s.created_at, s.invite_message, p.nickname AS speaker_nickname,
              p.avatar AS speaker_avatar, s.speaker_id
       FROM sessions s
       JOIN profiles p ON p.user_id = s.speaker_id
       WHERE s.listener_id = $1 AND s.status IN ('scheduled', 'active')
       ORDER BY s.created_at DESC`,
      [req.userId],
    );
    res.json({ status: "ok", invites: result.rows });
  } catch (err) {
    console.error("Takliflarni olishda xato:", err);
    res
      .status(500)
      .json({ status: "error", message: "Takliflarni olib bo'lmadi" });
  }
});

app.get("/api/invites/sent", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT s.id, s.status, s.created_at, p.nickname AS listener_nickname,
              p.avatar AS listener_avatar, s.listener_id
       FROM sessions s
       JOIN profiles p ON p.user_id = s.listener_id
       WHERE s.speaker_id = $1 AND s.status IN ('scheduled', 'active')
       ORDER BY s.created_at DESC`,
      [req.userId],
    );
    res.json({ status: "ok", invites: result.rows });
  } catch (err) {
    console.error("Yuborilgan takliflarni olishda xato:", err);
    res
      .status(500)
      .json({ status: "error", message: "Ma'lumotni olib bo'lmadi" });
  }
});

app.post("/api/invites/:sessionId/accept", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE sessions SET status = 'active', started_at = now()
       WHERE id = $1 AND listener_id = $2 AND status = 'scheduled'
       RETURNING speaker_id`,
      [req.params.sessionId, req.userId],
    );
    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "error", message: "Taklif topilmadi" });
    }

    notifyUser(result.rows[0].speaker_id, {
      type: "invite_accepted",
      sessionId: req.params.sessionId,
    });
    await resolveInviteTelegram(
      req.params.sessionId,
      "✅ <b>Saytda qabul qildingiz</b>",
    );

    res.json({ status: "ok" });
  } catch (err) {
    console.error("Taklifni qabul qilishda xato:", err);
    res.status(500).json({ status: "error", message: "Qabul qilib bo'lmadi" });
  }
});

app.post("/api/invites/:sessionId/decline", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE sessions SET status = 'cancelled'
       WHERE id = $1 AND listener_id = $2 AND status = 'scheduled'
       RETURNING speaker_id`,
      [req.params.sessionId, req.userId],
    );
    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "error", message: "Taklif topilmadi" });
    }

    notifyUser(result.rows[0].speaker_id, {
      type: "invite_declined",
      sessionId: req.params.sessionId,
    });
    await resolveInviteTelegram(
      req.params.sessionId,
      "❌ <b>Saytda rad etdingiz</b>",
    );

    res.json({ status: "ok" });
  } catch (err) {
    console.error("Taklifni rad etishda xato:", err);
    res.status(500).json({ status: "error", message: "Rad etib bo'lmadi" });
  }
});

// Dashboard'dagi "So'nggi suhbatlaringiz" bo'limi uchun — avval u
// statik "hali suhbat yo'q" matni edi, ma'lumot hech qayerdan olinmasdi.
// Faqat haqiqatan boshlangan (started_at bor) va tugagan suhbatlar.
// "Xabarlar" sahifasi: yozishmasi bor suhbatlar (taklif paytidagi ham),
// oxirgi xabar bo'yicha. 60 kundan eskilari ko'rsatilmaydi.
app.get("/api/conversations", requireAuth, async (req, res) => {
  try {
    const limit = parseListLimit(req.query.limit, 20);
    const result = await pool.query(
      `SELECT s.id, s.status,
              CASE WHEN s.speaker_id = $1 THEN 'speaker' ELSE 'listener' END AS my_role,
              p.nickname AS partner_nickname,
              p.avatar AS partner_avatar,
              p.user_id AS partner_id,
              last.content AS last_message,
              (last.sender_id = $1) AS last_is_mine,
              last.created_at AS last_at,
              (SELECT COUNT(*)::int FROM chat_messages m
               WHERE m.session_id = s.id AND m.sender_id <> $1
                 AND m.created_at > COALESCE(
                   (SELECT r.last_read_at FROM chat_reads r
                    WHERE r.session_id = s.id AND r.user_id = $1), '-infinity')) AS unread
       FROM sessions s
       JOIN profiles p ON p.user_id =
         CASE WHEN s.speaker_id = $1 THEN s.listener_id ELSE s.speaker_id END
       JOIN LATERAL (
         SELECT LEFT(m.content, 160) AS content, m.sender_id, m.created_at
         FROM chat_messages m WHERE m.session_id = s.id
         ORDER BY m.created_at DESC LIMIT 1
       ) last ON true
       WHERE (s.speaker_id = $1 OR s.listener_id = $1)
       ORDER BY last.created_at DESC, s.id
       LIMIT $2`,
      [req.userId, limit + 1],
    );
    res.json({
      status: "ok",
      conversations: result.rows.slice(0, limit),
      hasMore: result.rows.length > limit,
    });
  } catch (err) {
    console.error("Yozishmalarni olishda xato:", err);
    res.status(500).json({ status: "error", message: "Yozishmalarni olib bo'lmadi" });
  }
});

// Sarlavhadagi yashil doiracha uchun: yozishmalardagi o'qilmagan xabarlar
// va yangi javobi bor xatlar.
app.get("/api/unread", requireAuth, async (req, res) => {
  try {
    const chats = await pool.query(
      `SELECT COUNT(*)::int AS n
       FROM chat_messages m
       JOIN sessions s ON s.id = m.session_id
       LEFT JOIN chat_reads r ON r.session_id = s.id AND r.user_id = $1
       WHERE (s.speaker_id = $1 OR s.listener_id = $1)
         AND m.sender_id <> $1
         AND m.created_at > now() - interval '60 days'
         AND m.created_at > COALESCE(r.last_read_at, '-infinity')`,
      [req.userId],
    );
    const letters = await pool.query(
      `SELECT COUNT(*)::int AS n FROM letters l
       WHERE l.status IN ('open', 'taken')
         AND ((l.author_id = $1 AND l.last_message_at > l.author_seen_at)
           OR (l.listener_id = $1
               AND (l.listener_seen_at IS NULL OR l.last_message_at > l.listener_seen_at)))`,
      [req.userId],
    );
    res.json({
      status: "ok",
      chats: chats.rows[0].n,
      letters: letters.rows[0].n,
      total: chats.rows[0].n + letters.rows[0].n,
    });
  } catch (err) {
    console.error("O'qilmaganlarni hisoblashda xato:", err);
    res.status(500).json({ status: "error", message: "Hisoblab bo'lmadi" });
  }
});

app.post("/api/conversations/:sessionId/read", requireAuth, async (req, res) => {
  try {
    await pool.query(
      `INSERT INTO chat_reads (session_id, user_id)
       SELECT s.id, $2 FROM sessions s
       WHERE s.id = $1 AND (s.speaker_id = $2 OR s.listener_id = $2)
       ON CONFLICT (session_id, user_id) DO UPDATE SET last_read_at = now()`,
      [req.params.sessionId, req.userId],
    );
    res.json({ status: "ok" });
  } catch (err) {
    console.error("O'qildi deb belgilashda xato:", err);
    res.status(500).json({ status: "error", message: "Belgilab bo'lmadi" });
  }
});

// Dardkashga qo'ng'iroqsiz yozishma boshlash ("✉️ Xabar yozish"): suhbat
// `scheduled` bo'lib yaratiladi (yoki ikkalasi orasidagi ochiq suhbat
// ishlatiladi), xabar odatdagi yozishma bildirishnomasi bilan boradi —
// qo'ng'iroq oynasi ham, jiringlash ham yo'q.
app.post("/api/conversations", requireAuth, requireProfile, callLimiter, async (req, res) => {
  try {
    const { listenerId } = req.body ?? {};
    const text = typeof req.body?.message === "string" ? req.body.message.trim() : "";
    if (!text || [...text].length > 1000) {
      return res
        .status(400)
        .json({ status: "error", code: "message_length", message: "Xabar 1-1000 belgi bo'lsin" });
    }
    if (!UUID_RE.test(String(listenerId)) || listenerId === req.userId) {
      return res.status(400).json({ status: "error", message: "Noto'g'ri dardkash" });
    }
    const listener = await pool.query(
      `SELECT 1 FROM listener_profiles lp JOIN users u ON u.id = lp.user_id
       WHERE lp.user_id = $1 AND lp.status = 'approved' AND u.banned_at IS NULL`,
      [listenerId],
    );
    if (listener.rows.length === 0) {
      return res.status(404).json({ status: "error", message: "Dardkash topilmadi" });
    }
    const existing = await pool.query(
      `SELECT id FROM sessions
       WHERE speaker_id = $1 AND listener_id = $2 AND status IN ('scheduled', 'active')
       ORDER BY created_at DESC LIMIT 1`,
      [req.userId, listenerId],
    );
    const sessionId: string =
      existing.rows[0]?.id ??
      (
        await pool.query(
          `INSERT INTO sessions (speaker_id, listener_id, status) VALUES ($1, $2, 'scheduled')
           RETURNING id`,
          [req.userId, listenerId],
        )
      ).rows[0].id;
    await saveChatMessage(sessionId, req.userId!, text);
    res.json({ status: "ok", sessionId });
  } catch (err) {
    console.error("Yozishma boshlashda xato:", err);
    res.status(500).json({ status: "error", message: "Xabar yuborib bo'lmadi" });
  }
});

// Suhbatlar tarixi sahifalab: `?offset=N`, har safar RECENT_PAGE ta.
// Avval faqat oxirgi 10 ta qaytarilardi — eskilarini ko'rib bo'lmasdi.
const RECENT_PAGE = 10;

app.get("/api/sessions/recent", requireAuth, async (req, res) => {
  try {
    const offset = Math.min(Math.max(Number.parseInt(String(req.query.offset ?? "0"), 10) || 0, 0), 10000);
    const result = await pool.query(
      `SELECT s.id, s.started_at, s.ended_at,
              CASE WHEN s.speaker_id = $1 THEN 'speaker' ELSE 'listener' END AS my_role,
              p.nickname AS partner_nickname,
              p.avatar AS partner_avatar,
              p.user_id AS partner_id,
              (s.speaker_id = $1 AND EXISTS (
                SELECT 1 FROM favorite_listeners f
                WHERE f.user_id = $1 AND f.listener_id = s.listener_id
              )) AS partner_favorite,
              CASE WHEN s.speaker_id = $1 THEN s.mood_before END AS mood_before,
              (SELECT r.mood FROM session_ratings r
               WHERE r.session_id = s.id AND r.rated_by = $1) AS mood_after,
              EXISTS (
                SELECT 1 FROM session_ratings r
                WHERE r.session_id = s.id AND r.rated_by = $1
              ) AS rated
       FROM sessions s
       JOIN profiles p ON p.user_id =
         CASE WHEN s.speaker_id = $1 THEN s.listener_id ELSE s.speaker_id END
       WHERE (s.speaker_id = $1 OR s.listener_id = $1)
         AND s.status = 'ended'
         AND s.started_at IS NOT NULL
       ORDER BY COALESCE(s.ended_at, s.started_at) DESC, s.id
       LIMIT $2 OFFSET $3`,
      [req.userId, RECENT_PAGE + 1, offset],
    );
    res.json({
      status: "ok",
      sessions: result.rows.slice(0, RECENT_PAGE),
      hasMore: result.rows.length > RECENT_PAGE,
    });
  } catch (err) {
    console.error("So'nggi suhbatlarni olishda xato:", err);
    res
      .status(500)
      .json({ status: "error", message: "Suhbatlarni olib bo'lmadi" });
  }
});

app.post("/api/session/start", requireAuth, requireProfile, callLimiter, async (req, res) => {
  try {
    const { listenerId } = req.body;
    if (!listenerId) {
      return res
        .status(400)
        .json({ status: "error", message: "listenerId kerak" });
    }
    if (listenerId === req.userId) {
      return res.status(400).json({
        status: "error",
        message: "O'zingiz bilan suhbat boshlab bo'lmaydi",
      });
    }

    const listenerCheck = await pool.query(
      `SELECT lp.user_id FROM listener_profiles lp
       JOIN users u ON u.id = lp.user_id
       WHERE lp.user_id = $1 AND lp.status = 'approved' AND u.banned_at IS NULL`,
      [listenerId],
    );
    if (listenerCheck.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "error", message: "Dardkash topilmadi" });
    }

    const existing = await pool.query(
      `SELECT id FROM sessions
       WHERE speaker_id = $1 AND listener_id = $2 AND status IN ('scheduled', 'active')
       ORDER BY created_at DESC LIMIT 1`,
      [req.userId, listenerId],
    );

    let sessionId: string;
    if (existing.rows.length > 0) {
      sessionId = existing.rows[0].id;
    } else {
      const inserted = await pool.query(
        `INSERT INTO sessions (speaker_id, listener_id, status)
         VALUES ($1, $2, 'scheduled')
         RETURNING id`,
        [req.userId, listenerId],
      );
      sessionId = inserted.rows[0].id;
    }

    const speakerResult = await pool.query(
      "SELECT nickname FROM profiles WHERE user_id = $1",
      [req.userId],
    );
    const speakerName = speakerResult.rows[0]?.nickname || "Kimdir";

    await notifyIncomingCall({
      listenerId,
      sessionId,
      speakerName,
      kind: "incoming_call",
    });

    // Suhbat boshqa yo'l bilan boshlandi — navbatda turishi shart emas.
    await cancelWaitlist(req.userId!);
    res.json({ status: "ok", sessionId, waiting: true });
  } catch (err) {
    console.error("Qo'ng'iroq boshlashda xato:", err);
    res
      .status(500)
      .json({ status: "error", message: "Amalni bajarib bo'lmadi" });
  }
});

app.post("/api/session/match", requireAuth, requireProfile, callLimiter, async (req, res) => {
  try {
    const profileResult = await pool.query(
      "SELECT language, languages, preferred_listener_gender FROM profiles WHERE user_id = $1",
      [req.userId],
    );
    const own = profileResult.rows[0];
    const languages: string[] = own?.languages?.length
      ? own.languages
      : [own?.language || "uz"];
    const preferredGender: string = own?.preferred_listener_gender || "any";

    const topicsResult = await pool.query(
      "SELECT topic_code FROM profile_topics WHERE user_id = $1",
      [req.userId],
    );
    const topicCodes = topicsResult.rows.map((r) => r.topic_code as string);

    // Jins — ustuvorlik emas, QAT'IY filtr: "ayol dardkash" so'ragan odamni
    // jimgina erkak dardkashga ulab qo'ygandan ko'ra, "hozircha mos dardkash
    // yo'q" deyish to'g'riroq. Jinsini aytmagan dardkashlar faqat "farqi
    // yo'q" tanlaganlarga chiqadi.
    const candidates = await pool.query(
      `SELECT
         lp.user_id,
         (p.languages && $2::text[]) AS language_match,
         COALESCE(overlap.cnt, 0) AS topic_overlap
       FROM listener_profiles lp
       JOIN profiles p ON p.user_id = lp.user_id
       LEFT JOIN (
         SELECT user_id, COUNT(*) AS cnt
         FROM listener_topics
         WHERE topic_code = ANY($3::text[])
         GROUP BY user_id
       ) overlap ON overlap.user_id = lp.user_id
       WHERE lp.status = 'approved'
         AND lp.is_online = true
         AND lp.last_seen_at > now() - interval '90 seconds'
         AND lp.user_id != $1
         AND ($4::text = 'any' OR p.gender = $4::text)
         AND NOT EXISTS (
           SELECT 1 FROM users bu
           WHERE bu.id = lp.user_id AND bu.banned_at IS NOT NULL
         )
         AND lp.user_id NOT IN (
           SELECT speaker_id FROM sessions
           WHERE status = 'active'
              OR (status = 'scheduled' AND created_at > now() - interval '2 minutes')
           UNION
           SELECT listener_id FROM sessions
           WHERE status = 'active'
              OR (status = 'scheduled' AND created_at > now() - interval '2 minutes')
         )
       ORDER BY language_match DESC, topic_overlap DESC, lp.rating_avg DESC, lp.sessions_count ASC
       LIMIT 1`,
      [req.userId, languages, topicCodes, preferredGender],
    );

    if (candidates.rows.length === 0) {
      return res.status(404).json({
        status: "error",
        message:
          "Hozircha mos dardkash yo'q, birozdan keyin qayta urinib ko'ring",
      });
    }

    const listenerId = candidates.rows[0].user_id as string;

    const existing = await pool.query(
      `SELECT id FROM sessions
       WHERE speaker_id = $1 AND listener_id = $2 AND status IN ('scheduled', 'active')
       ORDER BY created_at DESC LIMIT 1`,
      [req.userId, listenerId],
    );

    let sessionId: string;
    if (existing.rows.length > 0) {
      sessionId = existing.rows[0].id;
    } else {
      const inserted = await pool.query(
        `INSERT INTO sessions (speaker_id, listener_id, status)
         VALUES ($1, $2, 'scheduled')
         RETURNING id`,
        [req.userId, listenerId],
      );
      sessionId = inserted.rows[0].id;
    }

    const speakerResult = await pool.query(
      "SELECT nickname FROM profiles WHERE user_id = $1",
      [req.userId],
    );
    const speakerName = speakerResult.rows[0]?.nickname || "Kimdir";

    await notifyIncomingCall({
      listenerId,
      sessionId,
      speakerName,
      kind: "incoming_call",
    });

    // Suhbat boshqa yo'l bilan boshlandi — navbatda turishi shart emas.
    await cancelWaitlist(req.userId!);
    res.json({ status: "ok", sessionId, waiting: true });
  } catch (err) {
    console.error("Moslashtirishda xato:", err);
    res.status(500).json({ status: "error", message: "Moslashtirib bo'lmadi" });
  }
});

// --- Brauzer push-bildirishnomalari (server/src/push.ts) ---

app.get("/api/push/public-key", (_req, res) => {
  res.json({ status: "ok", key: pushPublicKey() });
});

app.post("/api/push/subscribe", requireAuth, async (req, res) => {
  const sub = req.body?.subscription;
  const endpoint = sub?.endpoint;
  const p256dh = sub?.keys?.p256dh;
  const auth = sub?.keys?.auth;
  if (
    typeof endpoint !== "string" ||
    !/^https:\/\//.test(endpoint) ||
    endpoint.length > 1000 ||
    typeof p256dh !== "string" ||
    typeof auth !== "string" ||
    p256dh.length > 200 ||
    auth.length > 100
  ) {
    return res.status(400).json({ status: "error", message: "Noto'g'ri obuna" });
  }
  try {
    // Bitta qurilma (endpoint) — bitta foydalanuvchi: boshqa hisobga kirilsa,
    // obuna yangi hisobga o'tadi.
    await pool.query(
      `INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (endpoint) DO UPDATE SET user_id = $2, p256dh = $3, auth = $4`,
      [endpoint, req.userId, p256dh, auth],
    );
    res.json({ status: "ok" });
  } catch (err) {
    console.error("Push obunasini saqlashda xato:", err);
    res.status(500).json({ status: "error", message: "Saqlab bo'lmadi" });
  }
});

app.post("/api/push/unsubscribe", requireAuth, async (req, res) => {
  const endpoint = req.body?.endpoint;
  if (typeof endpoint !== "string") {
    return res.status(400).json({ status: "error", message: "endpoint kerak" });
  }
  try {
    await pool.query("DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2", [
      endpoint,
      req.userId,
    ]);
    res.json({ status: "ok" });
  } catch (err) {
    console.error("Push obunasini o'chirishda xato:", err);
    res.status(500).json({ status: "error", message: "O'chirib bo'lmadi" });
  }
});

// --- "Xat" rejimi (server/src/letters.ts) ---
app.use("/api/letters", createLettersRouter());

// --- Kutish navbati (server/src/waitlist.ts) ---

app.get("/api/waitlist/me", requireAuth, async (req, res) => {
  try {
    res.json({ status: "ok", waiting: await getMyWaiting(req.userId!) });
  } catch (err) {
    console.error("Navbat holatini olishda xato:", err);
    res.status(500).json({ status: "error", message: "Navbat holatini olib bo'lmadi" });
  }
});

app.post("/api/waitlist", requireAuth, callLimiter, async (req, res) => {
  try {
    const profile = await pool.query("SELECT 1 FROM profiles WHERE user_id = $1", [req.userId]);
    if (profile.rows.length === 0) {
      return res
        .status(400)
        .json({ status: "error", code: "no_profile", message: "Avval profilni to'ldiring" });
    }
    res.json({ status: "ok", waiting: await joinWaitlist(req.userId!) });
  } catch (err) {
    console.error("Navbatga yozishda xato:", err);
    res.status(500).json({ status: "error", message: "Navbatga yozib bo'lmadi" });
  }
});

app.delete("/api/waitlist/me", requireAuth, async (req, res) => {
  try {
    await cancelWaitlist(req.userId!);
    res.json({ status: "ok" });
  } catch (err) {
    console.error("Navbatni bekor qilishda xato:", err);
    res.status(500).json({ status: "error", message: "Navbatni bekor qilib bo'lmadi" });
  }
});

app.get("/api/waitlist", requireAuth, async (req, res) => {
  try {
    res.json({ status: "ok", waiting: await listWaitingFor(req.userId!) });
  } catch (err) {
    console.error("Navbat ro'yxatini olishda xato:", err);
    res.status(500).json({ status: "error", message: "Ro'yxatni olib bo'lmadi" });
  }
});

app.post("/api/waitlist/:waitlistId/take", requireAuth, async (req, res) => {
  if (!UUID_RE.test(req.params.waitlistId)) {
    return res.status(404).json({ status: "error", code: "not_found", message: "Topilmadi" });
  }
  try {
    const result = await takeWaitlist(req.params.waitlistId, req.userId!);
    if (!result.ok) {
      const status = result.code === "not_found" ? 404 : result.code === "not_allowed" ? 403 : 409;
      return res.status(status).json({ status: "error", code: result.code });
    }
    res.json({ status: "ok", sessionId: result.sessionId });
  } catch (err) {
    console.error("Navbatdagi suhbatni olishda xato:", err);
    res.status(500).json({ status: "error", message: "Suhbatni olib bo'lmadi" });
  }
});

app.post("/api/session/:sessionId/end", requireAuth, async (req, res) => {
  try {
    const { sessionId } = req.params;
    // Hali qabul qilinmagan (scheduled) suhbat "tugamaydi", bekor bo'ladi —
    // avval u 'ended' bo'lib, dardkashdagi qo'ng'iroq modali ochiq qolardi.
    const result = await pool.query(
      `UPDATE sessions SET
         status = CASE WHEN status = 'scheduled'
                       THEN 'cancelled'::session_status
                       ELSE 'ended'::session_status END,
         ended_at = now()
       WHERE id = $1 AND (speaker_id = $2 OR listener_id = $2)
         AND status IN ('scheduled', 'active')
       RETURNING speaker_id, listener_id, status`,
      [sessionId, req.userId],
    );
    if (result.rows.length === 0) {
      return res
        .status(403)
        .json({ status: "error", message: "Bu suhbatga aloqangiz yo'q" });
    }
    if (result.rows[0].status === "cancelled") {
      const { speaker_id, listener_id } = result.rows[0];
      notifyUser(req.userId === speaker_id ? listener_id : speaker_id, {
        type: "call_cancelled",
        sessionId,
      });
      await resolveInviteTelegram(sessionId, inviteStatusText("cancelled_by_caller"));
      return res.json({ status: "ok" });
    }
    // sessions_count (matching'dagi yuk taqsimoti mezoni) shu yerda yangilanadi.
    await pool.query("SELECT refresh_listener_stats($1)", [
      result.rows[0].listener_id,
    ]);
    res.json({ status: "ok" });
  } catch (err) {
    console.error("Suhbatni tugatishda xato:", err);
    res
      .status(500)
      .json({ status: "error", message: "Suhbatni tugatib bo'lmadi" });
  }
});

app.get("/api/session/:sessionId/messages", requireAuth, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const check = await pool.query(
      "SELECT id FROM sessions WHERE id = $1 AND (speaker_id = $2 OR listener_id = $2)",
      [sessionId, req.userId],
    );
    if (check.rows.length === 0) {
      return res
        .status(403)
        .json({ status: "error", message: "Bu suhbatga aloqangiz yo'q" });
    }

    const result = await pool.query(
      "SELECT id, sender_id, content, created_at FROM chat_messages WHERE session_id = $1 ORDER BY created_at ASC",
      [sessionId],
    );
    res.json({ status: "ok", messages: result.rows });
  } catch (err) {
    console.error("Xabarlarni olishda xato:", err);
    res
      .status(500)
      .json({ status: "error", message: "Xabarlarni olib bo'lmadi" });
  }
});

app.post("/api/session/:sessionId/messages", requireAuth, messageLimiter, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { content } = req.body;

    if (
      typeof content !== "string" ||
      content.trim().length === 0 ||
      content.length > 2000
    ) {
      return res
        .status(400)
        .json({ status: "error", message: "Xabar matni noto'g'ri" });
    }

    const check = await pool.query(
      "SELECT id FROM sessions WHERE id = $1 AND (speaker_id = $2 OR listener_id = $2)",
      [sessionId, req.userId],
    );
    if (check.rows.length === 0) {
      return res
        .status(403)
        .json({ status: "error", message: "Bu suhbatga aloqangiz yo'q" });
    }

    const message = await saveChatMessage(sessionId, req.userId!, content.trim());
    res.json({ status: "ok", message });
  } catch (err) {
    console.error("Xabar yozishda xato:", err);
    res
      .status(500)
      .json({ status: "error", message: "Xabar yuborib bo'lmadi" });
  }
});

async function notifyThanks(listenerId: string, speakerId: string, thanks: string) {
  const result = await pool.query(
    `SELECT sp.nickname, u.telegram_id
     FROM profiles sp, users u
     WHERE sp.user_id = $1 AND u.id = $2`,
    [speakerId, listenerId],
  );
  const row = result.rows[0];
  if (!row) return;
  notifyUser(listenerId, { type: "thanks_received", nickname: row.nickname });
  pushIfOffline(listenerId, {
    uz: { title: "💌 Sizga rahmat aytishdi", body: `${row.nickname}: «${thanks.slice(0, 120)}»` },
    ru: { title: "💌 Вас поблагодарили", body: `${row.nickname}: «${thanks.slice(0, 120)}»` },
    path: "/dashboard?tab=impact",
  });
  if (row.telegram_id) {
    await sendTelegramMessage(
      row.telegram_id,
      `💌 <b>${escapeHtml(row.nickname)}</b> sizga rahmat aytdi:\n\n«${escapeHtml(thanks)}»`,
    );
  }
}

// "Tabriklaymiz, siz tasdiqlandingiz" kartochkasi yopildi — qayta chiqmaydi.
app.post("/api/listener/welcome-seen", requireAuth, async (req, res) => {
  try {
    await pool.query(
      "UPDATE listener_profiles SET welcome_seen_at = now() WHERE user_id = $1",
      [req.userId],
    );
    res.json({ status: "ok" });
  } catch (err) {
    console.error("Kartochkani belgilashda xato:", err);
    res.status(500).json({ status: "error", message: "Belgilab bo'lmadi" });
  }
});

// Dardkash kabineti uchun: uning hissasi va unga yozilgan rahmat xatlari.
app.get("/api/listener/impact", requireAuth, async (req, res) => {
  try {
    const stats = await pool.query(
      `SELECT lp.sessions_count, lp.rating_avg,
              (SELECT COUNT(*)::int FROM session_ratings r
               JOIN sessions s ON s.id = r.session_id
               WHERE s.listener_id = $1 AND r.rated_by = s.speaker_id AND r.thanks IS NOT NULL) AS thanks_count,
              (SELECT COUNT(*)::int FROM session_ratings r
               JOIN sessions s ON s.id = r.session_id
               WHERE s.listener_id = $1 AND r.rated_by = s.speaker_id
                 AND r.mood IN ('better', 'much_better')) AS helped_count
       FROM listener_profiles lp WHERE lp.user_id = $1 AND lp.status = 'approved'`,
      [req.userId],
    );
    if (stats.rows.length === 0) return res.json({ status: "ok", impact: null });
    const thanks = await pool.query(
      `SELECT r.thanks, r.created_at, p.nickname
       FROM session_ratings r
       JOIN sessions s ON s.id = r.session_id
       JOIN profiles p ON p.user_id = s.speaker_id
       WHERE s.listener_id = $1 AND r.rated_by = s.speaker_id AND r.thanks IS NOT NULL
       ORDER BY r.created_at DESC
       LIMIT 10`,
      [req.userId],
    );
    const row = stats.rows[0];
    res.json({
      status: "ok",
      impact: {
        sessionsCount: row.sessions_count,
        rating: Number(row.rating_avg),
        thanksCount: row.thanks_count,
        helpedCount: row.helped_count,
        thanks: thanks.rows,
      },
    });
  } catch (err) {
    console.error("Dardkash hissasini olishda xato:", err);
    res.status(500).json({ status: "error", message: "Ma'lumotni olib bo'lmadi" });
  }
});

app.post("/api/session/:sessionId/rating", requireAuth, reportLimiter, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { listened, mood, comment } = req.body;
    const thanks =
      typeof req.body.thanks === "string" && req.body.thanks.trim()
        ? req.body.thanks.trim()
        : null;
    if (thanks && [...thanks].length > 300) {
      return res.status(400).json({ status: "error", message: "Rahmat xati juda uzun" });
    }
    if (
      (listened && !["yes", "partial", "no"].includes(listened)) ||
      (mood && !["worse", "same", "better", "much_better"].includes(mood))
    ) {
      return res.status(400).json({ status: "error", message: "Noto'g'ri baho qiymati" });
    }

    const check = await pool.query(
      "SELECT listener_id, speaker_id FROM sessions WHERE id = $1 AND (speaker_id = $2 OR listener_id = $2)",
      [sessionId, req.userId],
    );
    if (check.rows.length === 0) {
      return res
        .status(403)
        .json({ status: "error", message: "Bu suhbatga aloqangiz yo'q" });
    }

    // Rahmat xati faqat dardini aytuvchidan dardkashga.
    const isSpeaker = check.rows[0].speaker_id === req.userId;
    const previous = await pool.query(
      "SELECT thanks FROM session_ratings WHERE session_id = $1 AND rated_by = $2",
      [sessionId, req.userId],
    );

    // Bitta suhbatga bir kishi faqat bitta baho — qayta yuborilsa yangilanadi.
    await pool.query(
      `INSERT INTO session_ratings (session_id, rated_by, listened, mood, comment, thanks)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (session_id, rated_by) DO UPDATE SET
         listened = EXCLUDED.listened,
         mood = EXCLUDED.mood,
         comment = EXCLUDED.comment,
         thanks = EXCLUDED.thanks,
         created_at = now()`,
      [
        sessionId,
        req.userId,
        listened || null,
        mood || null,
        comment || null,
        isSpeaker ? thanks : null,
      ],
    );
    if (isSpeaker && thanks && thanks !== previous.rows[0]?.thanks) {
      notifyThanks(check.rows[0].listener_id, req.userId!, thanks).catch((err) =>
        console.error("Rahmat xatini yetkazishda xato:", err),
      );
    }
    await pool.query("SELECT refresh_listener_stats($1)", [
      check.rows[0].listener_id,
    ]);

    res.json({ status: "ok" });
  } catch (err) {
    console.error("Baholashni saqlashda xato:", err);
    res
      .status(500)
      .json({ status: "error", message: "Baholashni saqlab bo'lmadi" });
  }
});

app.post("/api/session/:sessionId/report", requireAuth, reportLimiter, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { reason, details } = req.body;

    if (typeof reason !== "string" || !Object.hasOwn(REPORT_REASON_LABELS, reason)) {
      return res
        .status(400)
        .json({ status: "error", message: "Noto'g'ri sabab" });
    }
    if (details !== undefined && details !== null && typeof details !== "string") {
      return res
        .status(400)
        .json({ status: "error", message: "Izoh matn bo'lishi kerak" });
    }
    const detailsText = details?.trim().slice(0, 1000) || null;

    const check = await pool.query(
      "SELECT speaker_id, listener_id FROM sessions WHERE id = $1 AND (speaker_id = $2 OR listener_id = $2)",
      [sessionId, req.userId],
    );
    if (check.rows.length === 0) {
      return res
        .status(403)
        .json({ status: "error", message: "Bu suhbatga aloqangiz yo'q" });
    }

    const { speaker_id, listener_id } = check.rows[0];
    const reportedUser = req.userId === speaker_id ? listener_id : speaker_id;

    await fileReport({
      reporterId: req.userId!,
      reportedUserId: reportedUser,
      sessionId,
      reason,
      details: detailsText,
    });

    res.json({ status: "ok" });
  } catch (err) {
    console.error("Shikoyatni saqlashda xato:", err);
    res
      .status(500)
      .json({ status: "error", message: "Shikoyatni saqlab bo'lmadi" });
  }
});

// Google orqali kirgan foydalanuvchi Telegram'ni ulashi uchun bir martalik
// deep-link: t.me/<bot>?start=<token>. Bot webhook'i tokenni ko'rib,
// telegram_id'ni shu hisobga yozadi (linkTelegramAccount).
app.post("/api/telegram/link", requireAuth, authLimiter, async (req, res) => {
  const botUsername =
    process.env.TELEGRAM_BOT_USERNAME ||
    process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;
  if (!botUsername) {
    return res
      .status(503)
      .json({ status: "error", message: "Telegram bot sozlanmagan" });
  }
  try {
    const token = crypto.randomBytes(16).toString("hex");
    await pool.query(
      "DELETE FROM telegram_link_tokens WHERE user_id = $1 OR expires_at < now()",
      [req.userId],
    );
    await pool.query(
      `INSERT INTO telegram_link_tokens (token, user_id, expires_at)
       VALUES ($1, $2, now() + interval '15 minutes')`,
      [token, req.userId],
    );
    res.json({ status: "ok", url: `https://t.me/${botUsername}?start=${token}` });
  } catch (err) {
    console.error("Telegram ulash havolasini yaratishda xato:", err);
    res.status(500).json({ status: "error", message: "Havola yaratib bo'lmadi" });
  }
});

async function linkTelegramAccount(
  token: string,
  telegramUserId: number,
  chatId: number,
) {
  const tokenResult = await pool.query(
    `DELETE FROM telegram_link_tokens
     WHERE token = $1 AND expires_at > now()
     RETURNING user_id`,
    [token],
  );
  const userId = tokenResult.rows[0]?.user_id;
  if (!userId) {
    await sendTelegramMessage(
      chatId,
      "Havola eskirgan yoki allaqachon ishlatilgan. Saytdagi \"Telegram'ni ulash\" tugmasini qaytadan bosing.",
    );
    return;
  }

  // Bitta Telegram hisobi faqat bitta Dardkash hisobiga bog'lanadi
  // (users.telegram_id UNIQUE). Odatiy holat: odam avval Telegram orqali,
  // keyin Google orqali kirgan — ikki alohida hisob. Jimgina ko'chirmaymiz:
  // eski hisob bo'sh bo'lsa (profili yo'q) — o'zimiz ko'chiramiz, aks holda
  // tasdiq so'raymiz (server/src/telegram-move.ts).
  const owner = await pool.query(
    "SELECT id FROM users WHERE telegram_id = $1",
    [String(telegramUserId)],
  );
  if (owner.rows.length > 0 && owner.rows[0].id !== userId) {
    const handled = await handleTelegramConflict(
      chatId,
      String(telegramUserId),
      owner.rows[0].id,
      userId,
    );
    if (handled === "asked") return;
  }

  await pool.query("UPDATE users SET telegram_id = $2 WHERE id = $1", [
    userId,
    String(telegramUserId),
  ]);
  await sendTelegramMessage(
    chatId,
    "✅ Telegram hisobingiz ulandi!\n\nEndi saytda bo'lmagan paytingizda ham kimdir siz bilan suhbatlashmoqchi bo'lsa, shu yerga xabar keladi.",
  );
  notifyUser(userId, { type: "telegram_linked" });
}

// Express 4 async handler ichidagi xatoni o'zi ushlamaydi — bu yerdagi
// har qanday DB/Telegram xatosi butun jarayonni yiqitardi. Xato bo'lsa ham
// 200 qaytaramiz: aks holda Telegram o'sha update'ni qayta-qayta yuboradi.
app.post("/api/telegram/webhook", async (req, res) => {
  try {
    await handleTelegramWebhook(req, res);
  } catch (err) {
    console.error("Telegram webhook xatosi:", err);
    if (!res.headersSent) res.sendStatus(200);
  }
});

async function handleTelegramWebhook(req: express.Request, res: express.Response) {
  const secret = req.header("X-Telegram-Bot-Api-Secret-Token");
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expectedSecret || secret !== expectedSecret) {
    return res.sendStatus(401);
  }

  const message = req.body?.message;
  const startToken =
    typeof message?.text === "string"
      ? message.text.match(/^\/start\s+([a-f0-9]{32})$/)?.[1]
      : undefined;
  if (startToken && message.chat?.type === "private") {
    await linkTelegramAccount(startToken, message.from.id, message.chat.id);
    return res.sendStatus(200);
  }
  if (message && String(message.chat?.id) === process.env.ADMIN_TELEGRAM_CHAT_ID) {
    const rejected = await handleRejectReason(message);
    if (rejected) {
      await editTelegramMessage(
        message.chat.id,
        rejected.messageId,
        `${escapeHtml(rejected.originalText)}\n\n<b>${escapeHtml(rejected.text)}</b>`,
      );
      await sendTelegramMessage(message.chat.id, rejected.text);
      return res.sendStatus(200);
    }
  }
  if (message && (await handleTelegramChatReply(message))) {
    return res.sendStatus(200);
  }
  if (message && (await handleTelegramPendingReply(message))) {
    return res.sendStatus(200);
  }
  if (message?.text === "/start") {
    const chatId = message.chat.id;
    const existing = await pool.query(
      "SELECT id FROM users WHERE telegram_id = $1",
      [String(chatId)],
    );
    // "Ilovani ochish" — Dardkash Telegram ichida (Mini App) ochiladi va
    // foydalanuvchi avtomatik kiradi (/api/auth/telegram-webapp).
    const openApp = [
      [{ text: "📱 Dardkash'ni ochish", web_app: { url: `${process.env.APP_BASE_URL}/` } }],
    ];
    if (existing.rows.length > 0) {
      await sendTelegramMessage(
        chatId,
        "Assalomu alaykum! 👋\n\nHisobingiz allaqachon bog'langan — endi profilingiz bilan bog'liq muhim xabarlarni shu yerdan olasiz.\n\nDardkash'ni to'g'ridan-to'g'ri Telegram ichida ham ochishingiz mumkin:",
        openApp,
      );
    } else {
      await sendTelegramMessage(
        chatId,
        "Assalomu alaykum! 👋\n\nDardkash botiga xush kelibsiz.\n\nPastdagi tugma orqali Dardkash'ni shu yerning o'zida oching — alohida ro'yxatdan o'tish shart emas:",
        openApp,
      );
    }
    return res.sendStatus(200);
  }

  // /start'dan boshqa har qanday yozilgan xabar avval sukut bilan
  // yo'qolib ketardi — hech kimga yetib bormasdi. Maxfiylik siyosati va
  // foydalanish qoidalari sahifalarida savol/shikoyat/hisobni o'chirish
  // so'rovi uchun aynan shu bot ko'rsatilgan, shuning uchun endi bunday
  // xabarlar admin chatiga forward qilinadi.
  if (typeof message?.text === "string") {
    const chatId = message.chat.id;
    const adminChatId = process.env.ADMIN_TELEGRAM_CHAT_ID;
    if (adminChatId && String(chatId) !== adminChatId) {
      const senderName = message.from?.username
        ? `@${message.from.username}`
        : message.from?.first_name || `ID ${chatId}`;
      await sendTelegramMessage(
        adminChatId,
        `📩 <b>${escapeHtml(senderName)}</b> (chat ID: ${chatId}):\n${escapeHtml(message.text)}`,
      );
      await sendTelegramMessage(
        chatId,
        "Xabaringiz qabul qilindi, tez orada bog'lanamiz.",
      );
    }
    return res.sendStatus(200);
  }

  const callback = req.body?.callback_query;
  if (!callback) {
    return res.sendStatus(200);
  }

  const fromChatId = String(callback.from.id);
  const [action, targetId] = (callback.data as string).split(":");
  const chatId = callback.message.chat.id;
  const messageId = callback.message.message_id;

  if (action === "approve" || action === "reject") {
    if (fromChatId !== process.env.ADMIN_TELEGRAM_CHAT_ID) {
      await answerCallbackQuery(callback.id, "Sizda bu amal uchun ruxsat yo'q");
      return res.sendStatus(200);
    }

    if (!UUID_RE.test(targetId || "")) {
      await answerCallbackQuery(callback.id);
      return res.sendStatus(200);
    }
    if (action === "approve") {
      await approveListener(targetId, null);
      await editTelegramMessage(
        chatId,
        messageId,
        `${escapeHtml(callback.message.text || "")}\n\n✅ <b>Tasdiqlandi</b>`,
      );
      await answerCallbackQuery(callback.id, "Tasdiqlandi");
    } else {
      // Sabab so'raladi — keyingi xabar (handleRejectReason) rad etadi.
      await askRejectReason(chatId, targetId, messageId, callback.message.text || "");
      await answerCallbackQuery(callback.id, "Sababni yozing");
    }
    return res.sendStatus(200);
  }

  if (action === "report_ban" || action === "report_ok") {
    if (fromChatId !== process.env.ADMIN_TELEGRAM_CHAT_ID || !UUID_RE.test(targetId || "")) {
      await answerCallbackQuery(callback.id, "Sizda bu amal uchun ruxsat yo'q");
      return res.sendStatus(200);
    }
    const outcome = await resolveReport(targetId, null, action === "report_ban");
    const text = !outcome
      ? "Shikoyat topilmadi"
      : action === "report_ok"
        ? "✓ Shikoyat yopildi"
        : outcome.banned
          ? "🚫 Foydalanuvchi bloklandi"
          : "Shikoyat yopildi (foydalanuvchi allaqachon bloklangan yoki bloklab bo'lmaydi)";
    await editTelegramMessage(
      chatId,
      messageId,
      `${escapeHtml(callback.message.text || "")}\n\n<b>${text}</b>`,
    );
    await answerCallbackQuery(callback.id, text);
    return res.sendStatus(200);
  }

  if (action.startsWith("letter_")) {
    if (fromChatId !== process.env.ADMIN_TELEGRAM_CHAT_ID) {
      await answerCallbackQuery(callback.id, "Sizda bu amal uchun ruxsat yo'q");
      return res.sendStatus(200);
    }
    const text = await handleLetterAdminAction(action, targetId || "");
    await editTelegramMessage(
      chatId,
      messageId,
      `${escapeHtml(callback.message.text || "")}\n\n<b>${text}</b>`,
    );
    await answerCallbackQuery(callback.id, text);
    return res.sendStatus(200);
  }

  if (action === "wait_take") {
    const userResult = await pool.query("SELECT id FROM users WHERE telegram_id = $1", [
      fromChatId,
    ]);
    const listenerId = userResult.rows[0]?.id as string | undefined;
    if (!listenerId || !UUID_RE.test(targetId || "")) {
      await answerCallbackQuery(callback.id, "Bu so'rov sizga tegishli emas");
      return res.sendStatus(200);
    }
    const result = await takeWaitlist(targetId, listenerId);
    if (result.ok) {
      await editTelegramMessage(chatId, messageId, "✅ <b>Suhbat sizniki!</b>\n\nSuhbatdoshingizga xabar berildi.", [
        [{ text: "Suhbatga kirish", url: await sessionUrl(listenerId, result.sessionId) }],
      ]);
      await answerCallbackQuery(callback.id, "Suhbat sizniki");
    } else {
      const text =
        result.code === "taken"
          ? "✓ <b>Bu suhbatni boshqa dardkash oldi.</b> Rahmat!"
          : result.code === "busy"
            ? "Siz hozir boshqa suhbatdasiz"
            : "⌛ <b>Bu so'rov endi dolzarb emas</b>";
      if (result.code !== "busy") await editTelegramMessage(chatId, messageId, text);
      await answerCallbackQuery(callback.id, text.replace(/<[^>]+>/g, ""));
    }
    return res.sendStatus(200);
  }

  // Dardkash taklif xabarini Telegram'dan shikoyat qiladi: taklif rad
  // etiladi, shikoyat admin'ga boradi.
  if (action === "tg_move_yes" || action === "tg_move_no") {
    const text = await confirmTelegramMove(chatId, fromChatId, action === "tg_move_yes");
    await editTelegramMessage(chatId, messageId, text);
    await answerCallbackQuery(callback.id);
    return res.sendStatus(200);
  }

  if (action === "chat_reply") {
    const text = UUID_RE.test(targetId || "")
      ? await startTelegramReply(chatId, fromChatId, targetId)
      : "Topilmadi";
    await answerCallbackQuery(callback.id, text);
    return res.sendStatus(200);
  }

  if (action === "invite_report") {
    const sessionId = targetId;
    if (!UUID_RE.test(sessionId || "")) {
      await answerCallbackQuery(callback.id);
      return res.sendStatus(200);
    }
    const row = await pool.query(
      `SELECT s.speaker_id, s.listener_id, s.invite_message FROM sessions s
       JOIN users u ON u.id = s.listener_id
       WHERE s.id = $1 AND u.telegram_id = $2`,
      [sessionId, fromChatId],
    );
    if (row.rows.length === 0) {
      await answerCallbackQuery(callback.id, "Bu taklif sizga tegishli emas");
      return res.sendStatus(200);
    }
    const { speaker_id, listener_id, invite_message } = row.rows[0];
    const cancelled = await pool.query(
      "UPDATE sessions SET status = 'cancelled' WHERE id = $1 AND status = 'scheduled' RETURNING id",
      [sessionId],
    );
    await fileReport({
      reporterId: listener_id,
      reportedUserId: speaker_id,
      sessionId,
      reason: "abuse",
      details: invite_message,
      context: "Taklif xabari (Telegram'dan)",
    });
    if (cancelled.rows.length > 0) {
      notifyUser(speaker_id, { type: "invite_declined", sessionId });
    }
    await editTelegramMessage(chatId, messageId, "🚩 <b>Shikoyat yuborildi, taklif rad etildi</b>");
    await answerCallbackQuery(callback.id, "Shikoyat yuborildi");
    return res.sendStatus(200);
  }

  if (action === "invite_accept" || action === "invite_decline") {
    const sessionId = targetId;
    if (!UUID_RE.test(sessionId || "")) {
      await answerCallbackQuery(callback.id);
      return res.sendStatus(200);
    }
    const userCheck = await pool.query(
      `SELECT u.id AS user_id, s.status FROM users u
       JOIN sessions s ON s.listener_id = u.id
       WHERE u.telegram_id = $1 AND s.id = $2`,
      [fromChatId, sessionId],
    );
    if (userCheck.rows.length === 0) {
      await answerCallbackQuery(callback.id, "Bu taklif sizga tegishli emas");
      return res.sendStatus(200);
    }
    const listenerId = userCheck.rows[0].user_id;

    if (action === "invite_accept") {
      const result = await pool.query(
        `UPDATE sessions SET status = 'active', started_at = now()
         WHERE id = $1 AND listener_id = $2 AND status = 'scheduled'
         RETURNING speaker_id`,
        [sessionId, listenerId],
      );
      if (result.rows.length === 0) {
        await answerCallbackQuery(
          callback.id,
          "Bu taklif allaqachon javob berilgan",
        );
        await editTelegramMessage(
          chatId,
          messageId,
          inviteStatusText(userCheck.rows[0].status),
        );
        return res.sendStatus(200);
      }
      await editTelegramMessage(
        chatId,
        messageId,
        '✅ <b>Qabul qildingiz</b>\n\nSaytda "Suhbatni boshlash" tugmasini bosing: https://dardkash.uz/dashboard',
      );
      await answerCallbackQuery(callback.id, "Qabul qildingiz");
      notifyUser(result.rows[0].speaker_id, {
        type: "invite_accepted",
        sessionId,
      });
    } else {
      const result = await pool.query(
        `UPDATE sessions SET status = 'cancelled'
         WHERE id = $1 AND listener_id = $2 AND status = 'scheduled'
         RETURNING speaker_id`,
        [sessionId, listenerId],
      );
      if (result.rows.length === 0) {
        await answerCallbackQuery(
          callback.id,
          "Bu taklif allaqachon javob berilgan",
        );
        await editTelegramMessage(
          chatId,
          messageId,
          inviteStatusText(userCheck.rows[0].status),
        );
        return res.sendStatus(200);
      }
      await editTelegramMessage(chatId, messageId, "❌ <b>Rad etdingiz</b>");
      await answerCallbackQuery(callback.id, "Rad etdingiz");
      notifyUser(result.rows[0].speaker_id, {
        type: "invite_declined",
        sessionId,
      });
    }
    return res.sendStatus(200);
  }

  return res.sendStatus(200);
}

// requireAuth kabi middleware'lar `next(err)` bilan uzatgan xatolar uchun —
// busiz Express HTML sahifa qaytarardi.
app.use(
  (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("Kutilmagan xato:", err);
    if (res.headersSent) return;
    res.status(500).json({ status: "error", message: "Serverda xato yuz berdi" });
  },
);

// So'nggi himoya: biror joyda ushlanmagan promise xatosi qolsa, Node 20
// standart holatda jarayonni to'xtatadi va barcha WebSocket'lar uziladi.
process.on("unhandledRejection", (err) => {
  console.error("Ushlanmagan promise xatosi:", err);
});

const PORT = process.env.PORT || 4000;
const server = createServer(app);

// Ikkala WebSocket ham bitta dispetcher orqali. Avval har biri
// `new WebSocketServer({ server, path })` bilan o'zi ulanardi — lekin `ws`
// kutubxonasida bunday server o'z yo'liga mos kelmagan HAR QANDAY upgrade
// so'rovini 400 bilan uzib tashlaydi. Natijada /api/ws/notify har doim 400
// olardi (dashboard qo'ng'iroq modali hech qachon ishlamasdi), /api/ws/chat
// esa 101 olib, darhol notify serveri tomonidan uzilardi (video paytida
// yozishma "ulanish yo'q" xatosi).
const wsServers: Record<string, ReturnType<typeof createChatWebSocketServer>> = {
  "/api/ws/chat": createChatWebSocketServer(),
  "/api/ws/notify": createNotifyWebSocketServer(),
};
server.on("upgrade", (req, socket, head) => {
  const pathname = new URL(req.url || "", "http://localhost").pathname;
  const wss = wsServers[pathname];
  if (!wss) {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
});

// Server ishga tushishidan OLDIN migratsiyalarni qo'llaymiz — aks holda
// (masalan chat_messages jadvali yoki listener_profiles.last_seen_at
// ustuni hali qo'shilmagan eski baza bilan) so'rovlar jim 500 xato
// qaytaraverardi. Migratsiya muvaffaqiyatsiz bo'lsa, server yarim-ishlaydigan
// holatda qolmasin deb butunlay to'xtaydi.
runMigrations(pool)
  .then(() => {
    startSessionSweeper();
    server.listen(PORT, () => {
      console.log(
        `Dardkash API ${PORT}-portda ishga tushdi (WebSocket chat va bildirishnoma bilan)`,
      );
    });
  })
  .catch((err) => {
    console.error("Migratsiyalarni qo'llab bo'lmadi, server to'xtatildi:", err);
    process.exit(1);
  });
