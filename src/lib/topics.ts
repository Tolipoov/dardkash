// Mavzular bazada KOD sifatida saqlanadi (masalan "family"), matn emas.
// Interfeysda `topics.<code>` tarjima kaliti orqali ko'rsatiladi (messages/uz.json, ru.json).
// Yangi kod qo'shsangiz: `topics` jadvaliga (migratsiya) va ikkala tarjima fayliga ham qo'shing.
export const TOPIC_CODES = [
  "family",
  "relationships",
  "parenting",
  "work",
  "study",
  "loneliness",
  "stress",
  "self_esteem",
  "health",
  "finance",
  "migration",
  "addiction",
  "grief",
  "other",
] as const;

export type TopicCode = (typeof TOPIC_CODES)[number];

// server/src/index.ts'dagi MAX_TOPICS bilan bir xil bo'lishi kerak.
export const MAX_TOPICS = 5;
