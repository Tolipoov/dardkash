import { pool } from "./db";

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
