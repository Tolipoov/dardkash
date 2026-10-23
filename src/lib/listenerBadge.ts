// Dardkash kartochkasidagi belgi: yangilar (kam suhbat) ham ko'rinsin —
// reytingi yo'qligi "yomon" degani emas, tajribalilar esa ajralib tursin.
export type ListenerBadge = "new" | "experienced" | null;

const NEW_UNDER_SESSIONS = 3;
const EXPERIENCED_SESSIONS = 10;
const EXPERIENCED_RATING = 4;

export function listenerBadge(sessionsCount: number, rating: number): ListenerBadge {
  if (sessionsCount < NEW_UNDER_SESSIONS) return "new";
  if (sessionsCount >= EXPERIENCED_SESSIONS && rating >= EXPERIENCED_RATING) return "experienced";
  return null;
}
