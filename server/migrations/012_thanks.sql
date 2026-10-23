-- Rahmat xati (2026-10-22): dardini aytuvchi suhbatdan keyin dardkashga
-- qisqa minnatdorchilik yozadi — dardkash uni kabinetida (va Telegram'da)
-- ko'radi. Avvalgi `comment` maydoni faqat bazada qolardi, dardkash uni
-- hech qachon ko'rmasdi.
--
-- Fayl idempotent: fresh bazada docker-entrypoint-initdb.d orqali ham,
-- keyin migrate.ts orqali ham ishga tushishi mumkin.
ALTER TABLE session_ratings ADD COLUMN IF NOT EXISTS thanks TEXT
  CHECK (char_length(thanks) <= 300);
