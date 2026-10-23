-- Suhbatdan OLDINGI kayfiyat (2026-10-22).
--
-- Keyingi kayfiyat avvaldan `session_ratings.mood`da bor edi (baholash
-- oynasi). Endi dardini aytuvchi suhbat boshida ham belgilaydi (1 — juda
-- og'ir ... 5 — yaxshi) — kabinetida "oldin → keyin" o'zgarishini ko'radi.
--
-- Fayl idempotent: fresh bazada docker-entrypoint-initdb.d orqali ham,
-- keyin migrate.ts orqali ham ishga tushishi mumkin.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS mood_before SMALLINT
  CHECK (mood_before BETWEEN 1 AND 5);
