// Mavzular bazada KOD sifatida saqlanadi (masalan "family"), matn emas.
// Interfeysda `topics.<code>` tarjima kaliti orqali ko'rsatiladi (messages/uz.json, ru.json).
export const TOPIC_CODES = [
  "family",
  "relationships",
  "work",
  "loneliness",
  "stress",
  "finance",
  "grief",
  "other",
] as const;

export type TopicCode = (typeof TOPIC_CODES)[number];
