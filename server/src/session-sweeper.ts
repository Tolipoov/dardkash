import { RoomServiceClient } from "livekit-server-sdk";
import { inviteStatusText, resolveInviteTelegram } from "./call-notify";
import { pool } from "./db";
import { sweepLetters } from "./letters";
import { expireWaitlist } from "./waitlist";

// "Osilib qolgan" suhbatlarni yopuvchi fon vazifasi.
//
// Suhbat faqat frontend `/api/session/:id/end`ni chaqirganda tugardi. Agar
// ikkala tomon ham tab'ni yopsa/brauzer qulasa va sendBeacon yetib
// bormasa, suhbat abadiy `active` qolardi — /api/session/match esa faol
// suhbatdagi odamlarni chetlab o'tgani uchun o'sha dardkash hech qachon
// qayta tanlanmasdi (production'da shunday suhbat 22 kun turib qolgan edi).
//
// Endi har daqiqada LiveKit'dan xonada kim borligi so'raladi: ketma-ket
// ikki tekshiruvda xona bo'sh bo'lsa (sahifani yangilash kabi qisqa
// uzilishlar hisobga olinmasin deb), suhbat tugatiladi. LiveKit'ga ulanib
// bo'lmasa hech narsa yopilmaydi — faqat MAX_SESSION_HOURS'dan uzoq
// davom etgan suhbatlar baribir yopiladi.

const SWEEP_INTERVAL_MS = 60 * 1000;
const GRACE_MINUTES = 2;
const MAX_SESSION_HOURS = 4;
// Javob berilmagan taklif shuncha vaqtdan keyin bekor bo'ladi. Avval ular
// abadiy `scheduled` qolib, dashboard'dagi takliflar ro'yxatida turaverardi.
const INVITE_TTL_HOURS = 24;
// Yozishmasi bor `scheduled` suhbat ("✉️ Xabar yozish" yoki xabarli taklif) —
// bu endi shunchaki javobsiz taklif emas, qo'ng'iroqsiz yozishma. U oxirgi
// xabardan shuncha kun o'tmaguncha ochiq qoladi (avval 24 soatda bekor
// bo'lib, yozishayotgan odamlarning suhbati "yakunlangan" bo'lib qolardi).
const CONVERSATION_IDLE_DAYS = 7;

const roomService = new RoomServiceClient(
  process.env.LIVEKIT_API_URL || "http://dardkash-livekit:7880",
  process.env.LIVEKIT_API_KEY as string,
  process.env.LIVEKIT_API_SECRET as string,
);

// Oldingi tekshiruvda bo'sh chiqqan suhbatlar.
let emptyLastSweep = new Set<string>();

async function endSessions(ids: string[], reason: string) {
  if (ids.length === 0) return;
  const result = await pool.query(
    `UPDATE sessions SET status = 'ended', ended_at = now()
     WHERE id = ANY($1::uuid[]) AND status = 'active'
     RETURNING id, listener_id`,
    [ids],
  );
  const listeners = new Set(result.rows.map((r) => r.listener_id as string));
  for (const listenerId of Array.from(listeners)) {
    await pool.query("SELECT refresh_listener_stats($1)", [listenerId]);
  }
  if (result.rows.length > 0) {
    console.log(`${result.rows.length} ta suhbat avtomatik yopildi (${reason})`);
  }
}

async function expireInvites() {
  const expired = await pool.query(
    `UPDATE sessions s SET status = 'cancelled', ended_at = now()
     FROM (
       SELECT s2.id,
              (SELECT MAX(m.created_at) FROM chat_messages m WHERE m.session_id = s2.id) AS last_msg
       FROM sessions s2
       WHERE s2.status = 'scheduled'
         AND s2.created_at < now() - make_interval(hours => $1)
     ) x
     WHERE s.id = x.id
       AND (
         x.last_msg IS NULL
         OR x.last_msg < now() - make_interval(days => $2)
       )
     RETURNING s.id`,
    [INVITE_TTL_HOURS, CONVERSATION_IDLE_DAYS],
  );
  for (const { id } of expired.rows) {
    await resolveInviteTelegram(id, inviteStatusText("expired"));
  }
  if (expired.rows.length > 0) {
    console.log(`${expired.rows.length} ta javobsiz taklif bekor qilindi`);
  }
}

async function sweep() {
  await expireInvites();
  await expireWaitlist();
  await sweepLetters();

  const tooLong = await pool.query(
    `SELECT id FROM sessions
     WHERE status = 'active'
       AND COALESCE(started_at, created_at) < now() - make_interval(hours => $1)`,
    [MAX_SESSION_HOURS],
  );
  await endSessions(
    tooLong.rows.map((r) => r.id),
    `${MAX_SESSION_HOURS} soatdan uzoq`,
  );

  const candidates = await pool.query(
    `SELECT id FROM sessions
     WHERE status = 'active'
       AND COALESCE(started_at, created_at) < now() - make_interval(mins => $1)`,
    [GRACE_MINUTES],
  );

  const occupied = new Set<string>();
  try {
    const rooms = await roomService.listRooms();
    for (const room of rooms) {
      if (room.numParticipants > 0) occupied.add(room.name);
    }
  } catch (err) {
    console.error("LiveKit xonalarini olib bo'lmadi, tekshiruv o'tkazib yuborildi:", err);
    return;
  }

  const emptyNow = new Set<string>();
  const toEnd: string[] = [];
  for (const { id } of candidates.rows) {
    if (occupied.has(id)) continue;
    if (emptyLastSweep.has(id)) toEnd.push(id);
    else emptyNow.add(id);
  }
  emptyLastSweep = emptyNow;
  await endSessions(toEnd, "LiveKit xonasi bo'sh");
}

export function startSessionSweeper() {
  let running = false;
  const tick = () => {
    if (running) return;
    running = true;
    sweep()
      .catch((err) => console.error("Suhbat tozalovchida xato:", err))
      .finally(() => {
        running = false;
      });
  };
  tick();
  setInterval(tick, SWEEP_INTERVAL_MS).unref();
}
