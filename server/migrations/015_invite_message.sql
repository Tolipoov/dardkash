-- Taklif bilan qisqa xabar (2026-10-22, foydalanuvchi taklifi): dardini
-- aytuvchi dardkashga taklif yuborganda nima haqida gaplashmoqchi ekanini
-- yoza oladi — xabar dardkashga saytda va Telegram'da ko'rinadi.
--
-- Fayl idempotent: fresh bazada docker-entrypoint-initdb.d orqali ham,
-- keyin migrate.ts orqali ham ishga tushishi mumkin.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS invite_message TEXT
  CHECK (char_length(invite_message) <= 300);
