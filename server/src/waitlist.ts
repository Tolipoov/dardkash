import { pool } from "./db";
import { isUserConnected, notifyUser } from "./notify-ws";
import { pushIfOffline } from "./push";
import { editTelegramMessage, escapeHtml, sendTelegramMessage } from "./telegram/bot";

// Kutish navbati: onlayn dardkash bo'lmasa, dardini aytuvchi navbatga
// yoziladi, mos dardkashlarga xabar boradi, birinchi javob bergan dardkash
// suhbatni oladi. Avval bunday paytda odam "hozircha mos dardkash yo'q"
// xabarini ko'rib ketib qolardi.

// Shuncha vaqtda hech kim olmasa, navbat bekor bo'ladi.
export const WAITLIST_TTL_MINUTES = 120;
// Bir dardkashga "kimdir kutmoqda" Telegram xabari shundan tez-tez ketmaydi.
export const PING_COOLDOWN_MINUTES = 15;

// Telegram xabarlari hozircha faqat o'zbekcha (boshqa bot xabarlari kabi).
export const TOPIC_LABELS: Record<string, string> = {
  family: "Oila",
  relationships: "Munosabatlar",
  parenting: "Farzand tarbiyasi",
  work: "Ish / Karyera",
  study: "O'qish / Imtihon",
  loneliness: "Yolg'izlik",
  stress: "Stress / Xavotir",
  self_esteem: "O'ziga ishonch",
  health: "Sog'liq",
  finance: "Moliyaviy muammolar",
  migration: "Musofirlik",
  addiction: "Qaramlik",
  grief: "Yo'qotish / Motam",
  other: "Boshqa",
};

// Navbatdagi odamga mos dardkashlar: tasdiqlangan, bloklanmagan, umumiy
// tili bor, dardini aytuvchi jins tanlagan bo'lsa — o'sha jinsdagi.
// `$1` — speaker_id.
export const COMPATIBLE_LISTENERS_SQL = `
  SELECT lp.user_id, u.telegram_id, lp.last_wait_ping_at
  FROM listener_profiles lp
  JOIN users u ON u.id = lp.user_id
  JOIN profiles lprof ON lprof.user_id = lp.user_id
  JOIN profiles sp ON sp.user_id = $1
  WHERE lp.status = 'approved'
    AND u.banned_at IS NULL
    AND lp.user_id <> $1
    AND lprof.languages && sp.languages
    AND (sp.preferred_listener_gender = 'any' OR lprof.gender = sp.preferred_listener_gender)
`;

// Foydalanuvchi tilidagi sayt manzili (Telegram tugmalari uchun).
export async function siteUrl(userId: string, path: string): Promise<string> {
  const result = await pool.query(
    "SELECT language FROM profiles WHERE user_id = $1",
    [userId],
  );
  const prefix = result.rows[0]?.language === "ru" ? "/ru" : "";
  return `${process.env.APP_BASE_URL}${prefix}${path}`;
}

export function sessionUrl(userId: string, sessionId: string): Promise<string> {
  return siteUrl(userId, `/session/${sessionId}`);
}

async function notifyAllListeners(payload: object) {
  const result = await pool.query(
    "SELECT user_id FROM listener_profiles WHERE status = 'approved'",
  );
  for (const { user_id } of result.rows) notifyUser(user_id, payload);
}

// Navbat hal bo'lgach, dardkashlarga ketgan xabarlardagi tugmani olib
// tashlaydi (`exceptListenerId` — suhbatni olgan dardkash, uning xabari
// alohida yangilanadi).
async function resolvePings(waitlistId: string, text: string, exceptListenerId?: string) {
  const pings = await pool.query(
    "SELECT listener_id, tg_chat_id, tg_message_id FROM waitlist_pings WHERE waitlist_id = $1",
    [waitlistId],
  );
  for (const ping of pings.rows) {
    if (ping.listener_id === exceptListenerId) continue;
    await editTelegramMessage(ping.tg_chat_id, Number(ping.tg_message_id), text);
  }
}

async function pingListeners(waitlistId: string, speakerId: string) {
  const topicsResult = await pool.query(
    "SELECT topic_code FROM profile_topics WHERE user_id = $1",
    [speakerId],
  );
  const topics = topicsResult.rows
    .map((r) => TOPIC_LABELS[r.topic_code as string] || r.topic_code)
    .join(", ");

  const listeners = await pool.query(COMPATIBLE_LISTENERS_SQL, [speakerId]);
  const text =
    `🔔 <b>Kimdir hozir suhbatdosh kutmoqda</b>\n\n` +
    (topics ? `Mavzular: ${escapeHtml(topics)}\n\n` : "") +
    `Birinchi javob bergan dardkash suhbatni oladi.`;

  for (const listener of listeners.rows) {
    const listenerId = listener.user_id as string;
    // Saytda bo'lsa — kabinetidagi ro'yxat va bildirishnoma yetarli.
    if (isUserConnected(listenerId)) {
      notifyUser(listenerId, { type: "waitlist_new" });
      continue;
    }
    const lastPing = listener.last_wait_ping_at as Date | null;
    if (lastPing && Date.now() - lastPing.getTime() < PING_COOLDOWN_MINUTES * 60 * 1000) {
      continue;
    }
    pushIfOffline(listenerId, {
      uz: { title: "🔔 Kimdir suhbatdosh kutmoqda", body: "Birinchi javob bergan dardkash suhbatni oladi." },
      ru: { title: "🔔 Кто-то ждёт собеседника", body: "Разговор получит слушатель, откликнувшийся первым." },
      path: "/dashboard",
      tag: "waitlist",
    });
    if (!listener.telegram_id) {
      await pool.query(
        "UPDATE listener_profiles SET last_wait_ping_at = now() WHERE user_id = $1",
        [listenerId],
      );
      continue;
    }
    const messageId = await sendTelegramMessage(listener.telegram_id, text, [
      [{ text: "🎧 Suhbatni olish", callback_data: `wait_take:${waitlistId}` }],
    ]);
    if (!messageId) continue;
    await pool.query(
      `INSERT INTO waitlist_pings (waitlist_id, listener_id, tg_chat_id, tg_message_id)
       VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
      [waitlistId, listenerId, listener.telegram_id, messageId],
    );
    await pool.query(
      "UPDATE listener_profiles SET last_wait_ping_at = now() WHERE user_id = $1",
      [listenerId],
    );
  }
}

export async function joinWaitlist(speakerId: string) {
  const inserted = await pool.query(
    `INSERT INTO waitlist (speaker_id) VALUES ($1)
     ON CONFLICT (speaker_id) WHERE status = 'waiting' DO NOTHING
     RETURNING id`,
    [speakerId],
  );
  if (inserted.rows.length > 0) {
    const id = inserted.rows[0].id as string;
    // Xabar yuborish sekin bo'lishi mumkin (Telegram) — javobni kutdirmaymiz.
    pingListeners(id, speakerId).catch((err) =>
      console.error("Dardkashlarga navbat xabarini yuborishda xato:", err),
    );
  }
  return getMyWaiting(speakerId);
}

export async function getMyWaiting(speakerId: string) {
  const result = await pool.query(
    `SELECT id, created_at FROM waitlist WHERE speaker_id = $1 AND status = 'waiting'`,
    [speakerId],
  );
  return (result.rows[0] as { id: string; created_at: string } | undefined) ?? null;
}

// Odam navbatdan chiqdi (o'zi bekor qildi yoki boshqa yo'l bilan suhbat
// boshladi).
export async function cancelWaitlist(speakerId: string) {
  const result = await pool.query(
    `UPDATE waitlist SET status = 'cancelled', resolved_at = now()
     WHERE speaker_id = $1 AND status = 'waiting'
     RETURNING id`,
    [speakerId],
  );
  for (const { id } of result.rows) {
    await resolvePings(id, "⌛ <b>Bu so'rov endi dolzarb emas</b>");
  }
  if (result.rows.length > 0) await notifyAllListeners({ type: "waitlist_changed" });
}

// Dardkash uchun: unga mos, hozir kutayotganlar.
export async function listWaitingFor(listenerId: string) {
  const result = await pool.query(
    `SELECT w.id, w.speaker_id, p.nickname, p.avatar,
            FLOOR(EXTRACT(EPOCH FROM now() - w.created_at) / 60)::int AS waiting_minutes,
            COALESCE(array_agg(pt.topic_code) FILTER (WHERE pt.topic_code IS NOT NULL), '{}') AS topics
     FROM waitlist w
     JOIN profiles p ON p.user_id = w.speaker_id
     JOIN users u ON u.id = w.speaker_id
     JOIN profiles lprof ON lprof.user_id = $1
     LEFT JOIN profile_topics pt ON pt.user_id = w.speaker_id
     WHERE w.status = 'waiting'
       AND w.speaker_id <> $1
       AND u.banned_at IS NULL
       AND p.languages && lprof.languages
       AND (p.preferred_listener_gender = 'any' OR p.preferred_listener_gender = lprof.gender)
     GROUP BY w.id, w.speaker_id, p.nickname, p.avatar, w.created_at
     ORDER BY w.created_at ASC`,
    [listenerId],
  );
  return result.rows;
}

export type TakeResult =
  | { ok: true; sessionId: string }
  | { ok: false; code: "not_found" | "taken" | "not_allowed" | "busy" };

// Dardkash navbatdagi odamni oladi. Bir nechta dardkash bir vaqtda bossa,
// `FOR UPDATE` faqat bittasiga ruxsat beradi.
export async function takeWaitlist(waitlistId: string, listenerId: string): Promise<TakeResult> {
  const client = await pool.connect();
  let speakerId: string;
  let sessionId: string;
  try {
    await client.query("BEGIN");

    const listener = await client.query(
      `SELECT lp.user_id, p.nickname, p.gender, p.languages
       FROM listener_profiles lp
       JOIN users u ON u.id = lp.user_id
       JOIN profiles p ON p.user_id = lp.user_id
       WHERE lp.user_id = $1 AND lp.status = 'approved' AND u.banned_at IS NULL`,
      [listenerId],
    );
    if (listener.rows.length === 0) {
      await client.query("ROLLBACK");
      return { ok: false, code: "not_allowed" };
    }

    const busy = await client.query(
      `SELECT 1 FROM sessions
       WHERE status = 'active' AND (speaker_id = $1 OR listener_id = $1) LIMIT 1`,
      [listenerId],
    );
    if (busy.rows.length > 0) {
      await client.query("ROLLBACK");
      return { ok: false, code: "busy" };
    }

    const entry = await client.query(
      `SELECT w.status, w.speaker_id, p.preferred_listener_gender, p.languages,
              (u.banned_at IS NOT NULL) AS speaker_banned
       FROM waitlist w
       JOIN profiles p ON p.user_id = w.speaker_id
       JOIN users u ON u.id = w.speaker_id
       WHERE w.id = $1
       FOR UPDATE OF w`,
      [waitlistId],
    );
    const row = entry.rows[0];
    if (!row || row.speaker_banned || row.status === "cancelled" || row.status === "expired") {
      await client.query("ROLLBACK");
      return { ok: false, code: "not_found" };
    }
    if (row.status === "taken") {
      await client.query("ROLLBACK");
      return { ok: false, code: "taken" };
    }
    const me = listener.rows[0];
    const sharesLanguage = (row.languages as string[]).some((l) =>
      (me.languages as string[]).includes(l),
    );
    if (
      row.speaker_id === listenerId ||
      !sharesLanguage ||
      (row.preferred_listener_gender !== "any" && row.preferred_listener_gender !== me.gender)
    ) {
      await client.query("ROLLBACK");
      return { ok: false, code: "not_allowed" };
    }

    speakerId = row.speaker_id;
    // Dardini aytuvchi suhbatni allaqachon so'ragan — shuning uchun suhbat
    // darhol `active`. U kelmasa, dardkash chiqib ketgach sweeper yopadi.
    const session = await client.query(
      `INSERT INTO sessions (speaker_id, listener_id, status, started_at)
       VALUES ($1, $2, 'active', now()) RETURNING id`,
      [speakerId, listenerId],
    );
    sessionId = session.rows[0].id;
    await client.query(
      `UPDATE waitlist SET status = 'taken', session_id = $2, taken_by = $3, resolved_at = now()
       WHERE id = $1`,
      [waitlistId, sessionId, listenerId],
    );
    await client.query("COMMIT");

    const listenerName = me.nickname as string;
    notifyUser(speakerId, { type: "listener_found", sessionId, listenerName });
    pushIfOffline(speakerId, {
      uz: { title: "🎧 Dardkash topildi!", body: `${listenerName} sizni tinglashga tayyor.` },
      ru: { title: "🎧 Слушатель найден!", body: `${listenerName} готов(а) вас выслушать.` },
      path: `/session/${sessionId}`,
      tag: sessionId,
    });
    const speaker = await pool.query("SELECT telegram_id FROM users WHERE id = $1", [speakerId]);
    const speakerTelegram = speaker.rows[0]?.telegram_id;
    if (speakerTelegram) {
      await sendTelegramMessage(
        speakerTelegram,
        `🎧 <b>${escapeHtml(listenerName)}</b> sizni tinglashga tayyor!\n\nSuhbatga kirish uchun tugmani bosing.`,
        [[{ text: "Suhbatga kirish", url: await sessionUrl(speakerId, sessionId) }]],
      );
    }
    await resolvePings(waitlistId, "✓ <b>Bu suhbatni boshqa dardkash oldi.</b> Rahmat!", listenerId);
    await notifyAllListeners({ type: "waitlist_changed" });
    return { ok: true, sessionId };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// Sweeper chaqiradi: uzoq kutib, hech kim olmagan navbatlar.
export async function expireWaitlist() {
  const result = await pool.query(
    `UPDATE waitlist SET status = 'expired', resolved_at = now()
     WHERE status = 'waiting' AND created_at < now() - make_interval(mins => $1)
     RETURNING id, speaker_id`,
    [WAITLIST_TTL_MINUTES],
  );
  for (const { id, speaker_id } of result.rows) {
    await resolvePings(id, "⌛ <b>Bu so'rov endi dolzarb emas</b>");
    notifyUser(speaker_id, { type: "waitlist_expired" });
    const speaker = await pool.query("SELECT telegram_id FROM users WHERE id = $1", [speaker_id]);
    if (speaker.rows[0]?.telegram_id) {
      await sendTelegramMessage(
        speaker.rows[0].telegram_id,
        "Afsuski, hozircha bo'sh dardkash topilmadi. Birozdan keyin qayta urinib ko'ring.",
      );
    }
  }
  if (result.rows.length > 0) {
    await notifyAllListeners({ type: "waitlist_changed" });
    console.log(`${result.rows.length} ta navbat muddati tugadi`);
  }
}
