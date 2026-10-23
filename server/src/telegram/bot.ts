// Telegram parse_mode="HTML" bilan yuborilayotgan xabarga foydalanuvchi
// yozgan matnni to'g'ridan-to'g'ri qo'yish xavfli — yopilmagan teg yoki
// "<"/"&" belgisi butun xabarni Telegram tomonidan rad ettirishi mumkin.
export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN as string;
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// Tugma: bot'ga qaytadigan `callback_data`, saytni ochadigan `url` yoki
// Telegram ichidagi Mini App (`web_app`).
type InlineButton =
  | { text: string; callback_data: string }
  | { text: string; url: string }
  // Mini App'ni Telegram ichida ochadi (faqat shaxsiy chatlarda ishlaydi).
  | { text: string; web_app: { url: string } };

// Foydalanuvchiga (yoki admin chatiga) xabar yuboradi. `buttons` berilsa,
// xabar ostida bosiladigan tugmalar chiqadi (masalan "Tasdiqlash"/"Rad etish").
// Qaytadi: Telegram xabar ID'si (keyin uni tahrirlash uchun kerak bo'ladi).
// `forceReply` — Telegram yozish maydonini o'zi ochib, javobni shu xabarga
// bog'laydi (foydalanuvchi "Reply" qilishni bilishi shart emas).
type ForceReply = { forceReply: true; placeholder?: string };

export async function sendTelegramMessage(
  chatId: string | number,
  text: string,
  buttons?: InlineButton[][] | ForceReply,
): Promise<number | null> {
  const replyMarkup = !buttons
    ? undefined
    : Array.isArray(buttons)
      ? { inline_keyboard: buttons }
      : { force_reply: true, input_field_placeholder: buttons.placeholder };
  try {
    const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      }),
    });
    const data = await res.json();
    if (!data.ok) {
      console.warn("Telegram xabar yuborilmadi:", JSON.stringify(data));
      return null;
    }
    return data.result.message_id as number;
  } catch (err) {
    console.warn("Telegram xabar yuborishda xato:", err);
    return null;
  }
}

// Tugmalar bosilgandan keyin, xabarning o'zini yangi matn bilan almashtiradi
// (masalan tugmalar o'rniga "✅ Tasdiqlandi" yozib qo'yish uchun).
export async function editTelegramMessage(
  chatId: string | number,
  messageId: number,
  text: string,
  buttons?: InlineButton[][],
) {
  try {
    await fetch(`${TELEGRAM_API}/editMessageText`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        text,
        parse_mode: "HTML",
        ...(buttons ? { reply_markup: { inline_keyboard: buttons } } : {}),
      }),
    });
  } catch (err) {
    console.warn("Telegram xabarni tahrirlashda xato:", err);
  }
}

// Tugma bosilganda Telegram "kutish" belgisini (soat aylanishi) ko'rsatadi —
// buni to'xtatish uchun albatta chaqirilishi kerak.
export async function answerCallbackQuery(callbackQueryId: string, text?: string) {
  try {
    await fetch(`${TELEGRAM_API}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
    });
  } catch (err) {
    console.warn("Telegram callback javobida xato:", err);
  }
}
