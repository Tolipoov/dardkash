// Dardkashning odatiy bo'sh vaqti — server/src/availability.ts bilan bir xil
// ko'rinish: kunlar 1 (dushanba) ... 7 (yakshanba), soatlar Toshkent vaqti,
// `from > to` — tun bo'yi, `to = 24` — yarim tun ("24:00" deb ko'rsatiladi).
export interface Availability {
  days: number[];
  from: number;
  to: number;
}

export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

export function formatHour(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

// "Du–Ju", "Du, Cho, Sha" yoki `everyDay`. `shortDay` — `days.<n>` tarjimasi.
export function formatDays(
  days: number[],
  shortDay: (day: number) => string,
  everyDay: string,
): string {
  const sorted = [...days].sort((a, b) => a - b);
  if (sorted.length === 7) return everyDay;
  const consecutive = sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1);
  if (consecutive && sorted.length >= 3) {
    return `${shortDay(sorted[0])}–${shortDay(sorted[sorted.length - 1])}`;
  }
  return sorted.map(shortDay).join(", ");
}
