-- Chat xabarlari jadvali — hech qachon yaratilmagan edi, lekin backend
-- (server/src/chat-ws.ts va POST/GET /api/session/:id/messages,
-- server/src/index.ts) buni birinchi kundan ishlatib kelayotgan edi.
-- Natijada suhbat paytida xabar yozishga urinilganda har doim
-- "relation \"chat_messages\" does not exist" xatosi bilan yiqilardi —
-- WebSocket orqali jim (foydalanuvchiga hech qanday xato ko'rsatilmasdan,
-- chat-ws.ts'dagi try/catch faqat serverga log yozadi), REST orqali esa
-- 500 bilan.
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id),
  content TEXT NOT NULL CHECK (char_length(content) <= 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session
  ON chat_messages (session_id, created_at);

-- last_seen_at ustuni — /api/listeners, /api/session/match va
-- /api/listeners/presence barchasi "lp.is_online AND lp.last_seen_at >
-- now() - interval '90 seconds'" (yoki uni yozish) mantig'iga tayanadi,
-- lekin 001_init.sql'da bu ustun umuman yaratilmagan edi. Shu sabab
-- "hozir onlayn dardkashlar" ro'yxati (GET /api/listeners), moslashtirish
-- (POST /api/session/match) va holat yangilash (POST
-- /api/listeners/presence) — barchasi har doim 500 xato bilan yiqilardi,
-- ya'ni onlayn dardkash ro'yxati productionda doim bo'sh yoki xato
-- ko'rsatardi.
ALTER TABLE listener_profiles
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
