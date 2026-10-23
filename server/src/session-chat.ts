import { broadcastChatMessage, isUserInChatRoom } from "./chat-ws";
import { pool } from "./db";
import { isUserConnected, notifyUser } from "./notify-ws";
import { pushIfOffline } from "./push";
import { escapeHtml, sendTelegramMessage } from "./telegram/bot";
import { siteUrl } from "./waitlist";

// Suhbat (taklif) yozishmasi: xabarni saqlaydi, yozishma oynasi ochiq
// turganlarga darhol yetkazadi, ikkinchi tomon oynada bo'lmasa — saytda
// bildirishnoma yoki Telegram (u yerdan "Reply" bilan javob qaytarsa ham
// bo'ladi — handleTelegramChatReply).

// Bir suhbat bo'yicha bir odamga Telegram'da shundan tez-tez xabar ketmaydi
// (ketma-ket yozilgan bir nechta qator — bitta bildirishnoma).
const TELEGRAM_COOLDOWN_MS = 60 * 1000;
const lastTelegram = new Map<string, number>();

export async function saveChatMessage(
  sessionId: string,
  senderId: string,
  content: string,
  options: { notify?: boolean } = {},
) {
  const inserted = await pool.query(
    `INSERT INTO chat_messages (session_id, sender_id, content)
     VALUES ($1, $2, $3)
     RETURNING id, sender_id, content, created_at`,
    [sessionId, senderId, content],
  );
  const message = inserted.rows[0];
  // Yozgan odam yozishmani ko'rgan — uning o'qilmaganlari nolga tushadi
  // (Telegram'dan javob qaytarganda ham).
  await pool.query(
    `INSERT INTO chat_reads (session_id, user_id) VALUES ($1, $2)
     ON CONFLICT (session_id, user_id) DO UPDATE SET last_read_at = now()`,
    [sessionId, senderId],
  );
  broadcastChatMessage(sessionId, message);
  if (options.notify !== false) {
    notifyRecipient(sessionId, senderId, content).catch((err) =>
      console.error("Yozishma bildirishnomasida xato:", err),
    );
  }
  return message;
}

// Telegram xabarini suhbatga bog'laydi — keyin unga "Reply" qilinsa,
// javob shu suhbatga tushadi.
export async function rememberTelegramMessage(
  chatId: string | number,
  messageId: number,
  sessionId: string,
  userId: string,
) {
  await pool.query(
    `INSERT INTO chat_telegram_messages (tg_chat_id, tg_message_id, session_id, user_id)
     VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
    [chatId, messageId, sessionId, userId],
  );
}

async function notifyRecipient(sessionId: string, senderId: string, content: string) {
  const result = await pool.query(
    `SELECT s.speaker_id, s.listener_id, s.status, p.nickname
     FROM sessions s JOIN profiles p ON p.user_id = $2
     WHERE s.id = $1`,
    [sessionId, senderId],
  );
  const row = result.rows[0];
  if (!row || !["scheduled", "active"].includes(row.status)) return;
  const recipient = row.speaker_id === senderId ? row.listener_id : row.speaker_id;
  if (isUserInChatRoom(sessionId, recipient)) return;

  const preview = [...content].slice(0, 200).join("");
  if (isUserConnected(recipient)) {
    notifyUser(recipient, { type: "chat_message", sessionId, nickname: row.nickname, preview });
    return;
  }

  const key = `${sessionId}:${recipient}`;
  if (Date.now() - (lastTelegram.get(key) ?? 0) < TELEGRAM_COOLDOWN_MS) return;
  lastTelegram.set(key, Date.now());
  pushIfOffline(recipient, {
    uz: { title: `💬 ${row.nickname}`, body: preview },
    ru: { title: `💬 ${row.nickname}`, body: preview },
    path: `/messages/${sessionId}`,
    tag: sessionId,
  });
  const user = await pool.query("SELECT telegram_id FROM users WHERE id = $1", [recipient]);
  const telegramId = user.rows[0]?.telegram_id;
  if (!telegramId) return;
  const messageId = await sendTelegramMessage(
    telegramId,
    `💬 <b>${escapeHtml(row.nickname)}</b>: «${escapeHtml(preview)}»\n\n` +
      `Javob berish uchun pastdagi tugmani bosing.`,
    [
      [{ text: "✍️ Javob yozish", callback_data: `chat_reply:${sessionId}` }],
      [{ text: "Yozishmani ochish", url: await siteUrl(recipient, `/messages/${sessionId}`) }],
    ],
  );
  if (messageId) await rememberTelegramMessage(telegramId, messageId, sessionId, recipient);
}

// Telegram webhook'dan: foydalanuvchi bot xabariga "Reply" qildi. Qaytadi:
// true — xabar suhbatga tegishli edi va qayta ishlandi.
export async function handleTelegramChatReply(message: {
  text?: string;
  chat?: { id: number; type?: string };
  from?: { id: number };
  reply_to_message?: { message_id: number };
}): Promise<boolean> {
  if (
    message.chat?.type !== "private" ||
    !message.reply_to_message ||
    typeof message.text !== "string" ||
    !message.text.trim()
  ) {
    return false;
  }
  const mapped = await pool.query(
    `SELECT m.session_id, m.user_id, s.status
     FROM chat_telegram_messages m
     JOIN sessions s ON s.id = m.session_id
     JOIN users u ON u.id = m.user_id
     WHERE m.tg_chat_id = $1 AND m.tg_message_id = $2
       AND u.telegram_id = $3 AND u.banned_at IS NULL`,
    [message.chat.id, message.reply_to_message.message_id, String(message.from?.id)],
  );
  const row = mapped.rows[0];
  if (!row) return false;
  if (!["scheduled", "active"].includes(row.status)) {
    await sendTelegramMessage(message.chat.id, "Bu suhbat yakunlangan, xabar yuborilmadi.");
    return true;
  }
  pendingReplies.delete(String(message.chat.id));
  await saveChatMessage(row.session_id, row.user_id, message.text.trim().slice(0, 2000));
  await sendTelegramMessage(message.chat.id, "✓ Yuborildi");
  return true;
}

// "✍️ Javob yozish" tugmasi: bot javob so'raydi (yozish maydoni o'zi
// ochiladi), keyingi oddiy xabar shu suhbatga yoziladi. 10 daqiqa amal qiladi.
const PENDING_REPLY_MS = 10 * 60 * 1000;
const pendingReplies = new Map<string, { sessionId: string; userId: string; at: number }>();

// Webhook `chat_reply:<sessionId>` callback'idan. Qaytadi: callback javobi matni.
export async function startTelegramReply(
  chatId: number,
  fromTelegramId: string,
  sessionId: string,
): Promise<string> {
  const result = await pool.query(
    `SELECT u.id AS user_id, s.status, p.nickname AS partner
     FROM sessions s
     JOIN users u ON u.telegram_id = $2 AND u.banned_at IS NULL
                 AND (u.id = s.speaker_id OR u.id = s.listener_id)
     JOIN profiles p ON p.user_id = CASE WHEN u.id = s.speaker_id THEN s.listener_id ELSE s.speaker_id END
     WHERE s.id = $1`,
    [sessionId, fromTelegramId],
  );
  const row = result.rows[0];
  if (!row) return "Bu suhbat sizga tegishli emas";
  if (!["scheduled", "active"].includes(row.status)) return "Bu suhbat yakunlangan";
  pendingReplies.set(String(chatId), { sessionId, userId: row.user_id, at: Date.now() });
  const promptId = await sendTelegramMessage(
    chatId,
    `✍️ <b>${escapeHtml(row.partner)}</b>ga javobingizni yozing va yuboring:`,
    { forceReply: true, placeholder: "Javobingiz..." },
  );
  // Yozish maydoni shu xabarga "Reply" bo'lib keladi — u yo'l ham ishlaydi.
  if (promptId) await rememberTelegramMessage(chatId, promptId, sessionId, row.user_id);
  return "Javobingizni yozing";
}

// Tugmadan keyin yozilgan oddiy (Reply'siz) xabar. Qaytadi: true — qayta ishlandi.
export async function handleTelegramPendingReply(message: {
  text?: string;
  chat?: { id: number; type?: string };
}): Promise<boolean> {
  if (message.chat?.type !== "private" || typeof message.text !== "string") return false;
  const key = String(message.chat.id);
  const pending = pendingReplies.get(key);
  if (!pending) return false;
  if (Date.now() - pending.at > PENDING_REPLY_MS) {
    pendingReplies.delete(key);
    return false;
  }
  // Buyruqlar (/start va h.k.) javob sifatida olinmaydi.
  if (message.text.startsWith("/")) {
    pendingReplies.delete(key);
    return false;
  }
  const text = message.text.trim();
  if (!text) return false;
  pendingReplies.delete(key);
  const session = await pool.query("SELECT status FROM sessions WHERE id = $1", [pending.sessionId]);
  if (!["scheduled", "active"].includes(session.rows[0]?.status)) {
    await sendTelegramMessage(message.chat.id, "Bu suhbat yakunlangan, xabar yuborilmadi.");
    return true;
  }
  await saveChatMessage(pending.sessionId, pending.userId, text.slice(0, 2000));
  await sendTelegramMessage(message.chat.id, "✓ Yuborildi");
  return true;
}
