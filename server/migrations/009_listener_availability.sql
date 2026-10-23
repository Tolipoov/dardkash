-- Dardkashning odatiy bo'sh vaqti (2026-10-22).
--
-- Kartochkada "Odatda: Du–Ju, 20:00–23:00" ko'rinadi, onlayn dardkash
-- topilmasa esa "dardkashlar odatda bugun 20:00 dan bo'sh" deb aytiladi —
-- odam qachon qaytib kelishni biladi. Vaqt Toshkent bo'yicha (UTC+5),
-- kunlar ISO tartibida (1 = dushanba ... 7 = yakshanba). `available_from >
-- available_to` — tun bo'yi (masalan 22 → 2), `available_to = 24` — yarim tun.
--
-- Fayl idempotent: fresh bazada docker-entrypoint-initdb.d orqali ham,
-- keyin migrate.ts orqali ham ishga tushishi mumkin.
ALTER TABLE listener_profiles ADD COLUMN IF NOT EXISTS available_days SMALLINT[] NOT NULL DEFAULT '{}';
ALTER TABLE listener_profiles ADD COLUMN IF NOT EXISTS available_from SMALLINT
  CHECK (available_from BETWEEN 0 AND 23);
ALTER TABLE listener_profiles ADD COLUMN IF NOT EXISTS available_to SMALLINT
  CHECK (available_to BETWEEN 1 AND 24);
