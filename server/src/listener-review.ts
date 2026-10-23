import { pool } from "./db";
import { notifyUser } from "./notify-ws";
import { pushIfOffline } from "./push";
import { escapeHtml, sendTelegramMessage } from "./telegram/bot";
import { siteUrl } from "./waitlist";

// Dardkash arizasini tasdiqlash/rad etish va foydalanuvchiga boradigan
// bot xabarlari — sayt (admin panel) ham, Telegram tugmalari ham shu yerdan.
// Xabarlar foydalanuvchi interfeys tiliga qarab (profiles.language).

async function recipient(userId: string) {
  const result = await pool.query(
    `SELECT u.telegram_id, p.nickname, p.language
     FROM users u LEFT JOIN profiles p ON p.user_id = u.id
     WHERE u.id = $1`,
    [userId],
  );
  const row = result.rows[0];
  return {
    telegramId: row?.telegram_id as string | null,
    nickname: (row?.nickname as string) || "",
    ru: row?.language === "ru",
  };
}

async function openAppButton(userId: string, ru: boolean, path = "/dashboard") {
  return {
    text: ru ? "📱 Открыть Dardkash" : "📱 Dardkash'ni ochish",
    web_app: { url: await siteUrl(userId, path) },
  };
}

export async function approveListener(userId: string, reviewerId: string | null) {
  const updated = await pool.query(
    `UPDATE listener_profiles
     SET status = 'approved', reviewed_by = $2, reviewed_at = now(), welcome_seen_at = NULL
     WHERE user_id = $1 RETURNING user_id`,
    [userId, reviewerId],
  );
  if (updated.rows.length === 0) return false;
  // Saytda bo'lsa — kabinet darhol yangilanadi ("Tabriklaymiz" kartochkasi).
  notifyUser(userId, { type: "listener_approved" });
  pushIfOffline(userId, {
    uz: { title: "🎉 Tabriklaymiz!", body: "Dardkash sifatida profilingiz tasdiqlandi." },
    ru: { title: "🎉 Поздравляем!", body: "Ваш профиль слушателя одобрен." },
    path: "/dashboard",
  });

  const { telegramId, nickname, ru } = await recipient(userId);
  if (!telegramId) return true;
  const name = escapeHtml(nickname);
  const text = ru
    ? `🎉 <b>Поздравляем, ${name}!</b> Ваш профиль слушателя одобрен.\n\n` +
      `С чего начать:\n` +
      `1️⃣ Укажите в профиле, когда вы обычно свободны — люди будут знать, когда заходить.\n` +
      `2️⃣ Прочитайте памятку «Как хорошо слушать» (2 минуты).\n` +
      `3️⃣ Будьте онлайн на сайте или в этом приложении — когда кто-то ищет собеседника, вам придёт уведомление.\n\n` +
      `Также загляните в «Письма» — там могут ждать ответа.`
    : `🎉 <b>Tabriklaymiz, ${name}!</b> Dardkash sifatida profilingiz tasdiqlandi.\n\n` +
      `Nimadan boshlash kerak:\n` +
      `1️⃣ Profilingizda odatda qachon bo'sh bo'lishingizni kiriting — odamlar qachon kirishni bilishadi.\n` +
      `2️⃣ «Qanday yaxshi tinglash kerak» qo'llanmasini o'qing (2 daqiqa).\n` +
      `3️⃣ Saytda yoki shu yerdagi ilovada onlayn bo'ling — kimdir suhbatdosh qidirsa, sizga xabar keladi.\n\n` +
      `«Xatlar» bo'limiga ham qarang — u yerda javob kutayotgan xatlar bo'lishi mumkin.`;
  await sendTelegramMessage(telegramId, text, [
    [await openAppButton(userId, ru)],
    [
      { text: ru ? "📖 Памятка" : "📖 Qo'llanma", url: await siteUrl(userId, "/guide") },
      {
        text: ru ? "🕒 Свободное время" : "🕒 Bo'sh vaqt",
        url: await siteUrl(userId, "/onboarding?edit=1"),
      },
    ],
  ]);
  return true;
}

export async function rejectListener(
  userId: string,
  reason: string | null,
  reviewerId: string | null,
) {
  const updated = await pool.query(
    `UPDATE listener_profiles
     SET status = 'rejected', reject_reason = $2, reviewed_by = $3, reviewed_at = now()
     WHERE user_id = $1 RETURNING user_id`,
    [userId, reason, reviewerId],
  );
  if (updated.rows.length === 0) return false;
  notifyUser(userId, { type: "listener_rejected" });
  pushIfOffline(userId, {
    uz: { title: "Ariza natijasi", body: "Dardkash arizangiz hozircha tasdiqlanmadi." },
    ru: { title: "Решение по заявке", body: "Ваша заявка слушателя пока не одобрена." },
    path: "/onboarding?edit=1",
  });

  const { telegramId, ru } = await recipient(userId);
  if (!telegramId) return true;
  const reasonText = reason
    ? `\n\n${ru ? "Причина" : "Sabab"}: ${escapeHtml(reason)}`
    : "";
  await sendTelegramMessage(
    telegramId,
    (ru
      ? `К сожалению, ваша заявка слушателя пока не одобрена.${reasonText}\n\nВы можете исправить профиль и подать заявку снова.`
      : `Afsuski, dardkash sifatidagi arizangiz hozircha tasdiqlanmadi.${reasonText}\n\nProfilingizni to'g'rilab, qaytadan ariza berishingiz mumkin.`),
    [
      [
        {
          text: ru ? "✏️ Исправить профиль" : "✏️ Profilni tahrirlash",
          url: await siteUrl(userId, "/onboarding?edit=1"),
        },
      ],
    ],
  );
  return true;
}

// Profil birinchi marta yaratilganda (Telegram ulangan bo'lsa).
export async function sendWelcome(userId: string, appliedAsListener: boolean) {
  const { telegramId, nickname, ru } = await recipient(userId);
  if (!telegramId) return;
  const name = escapeHtml(nickname);
  const text = ru
    ? `👋 <b>Добро пожаловать, ${name}!</b>\n\n` +
      `Что можно делать в Dardkash:\n` +
      `• «Найти слушателя» — поговорить с тем, кто свободен прямо сейчас;\n` +
      `• «Письма» — написать, а ответ получить позже;\n` +
      `• «✉️ Написать» — сообщение понравившемуся слушателю, без звонка.\n\n` +
      `Можно оставаться анонимным, разговоры не записываются.` +
      (appliedAsListener
        ? `\n\n📝 Ваша заявка слушателя отправлена модератору — о решении сообщим здесь.`
        : "")
    : `👋 <b>Xush kelibsiz, ${name}!</b>\n\n` +
      `Dardkash'da nima qilish mumkin:\n` +
      `• «Dardkash topish» — hozir bo'sh dardkash bilan gaplashish;\n` +
      `• «Xatlar» — yozib qo'yib, javobni keyinroq olish;\n` +
      `• «✉️ Xabar yozish» — yoqqan dardkashga qo'ng'iroqsiz xabar.\n\n` +
      `Anonim qolishingiz mumkin, suhbatlar yozib olinmaydi.` +
      (appliedAsListener
        ? `\n\n📝 Dardkash bo'lish arizangiz moderatorga yuborildi — qaror haqida shu yerda xabar beramiz.`
        : "");
  await sendTelegramMessage(telegramId, text, [[await openAppButton(userId, ru)]]);
}

// --- Telegram'dan rad etish sababi bilan ---
// "❌ Rad etish" bosilganda bot admin'dan sabab so'raydi; keyingi xabar —
// sabab ("-" — sababsiz). 10 daqiqa amal qiladi (xotirada).
const REASON_PROMPT_MS = 10 * 60 * 1000;
const pendingReasons = new Map<
  string,
  { userId: string; messageId: number; originalText: string; at: number }
>();

export async function askRejectReason(
  adminChatId: number,
  userId: string,
  messageId: number,
  originalText: string,
) {
  pendingReasons.set(String(adminChatId), { userId, messageId, originalText, at: Date.now() });
  await sendTelegramMessage(
    adminChatId,
    "✍️ Rad etish sababini yozing — u arizachiga yuboriladi.\nSababsiz rad etish uchun «-» yuboring.",
    { forceReply: true, placeholder: "Sabab..." },
  );
}

// Qaytadi: qayta ishlangan bo'lsa — natija (asl ariza xabarini yangilash uchun), aks holda null.
export async function handleRejectReason(message: {
  text?: string;
  chat?: { id: number };
}): Promise<{ messageId: number; originalText: string; text: string } | null> {
  if (!message.chat || typeof message.text !== "string") return null;
  const key = String(message.chat.id);
  const pending = pendingReasons.get(key);
  if (!pending) return null;
  pendingReasons.delete(key);
  if (Date.now() - pending.at > REASON_PROMPT_MS || message.text.startsWith("/")) return null;
  const raw = message.text.trim();
  const reason = raw === "-" || !raw ? null : [...raw].slice(0, 500).join("");
  await rejectListener(pending.userId, reason, null);
  return {
    messageId: pending.messageId,
    originalText: pending.originalText,
    text: reason ? `❌ Rad etildi. Sabab: ${reason}` : "❌ Rad etildi (sababsiz)",
  };
}
