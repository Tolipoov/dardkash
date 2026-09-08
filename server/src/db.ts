import { Pool } from "pg";

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Google ID bo'yicha foydalanuvchini topadi, topilmasa yangi yaratadi
export async function findOrCreateGoogleUser(googleId: string, email: string) {
  const existing = await pool.query(
    "SELECT id FROM users WHERE google_id = $1",
    [googleId]
  );
  if (existing.rows.length > 0) return existing.rows[0].id as string;

  const inserted = await pool.query(
    "INSERT INTO users (google_id, email) VALUES ($1, $2) RETURNING id",
    [googleId, email]
  );
  return inserted.rows[0].id as string;
}

// Telegram ID bo'yicha foydalanuvchini topadi, topilmasa yangi yaratadi
export async function findOrCreateTelegramUser(telegramId: string) {
  const existing = await pool.query(
    "SELECT id FROM users WHERE telegram_id = $1",
    [telegramId]
  );
  if (existing.rows.length > 0) return existing.rows[0].id as string;

  const inserted = await pool.query(
    "INSERT INTO users (telegram_id) VALUES ($1) RETURNING id",
    [telegramId]
  );
  return inserted.rows[0].id as string;
}
