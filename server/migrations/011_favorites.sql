-- Saqlangan dardkashlar (2026-10-22): yoqqan dardkash bilan qayta
-- gaplashish oson bo'lsin — kabinetda alohida ro'yxat, u onlayn bo'lganda
-- saytdagi bildirishnoma.
--
-- Fayl idempotent: fresh bazada docker-entrypoint-initdb.d orqali ham,
-- keyin migrate.ts orqali ham ishga tushishi mumkin.
CREATE TABLE IF NOT EXISTS favorite_listeners (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listener_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, listener_id)
);
CREATE INDEX IF NOT EXISTS idx_favorite_listeners_listener ON favorite_listeners (listener_id);
