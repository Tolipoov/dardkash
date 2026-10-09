import { pool } from "./db";
import { isUserConnected, notifyUser } from "./notify-ws";
import { editTelegramMessage, escapeHtml, sendTelegramMessage } from "./telegram/bot";

// Dardkash saytda bo'lsa ham, modalga shu vaqt ichida javob bermasa,
// Telegram xabari ham yuboriladi (tab ochiq qolib, odam boshqa joyda
// bo'lishi mumkin).
const ONLINE_FALLBACK_MS = 30 * 1000;

type CallKind = "incoming_call" | "new_invite";

// Qo'ng'iroq/taklif haqida dardkashni xabardor qiladi:
// - saytda bo'lsa (notify socket ulangan) — darhol modal, 30 soniyada
//   javob bo'lmasa Telegram ham;
// - saytda bo'lmasa — darhol Telegram.
// Avval bu mantiq uch joyda (invites, session/start, session/match)
// takrorlangan va Telegram har doim, onlayn bo'lsa ham yuborilardi.
export async function notifyIncomingCall(opts: {
  listenerId: string;
  sessionId: string;
  speakerName: string;
  kind: CallKind;
}) {
  const { listenerId, sessionId, speakerName, kind } = opts;
  notifyUser(listenerId, { type: kind, sessionId, speakerName });

  if (!isUserConnected(listenerId)) {
    await sendInviteTelegram(opts);
    return;
  }

  setTimeout(async () => {
    try {
      const pending = await pool.query(
        "SELECT 1 FROM sessions WHERE id = $1 AND status = 'scheduled' AND tg_message_id IS NULL",
        [sessionId],
      );
      if (pending.rows.length > 0) await sendInviteTelegram(opts);
    } catch (err) {
      console.error("Kechiktirilgan Telegram bildirishnomasida xato:", err);
    }
  }, ONLINE_FALLBACK_MS).unref();
}

async function sendInviteTelegram(opts: {
  listenerId: string;
  sessionId: string;
  speakerName: string;
  kind: CallKind;
}) {
  const { listenerId, sessionId, speakerName, kind } = opts;
  const result = await pool.query(
    "SELECT telegram_id FROM users WHERE id = $1",
    [listenerId],
  );
  const telegramId = result.rows[0]?.telegram_id;
  if (!telegramId) return;

  const icon = kind === "incoming_call" ? "📞" : "💬";
  const messageId = await sendTelegramMessage(
    telegramId,
    `${icon} <b>${escapeHtml(speakerName)}</b> siz bilan suhbatlashishni xohlaydi.\n\n` +
      `Javob berish uchun tugmani bosing yoki saytga kiring: ${process.env.APP_BASE_URL}/dashboard`,
    [
      [
        { text: "✅ Qabul qilish", callback_data: `invite_accept:${sessionId}` },
        { text: "❌ Rad etish", callback_data: `invite_decline:${sessionId}` },
      ],
    ],
  );
  if (messageId) {
    await pool.query(
      "UPDATE sessions SET tg_chat_id = $2, tg_message_id = $3 WHERE id = $1",
      [sessionId, telegramId, messageId],
    );
  }
}

// Taklif hal bo'lgach (saytda qabul/rad etilgan va h.k.) Telegram'dagi
// eski tugmali xabarni yangi holat matni bilan almashtiradi — aks holda
// keyin eski tugmani bosish chalkashlik tug'dirardi.
export async function resolveInviteTelegram(sessionId: string, text: string) {
  const result = await pool.query(
    "SELECT tg_chat_id, tg_message_id FROM sessions WHERE id = $1",
    [sessionId],
  );
  const row = result.rows[0];
  if (!row?.tg_chat_id || !row?.tg_message_id) return;
  await editTelegramMessage(row.tg_chat_id, Number(row.tg_message_id), text);
}

// Session holatiga mos, Telegram'dagi xabar uchun yakuniy matn.
export function inviteStatusText(status: string): string {
  if (status === "active") return "✅ <b>Qabul qilingan</b>";
  if (status === "cancelled") return "❌ <b>Rad etilgan</b>";
  if (status === "cancelled_by_caller") return "🚫 <b>Qo'ng'iroq bekor qilindi</b>";
  if (status === "ended") return "☑️ <b>Suhbat yakunlangan</b>";
  return "⌛ <b>Taklif endi dolzarb emas</b>";
}
