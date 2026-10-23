import { pool } from "./db";
import { escapeHtml, sendTelegramMessage } from "./telegram/bot";
import { cancelWaitlist } from "./waitlist";

export async function isBanned(userId: string): Promise<boolean> {
  const result = await pool.query(
    "SELECT 1 FROM users WHERE id = $1 AND banned_at IS NOT NULL",
    [userId],
  );
  return result.rows.length > 0;
}

// Foydalanuvchini bloklaydi: keyingi so'rovidayoq sessiyasi bekor bo'ladi
// (requireAuth), qayta kira olmaydi, dardkashlar ro'yxati va matching'dan
// chiqadi, ochiq suhbat/takliflari yopiladi. Admin/moderatorni bloklab
// bo'lmaydi. Qaytadi: haqiqatan bloklandimi.
export async function banUser(
  userId: string,
  bannedBy: string | null,
  reason: string | null,
): Promise<boolean> {
  const result = await pool.query(
    `UPDATE users u SET banned_at = now(), banned_by = $2, ban_reason = $3
     WHERE u.id = $1 AND u.banned_at IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM profiles p
         WHERE p.user_id = u.id AND p.role IN ('admin', 'moderator')
       )
     RETURNING u.id`,
    [userId, bannedBy, reason],
  );
  if (result.rows.length === 0) return false;

  await pool.query(
    "UPDATE listener_profiles SET is_online = false WHERE user_id = $1",
    [userId],
  );
  await cancelWaitlist(userId);
  const closed = await pool.query(
    `UPDATE sessions SET
       status = CASE WHEN status = 'scheduled'
                     THEN 'cancelled'::session_status
                     ELSE 'ended'::session_status END,
       ended_at = now()
     WHERE (speaker_id = $1 OR listener_id = $1)
       AND status IN ('scheduled', 'active')
     RETURNING listener_id`,
    [userId],
  );
  const listeners = new Set(closed.rows.map((r) => r.listener_id as string));
  for (const listenerId of Array.from(listeners)) {
    await pool.query("SELECT refresh_listener_stats($1)", [listenerId]);
  }
  return true;
}

export async function unbanUser(userId: string): Promise<boolean> {
  const result = await pool.query(
    `UPDATE users SET banned_at = NULL, banned_by = NULL, ban_reason = NULL
     WHERE id = $1 AND banned_at IS NOT NULL
     RETURNING id`,
    [userId],
  );
  return result.rows.length > 0;
}

// Shikoyatni yopadi. `ban` bo'lsa, shikoyat qilingan foydalanuvchi
// bloklanadi va unga tegishli qolgan ochiq shikoyatlar ham yopiladi.
// Qaytadi: null — shikoyat topilmadi; aks holda bloklash natijasi.
export async function resolveReport(
  reportId: string,
  resolvedBy: string | null,
  ban: boolean,
): Promise<{ banned: boolean } | null> {
  const result = await pool.query(
    `UPDATE reports SET resolved = true, resolved_at = now(), resolved_by = $2
     WHERE id = $1
     RETURNING reported_user`,
    [reportId, resolvedBy],
  );
  if (result.rows.length === 0) return null;

  const reportedUser = result.rows[0].reported_user as string | null;
  if (!ban || !reportedUser) return { banned: false };

  const banned = await banUser(reportedUser, resolvedBy, `report:${reportId}`);
  await pool.query(
    `UPDATE reports SET resolved = true, resolved_at = now(), resolved_by = $2
     WHERE reported_user = $1 AND NOT resolved`,
    [reportedUser, resolvedBy],
  );
  return { banned };
}

export const REPORT_REASON_LABELS: Record<string, string> = {
  abuse: "Haqorat / tahqirlash",
  inappropriate: "Nomunosib xatti-harakat",
  other: "Boshqa sabab",
};

// Shikoyatni saqlaydi va admin'ga Telegram'da tugmalar bilan yuboradi
// (suhbat ham, xat ham shu yerdan). `context` — admin xabaridagi qo'shimcha
// qator (masalan qaysi xat haqida).
export async function fileReport(opts: {
  reporterId: string;
  reportedUserId: string;
  sessionId: string | null;
  reason: string;
  details: string | null;
  context?: string;
}) {
  const { reporterId, reportedUserId, sessionId, reason, details, context } = opts;
  const inserted = await pool.query(
    `INSERT INTO reports (session_id, reported_by, reported_user, reason, details)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [sessionId, reporterId, reportedUserId, reason, details],
  );
  const reportId = inserted.rows[0].id as string;

  // Avval shikoyat faqat bazaga yozilardi — hech kim xabar topmasdi.
  if (!process.env.ADMIN_TELEGRAM_CHAT_ID) return;
  const names = await pool.query(
    `SELECT
       (SELECT nickname FROM profiles WHERE user_id = $1) AS reporter,
       (SELECT nickname FROM profiles WHERE user_id = $2) AS reported,
       (SELECT COUNT(*) FROM reports WHERE reported_user = $2) AS total`,
    [reporterId, reportedUserId],
  );
  const { reporter, reported, total } = names.rows[0];
  await sendTelegramMessage(
    process.env.ADMIN_TELEGRAM_CHAT_ID,
    `🚨 <b>Yangi shikoyat</b>\n\n` +
      `👤 Kimga: ${escapeHtml(reported || "—")} (jami shikoyatlar: ${total})\n` +
      `✍️ Kimdan: ${escapeHtml(reporter || "—")}\n` +
      `🏷 Sabab: ${REPORT_REASON_LABELS[reason]}` +
      (context ? `\n📍 ${escapeHtml(context)}` : "") +
      (details ? `\n📝 ${escapeHtml(details)}` : "") +
      `\n\n${process.env.APP_BASE_URL}/admin/moderation`,
    [
      [
        { text: "🚫 Bloklash", callback_data: `report_ban:${reportId}` },
        { text: "✓ Yopish", callback_data: `report_ok:${reportId}` },
      ],
    ],
  );
}
