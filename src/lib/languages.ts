// Suhbat tillari bazada kod bilan saqlanadi ("uz", "ru") — foydalanuvchiga
// nomi bilan ko'rsatiladi. Noma'lum kod bo'lsa (kelajakda yangi til) — kodning o'zi.
export function languageNames(
  codes: string[],
  t: { (key: string): string; has(key: string): boolean },
): string {
  return codes.map((code) => (t.has(code) ? t(code) : code.toUpperCase())).join(", ");
}
