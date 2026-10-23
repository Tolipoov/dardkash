-- Tasdiqlangan dardkashga saytdagi bir martalik "Tabriklaymiz" kartochkasi
-- (2026-10-23). Telegram ulanmagan dardkash tasdiqlanganini avval faqat
-- kabinetdagi kichik belgidan bilardi.
--
-- Fayl idempotent: fresh bazada docker-entrypoint-initdb.d orqali ham,
-- keyin migrate.ts orqali ham ishga tushishi mumkin.
ALTER TABLE listener_profiles ADD COLUMN IF NOT EXISTS welcome_seen_at TIMESTAMPTZ;
-- Allaqachon tasdiqlanganlarga kartochka kechikib chiqmasin.
UPDATE listener_profiles SET welcome_seen_at = now()
WHERE status = 'approved' AND welcome_seen_at IS NULL;
