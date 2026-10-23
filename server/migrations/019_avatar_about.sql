-- Profil: tayyor avatar va "o'zim haqimda" (2026-10-23).
--
-- `avatar` — tayyor rasmchalardan biri (kodi, masalan "tree"); haqiqiy rasm
-- ataylab yo'q (anonimlik, moderatsiya). `about` — dardini aytuvchining
-- ixtiyoriy qisqa matni, faqat u bilan aloqadagi dardkashga ko'rinadi.
--
-- Fayl idempotent: fresh bazada docker-entrypoint-initdb.d orqali ham,
-- keyin migrate.ts orqali ham ishga tushishi mumkin.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar TEXT CHECK (char_length(avatar) <= 20);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS about TEXT CHECK (char_length(about) <= 200);
