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
import { verifyTelegramAuth } from "./auth/telegram";
import { createChatWebSocketServer } from "./chat-ws";
import { findOrCreateGoogleUser, findOrCreateTelegramUser, pool } from "./db";
import { runMigrations } from "./migrate";
import { createNotifyWebSocketServer, notifyUser } from "./notify-ws";
import {
  inviteStatusText,
  notifyIncomingCall,
  resolveInviteTelegram,
} from "./call-notify";
import { rateLimit } from "./rate-limit";
import { startSessionSweeper } from "./session-sweeper";
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
    const sessionToken = signSession(userId);

    res.cookie("dardkash_session", sessionToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    const redirectTo = safeNext(req.cookies?.post_login_redirect);
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
    const redirectTo = safeNext(nextParam ?? req.cookies?.post_login_redirect);
    res.clearCookie("post_login_redirect");
    res.redirect(`${process.env.APP_BASE_URL}${redirectTo}`);
  } catch (err) {
    console.error("Telegram login xatosi:", err);
    res
      .status(500)
      .json({ status: "error", message: "Telegram login muvaffaqiyatsiz" });
  }
});

app.post("/api/auth/logout", (_req, res) => {
  res.clearCookie("dardkash_session");
  res.json({ status: "ok" });
});

app.get("/api/me", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.email, u.telegram_id, p.nickname, p.role, p.phone, p.wants, lp.status AS listener_status
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

const VALID_WANTS = ["speaker", "listener", "both"];
const VALID_GENDERS = ["male", "female", "skip"];
const VALID_LANGUAGES = ["uz", "ru"];

app.get("/api/profile", requireAuth, async (req, res) => {
  try {
    const profileResult = await pool.query(
      "SELECT nickname, age_range, gender, phone, wants FROM profiles WHERE user_id = $1",
      [req.userId],
    );
    if (profileResult.rows.length === 0) {
      return res.json({ status: "ok", profile: null });
    }

    const topicsResult = await pool.query(
      "SELECT topic_code FROM profile_topics WHERE user_id = $1",
      [req.userId],
    );
    const bioResult = await pool.query(
      "SELECT bio, status FROM listener_profiles WHERE user_id = $1",
      [req.userId],
    );

    res.json({
      status: "ok",
      profile: {
        ...profileResult.rows[0],
        topics: topicsResult.rows.map((r) => r.topic_code),
        bio: bioResult.rows[0]?.bio || "",
        listener_status: bioResult.rows[0]?.status || null,
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
  const { nickname, ageRange, gender, phone, wants, topics, bio, language } = req.body;

  if (
    typeof nickname !== "string" ||
    nickname.trim().length < 2 ||
    nickname.trim().length > 40
  ) {
    return res.status(400).json({
      status: "error",
      message: "Taxallus 2-40 belgidan iborat bo'lishi kerak",
    });
  }
  if (typeof ageRange !== "string" || !ageRange) {
    return res
      .status(400)
      .json({ status: "error", message: "Yosh oralig'ini tanlang" });
  }
  if (gender && !VALID_GENDERS.includes(gender)) {
    return res
      .status(400)
      .json({ status: "error", message: "Noto'g'ri jins qiymati" });
  }
  if (language && !VALID_LANGUAGES.includes(language)) {
    return res
      .status(400)
      .json({ status: "error", message: "Noto'g'ri til qiymati" });
  }
  if (!VALID_WANTS.includes(wants)) {
    return res
      .status(400)
      .json({ status: "error", message: "Noto'g'ri rol tanlandi" });
  }
  if (!Array.isArray(topics) || topics.length === 0) {
    return res
      .status(400)
      .json({ status: "error", message: "Kamida bitta mavzu tanlang" });
  }
  const wantsListener = wants === "listener" || wants === "both";
  if (
    wantsListener &&
    (typeof bio !== "string" || bio.trim().length === 0 || bio.length > 300)
  ) {
    return res.status(400).json({
      status: "error",
      message: "Bio 1-300 belgidan iborat bo'lishi kerak",
    });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const validTopics = await client.query(
      "SELECT code FROM topics WHERE code = ANY($1::text[])",
      [topics],
    );
    if (validTopics.rows.length !== new Set(topics).size) {
      await client.query("ROLLBACK");
      return res
        .status(400)
        .json({ status: "error", message: "Noto'g'ri mavzu kodi" });
    }

    await client.query(
      `INSERT INTO profiles (user_id, nickname, age_range, gender, phone, wants, language)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (user_id) DO UPDATE
       SET nickname = $2, age_range = $3, gender = $4, phone = $5, wants = $6,
           language = COALESCE($7, profiles.language), updated_at = now()`,
      [
        req.userId,
        nickname.trim(),
        ageRange,
        gender || null,
        phone || null,
        wants,
        language || null,
      ],
    );

    await client.query("DELETE FROM profile_topics WHERE user_id = $1", [
      req.userId,
    ]);
    for (const topicCode of topics as string[]) {
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
      const existingListener = await client.query(
        "SELECT status FROM listener_profiles WHERE user_id = $1",
        [req.userId],
      );
      const previousStatus = existingListener.rows[0]?.status as
        | string
        | undefined;
      shouldNotifyAdmin =
        previousStatus === undefined || previousStatus === "rejected";

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
    }

    await client.query("COMMIT");

    if (shouldNotifyAdmin && process.env.ADMIN_TELEGRAM_CHAT_ID) {
      const topicsText = topics.join(", ");
      await sendTelegramMessage(
        process.env.ADMIN_TELEGRAM_CHAT_ID,
        `🆕 <b>Yangi dardkash arizasi</b>\n\n👤 Ism: ${escapeHtml(nickname.trim())}\n📞 Tel: ${escapeHtml(String(phone || "—"))}\n📝 Bio: ${escapeHtml(bio)}\n🏷 Mavzular: ${escapeHtml(topicsText)}`,
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

app.post("/api/listeners/presence", requireAuth, async (req, res) => {
  const { online } = req.body;
  if (typeof online !== "boolean") {
    return res
      .status(400)
      .json({ status: "error", message: "online (true/false) kerak" });
  }
  try {
    await pool.query(
      online
        ? "UPDATE listener_profiles SET is_online = true, last_seen_at = now() WHERE user_id = $1"
        : "UPDATE listener_profiles SET is_online = false WHERE user_id = $1",
      [req.userId],
    );
    res.json({ status: "ok" });
  } catch (err) {
    console.error("Holatni yangilashda xato:", err);
    res
      .status(500)
      .json({ status: "error", message: "Holatni yangilab bo'lmadi" });
  }
});

app.get("/api/listeners", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
        u.id AS user_id,
        p.nickname,
        p.age_range,
        lp.rating_avg,
        lp.sessions_count,
        (lp.is_online AND lp.last_seen_at > now() - interval '90 seconds') AS is_online,
        COALESCE(array_agg(pt.topic_code) FILTER (WHERE pt.topic_code IS NOT NULL), '{}') AS topics
      FROM listener_profiles lp
      JOIN profiles p ON p.user_id = lp.user_id
      JOIN users u ON u.id = lp.user_id
      LEFT JOIN profile_topics pt ON pt.user_id = lp.user_id
      WHERE lp.status = 'approved' AND lp.user_id != $1
      GROUP BY u.id, p.nickname, p.age_range, lp.rating_avg, lp.sessions_count, lp.is_online, lp.last_seen_at`,
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
        p.phone,
        lp.bio,
        COALESCE(array_agg(pt.topic_code) FILTER (WHERE pt.topic_code IS NOT NULL), '{}') AS topics
      FROM listener_profiles lp
      JOIN profiles p ON p.user_id = lp.user_id
      JOIN users u ON u.id = lp.user_id
      LEFT JOIN profile_topics pt ON pt.user_id = lp.user_id
      WHERE lp.status = 'pending'
      GROUP BY u.id, p.nickname, p.phone, lp.bio, lp.created_at
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
      await pool.query(
        "UPDATE listener_profiles SET status = 'approved', reviewed_by = $1, reviewed_at = now() WHERE user_id = $2",
        [req.userId, req.params.userId],
      );

      const userResult = await pool.query(
        "SELECT telegram_id FROM users WHERE id = $1",
        [req.params.userId],
      );
      const telegramId = userResult.rows[0]?.telegram_id;
      if (telegramId) {
        await sendTelegramMessage(
          telegramId,
          "🎉 Tabriklaymiz! Dardkash sifatida profilingiz tasdiqlandi.\n\nEndi suhbatlarga qo'shila olasiz: https://dardkash.uz/dashboard",
        );
      }

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
      await pool.query(
        "UPDATE listener_profiles SET status = 'rejected', reject_reason = $1, reviewed_by = $2, reviewed_at = now() WHERE user_id = $3",
        [reason || null, req.userId, req.params.userId],
      );

      const userResult = await pool.query(
        "SELECT telegram_id FROM users WHERE id = $1",
        [req.params.userId],
      );
      const telegramId = userResult.rows[0]?.telegram_id;
      if (telegramId) {
        await sendTelegramMessage(
          telegramId,
          `Afsuski, dardkash sifatidagi arizangiz hozircha tasdiqlanmadi.${reason ? `\n\nSabab: ${escapeHtml(String(reason))}` : ""}\n\nQaytadan urinib ko'rishingiz mumkin: https://dardkash.uz/onboarding`,
        );
      }

      res.json({ status: "ok" });
    } catch (err) {
      console.error("Rad etishda xato:", err);
      res.status(500).json({ status: "error", message: "Rad etib bo'lmadi" });
    }
  },
);

// Suhbatning joriy holatini qaytaradi — frontend shunga qarab
// "kutilmoqda" yoki "faol" ekranini ko'rsatadi.
app.get("/api/session/:sessionId", requireAuth, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const result = await pool.query(
      `SELECT s.id, s.status, s.speaker_id, s.listener_id,
              sp.nickname AS speaker_nickname, lp.nickname AS listener_nickname
       FROM sessions s
       JOIN profiles sp ON sp.user_id = s.speaker_id
       JOIN profiles lp ON lp.user_id = s.listener_id
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

app.post("/api/invites", requireAuth, callLimiter, async (req, res) => {
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
        message: "O'zingizga taklif yubora olmaysiz",
      });
    }

    const listenerCheck = await pool.query(
      "SELECT user_id FROM listener_profiles WHERE user_id = $1 AND status = 'approved'",
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
      kind: "new_invite",
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
      `SELECT s.id, s.status, s.created_at, p.nickname AS speaker_nickname
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
      `SELECT s.id, s.status, s.created_at, p.nickname AS listener_nickname
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
app.get("/api/sessions/recent", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT s.id, s.started_at, s.ended_at,
              CASE WHEN s.speaker_id = $1 THEN 'speaker' ELSE 'listener' END AS my_role,
              p.nickname AS partner_nickname,
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
       ORDER BY COALESCE(s.ended_at, s.started_at) DESC
       LIMIT 10`,
      [req.userId],
    );
    res.json({ status: "ok", sessions: result.rows });
  } catch (err) {
    console.error("So'nggi suhbatlarni olishda xato:", err);
    res
      .status(500)
      .json({ status: "error", message: "Suhbatlarni olib bo'lmadi" });
  }
});

app.post("/api/session/start", requireAuth, callLimiter, async (req, res) => {
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
      "SELECT user_id FROM listener_profiles WHERE user_id = $1 AND status = 'approved'",
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

    res.json({ status: "ok", sessionId, waiting: true });
  } catch (err) {
    console.error("Qo'ng'iroq boshlashda xato:", err);
    res
      .status(500)
      .json({ status: "error", message: "Amalni bajarib bo'lmadi" });
  }
});

app.post("/api/session/match", requireAuth, callLimiter, async (req, res) => {
  try {
    const profileResult = await pool.query(
      "SELECT language FROM profiles WHERE user_id = $1",
      [req.userId],
    );
    const language = profileResult.rows[0]?.language || "uz";

    const topicsResult = await pool.query(
      "SELECT topic_code FROM profile_topics WHERE user_id = $1",
      [req.userId],
    );
    const topicCodes = topicsResult.rows.map((r) => r.topic_code as string);

    const candidates = await pool.query(
      `SELECT
         lp.user_id,
         (p.language = $2) AS language_match,
         COALESCE(overlap.cnt, 0) AS topic_overlap
       FROM listener_profiles lp
       JOIN profiles p ON p.user_id = lp.user_id
       LEFT JOIN (
         SELECT user_id, COUNT(*) AS cnt
         FROM profile_topics
         WHERE topic_code = ANY($3::text[])
         GROUP BY user_id
       ) overlap ON overlap.user_id = lp.user_id
       WHERE lp.status = 'approved'
         AND lp.is_online = true
         AND lp.last_seen_at > now() - interval '90 seconds'
         AND lp.user_id != $1
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
      [req.userId, language, topicCodes],
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

    res.json({ status: "ok", sessionId, waiting: true });
  } catch (err) {
    console.error("Moslashtirishda xato:", err);
    res.status(500).json({ status: "error", message: "Moslashtirib bo'lmadi" });
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

    const inserted = await pool.query(
      `INSERT INTO chat_messages (session_id, sender_id, content)
       VALUES ($1, $2, $3)
       RETURNING id, sender_id, content, created_at`,
      [sessionId, req.userId, content.trim()],
    );

    res.json({ status: "ok", message: inserted.rows[0] });
  } catch (err) {
    console.error("Xabar yozishda xato:", err);
    res
      .status(500)
      .json({ status: "error", message: "Xabar yuborib bo'lmadi" });
  }
});

app.post("/api/session/:sessionId/rating", requireAuth, reportLimiter, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { listened, mood, comment } = req.body;

    const check = await pool.query(
      "SELECT listener_id FROM sessions WHERE id = $1 AND (speaker_id = $2 OR listener_id = $2)",
      [sessionId, req.userId],
    );
    if (check.rows.length === 0) {
      return res
        .status(403)
        .json({ status: "error", message: "Bu suhbatga aloqangiz yo'q" });
    }

    // Bitta suhbatga bir kishi faqat bitta baho — qayta yuborilsa yangilanadi.
    await pool.query(
      `INSERT INTO session_ratings (session_id, rated_by, listened, mood, comment)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (session_id, rated_by) DO UPDATE SET
         listened = EXCLUDED.listened,
         mood = EXCLUDED.mood,
         comment = EXCLUDED.comment,
         created_at = now()`,
      [sessionId, req.userId, listened || null, mood || null, comment || null],
    );
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

    const validReasons = ["abuse", "inappropriate", "other"];
    if (!validReasons.includes(reason)) {
      return res
        .status(400)
        .json({ status: "error", message: "Noto'g'ri sabab" });
    }

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

    await pool.query(
      `INSERT INTO reports (session_id, reported_by, reported_user, reason, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [sessionId, req.userId, reportedUser, reason, details || null],
    );

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
  // (users.telegram_id UNIQUE). Boshqa hisobga (masalan ilgari Telegram
  // orqali alohida ochilgan) bog'langan bo'lsa — jimgina ko'chirmaymiz.
  const owner = await pool.query(
    "SELECT id FROM users WHERE telegram_id = $1",
    [String(telegramUserId)],
  );
  if (owner.rows.length > 0 && owner.rows[0].id !== userId) {
    await sendTelegramMessage(
      chatId,
      "Bu Telegram hisobi boshqa Dardkash hisobiga allaqachon bog'langan. Yordam kerak bo'lsa, shu yerga yozing.",
    );
    return;
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
  if (message?.text === "/start") {
    const chatId = message.chat.id;
    const existing = await pool.query(
      "SELECT id FROM users WHERE telegram_id = $1",
      [String(chatId)],
    );
    if (existing.rows.length > 0) {
      await sendTelegramMessage(
        chatId,
        "Assalomu alaykum! 👋\n\nHisobingiz allaqachon bog'langan — endi profilingiz bilan bog'liq muhim xabarlarni shu yerdan olasiz.",
      );
    } else {
      await sendTelegramMessage(
        chatId,
        "Assalomu alaykum! 👋\n\nDardkash botiga xush kelibsiz.\n\nBildirishnomalarni olish uchun avval saytda Telegram orqali kiring: https://dardkash.uz/auth",
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

    if (action === "approve") {
      await pool.query(
        "UPDATE listener_profiles SET status = 'approved', reviewed_at = now() WHERE user_id = $1",
        [targetId],
      );
      await editTelegramMessage(chatId, messageId, "✅ <b>Tasdiqlandi</b>");
      await answerCallbackQuery(callback.id, "Tasdiqlandi");
      const userResult = await pool.query(
        "SELECT telegram_id FROM users WHERE id = $1",
        [targetId],
      );
      const applicantTelegramId = userResult.rows[0]?.telegram_id;
      if (applicantTelegramId) {
        await sendTelegramMessage(
          applicantTelegramId,
          "🎉 Tabriklaymiz! Dardkash sifatida profilingiz tasdiqlandi.\n\nEndi suhbatlarga qo'shila olasiz: https://dardkash.uz/dashboard",
        );
      }
    } else {
      await pool.query(
        "UPDATE listener_profiles SET status = 'rejected', reviewed_at = now() WHERE user_id = $1",
        [targetId],
      );
      await editTelegramMessage(chatId, messageId, "❌ <b>Rad etildi</b>");
      await answerCallbackQuery(callback.id, "Rad etildi");
      const userResult = await pool.query(
        "SELECT telegram_id FROM users WHERE id = $1",
        [targetId],
      );
      const applicantTelegramId = userResult.rows[0]?.telegram_id;
      if (applicantTelegramId) {
        await sendTelegramMessage(
          applicantTelegramId,
          "Afsuski, dardkash sifatidagi arizangiz hozircha tasdiqlanmadi.\n\nQaytadan urinib ko'rishingiz mumkin: https://dardkash.uz/onboarding",
        );
      }
    }
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
