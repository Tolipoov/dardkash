// Backend WebSocket manzilini quradi.
//
// Production'da nginx bitta domenda frontend (`/`) va backend (`/api/`)ni
// birlashtiradi, shuning uchun `window.location.host` yetarli.
//
// Lekin lokal ishga tushirishda (Docker'siz `npm run dev`, yoki
// docker-compose'ning o'zi — u yerda ham nginx yo'q) frontend va backend
// ALOHIDA portlarda turadi (masalan :3000 va :4000) — shu holatda
// `NEXT_PUBLIC_API_ORIGIN` (masalan `http://localhost:4000`) orqali
// backend'ga to'g'ridan-to'g'ri ulanish kerak.
export function buildWsUrl(path: string): string {
  const apiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN;
  if (apiOrigin) {
    return apiOrigin.replace(/^http/, "ws") + path;
  }
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}${path}`;
}
