-- Brauzer push-bildirishnomalari (2026-10-23): sayt yopiq bo'lsa ham
-- telefon/kompyuterga bildirishnoma — ayniqsa Telegram ulamaganlar uchun.
-- Bitta foydalanuvchida bir nechta qurilma (obuna) bo'lishi mumkin.
--
-- Fayl idempotent: fresh bazada docker-entrypoint-initdb.d orqali ham,
-- keyin migrate.ts orqali ham ishga tushishi mumkin.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions (user_id);
