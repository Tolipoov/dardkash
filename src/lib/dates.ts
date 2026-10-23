// Ro'yxatlardagi qisqa sana: "21.10, 12:42". Brauzerlarning uz-UZ formati
// "10-21 12:42" (oy oldin, defis bilan) chiqarardi — tushunarsiz va tor
// joyda "10-" / "21 12:42" bo'lib sinardi. dd.mm ikkala tilda ham odatiy.
export function formatShortDate(value: string | number | Date): string {
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
