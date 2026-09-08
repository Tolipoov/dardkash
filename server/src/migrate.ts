import fs from "fs";
import path from "path";
import type { Pool } from "pg";

// Oddiy, o'zimiz yozgan migratsiya bajaruvchi (Supabase/Prisma kabi
// tayyor vosita ishlatilmayapti — CLAUDE.md'dagi "hamma narsa noldan"
// tanloviga mos). `server/migrations/*.sql` papkasidagi fayllarni nomi
// bo'yicha tartiblab, hali qo'llanmaganlarini birma-bir, tranzaksiya
// ichida qo'llaydi va `schema_migrations` jadvaliga belgilab qo'yadi.
//
// MUHIM: bu funksiya server har safar ishga tushganda (`docker compose up`,
// `npm run dev`) chaqiriladi — shuning uchun eski, allaqachon mavjud
// bazalarga ham yangi migratsiyalarni (masalan 002_chat_and_presence.sql)
// avtomatik yetkazadi. `docker-entrypoint-initdb.d` orqali ishlaydigan
// 001_init.sql esa FAQAT Postgres konteyneri birinchi marta yaratilganda
// ishga tushadi — mavjud konteynerlar uchun bu funksiya yagona yo'l.
export async function runMigrations(pool: Pool): Promise<void> {
  const dir = path.join(__dirname, "..", "migrations");
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const appliedResult = await pool.query(
    "SELECT filename FROM schema_migrations",
  );
  const applied = new Set(appliedResult.rows.map((r) => r.filename as string));

  // 001_init.sql odatda Postgres'ning o'z docker-entrypoint-initdb.d
  // mexanizmi orqali to'g'ridan-to'g'ri (bu runner'dan tashqarida) ishga
  // tushgan bo'ladi — bazada jadvallar bor, lekin schema_migrations'da
  // yozuv yo'q. Buni qayta ishga tushirishga urinish "type already
  // exists" xatosi bilan yiqiladi, shuning uchun avval tekshirib,
  // allaqachon qo'llangan deb belgilab qo'yamiz.
  if (files.includes("001_init.sql") && !applied.has("001_init.sql")) {
    const check = await pool.query("SELECT to_regclass('public.users') AS reg");
    if (check.rows[0]?.reg) {
      await pool.query(
        "INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING",
        ["001_init.sql"],
      );
      applied.add("001_init.sql");
    }
  }

  for (const file of files) {
    if (applied.has(file)) continue;

    const sql = fs.readFileSync(path.join(dir, file), "utf-8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query(
        "INSERT INTO schema_migrations (filename) VALUES ($1)",
        [file],
      );
      await client.query("COMMIT");
      console.log(`✅ Migratsiya qo'llandi: ${file}`);
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(`❌ Migratsiya muvaffaqiyatsiz (${file}):`, err);
      throw err;
    } finally {
      client.release();
    }
  }
}
