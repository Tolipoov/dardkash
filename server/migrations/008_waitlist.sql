-- Kutish navbati (2026-10-22).
--
-- Avval onlayn dardkash bo'lmasa, "Hozircha mos dardkash yo'q" deyilardi va
-- odam shunchaki ketib qolardi. Endi u navbatga yoziladi, mos dardkashlarga
-- Telegram/sayt orqali "kimdir kutmoqda" xabari boradi, birinchi javob
-- bergan dardkash suhbatni oladi.
--
-- Fayl idempotent: fresh bazada docker-entrypoint-initdb.d orqali ham,
-- keyin migrate.ts orqali ham ishga tushishi mumkin.
CREATE TABLE IF NOT EXISTS waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  speaker_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting', 'taken', 'cancelled', 'expired')),
  session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
  taken_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

-- Bir odam bir vaqtda faqat bitta faol navbatda tura oladi.
CREATE UNIQUE INDEX IF NOT EXISTS waitlist_one_waiting
  ON waitlist (speaker_id) WHERE status = 'waiting';

-- Dardkashlarga yuborilgan Telegram xabarlari — navbat hal bo'lgach
-- ulardagi "Suhbatni olish" tugmasini olib tashlash uchun.
CREATE TABLE IF NOT EXISTS waitlist_pings (
  waitlist_id UUID NOT NULL REFERENCES waitlist(id) ON DELETE CASCADE,
  listener_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tg_chat_id BIGINT NOT NULL,
  tg_message_id BIGINT NOT NULL,
  PRIMARY KEY (waitlist_id, listener_id)
);

-- Bir dardkashga ketma-ket ko'p "kimdir kutmoqda" xabari ketmasligi uchun.
ALTER TABLE listener_profiles ADD COLUMN IF NOT EXISTS last_wait_ping_at TIMESTAMPTZ;
