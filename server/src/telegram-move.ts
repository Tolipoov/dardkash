import { pool } from "./db";
import { banUser } from "./moderation";
import { notifyUser } from "./notify-ws";
import { escapeHtml, sendTelegramMessage } from "./telegram/bot";

// Telegram'ni boshqa Dardkash hisobidan hozirgi hisobga ko'chirish.
//
// Holat: odam avval Telegram orqali kirgan (alohida hisob ochilgan), keyin
// Google orqali kirib, "Telegram'ni ulash"ni bosgan — Telegram eski hisobga
// bog'langan. Ikki hisobni to'liq birlashtirish (o'nlab jadval) xavfli,
// shuning uchun faqat Telegram ko'chiriladi:
// - eski hisobning profili yo'q — so'ramasdan ko'chiriladi, bo'sh hisob o'chadi;
// - aks holda bot tasdiq so'raydi (10 daqiqa). Eski hisobga Google ulanmagan
//   bo'lsa, unga endi kirib bo'lmaydi — u "birlashtirildi" sababi bilan
//   bloklanadi (ro'yxat, matching, bildirishnomalardan chiqadi).

const CONFIRM_MS = 10 * 60 * 1000;
const pendingMoves = new Map<
  string,
  { telegramId: string; fromUserId: string; toUserId: string; at: number }
>();

async function nickname(userId: string) {
  const r = await pool.query("SELECT nickname FROM profiles WHERE user_id = $1", [userId]);
  return (r.rows[0]?.nickname as string | undefined) ?? null;
}

// Qaytadi: "moved" — darhol ko'chirildi (chaqiruvchi davom etib ulaydi),
// "asked" — tasdiq so'raldi.
export async function handleTelegramConflict(
  chatId: number,
  telegramId: string,
  fromUserId: string,
  toUserId: string,
): Promise<"moved" | "asked"> {
  const oldName = await nickname(fromUserId);
  if (!oldName) {
    // Profilsiz (bo'sh) eski hisob — hech narsa yo'qotilmaydi.
    await pool.query("UPDATE users SET telegram_id = NULL WHERE id = $1", [fromUserId]);
    await pool
      .query("DELETE FROM users WHERE id = $1 AND google_id IS NULL", [fromUserId])
      .catch(() => {});
    console.log(`Telegram ko'chirildi (bo'sh hisobdan): ${fromUserId} -> ${toUserId}`);
    return "moved";
  }
  pendingMoves.set(String(chatId), { telegramId, fromUserId, toUserId, at: Date.now() });
  const newName = (await nickname(toUserId)) ?? "—";
  console.log(`Telegram to'qnashuvi, tasdiq so'raldi: ${fromUserId} -> ${toUserId}`);
  await sendTelegramMessage(
    chatId,
    `Bu Telegram «<b>${escapeHtml(oldName)}</b>» Dardkash hisobiga bog'langan.\n\n` +
      `Uni hozirgi «<b>${escapeHtml(newName)}</b>» hisobingizga ko'chiraymi? ` +
      `Shunda «${escapeHtml(oldName)}» hisobiga Telegram orqali endi kira olmaysiz ` +
      `(undagi suhbatlar va dardkash holati o'tmaydi).`,
    [
      [
        { text: "✅ Ha, ko'chirish", callback_data: "tg_move_yes" },
        { text: "❌ Yo'q", callback_data: "tg_move_no" },
      ],
    ],
  );
  return "asked";
}

// Webhook'dan (tg_move_yes / tg_move_no). Qaytadi: xabar o'rniga yoziladigan matn.
export async function confirmTelegramMove(
  chatId: number,
  fromTelegramId: string,
  yes: boolean,
): Promise<string> {
  const key = String(chatId);
  const pending = pendingMoves.get(key);
  pendingMoves.delete(key);
  if (!pending || pending.telegramId !== fromTelegramId || Date.now() - pending.at > CONFIRM_MS) {
    return "Bu so'rov eskirgan. Saytdagi \"Telegram'ni ulash\" tugmasini qaytadan bosing.";
  }
  if (!yes) return "Bekor qilindi — Telegram avvalgi hisobda qoldi.";

  const client = await pool.connect();
  let oldHasGoogle = false;
  try {
    await client.query("BEGIN");
    const old = await client.query(
      "UPDATE users SET telegram_id = NULL WHERE id = $1 AND telegram_id = $2 RETURNING google_id",
      [pending.fromUserId, pending.telegramId],
    );
    if (old.rows.length === 0) {
      await client.query("ROLLBACK");
      return "Holat o'zgargan. Saytdagi \"Telegram'ni ulash\" tugmasini qaytadan bosing.";
    }
    oldHasGoogle = Boolean(old.rows[0].google_id);
    await client.query("UPDATE users SET telegram_id = $2 WHERE id = $1", [
      pending.toUserId,
      pending.telegramId,
    ]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  // Eski hisobga endi hech qanday yo'l bilan kirib bo'lmaydi — ro'yxatlarda
  // "arvoh" dardkash bo'lib qolmasin.
  if (!oldHasGoogle) {
    const newName = (await nickname(pending.toUserId)) ?? pending.toUserId;
    await banUser(pending.fromUserId, null, `Birlashtirildi: Telegram «${newName}» hisobiga ko'chirildi`);
  }
  console.log(`Telegram ko'chirildi (tasdiq bilan): ${pending.fromUserId} -> ${pending.toUserId}`);
  notifyUser(pending.toUserId, { type: "telegram_linked" });
  return "✅ Telegram hozirgi hisobingizga ko'chirildi va ulandi!\n\nEndi saytda bo'lmagan paytingizda ham xabarlar shu yerga keladi.";
}
