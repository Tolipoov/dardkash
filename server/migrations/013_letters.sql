-- "Xat" rejimi (2026-10-22): yozma, kechikkan suhbat.
--
-- Ikkala tomon bir vaqtda onlayn bo'lishi shart emas: dardini aytuvchi xat
-- yozadi, mos dardkash uni oladi (`taken`) va javob yozadi, keyin ular
-- navbatma-navbat yozishadi. Yuzma-yuz yoki ovoz bilan gaplashishga
-- uyaladiganlar uchun ham eng oson kirish yo'li.
--
-- Fayl idempotent: fresh bazada docker-entrypoint-initdb.d orqali ham,
-- keyin migrate.ts orqali ham ishga tushishi mumkin.
CREATE TABLE IF NOT EXISTS letters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listener_id UUID REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'taken', 'closed', 'expired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  taken_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- O'qilmagan javoblarni ko'rsatish uchun: har tomon xatni oxirgi ochgan payt.
  author_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  listener_seen_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_letters_open ON letters (created_at) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_letters_author ON letters (author_id);
CREATE INDEX IF NOT EXISTS idx_letters_listener ON letters (listener_id);

CREATE TABLE IF NOT EXISTS letter_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  letter_id UUID NOT NULL REFERENCES letters(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_letter_messages_letter ON letter_messages (letter_id, created_at);
