-- Shikoyatlar `reports` jadvaliga yozilardi, lekin ularni hech kim
-- ko'rmasdi va shikoyat qilingan foydalanuvchini to'xtatishning yo'li yo'q
-- edi (faqat qo'lda SQL). Bu fayl bloklash va shikoyatni yopish uchun
-- kerakli ustunlarni qo'shadi.
--
-- Fayl idempotent: fresh bazada docker-entrypoint-initdb.d orqali ham,
-- keyin migrate.ts orqali ham ishga tushishi mumkin.
ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_by UUID REFERENCES users(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_reason TEXT;

ALTER TABLE reports ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS resolved_by UUID REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_reports_unresolved ON reports (created_at) WHERE NOT resolved;
