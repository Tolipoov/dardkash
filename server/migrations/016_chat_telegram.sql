-- Taklif/suhbat yozishmasiga Telegram'dan javob (2026-10-22).
--
-- Ikkinchi tomon saytda bo'lmasa, yangi xabar unga Telegram'da boradi;
-- u o'sha xabarga Telegram'ning "Reply"i bilan javob qaytarsa, javob shu
-- jadval orqali qaysi suhbatga tegishli ekani aniqlanadi.
--
-- Fayl idempotent: fresh bazada docker-entrypoint-initdb.d orqali ham,
-- keyin migrate.ts orqali ham ishga tushishi mumkin.
CREATE TABLE IF NOT EXISTS chat_telegram_messages (
  tg_chat_id BIGINT NOT NULL,
  tg_message_id BIGINT NOT NULL,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tg_chat_id, tg_message_id)
);
