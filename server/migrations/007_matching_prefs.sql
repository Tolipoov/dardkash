-- Moslashtirish (matching) uchun yangi profil maydonlari (2026-10-12).
--
-- 1) `profiles.languages` — avval til faqat sayt tilidan yashirincha
--    olinardi (`profiles.language`), ikki tilda gaplasha oladigan dardkash
--    faqat bittasiga mos tushardi. `language` ustuni o'z joyida qoladi
--    (interfeys tili), `languages` — suhbat tillari.
-- 2) `profiles.preferred_listener_gender` — jins avval yig'ilardi, lekin
--    hech qayerda ishlatilmasdi. Endi dardini aytuvchi "ayol/erkak dardkash"
--    tanlashi mumkin.
-- 3) `listener_topics` — "ikkalasi ham" rolida bitta `profile_topics`
--    ro'yxati ikki ma'noda ishlatilardi ("nima haqida gaplashmoqchiman" va
--    "nimada tinglay olaman"). Endi `profile_topics` — birinchisi,
--    `listener_topics` — ikkinchisi.
--
-- Fayl idempotent: fresh bazada docker-entrypoint-initdb.d orqali ham,
-- keyin migrate.ts orqali ham ishga tushishi mumkin.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS languages TEXT[] NOT NULL DEFAULT '{}';
UPDATE profiles SET languages = ARRAY[language] WHERE languages = '{}';

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS preferred_listener_gender TEXT NOT NULL DEFAULT 'any'
  CHECK (preferred_listener_gender IN ('any', 'male', 'female'));

CREATE TABLE IF NOT EXISTS listener_topics (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  topic_code TEXT REFERENCES topics(code),
  PRIMARY KEY (user_id, topic_code)
);

-- Mavjud dardkashlar hozirgi mavzulari bilan qoladi — hech kim ro'yxatdan
-- yoki moslashtirishdan tushib qolmaydi.
INSERT INTO listener_topics (user_id, topic_code)
SELECT pt.user_id, pt.topic_code
FROM profile_topics pt
JOIN listener_profiles lp ON lp.user_id = pt.user_id
ON CONFLICT DO NOTHING;
