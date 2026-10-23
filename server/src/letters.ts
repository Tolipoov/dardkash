import express from "express";
import { requireAuth } from "./auth/middleware";
import { pool } from "./db";
import { fileReport, REPORT_REASON_LABELS } from "./moderation";
import { isUserConnected, notifyUser } from "./notify-ws";
import { pushIfOffline } from "./push";
import { rateLimit } from "./rate-limit";
import { escapeHtml, sendTelegramMessage } from "./telegram/bot";
import {
  COMPATIBLE_LISTENERS_SQL,
  PING_COOLDOWN_MINUTES,
  siteUrl,
  TOPIC_LABELS,
} from "./waitlist";

// "Xat" rejimi: yozma, kechikkan suhbat (013_letters.sql).
//
// pending — akkauntning birinchi xati, admin tasdiqlashini kutmoqda;
// open    — dardkashlarga ko'rinadi, hali hech kim olmagan;
// taken   — bitta dardkash oldi, ikkalasi navbatma-navbat yozishadi;
// hidden  — dardkash "spam" dedi, admin qarorini kutmoqda;
// closed  — muallif yakunladi; expired — hech kim olmadi (sweeper);
// removed — admin rad etdi yoki spam deb tasdiqladi.

const MAX_LETTER_LENGTH = 2000;
// Bir odamda bir vaqtda ochiq/olingan xatlar soni.
const MAX_ACTIVE_LETTERS = 3;
export const OPEN_LETTER_TTL_DAYS = 7;
// Dardkash olib, shuncha vaqt javob yozmasa — xat boshqalarga qaytadi.
export const TAKEN_REPLY_TTL_HOURS = 48;
// Spam tasdiqlansa, muallif shuncha kun xat yoza olmaydi.
const LETTER_BLOCK_DAYS = 14;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const letterLimiter = rateLimit({ name: "letters", windowMs: 60 * 1000, max: 20 });

function parseBody(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const body = value.trim();
  const length = [...body].length;
  return length >= 1 && length <= MAX_LETTER_LENGTH ? body : null;
}

// Saytda bo'lsa — socket, bo'lmasa — Telegram (sahifaga havola bilan).
async function notifyParty(userId: string, payload: object, telegramText: string, path: string) {
  if (isUserConnected(userId)) {
    notifyUser(userId, payload);
    return;
  }
  const nickname = (payload as { nickname?: string }).nickname ?? "";
  pushIfOffline(userId, {
    uz: { title: "✉️ Xatingizga javob keldi", body: nickname },
    ru: { title: "✉️ Ответ на ваше письмо", body: nickname },
    path,
    tag: path,
  });
  const user = await pool.query("SELECT telegram_id FROM users WHERE id = $1", [userId]);
  const telegramId = user.rows[0]?.telegram_id;
  if (!telegramId) return;
  await sendTelegramMessage(telegramId, telegramText, [
    [{ text: "Xatni ochish", url: await siteUrl(userId, path) }],
  ]);
}

async function pingListenersAboutLetter(authorId: string) {
  const topicsResult = await pool.query(
    "SELECT topic_code FROM profile_topics WHERE user_id = $1",
    [authorId],
  );
  const topics = topicsResult.rows
    .map((r) => TOPIC_LABELS[r.topic_code as string] || r.topic_code)
    .join(", ");
  const listeners = await pool.query(COMPATIBLE_LISTENERS_SQL, [authorId]);
  const text =
    `✉️ <b>Yangi xat keldi</b>\n\n` +
    (topics ? `Mavzular: ${escapeHtml(topics)}\n\n` : "") +
    `Kimdir dardini xat qilib yozdi — bo'sh vaqtingizda javob bera olasiz.`;

  for (const listener of listeners.rows) {
    const listenerId = listener.user_id as string;
    if (isUserConnected(listenerId)) {
      notifyUser(listenerId, { type: "letter_new" });
      continue;
    }
    // "Kimdir kutmoqda" bilan umumiy cheklov — dardkashni ko'p bezovta qilmaslik.
    const lastPing = listener.last_wait_ping_at as Date | null;
    if (lastPing && Date.now() - lastPing.getTime() < PING_COOLDOWN_MINUTES * 60 * 1000) continue;
    pushIfOffline(listenerId, {
      uz: { title: "✉️ Yangi xat keldi", body: "Kimdir dardini xat qilib yozdi — javob kutmoqda." },
      ru: { title: "✉️ Новое письмо", body: "Кто-то написал письмо — ждёт ответа." },
      path: "/letters",
      tag: "letters",
    });
    if (!listener.telegram_id) {
      await pool.query("UPDATE listener_profiles SET last_wait_ping_at = now() WHERE user_id = $1", [
        listenerId,
      ]);
      continue;
    }
    await sendTelegramMessage(listener.telegram_id, text, [
      [{ text: "Xatlarni ko'rish", url: await siteUrl(listenerId, "/letters") }],
    ]);
    await pool.query("UPDATE listener_profiles SET last_wait_ping_at = now() WHERE user_id = $1", [
      listenerId,
    ]);
  }
}

async function firstMessage(letterId: string): Promise<string> {
  const result = await pool.query(
    "SELECT body FROM letter_messages WHERE letter_id = $1 ORDER BY created_at ASC LIMIT 1",
    [letterId],
  );
  return (result.rows[0]?.body as string) ?? "";
}

// Admin'ga Telegram'da xat matni va qaror tugmalari.
async function sendToAdmin(letterId: string, authorId: string, kind: "first" | "flag") {
  const adminChat = process.env.ADMIN_TELEGRAM_CHAT_ID;
  if (!adminChat) return;
  const author = await pool.query("SELECT nickname FROM profiles WHERE user_id = $1", [authorId]);
  const nickname = escapeHtml(author.rows[0]?.nickname || "—");
  const body = escapeHtml((await firstMessage(letterId)).slice(0, 1500));
  const header =
    kind === "first"
      ? `✉️ <b>Yangi foydalanuvchining birinchi xati</b> — tasdiqlansa, dardkashlarga ko'rinadi.`
      : `🚩 <b>Dardkash xatni spam deb belgiladi</b> — xat hozir yashirin.`;
  await sendTelegramMessage(
    adminChat,
    `${header}\n\n👤 ${nickname}\n\n«${body}»`,
    kind === "first"
      ? [
          [
            { text: "✅ Tasdiqlash", callback_data: `letter_ok:${letterId}` },
            { text: "❌ Rad etish", callback_data: `letter_no:${letterId}` },
          ],
        ]
      : [
          [
            { text: `🚫 Spam — ${LETTER_BLOCK_DAYS} kun cheklash`, callback_data: `letter_spam:${letterId}` },
            { text: "↩️ Xatni qaytarish", callback_data: `letter_restore:${letterId}` },
          ],
        ],
  );
}

// Telegram webhook'dan (faqat admin chatidan) chaqiriladi. Qaytadi: admin
// xabaridagi tugmalar o'rniga yoziladigan natija matni.
export async function handleLetterAdminAction(action: string, letterId: string): Promise<string> {
  if (!UUID_RE.test(letterId)) return "Xat topilmadi";
  const notifyAuthor = async (authorId: string, text: string, type: string) => {
    notifyUser(authorId, { type, letterId });
    const user = await pool.query("SELECT telegram_id FROM users WHERE id = $1", [authorId]);
    if (user.rows[0]?.telegram_id) await sendTelegramMessage(user.rows[0].telegram_id, text);
  };

  if (action === "letter_ok") {
    const result = await pool.query(
      `UPDATE letters SET status = 'open', last_message_at = now()
       WHERE id = $1 AND status = 'pending' RETURNING author_id`,
      [letterId],
    );
    if (result.rows.length === 0) return "Xat allaqachon ko'rib chiqilgan";
    pingListenersAboutLetter(result.rows[0].author_id).catch((err) =>
      console.error("Dardkashlarga xat haqida xabar berishda xato:", err),
    );
    return "✅ Tasdiqlandi — dardkashlarga ko'rinadi";
  }
  if (action === "letter_no") {
    const result = await pool.query(
      `UPDATE letters SET status = 'removed', closed_at = now()
       WHERE id = $1 AND status = 'pending' RETURNING author_id`,
      [letterId],
    );
    if (result.rows.length === 0) return "Xat allaqachon ko'rib chiqilgan";
    await notifyAuthor(
      result.rows[0].author_id,
      "Afsuski, xatingiz qoidalarga mos kelmagani uchun dardkashlarga yuborilmadi.",
      "letter_removed",
    );
    return "❌ Rad etildi";
  }
  if (action === "letter_spam") {
    const result = await pool.query(
      `UPDATE letters SET status = 'removed', closed_at = now()
       WHERE id = $1 AND status = 'hidden' RETURNING author_id`,
      [letterId],
    );
    if (result.rows.length === 0) return "Xat allaqachon ko'rib chiqilgan";
    const authorId = result.rows[0].author_id;
    await pool.query(
      `UPDATE users SET letters_blocked_until = now() + make_interval(days => $2) WHERE id = $1`,
      [authorId, LETTER_BLOCK_DAYS],
    );
    // Muallifning boshqa ochiq/kutilayotgan xatlari ham yopiladi.
    await pool.query(
      `UPDATE letters SET status = 'removed', closed_at = now()
       WHERE author_id = $1 AND status IN ('pending', 'open')`,
      [authorId],
    );
    await notifyAuthor(
      authorId,
      `Xatingiz qoidalarga zid deb topildi. ${LETTER_BLOCK_DAYS} kun davomida yangi xat yoza olmaysiz.`,
      "letter_removed",
    );
    return `🚫 Spam — muallif ${LETTER_BLOCK_DAYS} kun xat yoza olmaydi`;
  }
  if (action === "letter_restore") {
    const result = await pool.query(
      `UPDATE letters SET status = 'open', listener_id = NULL, taken_at = NULL,
              listener_seen_at = NULL, flagged_by = NULL, flagged_at = NULL
       WHERE id = $1 AND status = 'hidden' RETURNING author_id`,
      [letterId],
    );
    if (result.rows.length === 0) return "Xat allaqachon ko'rib chiqilgan";
    return "↩️ Xat qaytarildi — yana dardkashlarga ko'rinadi";
  }
  return "Noma'lum amal";
}

// Foydalanuvchining shu xatdagi roli (yoki null — aloqasi yo'q).
async function roleIn(letterId: string, userId: string) {
  const result = await pool.query(
    "SELECT author_id, listener_id, status FROM letters WHERE id = $1",
    [letterId],
  );
  const letter = result.rows[0];
  if (!letter) return null;
  if (letter.author_id === userId) return { role: "author" as const, letter };
  if (letter.listener_id === userId) return { role: "listener" as const, letter };
  return null;
}

export function createLettersRouter() {
  const router = express.Router();
  router.use(requireAuth);

  router.param("letterId", (_req, res, next, id) => {
    if (!UUID_RE.test(String(id))) {
      return res.status(404).json({ status: "error", message: "Xat topilmadi" });
    }
    next();
  });

  router.get("/", async (req, res) => {
    try {
      const summary = `
        l.id, l.status, l.created_at, l.last_message_at,
        (SELECT LEFT(m.body, 160) FROM letter_messages m
         WHERE m.letter_id = l.id ORDER BY m.created_at ASC LIMIT 1) AS preview,
        (SELECT m.sender_id FROM letter_messages m
         WHERE m.letter_id = l.id ORDER BY m.created_at DESC LIMIT 1) AS last_sender_id`;
      const mine = await pool.query(
        `SELECT ${summary}, lp.nickname AS partner_nickname,
                (l.last_message_at > l.author_seen_at) AS has_new
         FROM letters l LEFT JOIN profiles lp ON lp.user_id = l.listener_id
         WHERE l.author_id = $1
         ORDER BY l.last_message_at DESC LIMIT 30`,
        [req.userId],
      );
      const assigned = await pool.query(
        `SELECT ${summary}, ap.nickname AS partner_nickname,
                (l.listener_seen_at IS NULL OR l.last_message_at > l.listener_seen_at) AS has_new
         FROM letters l JOIN profiles ap ON ap.user_id = l.author_id
         WHERE l.listener_id = $1
         ORDER BY l.last_message_at DESC LIMIT 30`,
        [req.userId],
      );
      // Ochiq xatlar — faqat tasdiqlangan dardkashga va unga mos (til,
      // dardini aytuvchining jins afzalligi) bo'lganlari.
      const open = await pool.query(
        `SELECT l.id, l.created_at, ap.nickname AS author_nickname,
                (SELECT m.body FROM letter_messages m
                 WHERE m.letter_id = l.id ORDER BY m.created_at ASC LIMIT 1) AS body,
                COALESCE((SELECT array_agg(pt.topic_code) FROM profile_topics pt
                          WHERE pt.user_id = l.author_id), '{}') AS topics
         FROM letters l
         JOIN profiles ap ON ap.user_id = l.author_id
         JOIN users au ON au.id = l.author_id
         JOIN listener_profiles me ON me.user_id = $1 AND me.status = 'approved'
         JOIN profiles mp ON mp.user_id = $1
         JOIN users mu ON mu.id = $1 AND mu.banned_at IS NULL
         WHERE l.status = 'open'
           AND l.author_id <> $1
           AND au.banned_at IS NULL
           AND ap.languages && mp.languages
           AND (ap.preferred_listener_gender = 'any' OR ap.preferred_listener_gender = mp.gender)
         ORDER BY l.created_at ASC LIMIT 30`,
        [req.userId],
      );
      res.json({
        status: "ok",
        mine: mine.rows,
        assigned: assigned.rows,
        open: open.rows,
      });
    } catch (err) {
      console.error("Xatlarni olishda xato:", err);
      res.status(500).json({ status: "error", message: "Xatlarni olib bo'lmadi" });
    }
  });

  router.post("/", letterLimiter, async (req, res) => {
    const body = parseBody(req.body?.body);
    if (!body) {
      return res
        .status(400)
        .json({ status: "error", code: "body_length", message: "Xat 1-2000 belgi bo'lsin" });
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const profile = await client.query("SELECT 1 FROM profiles WHERE user_id = $1", [req.userId]);
      if (profile.rows.length === 0) {
        await client.query("ROLLBACK");
        return res
          .status(400)
          .json({ status: "error", code: "no_profile", message: "Avval profilni to'ldiring" });
      }
      const blocked = await client.query(
        "SELECT letters_blocked_until FROM users WHERE id = $1 AND letters_blocked_until > now()",
        [req.userId],
      );
      if (blocked.rows.length > 0) {
        await client.query("ROLLBACK");
        return res.status(403).json({
          status: "error",
          code: "letters_blocked",
          until: blocked.rows[0].letters_blocked_until,
        });
      }
      const active = await client.query(
        "SELECT COUNT(*)::int AS n FROM letters WHERE author_id = $1 AND status IN ('pending', 'open', 'taken', 'hidden')",
        [req.userId],
      );
      if (active.rows[0].n >= MAX_ACTIVE_LETTERS) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          status: "error",
          code: "too_many",
          message: `Bir vaqtda ko'pi bilan ${MAX_ACTIVE_LETTERS} ta ochiq xat`,
        });
      }
      // Avval hech bir xati dardkashlarga chiqmagan akkaunt — birinchi xat
      // admin tasdiqlashidan o'tadi (admin chati sozlanmagan bo'lsa, yo'q).
      const trusted = await client.query(
        `SELECT 1 FROM letters WHERE author_id = $1
         AND status IN ('open', 'taken', 'closed', 'expired') LIMIT 1`,
        [req.userId],
      );
      const needsReview = trusted.rows.length === 0 && Boolean(process.env.ADMIN_TELEGRAM_CHAT_ID);
      const letter = await client.query(
        "INSERT INTO letters (author_id, status) VALUES ($1, $2) RETURNING id",
        [req.userId, needsReview ? "pending" : "open"],
      );
      const letterId = letter.rows[0].id as string;
      await client.query(
        "INSERT INTO letter_messages (letter_id, sender_id, body) VALUES ($1, $2, $3)",
        [letterId, req.userId, body],
      );
      await client.query("COMMIT");
      if (needsReview) {
        sendToAdmin(letterId, req.userId!, "first").catch((err) =>
          console.error("Xatni admin'ga yuborishda xato:", err),
        );
      } else {
        pingListenersAboutLetter(req.userId!).catch((err) =>
          console.error("Dardkashlarga xat haqida xabar berishda xato:", err),
        );
      }
      res.json({ status: "ok", letterId, pending: needsReview });
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("Xat yaratishda xato:", err);
      res.status(500).json({ status: "error", message: "Xatni saqlab bo'lmadi" });
    } finally {
      client.release();
    }
  });

  router.get("/:letterId", async (req, res) => {
    try {
      const access = await roleIn(req.params.letterId, req.userId!);
      if (!access) return res.status(404).json({ status: "error", message: "Xat topilmadi" });
      const seenColumn = access.role === "author" ? "author_seen_at" : "listener_seen_at";
      await pool.query(`UPDATE letters SET ${seenColumn} = now() WHERE id = $1`, [
        req.params.letterId,
      ]);
      const letter = await pool.query(
        `SELECT l.id, l.status, l.created_at, l.author_id, l.listener_id,
                ap.nickname AS author_nickname, lp.nickname AS listener_nickname
         FROM letters l
         JOIN profiles ap ON ap.user_id = l.author_id
         LEFT JOIN profiles lp ON lp.user_id = l.listener_id
         WHERE l.id = $1`,
        [req.params.letterId],
      );
      const messages = await pool.query(
        `SELECT id, sender_id, body, created_at FROM letter_messages
         WHERE letter_id = $1 ORDER BY created_at ASC`,
        [req.params.letterId],
      );
      res.json({
        status: "ok",
        role: access.role,
        letter: letter.rows[0],
        messages: messages.rows,
      });
    } catch (err) {
      console.error("Xatni olishda xato:", err);
      res.status(500).json({ status: "error", message: "Xatni olib bo'lmadi" });
    }
  });

  // Dardkash ochiq xatni oladi — bir nechta dardkash bossa, faqat bittasi.
  router.post("/:letterId/take", async (req, res) => {
    try {
      const result = await pool.query(
        `UPDATE letters l SET status = 'taken', listener_id = $2, taken_at = now(),
                listener_seen_at = now()
         FROM listener_profiles me, users mu, profiles mp, profiles ap, users au
         WHERE l.id = $1 AND l.status = 'open' AND l.author_id <> $2
           AND me.user_id = $2 AND me.status = 'approved'
           AND mu.id = $2 AND mu.banned_at IS NULL
           AND mp.user_id = $2
           AND ap.user_id = l.author_id AND au.id = l.author_id AND au.banned_at IS NULL
           AND ap.languages && mp.languages
           AND (ap.preferred_listener_gender = 'any' OR ap.preferred_listener_gender = mp.gender)
         RETURNING l.id`,
        [req.params.letterId, req.userId],
      );
      if (result.rows.length === 0) {
        const current = await pool.query("SELECT status FROM letters WHERE id = $1", [
          req.params.letterId,
        ]);
        const status = current.rows[0]?.status;
        return res.status(status === "taken" ? 409 : 404).json({
          status: "error",
          code: status === "taken" ? "taken" : "not_found",
        });
      }
      res.json({ status: "ok" });
    } catch (err) {
      console.error("Xatni olishda xato:", err);
      res.status(500).json({ status: "error", message: "Xatni olib bo'lmadi" });
    }
  });

  router.post("/:letterId/messages", letterLimiter, async (req, res) => {
    const body = parseBody(req.body?.body);
    if (!body) {
      return res
        .status(400)
        .json({ status: "error", code: "body_length", message: "Xat 1-2000 belgi bo'lsin" });
    }
    try {
      const access = await roleIn(req.params.letterId, req.userId!);
      if (!access) return res.status(404).json({ status: "error", message: "Xat topilmadi" });
      const { role, letter } = access;
      // Muallif xat ochiq turganida ham qo'shimcha yoza oladi; dardkash —
      // faqat olgan xatiga.
      const allowed =
        role === "author"
          ? ["pending", "open", "taken"].includes(letter.status)
          : letter.status === "taken";
      if (!allowed) {
        return res.status(409).json({ status: "error", code: "closed", message: "Xat yopilgan" });
      }
      await pool.query(
        "INSERT INTO letter_messages (letter_id, sender_id, body) VALUES ($1, $2, $3)",
        [req.params.letterId, req.userId, body],
      );
      const seenColumn = role === "author" ? "author_seen_at" : "listener_seen_at";
      await pool.query(
        `UPDATE letters SET last_message_at = now(), ${seenColumn} = now() WHERE id = $1`,
        [req.params.letterId],
      );

      const recipient = role === "author" ? letter.listener_id : letter.author_id;
      if (recipient) {
        const sender = await pool.query("SELECT nickname FROM profiles WHERE user_id = $1", [
          req.userId,
        ]);
        const nickname = sender.rows[0]?.nickname || "";
        notifyParty(
          recipient,
          { type: "letter_reply", letterId: req.params.letterId, nickname },
          `✉️ <b>${escapeHtml(nickname)}</b> xatingizga javob yozdi.`,
          `/letters/${req.params.letterId}`,
        ).catch((err) => console.error("Xat javobi haqida xabar berishda xato:", err));
      }
      res.json({ status: "ok" });
    } catch (err) {
      console.error("Xat yozishda xato:", err);
      res.status(500).json({ status: "error", message: "Xatni yuborib bo'lmadi" });
    }
  });

  // Muallif suhbatni yakunlaydi.
  router.post("/:letterId/close", async (req, res) => {
    try {
      const result = await pool.query(
        `UPDATE letters SET status = 'closed', closed_at = now()
         WHERE id = $1 AND author_id = $2 AND status IN ('pending', 'open', 'taken')
         RETURNING listener_id`,
        [req.params.letterId, req.userId],
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ status: "error", message: "Xat topilmadi" });
      }
      const listenerId = result.rows[0].listener_id;
      if (listenerId) notifyUser(listenerId, { type: "letter_closed", letterId: req.params.letterId });
      res.json({ status: "ok" });
    } catch (err) {
      console.error("Xatni yopishda xato:", err);
      res.status(500).json({ status: "error", message: "Xatni yopib bo'lmadi" });
    }
  });

  // Dardkash davom ettira olmasa — xat boshqa dardkashlarga qaytadi.
  router.post("/:letterId/release", async (req, res) => {
    try {
      const result = await pool.query(
        `UPDATE letters SET status = 'open', listener_id = NULL, taken_at = NULL,
                listener_seen_at = NULL
         WHERE id = $1 AND listener_id = $2 AND status = 'taken'
         RETURNING author_id`,
        [req.params.letterId, req.userId],
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ status: "error", message: "Xat topilmadi" });
      }
      res.json({ status: "ok" });
    } catch (err) {
      console.error("Xatni qaytarishda xato:", err);
      res.status(500).json({ status: "error", message: "Xatni qaytarib bo'lmadi" });
    }
  });

  // Dardkash xatni "spam" deb belgilaydi: ochiq xat (ro'yxatdan, olmasdan)
  // yoki o'zi olgan xat. Xat darhol yashiriladi, qarorni admin qiladi.
  router.post("/:letterId/flag", letterLimiter, async (req, res) => {
    try {
      const result = await pool.query(
        `UPDATE letters l SET status = 'hidden', flagged_by = $2, flagged_at = now()
         FROM listener_profiles me
         WHERE l.id = $1 AND me.user_id = $2 AND me.status = 'approved'
           AND l.author_id <> $2
           AND (l.status = 'open' OR (l.status = 'taken' AND l.listener_id = $2))
         RETURNING l.author_id`,
        [req.params.letterId, req.userId],
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ status: "error", message: "Xat topilmadi" });
      }
      sendToAdmin(req.params.letterId, result.rows[0].author_id, "flag").catch((err) =>
        console.error("Spam xatni admin'ga yuborishda xato:", err),
      );
      res.json({ status: "ok" });
    } catch (err) {
      console.error("Xatni belgilashda xato:", err);
      res.status(500).json({ status: "error", message: "Belgilab bo'lmadi" });
    }
  });

  router.post("/:letterId/report", letterLimiter, async (req, res) => {
    const { reason, details } = req.body ?? {};
    if (typeof reason !== "string" || !Object.hasOwn(REPORT_REASON_LABELS, reason)) {
      return res.status(400).json({ status: "error", message: "Noto'g'ri sabab" });
    }
    if (details !== undefined && details !== null && typeof details !== "string") {
      return res.status(400).json({ status: "error", message: "Izoh matn bo'lishi kerak" });
    }
    try {
      const access = await roleIn(req.params.letterId, req.userId!);
      if (!access) return res.status(404).json({ status: "error", message: "Xat topilmadi" });
      const reported =
        access.role === "author" ? access.letter.listener_id : access.letter.author_id;
      if (!reported) {
        return res.status(400).json({ status: "error", message: "Shikoyat qiladigan odam yo'q" });
      }
      await fileReport({
        reporterId: req.userId!,
        reportedUserId: reported,
        sessionId: null,
        reason,
        details: details?.trim().slice(0, 1000) || null,
        context: `Xat: ${process.env.APP_BASE_URL}/letters/${req.params.letterId}`,
      });
      res.json({ status: "ok" });
    } catch (err) {
      console.error("Xat bo'yicha shikoyatda xato:", err);
      res.status(500).json({ status: "error", message: "Shikoyatni saqlab bo'lmadi" });
    }
  });

  return router;
}

// Sweeper chaqiradi.
export async function sweepLetters() {
  const expired = await pool.query(
    `UPDATE letters SET status = 'expired', closed_at = now()
     WHERE status = 'open' AND created_at < now() - make_interval(days => $1)
     RETURNING id, author_id`,
    [OPEN_LETTER_TTL_DAYS],
  );
  for (const { id, author_id } of expired.rows) {
    notifyUser(author_id, { type: "letter_expired", letterId: id });
  }
  // Olingan, lekin dardkash hech narsa yozmagan xatlar — boshqalarga qaytadi.
  const released = await pool.query(
    `UPDATE letters l SET status = 'open', listener_id = NULL, taken_at = NULL,
            listener_seen_at = NULL
     WHERE l.status = 'taken'
       AND l.taken_at < now() - make_interval(hours => $1)
       AND NOT EXISTS (
         SELECT 1 FROM letter_messages m
         WHERE m.letter_id = l.id AND m.sender_id = l.listener_id
       )
     RETURNING l.id`,
    [TAKEN_REPLY_TTL_HOURS],
  );
  if (expired.rows.length + released.rows.length > 0) {
    console.log(
      `Xatlar: ${expired.rows.length} tasi muddati tugadi, ${released.rows.length} tasi qaytarildi`,
    );
  }
}
