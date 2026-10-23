// Umami hodisalari (skriptni nginx har bir sahifaga qo'shadi —
// /etc/nginx/snippets/umami.conf, panel: stats.tolipov.uz). Skript yo'q
// bo'lsa (lokal, bloklovchi kengaytma) — jimgina hech narsa qilmaydi.
// MUHIM: `data`ga shaxsiy ma'lumot (taxallus, matn, ID) qo'yilmaydi — faqat
// rol, natija kabi umumiy belgilar.
type EventData = Record<string, string | number | boolean>;

declare global {
  interface Window {
    umami?: { track: (event: string, data?: EventData) => void };
  }
}

export function track(event: string, data?: EventData) {
  try {
    window.umami?.track(event, data);
  } catch {
    // Analitika ixtiyoriy — xatosi sahifani buzmasin.
  }
}
