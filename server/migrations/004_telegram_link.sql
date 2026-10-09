-- Google orqali kirgan foydalanuvchilarda users.telegram_id yo'q edi va
-- uni ulashning hech qanday yo'li yo'q edi — shu sabab ular (production'da
-- 4 ta tasdiqlangan dardkashdan 3 tasi) offlayn paytida kelgan qo'ng'iroq
-- va takliflar haqida Telegram xabarini hech qachon olmasdi.
--
-- Ulash oqimi: sayt bir martalik token yaratadi → foydalanuvchi
-- t.me/<bot>?start=<token> havolasini ochadi → bot webhook'i tokenni
-- tekshirib, telegram_id'ni shu hisobga yozadi.
CREATE TABLE IF NOT EXISTS telegram_link_tokens (
  token TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);

-- Taklif haqidagi Telegram xabarining manzili — taklifga saytda javob
-- berilganda (yoki boshqa yo'l bilan hal bo'lganda) Telegram'dagi eski
-- "Qabul qilish / Rad etish" tugmalarini yangi holat bilan almashtirish uchun.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS tg_chat_id BIGINT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS tg_message_id BIGINT;
