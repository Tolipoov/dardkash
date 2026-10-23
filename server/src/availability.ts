// Dardkashning odatiy bo'sh vaqti (009_listener_availability.sql).
// Hamma vaqt Toshkent bo'yicha: O'zbekistonda yozgi vaqt yo'q, doim UTC+5.
const TASHKENT_OFFSET_HOURS = 5;

export interface Availability {
  days: number[];
  from: number;
  to: number;
}

// `undefined` — noto'g'ri qiymat; `null` — bo'sh vaqtni olib tashlash.
export function parseAvailability(value: unknown): Availability | null | undefined {
  if (value === null) return null;
  if (typeof value !== "object") return undefined;
  const { days, from, to } = value as Record<string, unknown>;
  if (
    !Array.isArray(days) ||
    days.length === 0 ||
    !days.every((d) => Number.isInteger(d) && d >= 1 && d <= 7) ||
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    (from as number) < 0 ||
    (from as number) > 23 ||
    (to as number) < 1 ||
    (to as number) > 24 ||
    from === to
  ) {
    return undefined;
  }
  return {
    days: [...new Set(days as number[])].sort((a, b) => a - b),
    from: from as number,
    to: to as number,
  };
}

// Dardkash `dow` kunining `hour` soatida (Toshkent) odatda bo'shmi.
function isAvailableAt(a: Availability, dow: number, hour: number): boolean {
  if (a.from < a.to) return a.days.includes(dow) && hour >= a.from && hour < a.to;
  // Tun bo'yi: kechki qismi shu kunga, ertalabki qismi oldingi kunga tegishli.
  const prevDow = dow === 1 ? 7 : dow - 1;
  return (a.days.includes(dow) && hour >= a.from) || (a.days.includes(prevDow) && hour < a.to);
}

// Eng yaqin soat (hozirgisi ham), qachonki kamida bitta dardkash odatda bo'sh.
// `dayOffset` — bugundan necha kun keyin, `weekday` — 1..7, `hour` — 0..23.
export function nextAvailable(
  listeners: Availability[],
  now = new Date(),
): { inHours: number; dayOffset: number; weekday: number; hour: number } | null {
  if (listeners.length === 0) return null;
  const local = new Date(now.getTime() + TASHKENT_OFFSET_HOURS * 3600 * 1000);
  const startHour = local.getUTCHours();
  for (let h = 0; h < 24 * 8; h++) {
    const totalHours = startHour + h;
    const dayOffset = Math.floor(totalHours / 24);
    const hour = totalHours % 24;
    const weekday = ((local.getUTCDay() + 6 + dayOffset) % 7) + 1; // getUTCDay: 0 = yakshanba
    if (listeners.some((a) => isAvailableAt(a, weekday, hour))) {
      return { inHours: h, dayOffset, weekday, hour };
    }
  }
  return null;
}
