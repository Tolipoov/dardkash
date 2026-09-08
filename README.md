# Dardkash.uz

Odamlarni real vaqtli video/audio/matn suhbat orqali tinglovchi ("dardkash")
bilan bog'laydigan platforma. To'liq arxitektura va dizayn tamoyillari uchun
[`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)ga, kod bo'yicha batafsil
kontekst va bilinigan kamchiliklar uchun [`CLAUDE.md`](./CLAUDE.md)ga qarang.

## Texnologiyalar

- **Frontend:** Next.js 14 (App Router) + TypeScript + Tailwind CSS
- **i18n:** `next-intl` — UZ/RU ko'p tillilik, `localePrefix: "as-needed"`
  (`dardkash.uz` — uz, `dardkash.uz/ru` — ru)
- **Backend:** Node.js + Express + TypeScript (`server/`) — **Supabase
  ishlatilmaydi**, auth/baza/ruxsatlar noldan, o'zimiz yozilgan
- **Baza:** PostgreSQL (Docker konteynerida, `dardkash-db`)
- **Auth:** Google OAuth va Telegram Login Widget, ikkalasi ham JWT
  (`dardkash_session` httpOnly cookie) orqali sessiya beradi
- **Video/Audio:** LiveKit (self-hosted, Docker orqali)

## Ishga tushirish (lokal)

```bash
npm install
cd server && npm install && cd ..
cp .env.example .env   # va o'zgaruvchilarni to'ldiring (pastga qarang)
```

Docker orqali (eng oson, production'dagi kabi):

```bash
docker compose up -d --build
```

Yoki Docker'siz, to'g'ridan-to'g'ri (tezroq, "hot reload" bilan — avval
PostgreSQL biror joyda ishlab turishi kerak):

```bash
# 1-terminal: frontend
npm run dev

# 2-terminal: backend
cd server && npm run dev
```

Batafsil qadamlar va lokal/Docker farqlari (masalan `DATABASE_URL`ning
host qismi) uchun [`CLAUDE.md`](./CLAUDE.md)dagi "Lokal ishga tushirish"
bo'limiga qarang.

## Muhit o'zgaruvchilari (`.env`)

To'liq va yangilangan ro'yxat [`.env.example`](./.env.example)da. Qisqacha:

| O'zgaruvchi | Tavsif |
|---|---|
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | PostgreSQL konteyneri uchun |
| `JWT_SECRET` | Sessiya token'ini imzolash uchun uzun tasodifiy matn |
| `APP_BASE_URL` | Frontend manzili (OAuth redirect va CORS uchun) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` | Google OAuth |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_BOT_USERNAME` / `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` | Telegram Login Widget |
| `NEXT_PUBLIC_LIVEKIT_URL` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | LiveKit video/audio |

## Ma'lumotlar bazasi

To'liq sxema [`server/migrations/001_init.sql`](./server/migrations/001_init.sql)da.
`docker compose up -d --build` bilan ishga tushirilganda, `dardkash-db`
konteyneri bu faylni **birinchi marta yaratilganda** avtomatik bajaradi
(`docker-entrypoint-initdb.d` orqali). Agar bazani Docker'siz ishlatsangiz,
faylni qo'lda bajarish kerak:

```bash
psql "$DATABASE_URL" -f server/migrations/001_init.sql
```

## Papka tuzilishi

```
src/app/[locale]/        → sahifalar (landing, auth, onboarding, dashboard, session, admin)
src/components/          → qayta ishlatiladigan UI va sahifaga xos komponentlar
src/lib/topics.ts        → mavzular kod-lug'ati (bazada kod, UI'da tarjima)
src/i18n/                → next-intl sozlamalari (config, navigation, request)
server/src/              → Express API: auth (Google/Telegram/JWT), db, routelar
server/migrations/       → PostgreSQL sxema fayllari
messages/uz.json,ru.json → barcha interfeys matnlari
deploy/                  → nginx konfiguratsiyasi va Contabo VPS'ga deploy qo'llanmasi
docs/ARCHITECTURE.md     → dizayn tizimi va texnik arxitektura
CLAUDE.md                → to'liq loyiha konteksti va bilinigan kamchiliklar ro'yxati
```

## Hozircha demo/mock yoki backend'ga ulanmagan qismlar

- Reyting/feedback (`FeedbackModal`) va shikoyat (`ReportModal`) — frontend
  bor, backend endpoint'i yo'q (`session_ratings`/`reports` jadvallariga
  yozish kerak)
- Suhbat (session) yaratish/matching endpoint'i yo'q — dashboard'dagi
  "suhbat boshlash" hozircha real session yaratmaydi
- Kризис-yordam mexanizmi — hozircha faqat statik matn
- Telegram bot (alohida bildirishnoma kanali) — hali qo'shilmagan

To'liq, fayl-qator darajasidagi kamchiliklar ro'yxati uchun
[`CLAUDE.md`](./CLAUDE.md)ga qarang.

## Deploy

Loyiha **Contabo VPS**ga Docker orqali deploy qilinadi (Vercel emas — bu
loyiha o'z backend'i, bazasi va LiveKit serveriga ega). To'liq qadamlar
[`deploy/DEPLOY.md`](./deploy/DEPLOY.md)da, nginx konfiguratsiyasi
[`deploy/dardkash.uz.conf`](./deploy/dardkash.uz.conf)da.
