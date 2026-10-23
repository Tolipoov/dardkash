// Ro'yxat so'rovlarida `?limit=N`: frontend "Yana ko'rsatish"da sonni
// oshiradi va avtomatik yangilanishda ham shu sonni so'raydi — offset'dan
// farqli, yangi xabar kelib tartib o'zgarsa ham takror/tushib qolish yo'q.
// limit + 1 ta olinadi: ortiqchasi bor-yo'qligi `hasMore` bo'ladi.
export function parseListLimit(raw: unknown, fallback: number, max = 500): number {
  const n = Number.parseInt(String(raw ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, max) : fallback;
}
