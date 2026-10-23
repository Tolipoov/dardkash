// Tayyor avatarlar — haqiqiy rasm o'rniga (anonimlik saqlanadi). Kodlar
// bazada saqlanadi (`profiles.avatar`), server/src/index.ts'dagi
// AVATAR_CODES bilan bir xil bo'lishi kerak. Ikonka — Avatar.tsx'da.
export const AVATARS = [
  { code: "tree", bg: "bg-barg/20", fg: "text-barg-ink" },
  { code: "leaf", bg: "bg-barg/15", fg: "text-barg" },
  { code: "sprout", bg: "bg-barg-100", fg: "text-barg-ink" },
  { code: "flower", bg: "bg-gisht/15", fg: "text-gisht" },
  { code: "sun", bg: "bg-yulduz/25", fg: "text-yulduz-ink-2" },
  { code: "moon", bg: "bg-tun", fg: "text-yulduz" },
  { code: "star", bg: "bg-yulduz-100", fg: "text-yulduz-dim" },
  { code: "cloud", bg: "bg-sahar-dim", fg: "text-kul/70" },
  { code: "mountain", bg: "bg-kul/10", fg: "text-kul" },
  { code: "waves", bg: "bg-barg/10", fg: "text-barg-dim" },
  { code: "bird", bg: "bg-gisht/10", fg: "text-gisht" },
  { code: "feather", bg: "bg-yulduz/15", fg: "text-yulduz-dim" },
] as const;

export type AvatarCode = (typeof AVATARS)[number]["code"];

export function isAvatarCode(value: unknown): value is AvatarCode {
  return AVATARS.some((a) => a.code === value);
}
