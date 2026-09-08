# Dardkash.uz — Arxitektura va Dizayn Hujjati

## 1. Mahsulot qisqacha

Dardkash — odamlarni real vaqtli video/audio suhbat orqali "dardkash" (tinglovchi) bilan
bog‘laydigan platforma. Ikki rol: **dardini aytuvchi** va **dardkash**. MVP veb-saytda ishlaydi,
keyingi bosqichda Telegram bot login/bildirishnoma kanali sifatida qo‘shiladi.

## 2. Dizayn tizimi (Design Tokens)

**"Tabiiy boshpana"** (2026-09, ikkinchi versiya — birinchi "tungi suhbat" konsepsiyasidan
keyin). Brief mohiyati: o‘simlikka to‘la, tabiiy yorug‘lik tushgan xonada birov bilan
gaplashish hissi — iliq, yerga yaqin, lekin klinik yoki "startup SaaS" emas. Asosiy
kontent sahifalari (bosh sahifa, dashboard, onboarding, admin) kunduzgi va yorug‘;
suhbat (video-qo‘ng‘iroq) xonasi funksional sabab bilan (video kontrastda yaxshi
ko‘rinishi uchun, sanoat standarti) qorong‘i qolaveradi, lekin endi issiq
mox/ko‘mir rangida — sovuq tungi-ko‘k emas.

### Rang palitrasi

Tailwind token nomlari saqlanib qoldi (`tailwind.config.ts`), faqat qiymatlar
yangilandi:

| Nomi (token) | Hex | Rol |
|---|---|---|
| Sahar | `#EDEAE2` | Asosiy yorug‘ fon (kontent sahifalari) |
| Sahar-dim | `#E4DED0` | Ikkinchi darajali yorug‘ fon (bo‘limlarni ajratish) |
| Barg | `#5F7D5A` | **Asosiy urg‘u** — CTA tugmalar, fokus holati, "online" indikator, tanlangan holat (mox-yashil) |
| Barg-dim | `#4C6548` | Barg'ning hover/active holati |
| Yulduz | `#B4693F` | **Ikkinchi darajali urg‘u** — reyting yulduzchasi, dekorativ urg‘u (loy-rang) |
| Yulduz-dim | `#8F5233` | Yulduz'ning to‘qroq holati |
| Kul | `#2A2924` | Asosiy matn rangi (yorug‘ fonda) |
| G‘isht | `#A6503D` | Ogohlantirish / suhbatni tugatish / xato holatlar |
| Tun | `#1E1B15` | Qorong‘i fon — FAQAT suhbat (call room) xonasi va bosh sahifadagi "xavfsizlik" bo‘limi uchun |
| Tun-deep | `#131110` | Eng qorong‘i fon (footer, call room video maydoni) |

Izoh: iliq krem fon + terrakota — "AI dizayn"ning eng ko‘p uchraydigan andozasi
(shablon) bo‘lgani uchun bundan ataylab qochilgan: fon rangi toza krem emas,
kulrang tusli "tosh" (`#EDEAE2`), asosiy urg‘u esa apelsin/terrakota emas,
**mox-yashil** (`Barg`) — loy-rang (`Yulduz`) faqat ikkinchi darajali,
dekorativ urg‘u sifatida (masalan reyting yulduzchasi) ishlatiladi.

### Tipografika

- **Sarlavhalar:** `Fraunces` (serif, optical sizing) — insoniy, iliq, "qo‘lda yozilgandek"
  hissi beradi, klinik emas.
- **Interfeys/matn:** `Manrope` (sans-serif) — yumshoq geometriya, o‘qish uchun qulay,
  Fraunces bilan aniq farqlanadi.
- Sarlavhalarda faqat bitta so‘zni bo‘rttirish, ALL CAPS yorliqlar ishlatilmaydi.

### Layout tamoyili

- Hero: markazlashtirilmagan, chapga tekislangan matn + o‘ngda organik "ovoz to‘lqini"
  vizual elementi (SVG). Bu "matching" jarayonini — ikki ovozning bir-birini topishini
  ramziy ifodalaydi.
- Bo‘limlar orasida qattiq chiziqlar yoki soyalar emas, balki yumshoq to‘lqinsimon
  ajratgichlar (wave divider) ishlatiladi — audio-suhbat mavzusiga mos.
- Kartalarda bitta xil radius/shadow shabloni emas — dardkash profil kartalari boshqa,
  mavzu teglar boshqa vizual og‘irlikka ega.

### Prinsiplar

1. Xonaga kirgandek his qilish kerak — shoshilinch "sotuv" emas.
2. Bitta jasorat — ovoz to‘lqini motivi — butun saytda takrorlanadi, qolgani jim.
3. Har bir bo‘sh holat (empty state) yo‘naltiruvchi bo‘lsin: "Hozircha suhbat yo‘q" emas,
   balki "Birinchi suhbatingizni boshlang" kabi harakatga undovchi.

## 3. Texnik arxitektura

```
┌─────────────────────────────────────────────────────────┐
│                     Foydalanuvchi                        │
│              (Brauzer — Web, keyin Telegram)              │
└───────────────────────┬───────────────────────────────────┘
                         │
                 ┌───────▼────────┐
                 │  Nginx (VPS)   │  ← dardkash.uz, /api/* backend'ga proxy
                 └───────┬────────┘
                         │
        ┌────────────────┼──────────────────┐
        │                │                  │
┌───────▼───────┐ ┌──────▼────────┐ ┌───────▼────────┐
│  Next.js App  │ │  Express API  │ │    LiveKit     │
│ (App Router)  │ │ auth/db/token │ │ (self-hosted,  │
│  uz/ru i18n   │ │   (server/)   │ │ video/audio)   │
└───────────────┘ └──────┬────────┘ └────────────────┘
                         │
                 ┌───────▼────────┐
                 │   PostgreSQL   │
                 │  (dardkash-db) │
                 └────────────────┘
```

Hammasi Docker Compose orqali bitta VPS'da (Contabo) ishga tushiriladi;
har bir quti — frontend, backend, LiveKit, Postgres — alohida konteyner.

### Texnologiyalar

| Qatlam | Tanlov | Sabab |
|---|---|---|
| Frontend | Next.js 14 (App Router) + TypeScript | SSR → SEO, tezlik, bitta repo |
| Uslub | Tailwind CSS | Tez, tokenlarni CSS-variable orqali boshqarish oson |
| i18n | `next-intl` | App Router bilan yaxshi ishlaydi, URL-asosli lokal (`/uz`, `/ru`) |
| Backend | Node.js + Express + TypeScript | Supabase ishlatilmaydi — auth, baza, ruxsatlar noldan, o'rganish maqsadida |
| Auth | Google OAuth + Telegram Login Widget → JWT | O'z sessiya boshqaruvi, tashqi auth-provider'ga bog'lanmasdan |
| Baza | PostgreSQL (Docker, `dardkash-db`) | To'g'ridan-to'g'ri SQL, RLS o'rniga ilova (middleware) darajasidagi ruxsatlar |
| Video/Audio | LiveKit (self-hosted) | Ochiq kodli, kamera/mikrofon boshqaruvi tayyor SDK bilan keladi |
| Hosting | Contabo VPS + Docker + Nginx | Boshqa loyihalar bilan bir serverda, konteynerlar orqali izolyatsiya qilingan |

### Papka tuzilishi

```
src/
  app/
    [locale]/
      layout.tsx              # til provayderi, global shrift
      page.tsx                 # bosh sahifa (landing)
      auth/page.tsx             # kirish (Telegram/Google)
      onboarding/page.tsx       # profil to'ldirish, bosqichma-bosqich
      dashboard/page.tsx        # matching, "suhbat boshlash"
      session/[id]/page.tsx     # video/audio suhbat xonasi
      admin/moderation/page.tsx # moderator paneli
  components/
    ui/                         # Button, Card, Toast, TopicTag — qayta ishlatiladigan
    landing/                    # faqat bosh sahifaga tegishli bloklar
    dashboard/                  # ListenerCard
    onboarding/                 # OnboardingForm
    session/                    # ControlBar, FeedbackModal, ReportModal
  lib/
    topics.ts                   # mavzular kod-lug'ati (bazada kod, UI'da tarjima)
  i18n/
    config.ts / navigation.ts / request.ts   # next-intl sozlamalari
messages/
  uz.json / ru.json             # interfeys tarjimalari
server/
  src/
    auth/                       # google.ts, telegram.ts, jwt.ts, livekit.ts, middleware.ts
    db.ts                       # pg Pool + findOrCreateUser funksiyalari
    index.ts                    # barcha Express route'lar
  migrations/
    001_init.sql                # to'liq DB sxemasi
deploy/
  dardkash.uz.conf              # nginx konfiguratsiyasi
  DEPLOY.md                     # Contabo VPS'ga deploy qo'llanmasi
```

## 4. Ma'lumotlar bazasi (qisqacha, to'liq sxema `server/migrations/001_init.sql`da)

- `users` — har bir login usuli (Google/Telegram) shu jadvalga bog'lanadi
- `profiles` — foydalanuvchi profili (taxallus, yosh oralig'i, jins, til, telefon, rol)
- `listener_profiles` — dardkash sifatidagi qo'shimcha ma'lumot (bio, status:
  pending/approved/rejected — moderatsiya navbati shu status orqali boshqariladi,
  alohida jadval yo'q)
- `topics` — mavzular lug'ati (kod + tarjima kaliti, matn emas)
- `sessions` — suhbat yozuvlari (vaqt, ishtirokchilar, turi: video/audio/chat, holati)
- `session_ratings` — suhbatdan keyingi baholash (jadval bor, lekin backend'ga
  yozadigan route hali yo'q — qarang [`CLAUDE.md`](../CLAUDE.md))
- `reports` — "to'xtatish"/shikoyat hodisalari (jadval bor, route hali yo'q)

## 5. Xavfsizlik va maxfiylik tamoyillari (kod darajasida)

1. **Row Level Security emas — ilova darajasidagi ruxsat nazorati.** Har bir
   himoyalangan route `requireAuth` (JWT cookie tekshiruvi) va kerak bo'lsa
   `requireRole(["admin","moderator"])` middleware'laridan o'tadi
   (`server/src/auth/middleware.ts`).
2. Sessiya `dardkash_session` httpOnly cookie ichidagi JWT orqali (30 kun
   amal qiladi, hozircha bekor qilish/logout mexanizmi yo'q).
3. Telefon raqami faqat admin/moderator route'ida (`/api/admin/listeners/pending`)
   qaytariladi, oddiy foydalanuvchilarga ko'rinadigan `/api/listeners`da yo'q.
4. Har bir sahifada statik kризис-yordam matni (hozircha), keyinchalik AI-signal tizimi.
5. Matn suhbat (chat) hali amalga oshirilmagan — kelgusida qo'shilganda
   shifrlash/TTL qoidalari alohida belgilanadi.

## 6. Keyingi bosqichlar (roadmap)

Joriy holat va bilinigan kamchiliklar uchun [`CLAUDE.md`](../CLAUDE.md)ga qarang.

1. **MVP (hozir):** Next.js + Express sayt, UZ/RU, Google/Telegram auth, profil,
   moderatsiya navbati (qo'lda), LiveKit orqali video/audio.
2. **2-bosqich:** Suhbat (session) yaratish/matching endpoint'i, reyting va
   shikoyat backend'ga ulash, Telegram bot (login + bildirishnoma).
3. **3-bosqich:** Kризис-aniqlash mexanizmi (kalit so'z/AI tahlil + avtomatik yo'naltirish).
4. **4-bosqich:** "Mutaxassis" darajasi, pullik konsultatsiya, mobil ilova.
