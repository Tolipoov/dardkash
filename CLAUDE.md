# Dardkash.uz — Loyiha haqida (Claude uchun kontekst fayli)

## Loyiha nima

Dardkash — odamlarni real vaqtli video/audio/matn suhbat orqali "dardkash"
(tinglovchi) bilan bog'laydigan platforma. Asosiy g'oya: "Ba'zan insonga
maslahat emas, uni chin dildan eshitadigan inson kerak."

Ikki rol: **dardini aytuvchi** (speaker) va **dardkash** (listener).
Har bir dardkash moderatsiyadan o'tishi shart (xavfsizlik uchun).

## Texnologiya stack

- **Frontend:** Next.js 14 (App Router) + TypeScript + Tailwind CSS
- **i18n:** next-intl, UZ/RU tillar, `localePrefix: "as-needed"`
  (asosiy til — uz — prefikssiz: `dardkash.uz`, boshqa til prefiks bilan:
  `dardkash.uz/ru`). Buning uchun `next/link`/`next/navigation` EMAS,
  albatta `@/i18n/navigation` dan `Link`/`useRouter`/`usePathname`
  ishlatiladi — aks holda til prefiksi noto'g'ri ishlaydi.
- **Backend:** Node.js + Express + TypeScript, **Supabase ISHLATILMAYDI**
  — hamma narsa (auth, baza, ruxsatlar) noldan, o'zimiz yozganmiz
  (ataylab shunday tanlangan, o'rganish maqsadida).
- **Baza:** PostgreSQL (Docker konteynerida, `dardkash-db`)
- **Auth:** Google OAuth va Telegram Login Widget, ikkalasi ham JWT
  (`dardkash_session` cookie, httpOnly) orqali sessiya beradi
- **Video/Audio:** LiveKit (self-hosted, Docker orqali), sub-domen
  `livekit.dardkash.uz` orqali WebSocket bilan ishlaydi

## Dizayn tizimi

2026-09-08'da rang palitrasi **"Tabiiy boshpana"** yo'nalishiga o'zgartirildi
(foydalanuvchi eski "tungi" palitrani zerikarli deb topgach) — mox-yashil
(`barg`) asosiy urg'u, loy-rang (`yulduz`) ikkinchi darajali, yorug' "tosh"
fon (`sahar`). Suhbat (call room) sahifasi ataylab qorong'i qolaveradi
(video uchun standart), lekin endi issiq ko'mir rangida. To'liq token
jadvali va tanlash jarayoni uchun `docs/ARCHITECTURE.md`ning 2-bo'limiga
qarang. Token NOMLARI o'zgarmadi (`tun`, `sahar`, `barg`, `yulduz`, `kul`,
`gisht`) — faqat `tailwind.config.ts`dagi hex qiymatlari va ba'zi
komponentlarning qaysi tokendan foydalanishi (masalan asosiy CTA tugma
endi `yulduz` emas, `barg`) yangilandi.

## Papka tuzilishi


## Lokal (kompyuterda) ishga tushirish

Bu kod GitHub'dan yoki serverdan nusxalangan bo'lishi mumkin. Kompyuteringizda
ishga tushirish uchun:

```bash
npm install
cd server && npm install && cd ..
```

`.env` faylini yarating (`.env.example`dan nusxalab):
```bash
cp .env.example .env
```

Va to'ldiring:
- `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` — o'zingiz o'ylab toping
- `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` — lokal test uchun Google Cloud
  Console'da alohida "Authorized redirect URI" qo'shish kerak bo'ladi
  (masalan `http://localhost:4000/api/auth/google/callback`)
- `JWT_SECRET` — istalgan uzun tasodifiy matn
- `LIVEKIT_*` — lokalda video sinash uchun alohida LiveKit konteyner kerak
  bo'ladi (yoki bu qismni hozircha o'tkazib yuborish mumkin)

Docker orqali ishga tushirish (eng oson yo'l, production'dagi kabi):
```bash
docker compose up -d --build
```

Yoki Docker'siz, to'g'ridan-to'g'ri (ishlab chiqish paytida tezroq, "hot reload" bilan):
```bash
# 1-terminal: frontend
npm run dev

# 2-terminal: backend (avval PostgreSQL biror joyda ishlab turishi kerak)
cd server && npm run dev
```

**Muhim:** lokal `.env`dagi `DATABASE_URL` Docker'dagidan farqli bo'ladi —
Docker'da host nomi `dardkash-db` (konteyner nomi), lokal to'g'ridan-to'g'ri
ishga tushirganda esa `localhost` bo'lishi kerak.

## Production serverga bog'liqlik

- **Server:** Contabo VPS (`/var/www/dardkash.uz`), boshqa loyihalar bilan
  bir serverda, Docker orqali izolyatsiya qilingan
- **Domenlar:** `dardkash.uz` (asosiy), `livekit.dardkash.uz` (video signal)
- **Deploy jarayoni:** kodni serverga yuklab (`git pull` yoki `rsync`),
  `docker compose up -d --build` bilan qayta quriladi
- Lokal o'zgarish qilgandan keyin: `git add . && git commit -m "..." && git push`,
  keyin serverda `git pull && docker compose up -d --build`

## Muhim eslatma / xatolardan saboqlar

1. **`next/link` yoki `next/navigation`dan `useRouter` hech qachon
   ishlatilmasin** — faqat `@/i18n/navigation` versiyasi, aks holda til
   prefiksi (`as-needed`) buziladi.
2. Next.js build paytida `server/` papkasini tekshirmasligi uchun
   `.dockerignore` va `tsconfig.json`da `exclude: ["server"]` bo'lishi shart.
3. `GROUP BY` ishlatilgan SQL so'rovlarda `ORDER BY` ustuni ham albatta
   `GROUP BY` ro'yxatida bo'lishi kerak (Postgres qat'iy talab qiladi).
4. LiveKit `keys:` bo'limidagi API secret kamida 32 belgidan iborat
   bo'lishi shart, aks holda server ishga tushmaydi.
5. Kamera/mikrofon topilmasa (`NotFoundError`), kod ulanishni to'xtatmasdan
   audio/video'siz davom etadi (`try/catch` alohida har biriga).
6. iOS/Safari avtomatik audio/video ijrosini bloklashi mumkin — foydalanuvchi
   birinchi marta ekranga bosishi kerak (`needsTap` holati orqali hal
   qilingan).
7. `alert()`/`confirm()` ISHLATILMAYDI — buning o'rniga
   `@/components/ui/Toast.tsx` (useToast hook) va maxsus modal komponentlar
   ishlatiladi.
8. `.env` va `livekit/livekit.yaml` fayllari HECH QACHON git'ga qo'shilmasin
   — `.gitignore`da allaqachon belgilangan, lekin yangi maxfiy fayl
   qo'shsangiz, shu faylga ham qo'shishni unutmang.

## Hozirgi holat (roadmap)

- ✅ Auth (Google + Telegram), JWT sessiya, ruxsatlar (requireAuth/requireRole)
- ✅ Onboarding → moderatsiya → dashboard → suhbat — to'liq ishlaydigan zanjir
- ✅ LiveKit orqali haqiqiy video/audio (asosiy oqim ishlayapti, sinovdan
  o'tmoqda)
- ✅ Suhbat (session) yaratish/tugatish (`POST /api/session/start`,
  `POST /api/session/:id/end`) — dashboard va ListenerCard shu orqali ishlaydi
- ✅ Reyting/feedback saqlash (`POST /api/session/:id/rating`) — FeedbackModal ulandi
- ✅ Shikoyat (report) saqlash (`POST /api/session/:id/report`) — ReportModal ulandi
- ✅ Matching algoritmi (`POST /api/session/match`) — til mosligi → mavzu
  kesishishi → reyting → suhbatlar soni (yuk taqsimoti) tartibida onlayn,
  tasdiqlangan va hozir band bo'lmagan dardkashlar orasidan tanlaydi.
  Dardkash holati (`is_online`) endi `POST /api/listeners/presence` orqali
  dashboard'ga kirganda/chiqqanda haqiqatan yangilanadi (avval bu ustun
  hech qachon `true` bo'lmasdi — CLAUDE.md'ning pastki bo'limiga qarang)
- ✅ Real-vaqtli qo'ng'iroq bildirishnomasi — dardkash onlayn bo'lsa,
  "suhbat boshlash" tugmasi bosilishi bilan dashboard'da darhol
  pulslanuvchi "Qo'ng'iroq" modali chiqadi (`/api/ws/notify` orqali,
  8-guruh #29ga qarang)
- ✅ Suhbat paytida yozishma (`chat_messages` jadvali, `/api/ws/chat`,
  `ChatPanel.tsx`) — avval `chat_messages` jadvali bazada umuman
  yo'q edi, shu sabab hech qachon ishlamagan (8-guruh #27ga qarang)
- ⏳ Kризис-yordam mexanizmi — hozircha faqat statik matn
- ⏳ Telegram bot (alohida bildirishnoma kanali)

## Topilgan muammolar (to'liq audit, 2026-09-08)

Loyiha to'liq ko'rib chiqildi (frontend, backend, Docker/nginx konfiglar,
hujjatlar). Pastda **zarar radiusi bo'yicha** tartiblangan ro'yxat — birinchi
guruh eng og'ir. Barcha punktlar ✅ TUZATILDI deb belgilanib, amalda ham hal
qilindi — **yagona istisno #3** (LiveKit sub-domeni `livekit.dardkash.uz`
uchun nginx konfiguratsiyasi): bu repo tashqarisidagi server/DNS/SSL
sozlamasini talab qiladi, shuning uchun faqat hujjatlashtirilgan, deploy
paytida qo'lda bajarilishi kerak.

### 1-guruh — production hozir ishlamaydi

1. **[✅ TUZATILDI] Port nomuvofiqligi:** `docker-compose.yml`da
   `dardkash-web` `127.0.0.1:3003:3000` ga bog'langan edi, lekin
   `deploy/dardkash.uz.conf` va `deploy/DEPLOY.md` `127.0.0.1:3001`ga proxy
   qilardi → production'da doim **502 Bad Gateway**. Ikkalasi ham `3001`ga
   moslashtirildi.
2. **[✅ TUZATILDI] `/api/*` uchun nginx marshruti yo'q edi:** frontend
   (`src/app/[locale]/auth/page.tsx`, `dashboard/page.tsx`, session sahifasi
   va h.k.) barcha backend chaqiruvlarini nisbiy `/api/...` yo'l bilan
   qiladi. `src/middleware.ts:12`dagi matcher `/api`ni ataylab chetlab
   o'tadi va `next.config.mjs`da `rewrites` yo'q, `src/app/api/` papkasi ham
   yo'q — demak `/api` so'rovlarini backend'ga (`dardkash-api:4000`) nginx
   darajasida yo'naltirish mo'ljallangan bo'lgan, lekin yozilmagan edi.
   Natijada Google/Telegram callback, `/api/me`, `/api/profile`,
   `/api/session/*/token` — hammasi production'da 404 qaytargan bo'lardi.
   `deploy/dardkash.uz.conf`ga `location /api/ { proxy_pass
   http://127.0.0.1:4000; }` bloki qo'shildi (HTTP va SSL namunasining
   ikkalasiga ham).
3. **`livekit.dardkash.uz` uchun nginx konfiguratsiyasi umuman yo'q** —
   `deploy/` papkasida faqat `dardkash.uz.conf` bor, LiveKit sub-domeni
   uchun alohida server bloki (WebSocket upgrade bilan) yozilmagan. Bu
   qo'lda hal qilinishi kerak — LiveKit konteyneri (`livekit/livekit.yaml`)
   va uning DNS/SSL/nginx sozlamalari repo tashqarisida ekan, deploy
   paytida eslab qolish kerak.

### 2-guruh — nol nuqtadan (fresh clone/deploy) ishga tushmaydi

4. **[✅ TUZATILDI] `dardkash-db` migratsiyani hech qachon bajarmaydi:**
   `docker-compose.yml`da faqat `dardkash-db-data` volume bor edi,
   `server/migrations/001_init.sql` hech qayerda ishga tushirilmasdi (na
   Postgres image'ning `docker-entrypoint-initdb.d` orqali, na
   `server/Dockerfile`/`index.ts` ichida). Sof `docker compose up -d
   --build`dan keyin baza bo'sh, jadval yo'q — `/api/me`, `/api/profile` va
   hokazo darhol 500 xato beradi. `docker-compose.yml`ga
   `./server/migrations:/docker-entrypoint-initdb.d:ro` volume qo'shildi
   (faqat konteyner birinchi marta yaratilganda ishlaydi — mavjud
   `dardkash-db-data` volume'ni o'chirib qayta yaratish kerak bo'lishi
   mumkin).
5. **[✅ TUZATILDI] `.env.example` haqiqatdan butunlay eskirgan edi** —
   faqat eski Supabase/LiveKit o'zgaruvchilarini o'z ichiga olardi
   (`NEXT_PUBLIC_SUPABASE_URL` va h.k.), CLAUDE.md'ning yuqorisida
   tavsiflangan haqiqiy talab qilinadigan o'zgaruvchilar
   (`POSTGRES_*`, `DATABASE_URL`, `JWT_SECRET`, `GOOGLE_CLIENT_*`,
   `APP_BASE_URL`, `TELEGRAM_BOT_*`, `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`,
   `LIVEKIT_*`) ro'yxatda yo'q edi — yangi klon qilgan odam ushbu faylni
   nusxalab to'ldirsa, loyiha ishlamas edi. To'liq ro'yxat bilan
   yangilandi.
6. **[✅ TUZATILDI] `APP_BASE_URL` bo'lmasa `undefined/dashboard`ga redirect
   xavfi bor edi.** `server/src/index.ts` boshiga `REQUIRED_ENV` ro'yxati
   qo'shildi — `JWT_SECRET`, `APP_BASE_URL`, `DATABASE_URL`, `GOOGLE_*`,
   `TELEGRAM_BOT_TOKEN`, `LIVEKIT_*` bo'lmasa, server ishga tushishning
   o'zida aniq xato chiqarib to'xtaydi (`process.exit(1)`), jim `as string`
   bilan yutilmaydi.
7. **[✅ TUZATILDI] Session cookie'da `secure: true` qattiq yozilgan edi**
   — bu HTTPS'siz (lokal `http://`) muhitda cookie saqlanmasligiga, ya'ni
   lokal login ishlamasligiga sabab bo'lardi. Endi `isProduction =
   process.env.NODE_ENV === "production"` orqali shartli (Google va
   Telegram callback'larining ikkalasida ham).

### 3-guruh — funksional to'g'irlik (ishlaydi, lekin noto'g'ri/yarim)

8. **[✅ TUZATILDI] Suhbat (session) yaratish endpoint'i yo'q edi.**
   `sessions` jadvali bor edi (`server/migrations/001_init.sql`), lekin uni
   to'ldiradigan birorta route yo'q edi — `ListenerCard`ning "suhbat
   boshlash" tugmasi tinglovchining user_id'sini sessionId deb yuborardi
   (doim 403), dashboard'dagi "qidirish" tugmasi esa soxta `/session/demo`ga
   o'tkazardi (`"demo"` UUID emas — 500 xato). Endi qo'shildi:
   - `POST /api/session/start` (`{ listenerId }`) — tinglovchi tasdiqlangan
     (`approved`) ekanini tekshiradi, `sessions` jadvaliga yozadi, `status:
     'active'`, `sessionId` qaytaradi (`server/src/index.ts`).
   - `POST /api/session/:sessionId/end` — qo'ng'iroq tugatilganda
     chaqiriladi (`session/[id]/page.tsx`ning `confirmEnd()`i), `status:
     'ended'`, `ended_at`ni yozadi.
   - `dashboard/page.tsx`: `startSessionWith()` haqiqiy so'rov yuboradi va
     qaytgan `sessionId`ga o'tkazadi; `ListenerCard`dagi "suhbat boshlash"
     ham shu funksiyaga ulandi; "qidirish" tugmasi endi fetch qilingan
     ro'yxatdagi birinchi **onlayn** tinglovchini tanlaydi (haqiqiy
     matching algoritmi emas, lekin endi ishlaydi va soxta emas — hali ham
     "avtomatik moslashtirish yo'q" holicha qoladi, faqat endi ochiq
     yolg'on demo emas).
9. **[✅ TUZATILDI] Toast context memoize qilinmagan edi** —
   `src/components/ui/Toast.tsx`da `<ToastContext.Provider value={{ push
   }}>` har render'da yangi obyekt yaratardi, bu `dashboard/page.tsx`dagi
   `useEffect(..., [router, toast])`ni potentsial cheksiz tsiklga
   tushirishi mumkin edi. `value`ni `useMemo(() => ({ push }), [push])`
   bilan o'raldi.
10. **[✅ TUZATILDI] `POST /api/profile` tranzaksiyasiz edi** — `profiles`
    UPSERT, `profile_topics` DELETE+INSERT, shartli `listener_profiles`
    UPSERT ketma-ket, `BEGIN/COMMIT` yo'q edi; o'rtada xato bo'lsa
    yarim-yangilangan profil qolardi. Endi `pool.connect()`dan olingan
    bitta `client` bilan `BEGIN`/`COMMIT`/`ROLLBACK` ichiga olindi. Shu
    bilan birga validatsiya qo'shildi: `nickname` (2-40 belgi), `ageRange`
    (bo'sh emas), `gender`/`wants` (ruxsat etilgan qiymatlar), `topics`
    (bo'sh bo'lmagan massiv, `topics` jadvalidagi haqiqiy kodlar bilan
    tekshiriladi), `bio` (dardkash bo'lsa 1-300 belgi) — noto'g'ri
    bo'lsa endi tushunarsiz 500 emas, aniq 400 xabari qaytadi.
11. **[✅ TUZATILDI] `server/src/auth/telegram.ts` hash'ni `!==` bilan
    solishtirardi** (timing-attack'ga ochiq) — `crypto.timingSafeEqual`
    bilan almashtirildi (uzunlik mos kelmasa avval qisqa yo'l bilan rad
    etiladi, `timingSafeEqual`ning o'zi uzunlik farqida xato tashlamasligi
    uchun).
12. **[✅ TUZATILDI] Google OAuth oqimida `state` parametri yo'q edi** —
    endi `/api/auth/google/start` tasodifiy `state` generatsiya qilib,
    qisqa muddatli (10 daqiqa) httpOnly cookie'da saqlaydi;
    `/api/auth/google/callback` qaytgan `state`ni cookie bilan solishtirib,
    mos kelmasa 400 qaytaradi (`server/src/auth/google.ts`,
    `server/src/index.ts`).
13. **[✅ TUZATILDI] Logout endpoint yo'q edi** — `POST /api/auth/logout`
    qo'shildi (`dardkash_session` cookie'sini tozalaydi). Dashboard
    sahifasiga "Chiqish" tugmasi qo'shildi (`messages/*.json`dagi
    `dashboard.logout` kaliti orqali).
14. **[✅ TUZATILDI] `admin/moderation` sahifasi 401 holatini alohida
    ushlamas edi** — endi 401'da `/auth`ga, 403'da toast ko'rsatib
    `/dashboard`ga yo'naltiradi (`load()` `useCallback` bilan o'ralib,
    `useEffect` dependency ogohlantirishi ham yo'qoldi).

### 4-guruh — o'lik kod va eskirgan hujjatlar

15. **[✅ O'CHIRILDI] `supabase/` papkasi butunlay o'lik edi** — eski
    Supabase-asosli arxitekturaning to'liq nusxasi (`supabase/schema.sql` +
    butun `src/`ning dublikati). Hech narsa uni import qilmasdi. Butunlay
    o'chirildi.
16. **[✅ O'CHIRILDI] `src/lib/supabase/client.ts` va `server.ts`** —
    asosiy `src/` ichida ham ishlatilmaydigan Supabase klientlari edi,
    o'chirildi. Shu bilan birga: `package.json`dagi
    `@supabase/supabase-js` va `@supabase/ssr` bog'liqliklari,
    `next.config.mjs`dagi `images.remotePatterns: **.supabase.co`,
    root `Dockerfile`dagi `NEXT_PUBLIC_SUPABASE_*` ARG/ENV'lari va
    `docker-compose.yml`dagi mos `build.args` qatorlari ham o'chirildi.
    `package-lock.json` `npm install` bilan qayta generatsiya qilindi
    (`tsc --noEmit` toza o'tdi, kodda boshqa hech qanday `supabase`
    iz qolmagani tekshirildi).
17. **[✅ YANGILANDI] `README.md` va `docs/ARCHITECTURE.md` ikkalasi ham eski
    (Supabase Auth+DB+Storage, Vercel deploy, `.env.local`) arxitekturani
    tasvirlardi.** Ikkalasi ham hozirgi haqiqiy stack (Next.js + Express +
    PostgreSQL + LiveKit + Docker + Contabo VPS)ga mos yangilandi —
    `docs/ARCHITECTURE.md`ning dizayn tizimi bo'limi (2-bo'lim) o'zgarishsiz
    qoldirildi, faqat texnik arxitektura/papka tuzilishi/baza/xavfsizlik/
    roadmap bo'limlari to'g'irlandi.
18. **[✅ TUZATILDI] `server/Dockerfile` frontend Dockerfile'idan orqada
    edi** — `npm install` (`npm ci` emas), yakuniy image'da to'liq
    devDependencies + root user. Endi frontend'dagi kabi 3 bosqichli:
    build → faqat production bog'liqliklari (`npm ci --omit=dev`) →
    yakuniy image alohida non-root (`dardkash`) foydalanuvchi ostida.
19. **[✅ TUZATILDI] `docker-compose.yml`da `dardkash-web` xizmati
    `networks: dardkash-net`ga kiritilmagan edi** (boshqa uchta xizmat
    kiritilgan edi) — qo'shildi, endi kelajakda `/api` Next.js `rewrites`
    orqali qilinsa ham `dardkash-api`ni DNS orqali topa oladi.

### 5-guruh — haqiqiy ishga tushirib sinashda topilgan (kod o'qishda ko'rinmagan) xato

Yuqoridagi hammasi kod o'qish orqali topilgan edi. Alohida seansda butun
stack (real PostgreSQL, real backend, real LiveKit server, ikkita real
Chrome — soxta kamera/mikrofon bilan) haqiqatan ishga tushirilib, ikkita
foydalanuvchi orasida video/audio qo'ng'iroq oxirigacha sinovdan
o'tkazildi. Backend API'ning barcha yo'llari (36 ta tekshiruv) xatosiz
ishladi, lekin **video oqimida faqat shu tarzda sinaganda ko'rinadigan
jiddiy xato topildi**:

20. **[✅ TUZATILDI] Suhbatga kechroq qo'shilgan tomon boshqa ishtirokchining
    videosini HECH QACHON ko'rmasdi.** Sabab —
    `src/app/[locale]/session/[id]/page.tsx`da uzoqdagi `<video>` elementi
    `{connecting ? <p>...</p> : <video ref={remoteVideoRef} .../>}` tarzida
    **shartli** render qilingan edi. Agar suhbatdosh siz xonaga kirishdan
    OLDIN allaqachon video/audio uzatib turgan bo'lsa, LiveKit SDK unga
    darhol (siz ulangan zahoti) avtomatik obuna bo'ladi va
    `RoomEvent.TrackSubscribed` hodisasini otadi — lekin bu payt
    `connecting` hali `true` bo'lgani uchun `<video>` elementi **DOM'da
    hali mavjud emas edi**, `remoteVideoRef.current` `null` bo'lardi, va
    kod jimgina hech narsa qilmasdi (video ilova qilinmasdi, xato ham
    chiqmasdi). Natijada: xonaga birinchi kirgan odam ikkinchisining
    videosini ko'radi, lekin ikkinchi bo'lib kirgan odam birinchisining
    videosini **hech qachon** ko'rmaydi — "Suhbatdoshingiz kutilmoqda..."
    holatida abadiy qolib ketadi. Bu ayni real ssenariy: bitta foydalanuvchi
    "suhbat boshlash"ni bosib sahifaga kirib turadi, ikkinchisi bir necha
    soniya/daqiqadan keyin qo'shiladi — ya'ni bu **har doim, tasodifiy
    emas** ro'y beradigan xato edi.
    Tuzatish: `<video ref={remoteVideoRef}>` endi `connecting`dan qat'i
    nazar har doim DOM'da render qilinadi ("Ulanmoqda..." va "Suhbatdoshingiz
    kutilmoqda..." matnlari endi video ustiga qo'yiladigan overlay sifatida
    ko'rsatiladi), shuning uchun `remoteVideoRef.current` component
    mount bo'lgan zahoti (har qanday `TrackSubscribed` hodisasidan oldin)
    tayyor bo'ladi.
21. **[✅ TUZATILDI] Component qayta o'rnatilganda (`sessionId` almashsa)
    eski video elementlar tozalanmasdi** — `useEffect` cleanup'ida faqat
    `room.disconnect()` chaqirilardi, video elementlarning `srcObject`si
    tozalanmasdi, ya'ni uzilgandan keyin ham oxirgi kadr "muzlab" ekranda
    qolib ketishi mumkin edi. Endi cleanup'da ikkala video elementning
    `srcObject`i ham `null`ga o'rnatiladi.

**Qo'shimcha e'tibor:** shu sinov davomida shuningdek aniqlandiki, LiveKit
`track.attach()` audio uchun elementni ataylab DOM'ga qo'shmaydi (SDK'ning
o'z ichki "recycled elements" dizayni) — bu xato emas, shunchaki
DOM-tekshiruvchi vositalar buni "ko'rmaydi"; WebRTC `getStats()` orqali
tekshirilganda audio paketlari ikkala tomonda ham barqaror oqib
turgani (soniyasiga ~40 paket, ikkala yo'nalishda ham) tasdiqlandi.

### 6-guruh — Matching algoritmi (yangi funksiya, ✅ qo'shildi va sinaldi)

Avval "Menga mos dardkash toping" tugmasi frontend'da fetch qilingan
ro'yxatdagi **birinchi onlayn** tinglovchini tanlardi — na mavzu, na til
hisobga olinardi. Endi to'liq backend'da hisoblanadigan real algoritm bor:

22. **`POST /api/session/match`** (`server/src/index.ts`) — ustuvorlik
    tartibida tanlaydi: (1) til mosligi (`profiles.language`), (2) mavzular
    kesishishi (`profile_topics` — nechta umumiy mavzu), (3) yuqoriroq
    reyting (`rating_avg`), (4) kamroq suhbatlar soni (yuk taqsimoti —
    doim bir xil "top" tinglovchiga hamma yugurmasin). Faqat `status =
    'approved'`, `is_online = true` va **hozir faol suhbatda bo'lmagan**
    (`sessions WHERE status='active'`da yo'q) dardkashlar orasidan
    tanlaydi. Hech kim topilmasa — 404 va tushunarli xabar.
    `dashboard/page.tsx`dagi `startSearch()` endi shu endpoint'ga so'rov
    yuboradi (avvalgi client-side "birinchi onlayn"ni tanlash mantig'i
    olib tashlandi).
23. **[✅ TUZATILDI, aslida yangi topilgan xato] `listener_profiles.is_online`
    hech qachon `true` bo'lmasdi.** Ustun bazada bor edi va
    `/api/listeners`/`/api/session/match` uni o'qirdi, lekin uni **yozadigan
    birorta ham route yo'q edi** — ya'ni "onlayn dardkashlar" ro'yxati
    productionda har doim bo'sh chiqqan bo'lardi. Endi `POST
    /api/listeners/presence` (`{ online: boolean }`) qo'shildi;
    `dashboard/page.tsx` tasdiqlangan dardkash sifatida sahifaga
    kirganda avtomatik `online: true` yuboradi, sahifadan chiqqanda
    (`beforeunload`, `navigator.sendBeacon` orqali) va "Chiqish" tugmasi
    bosilganda `online: false` yuboradi.
    **Bilinigan cheklov:** bu hozircha heartbeat/timeout'siz, eng oddiy
    usul — agar brauzer/qurilma kutilmagan tarzda (masalan tarmoq uzilishi,
    ilovani majburan yopish) o'chib qolsa, `sendBeacon` yetib bormasligi
    mumkin va foydalanuvchi bazada "onlayn" bo'lib qolaverishi mumkin.
    Keyingi bosqichda muntazam heartbeat (masalan har 30 soniyada) +
    so'nggi heartbeat'dan N daqiqa o'tgan bo'lsa avtomatik "offline"
    hisoblash qo'shilishi tavsiya etiladi.
24. Real Postgres'ga qarshi 10 ta stsenariy sinaldi va barchasi o'tdi:
    hech kim onlayn bo'lmaganda 404, `presence` validatsiyasi, `is_online`
    haqiqatan yozilishi, moslashtirish topilishi, **band (faol suhbatdagi)
    tinglovchi tanlanmasligi**, suhbat tugagach yana moslashtirilishi
    mumkinligi, va ikkita nomzod orasida **to'liq mavzu kesishishi
    yuqoriroq bo'lgan tinglovchi tanlanishi** (masalan speaker "family"+
    "work" tanlagan bo'lsa, ikkala mavzuni ham qamrab olgan tinglovchi
    faqat bittasini qamrab olgandan ustun qo'yiladi).

### 7-guruh — Dizayn tizimi yangilandi (✅) + yo'l-yo'lakay topilgan xato

25. **[✅ TUZATILDI] Butun rang palitrasi "Tabiiy boshpana" yo'nalishiga
    o'zgartirildi** — foydalanuvchi eski "tungi" palitrani "zerikarli"
    deb topgach, 3 ta dizayn yo'nalishi (Artifact orqali) taqqoslanib,
    biri tanlandi va `tailwind.config.ts`, `globals.css`,
    `VoiceWaveVisual.tsx`, `WaveDivider.tsx`, `Button.tsx`, bosh
    sahifaning hero qismi (`page.tsx`) orqali butun ilovaga qo'llandi.
    Batafsil — yuqoridagi "Dizayn tizimi" bo'limi va
    `docs/ARCHITECTURE.md`ning 2-bo'limi.
26. **[✅ TUZATILDI, yo'l-yo'lakay topilgan xato] `tailwind.config.ts`da
    `toastIn` keyframe'i noto'g'ri joyga yozilgan edi** — `keyframes: {
    pulseSoft: {...} }` obyektidan TASHQARIDA, alohida
    `theme.extend.toastIn` sifatida turardi (Tailwind buni tanimaydi).
    Natijada `animate-toast-in` klassi (`Toast.tsx`da ishlatiladi)
    hech qanday `@keyframes toastIn`ga bog'lanmagan edi — toast
    bildirishnomalari hech qachon "pastdan suzib chiqish" animatsiyasi
    bilan chiqmagan, shunchaki birdaniga paydo bo'lgan. Endi `toastIn`
    `keyframes {}` ichiga ko'chirildi.

### 8-guruh — To'liq audit (2026-09-08, ikkinchi tur): baza sxemasi va
real-vaqt qo'ng'iroq bildirishnomasi

Foydalanuvchi "suhbat qurish tugmasi bosilganda, dardkash onlayn bo'lsa,
haqiqiy qo'ng'iroq kabi bo'lishi kerak" va "suhbat paytida yozishma
ishlashi kerak" deb xabar berdi. Tekshiruv shuni ko'rsatdiki, bu ikkalasi
ham backend darajasida deyarli to'liq yozilgan edi (`/api/session/start`,
`/api/ws/notify`, `/api/session/:id/messages`, `/api/ws/chat`) — lekin ular
ishlamas edi, chunki **baza sxemasi ular kutgan ustun/jadvalga ega
emas edi**, va frontend hech qachon bildirishnoma socket'ini tinglamas edi.

27. **[✅ TUZATILDI, eng og'ir xato] `chat_messages` jadvali umuman
    yaratilmagan edi.** `server/migrations/001_init.sql`da bunday jadval
    yo'q, lekin `server/src/chat-ws.ts` va `POST/GET
    /api/session/:id/messages` (`server/src/index.ts`) uni birinchi
    kundan ishlatib kelayotgan edi. Natijada suhbat paytida xabar
    yozishga har qanday urinish — WebSocket orqali jim (frontend'ga hech
    qanday xato ko'rsatilmasdan, faqat server logiga yozilardi) yoki REST
    orqali 500 bilan — muvaffaqiyatsiz tugardi. Ya'ni "suhbat paytida
    yozishma" funksiyasi kodda to'liq yozilgan bo'lsa-da, birinchi
    xabardan boshlab ishlamasdi.
28. **[✅ TUZATILDI, eng og'ir xato] `listener_profiles.last_seen_at`
    ustuni umuman yaratilmagan edi.** `GET /api/listeners`, `POST
    /api/session/match` va `POST /api/listeners/presence` — uchalasi ham
    `lp.last_seen_at` ustuniga tayanadi (masalan "onlayn, lekin oxirgi 90
    soniyada heartbeat yubormagan" dardkashlarni oflayn hisoblash uchun),
    lekin `001_init.sql`da bu ustun yo'q edi. Natijada shu uchala so'rov
    ham har doim SQL xatosi bilan 500 qaytarardi — ya'ni "hozir onlayn
    dardkashlar" ro'yxati productionda har doim bo'sh chiqardi, va
    moslashtirish (`/api/session/match`) hech qachon ishlamasdi.
    Ikkalasi ham (#27, #28) yangi `server/migrations/002_chat_and_presence.sql`
    orqali tuzatildi. **Muhim:** `001_init.sql`ni tahrirlash mavjud
    (allaqachon yaratilgan) bazalarga ta'sir qilmaydi — u faqat Postgres
    konteyneri BIRINCHI marta yaratilganda ishga tushadi
    (`docker-entrypoint-initdb.d` orqali). Shu sabab `server/src/migrate.ts`
    qo'shildi — server har safar ishga tushganda `server/migrations/*.sql`
    papkasini tekshirib, hali qo'llanmagan fayllarni avtomatik qo'llaydi
    (qo'llangani `schema_migrations` jadvalida belgilanadi). Bu eski
    bazalarni ham, yangi klonlarni ham bir xil yo'l bilan to'g'irlaydi.
29. **[✅ TUZATILDI] Dashboard `/api/ws/notify` socket'ini hech qachon
    tinglamas edi.** Backend `POST /api/session/start` va `POST
    /api/invites` chaqirilganda `notifyUser()` orqali `incoming_call`/
    `new_invite` hodisasini socket bilan yuborardi (`server/src/notify-ws.ts`),
    lekin frontend'da BUTUN kodda birorta joy bu socket'ga ulanmasdi.
    Amalda bu shuni anglatardi: bir foydalanuvchi "suhbat boshlash"ni
    bossa, dardkash buni FAQAT quyidagi yo'llar bilan bilishi mumkin edi —
    Telegram xabari (agar Telegram ulangan bo'lsa) yoki dashboard sahifasini
    qo'lda yangilash (`incomingInvites` faqat sahifa ochilganda bir marta
    yuklanardi). Hech qanday "haqiqiy qo'ng'iroq" hissi yo'q edi. Endi
    `src/app/[locale]/dashboard/page.tsx` sahifaga kirilishi bilan
    `/api/ws/notify`ga ulanadi (uzilsa avtomatik qayta ulanadi) va
    `incoming_call`/`new_invite` kelganda darhol pulslanuvchi "Qo'ng'iroq"
    modalini (Qabul qilish/Rad etish, `respondToInvite()`ning o'ziga
    ulangan) ko'rsatadi — bir vaqtning o'zida taklif ro'yxatini ham
    yangilaydi.
30. **[✅ TUZATILDI] `docker-compose.yml`da `dardkash-web` porti yana
    nomuvofiq bo'lib qolgan edi** — 1-guruhdagi #1 xato ("3001ga
    moslashtirildi" deb yozilgan edi) aslida `docker-compose.yml`da hali
    ham `127.0.0.1:3003:3000` bo'lib qolgan ekan, `deploy/dardkash.uz.conf`
    esa hamon `3001`ga proxy qilardi — ya'ni docker-compose orqali
    ishga tushirilsa yana 502 Bad Gateway bo'lardi. `3001`ga qaytarildi.
31. **[✅ TUZATILDI] nginx'ning `/api/` bloki WebSocket upgrade
    sarlavhalarisiz edi.** `deploy/dardkash.uz.conf`da faqat `location /`
    (frontend) `Upgrade`/`Connection: upgrade` sarlavhalarini yuborardi;
    `location /api/` (backend, `/api/ws/chat` va `/api/ws/notify` ham shu
    prefiks ostida) buni yubormasdi — productionda bu ikkala socket ham
    umuman ulanmagan bo'lardi (WebSocket handshake oddiy HTTP javobiga
    aylanib qolardi). Ikkala sarlavha ham qo'shildi (jonli HTTP blokka va
    kelajakdagi SSL blok namunasiga), shu bilan birga `proxy_read_timeout
    3600s` — standart 60 soniyalik nginx timeout'i uzoq jim turadigan
    (masalan navbatdagi qo'ng'iroqni kutayotgan) socket'ni yopib
    yubormasligi uchun. Backend tomonida ham (`chat-ws.ts`, `notify-ws.ts`)
    30 soniyalik ping/pong keep-alive qo'shildi.
32. **[✅ TUZATILDI] Suhbat sahifasida (`session/[id]/page.tsx`) video
    ulanish effekti "npm run dev"da suhbatni darhol "tugagan" deb
    belgilardi.** Next.js'ning React Strict Mode'i (dev rejimida standart
    yoqilgan) effektlarni mount → cleanup → qayta mount tarzida ikki marta
    ishga tushiradi. Cleanup ichida `navigator.sendBeacon(.../end)`
    darhol yuborilardi — ya'ni suhbat "active" bo'lishi bilanoq, shu
    zumdayoq DB'da "ended" deb belgilanardi, va 3 soniyalik poll buni
    darhol payqab, foydalanuvchini "suhbat allaqachon tugagan" ekraniga
    otib yuborardi. Productionda (build qilingan, Strict Mode ta'sir
    qilmaydigan holatda) bu ko'rinmasdi, lekin lokal test qilishning
    o'zi imkonsiz edi. Endi `/end` chaqirig'i 300ms kechiktiriladi va
    effekt darhol qayta ishga tushsa (aynan shu ikkilanish holati) bekor
    qilinadi; haqiqiy tab yopish/yangilash uchun alohida `pagehide`
    tinglovchisi qo'shildi.
33. **[✅ TUZATILDI] Lokal ishga tushirishda (Docker'siz `npm run dev`,
    yoki hatto nginxsiz docker-compose) frontend'ning nisbiy `/api/...`
    so'rovlari umuman ishlamasdi** — chunki frontend va backend alohida
    portlarda turadi (masalan :3000 va :4000), production'dagidek ularni
    bitta domenga birlashtiruvchi nginx lokal muhitda yo'q. `next.config.mjs`ga
    shartli `rewrites()` qo'shildi: `NEXT_PUBLIC_API_ORIGIN` (`.env`da)
    berilgan bo'lsa, `/api/*` so'rovlari o'sha manzilga yo'naltiriladi;
    bo'sh bo'lsa (production'dagi kabi) hech narsa o'zgarmaydi. WebSocket
    ulanishlari (`ChatPanel.tsx`, dashboard) uchun ham xuddi shu
    o'zgaruvchidan foydalanadigan `src/lib/ws.ts` yordamchisi qo'shildi.
    `.env.example`, root `Dockerfile` va `docker-compose.yml` mos
    ravishda yangilandi.

**Xulosa:** #27 va #28 — bu audit davomida topilgan ENG OG'IR ikkita xato
edi, chunki ular "kod to'g'ri yozilgan, lekin baza uni qo'llab-quvvatlamaydi"
turkumiga kirardi — testdan o'tkazmasdan kod o'qish orqali payqash qiyin
(query sintaksisi to'g'ri, faqat bazada ustun/jadval yo'q). Bu xato turi
6-guruhdagi kabi "kod o'qishda ko'rinmaydigan, faqat ishga tushirib
sinaganda topiladigan" xatolarga misol.