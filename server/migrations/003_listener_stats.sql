-- listener_profiles.rating_avg va sessions_count ustunlari 001_init.sql'dan
-- beri bor edi va /api/session/match ularga ko'ra tartiblardi (reyting →
-- yuk taqsimoti), lekin ularni YOZADIGAN birorta kod yo'q edi — hamma
-- dardkashda doim 0.0 / 0 turardi, ya'ni matching'ning 3- va 4-mezonlari
-- amalda ishlamasdi. Bu fayl ikkalasini haqiqiy ma'lumotdan qayta
-- hisoblaydigan funksiya qo'shadi (server suhbat tugaganda va baho
-- qo'yilganda chaqiradi) va mavjud ma'lumot uchun bir marta to'ldiradi.
--
-- Fayl idempotent: fresh bazada u docker-entrypoint-initdb.d orqali ham,
-- keyin migrate.ts orqali ham ishga tushishi mumkin.

-- Bitta suhbatga bir kishi faqat bitta baho qo'ya oladi. Avval bunday
-- cheklov yo'q edi — takroriy baholar o'rtachani buzardi. Mavjud
-- takrorlardan eng oxirgisi qoldiriladi.
DELETE FROM session_ratings r
USING session_ratings newer
WHERE r.session_id = newer.session_id
  AND r.rated_by = newer.rated_by
  AND (r.created_at, r.id) < (newer.created_at, newer.id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_session_ratings_session_rater
  ON session_ratings (session_id, rated_by);

-- FeedbackModal `stars` yubormaydi, faqat `listened` va `mood` — shuning
-- uchun 1-5 ball ulardan chiqariladi (stars bo'lsa, u ustun). Faqat
-- SPEAKER qo'ygan baho dardkash reytingiga ta'sir qiladi.
CREATE OR REPLACE FUNCTION refresh_listener_stats(p_listener UUID)
RETURNS void LANGUAGE sql AS $$
  UPDATE listener_profiles lp SET
    sessions_count = (
      SELECT COUNT(*) FROM sessions s
      WHERE s.listener_id = p_listener
        AND s.status = 'ended'
        AND s.started_at IS NOT NULL
    ),
    rating_avg = COALESCE((
      SELECT ROUND(AVG(score), 1) FROM (
        SELECT COALESCE(
          r.stars::numeric,
          (COALESCE(l.v, m.v) + COALESCE(m.v, l.v)) / 2.0
        ) AS score
        FROM session_ratings r
        JOIN sessions s ON s.id = r.session_id
        LEFT JOIN (VALUES ('yes', 5), ('partial', 3), ('no', 1))
          AS l(k, v) ON l.k = r.listened
        LEFT JOIN (VALUES ('much_better', 5), ('better', 4), ('same', 3), ('worse', 1))
          AS m(k, v) ON m.k = r.mood
        WHERE s.listener_id = p_listener
          AND r.rated_by = s.speaker_id
      ) scores
      WHERE score IS NOT NULL
    ), 0)
  WHERE lp.user_id = p_listener;
$$;

SELECT refresh_listener_stats(user_id) FROM listener_profiles;
