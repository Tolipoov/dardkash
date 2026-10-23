-- Xatlar moderatsiyasi (2026-10-22).
--
-- pending — akkauntning birinchi xati, admin tasdiqlaguncha dardkashlarga
--           ko'rinmaydi (spam asosan yangi, bir martalik akkauntlardan);
-- hidden  — dardkash "spam" deb belgiladi, admin qaror qilguncha yashirin;
-- removed — admin rad etdi yoki spam deb tasdiqladi.
-- Spam tasdiqlansa, muallif 14 kun xat yoza olmaydi (`letters_blocked_until`).
--
-- Fayl idempotent: fresh bazada docker-entrypoint-initdb.d orqali ham,
-- keyin migrate.ts orqali ham ishga tushishi mumkin.
ALTER TABLE letters DROP CONSTRAINT IF EXISTS letters_status_check;
ALTER TABLE letters ADD CONSTRAINT letters_status_check
  CHECK (status IN ('pending', 'open', 'taken', 'closed', 'expired', 'hidden', 'removed'));
ALTER TABLE letters ADD COLUMN IF NOT EXISTS flagged_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE letters ADD COLUMN IF NOT EXISTS flagged_at TIMESTAMPTZ;

ALTER TABLE users ADD COLUMN IF NOT EXISTS letters_blocked_until TIMESTAMPTZ;
