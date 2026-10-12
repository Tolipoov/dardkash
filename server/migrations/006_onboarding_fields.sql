-- Ro'yxatdan o'tish formasi takomillashtirildi (2026-10-12).
--
-- 1) Mavzular ro'yxati kengaytirildi: 6 foydalanuvchidan 4 tasi "other"ni
--    tanlagan edi — ya'ni ro'yxat odamlarning haqiqiy dardini qamramasdi.
-- 2) Telefon maydoniga shunchaki bosib o'tib ketilsa, bazaga "+998 " (yoki
--    chala raqam) saqlanib qolardi — bunday qiymatlar tozalanadi.
--
-- Fayl idempotent: fresh bazada docker-entrypoint-initdb.d orqali ham,
-- keyin migrate.ts orqali ham ishga tushishi mumkin.
INSERT INTO topics (code, sort_order) VALUES
  ('parenting', 3), ('study', 5), ('self_esteem', 8), ('health', 9),
  ('migration', 11), ('addiction', 12)
ON CONFLICT (code) DO NOTHING;

UPDATE topics SET sort_order = 4 WHERE code = 'work';
UPDATE topics SET sort_order = 6 WHERE code = 'loneliness';
UPDATE topics SET sort_order = 7 WHERE code = 'stress';
UPDATE topics SET sort_order = 10 WHERE code = 'finance';
UPDATE topics SET sort_order = 13 WHERE code = 'grief';
UPDATE topics SET sort_order = 99 WHERE code = 'other';

UPDATE profiles SET phone = NULL
WHERE phone IS NOT NULL
  AND length(regexp_replace(phone, '\D', '', 'g')) <> 12;
