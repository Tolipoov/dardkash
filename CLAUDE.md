# Dardkash.uz — Loyiha haqida (Claude uchun kontekst fayli)

## Loyiha nima

Dardkash — odamlarni real vaqtli video/audio/matn suhbat orqali "dardkash"
(tinglovchi) bilan bog'laydigan platforma. Asosiy g'oya: "Ba'zan insonga
maslahat emas, uni chin dildan eshitadigan inson kerak."

Ikki rol: **dardini aytuvchi** (speaker) va **dardkash** (listener).
Har bir dardkash moderatsiyadan o'tishi shart (xavfsizlik uchun).

## Texnologiya stack

- **Frontend:** Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS
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

1. **[✅ TUZATILDI, keyin 3003ga moslandi — #39] Port nomuvofiqligi:** `docker-compose.yml`da
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
    tartibida tanlaydi: (1) til mosligi (`profiles.languages`, 11-guruh #54), (2) mavzular
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

### 9-guruh — Uchinchi tur (2026-09-30)

34. **[✅ TUZATILDI] Kirmagan foydalanuvchi "ro'yxatdan o'tish" tugmasini
    bossa, onboarding bir lahza ko'rinib, keyin /auth'ga sakrardi.**
    `OnboardingForm`da 401'dan keyin `.finally()` darhol
    `checkingProfile=false` qilardi. Endi bosh sahifa tugmalari va header
    kirmagan odamni to'g'ridan-to'g'ri `/auth?next=...`ga olib boradi
    (`authHrefFor()`, `useLandingCta.ts`), onboarding esa yo'naltirish
    paytida hech narsa chizmaydi. `next`ga locale prefiksi (`/ru`) qo'shiladi.
35. **[✅ TUZATILDI] Telegram login `next`ni e'tiborsiz qoldirardi** (faqat
    Google cookie'sini o'qirdi) va `next` tekshirilmasdi (open redirect,
    `?next=@evil.com`). `safeNext()` qo'shildi.
36. **[✅ TUZATILDI] `rating_avg`/`sessions_count` hech qachon yozilmasdi**
    — matching'ning 3-4 mezonlari ishlamasdi. `003_listener_stats.sql`:
    `refresh_listener_stats()` funksiyasi (suhbat tugaganda va baho
    qo'yilganda chaqiriladi), `session_ratings(session_id, rated_by)`
    UNIQUE. Ball = `stars` yoki `listened`/`mood`dan 1-5.
37. **[✅ TUZATILDI] "Osilib qolgan" `active` suhbatlar** dardkashni matching'dan
    abadiy chiqarib qo'yardi (biri 22 kun turgan). `server/src/session-sweeper.ts`
    har daqiqada LiveKit xonalarini tekshiradi: ketma-ket 2 marta bo'sh →
    suhbat yopiladi; 4 soatdan uzoq bo'lsa baribir yopiladi.
38. **[✅ TUZATILDI] Rate limit yo'q edi** — `server/src/rate-limit.ts`
    (xotirada, bitta konteyner uchun yetarli). `trust proxy = 1`.
39. `/api/telegram-test` debug sahifasi o'chirildi; noto'g'ri `sessionId`
    endi 500 emas, 404 (`app.param`). Repodagi nginx namunasi porti
    serverdagi haqiqiy `3003`ga moslandi.
    **Qolgan:** chat WebSocket xabarlari rate limit'siz; kriziz-yordam statik.
40. **[✅ QO'SHILDI] Offlayn dardkashga Telegram orqali qo'ng'iroq/taklif
    xabari.** Kod avval ham Telegram yuborardi, lekin faqat Telegram orqali
    login qilganlarga (4 tasdiqlangan dardkashdan 3 tasida `telegram_id`
    yo'q edi) va onlayn bo'lsa ham. Endi: `server/src/call-notify.ts` —
    saytda bo'lmasa darhol Telegram, saytda bo'lsa modal + 30 soniyada
    javob bo'lmasa Telegram; saytda javob berilsa Telegram'dagi tugmali
    xabar holat matniga almashtiriladi (`sessions.tg_chat_id/tg_message_id`).
    Google foydalanuvchilari uchun dashboard'da "Telegram'ni ulash" banneri:
    `POST /api/telegram/link` → `t.me/<bot>?start=<token>` → webhook
    `/start <token>` → `users.telegram_id` (`004_telegram_link.sql`).
    Nickname endi `escapeHtml` qilinadi.
41. **[✅ TUZATILDI, eng og'ir] Ikkala WebSocket ham ishlamasdi.** `chat-ws.ts`
    va `notify-ws.ts` har biri `new WebSocketServer({ server, path })` bilan
    bitta HTTP serverga ulanardi — `ws` kutubxonasida bunday server o'z
    yo'liga mos kelmagan upgrade'ni **400 bilan uzadi**. Natija:
    `/api/ws/notify` doim 400 (dashboard qo'ng'iroq modali hech qachon
    chiqmagan, `isUserConnected` doim false), `/api/ws/chat` esa 101 olib
    darhol uzilardi (video paytida xabar "ulanish yo'q"). Endi ikkalasi
    `noServer: true` va `index.ts`dagi yagona `server.on("upgrade")`
    dispetcheri orqali. **Qoida: yangi WS qo'shsangiz, shu dispetcherga qo'shing.**
42. **[✅ TUZATILDI] Kamera o'chirib-yoqilgach o'z videosi ko'rinmasdi** — local
    `<video>` shartli render qilinardi; endi doim DOM'da +
    `RoomEvent.LocalTrackPublished`da qayta `attach`.
43. **[✅ YANGILANDI] Suhbat ekrani** — `fixed inset-0 h-[100dvh]` (header/footer
    ustidan), boshqaruv paneli lucide SVG ikonkalar bilan bitta qatorda
    (mikrofon, kamera, tugatish, yozishma + o'qilmagan belgisi, shikoyat),
    yozishma telefonda to'liq kenglikda. "Orqaga" tugmasi va tab yopish
    endi tasdiqsiz chiqarib yubormaydi (`popstate` + `beforeunload`).
44. **[✅ TUZATILDI]** Dashboard'dagi dardkashlar ro'yxati 15 soniyada va
    oynaga qaytilganda yangilanadi (avval yangi tasdiqlangan dardkash
    faqat sahifa yangilanganda ko'rinardi). `requireAuth` endi bazadan
    o'chirilgan foydalanuvchi cookie'sini 401 bilan rad etadi (avval FK
    xatosi bilan 500).


### 10-guruh — To'rtinchi tur (2026-10-09)

45. **[✅ TUZATILDI] Baholash oynasi 3 soniyada yo'qolardi** — suhbat sahifasida
    `status === "ended"` ekrani `ended` (FeedbackModal) tekshiruvidan oldin
    turardi, poll esa to'xtamasdi. Suhbatni ikkinchi tomon tugatsa, oyna umuman
    chiqmasdi (17 suhbatga 3 ta baho). Endi FeedbackModal birinchi tekshiriladi
    va `wasInCall` orqali ikkala tomonga ham chiqadi.
46. **[✅ TUZATILDI] API Postgres uzilganda yiqilardi** — `pool.on("error")` yo'q
    edi; `/api/me`, `requireRole` va Telegram webhook `try/catch`siz edi (Express 4
    async xatoni ushlamaydi). Qo'shildi: pool tinglovchisi, umumiy xato
    middleware'i, `unhandledRejection`. **Qoida: yangi async route — doim try/catch.**
47. **[✅ TUZATILDI] Javobsiz qo'ng'iroq abadiy `scheduled` qolardi.**
    `/api/session/:id/end` endi `scheduled` suhbatni `cancelled` qiladi va
    ikkinchi tomonga `call_cancelled` yuboradi (modal yopiladi, Telegram xabari
    yangilanadi). Kutish ekranida va "Yuborgan takliflar"da bekor qilish tugmasi.
    Sweeper 24 soatdan eski takliflarni bekor qiladi.
48. **[✅ TUZATILDI]** Admin'ga ariza xabarida nickname/bio/telefon va rad etish
    sababi `escapeHtml`siz edi — `<`/`&` bo'lsa Telegram xabarni rad etardi.
49. **[✅ QO'SHILDI] Shikoyat va bloklash.** Shikoyat endi admin Telegram'iga
    tugmalar bilan boradi (`report_ban:` / `report_ok:`), `/admin/moderation`da
    "Shikoyatlar" va "Bloklanganlar" bo'limlari bor. Bloklash
    (`server/src/moderation.ts`, `005_moderation.sql`, `users.banned_at`):
    `requireAuth` 401 `code: "banned"` qaytaradi, qayta login `/auth?blocked=1`ga
    tushadi, dardkash ro'yxat/matching'dan chiqadi, ochiq suhbatlari yopiladi.
    Admin/moderatorni bloklab bo'lmaydi. ReportModal'ga izoh maydoni qo'shildi.
    **Qolgan:** bloklangan odamni LiveKit xonasidan darhol chiqarish.
    (Kriziz/ishonch telefoni eslatmasi foydalanuvchi qarori bilan qo'shilmaydi —
    `session.crisisNote` ataylab bo'sh.)
50. **[✅ O'ZGARDI] Qo'ng'iroq bildirishnomasi butun saytda.** `/api/ws/notify`
    socket'i, qo'ng'iroq modali (endi ovoz bilan) va dardkashning "onlayn"
    heartbeat'i dashboard'dan `src/components/call/CallNotifier.tsx`ga
    (layout) ko'chdi — avval dardkash boshqa sahifada bo'lsa oflayn ko'rinardi.
    Sahifalar socket'ga o'zi ulanmaydi: `NOTIFY_EVENT` window hodisasini
    tinglaydi. Suhbat sahifasida modal chiqmaydi va heartbeat to'xtaydi.
    Barcha qattiq yozilgan o'zbekcha UI matnlari `messages/*.json`ga o'tdi,
    sahifa title/description endi tilga qarab (`meta` namespace).
    **Qoida: UI matni faqat `t()` orqali.**
51. **[✅ QO'SHILDI] SEO va xavfsizlik sarlavhalari (2026-10-09).**
    `src/app/robots.ts`, `src/app/sitemap.ts` (manzil — `src/lib/site.ts`).
    Noma'lum til segmenti (`/wp-login.php`, `/abc.txt`) endi 200 bilan bosh
    sahifa emas, haqiqiy 404 (`[locale]/layout.tsx`da `notFound()`,
    `src/app/not-found.tsx`). Jonli nginx'ga HSTS, `nosniff`,
    `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` va `www` →
    asosiy domen redirect qo'shildi; `deploy/dardkash.uz.conf` va yangi
    `deploy/livekit.dardkash.uz.conf` — serverdagi haqiqiy konfiglarning
    nusxasi (1-guruh #3 shu bilan hujjatlashtirildi). Backend `npm audit` toza.
    **Qolgan:** backup faqat shu serverda (tashqi nusxa yo'q).
52. **[✅ YANGILANDI] Next 14 → 16, React 18 → 19, next-intl 3 → 4.** Production
    `npm audit` ikkala tomonda ham toza. Next 16 farqlari: `params` endi
    `Promise` (`await params`); `src/middleware.ts` → `src/proxy.ts`;
    `next lint` yo'q — `npm run lint` = `eslint .` (`eslint.config.mjs`).
    Yangi lint qoidalari: render paytida `ref.current` yozilmaydi, effekt
    ichida sinxron `setState` chaqirilmaydi.

### 11-guruh — Ro'yxatdan o'tish formasi va matching maydonlari (2026-10-12)

53. **[✅ YANGILANDI] Onboarding formasi.** Telefon endi faqat dardkashdan,
    4-qadamda so'raladi (ixtiyoriy; avval maydonga bosib o'tilsa bazaga
    `"+998 "` saqlanardi — backend `normalizePhone()` bilan tekshiradi).
    Mavzular 8 → 14 ta (`006_onboarding_fields.sql`, `src/lib/topics.ts`),
    har ro'yxatda ko'pi bilan 5 ta (`MAX_TOPICS`). Bio kamida 30 belgi.
    Taxallus takrorlanmaydi (409 `nickname_taken`) + "tasodifiy taxallus"
    tugmasi. Yosh: `45+` → `45-54`/`55+`. Tugma nega o'chiqligi yozib
    turiladi (`stepProblem()`). `?edit=1` — hamma bo'lim bitta sahifada.
    `POST /api/profile` xatolari endi `code` qaytaradi
    (`onboarding.errors.<code>`).
    **Qoida: yangi cheklov eski ma'lumotni bloklamasin** — mavzular soni va
    bio uzunligi saqlangan qiymat o'zgarmagan bo'lsa tekshirilmaydi
    (frontend `saved`, backend `sameSet`/`previousBio`).
54. **[✅ QO'SHILDI] Matching uchun yangi maydonlar** (`007_matching_prefs.sql`):
    `profiles.languages` (suhbat tillari; `language` — interfeys tili bo'lib
    qoladi), `profiles.preferred_listener_gender` (`/api/session/match`da
    QAT'IY filtr — mos jinsdagi dardkash bo'lmasa 404), `listener_topics`
    (dardkash TINGLAYDIGAN mavzular; `profile_topics` — o'zi gaplashmoqchi
    bo'lganlari). `/api/listeners`, admin navbati va matching endi
    `listener_topics`ni o'qiydi.
    **Qolgan:** dashboard'dagi qo'lda tanlanadigan ro'yxat jins afzalligini
    hisobga olmaydi; `ListenerCard`da til/jins ko'rsatilmaydi.
55. **[✅ TUZATILDI] Emoji taxallus 500 xato berardi (2026-10-22).** Haqiqiy
    foydalanuvchi "🗿" kiritdi: JS `.length` uni 2 deb sanab o'tkazib yubordi,
    Postgres `char_length` esa 1 deb `profiles_nickname_check`da rad etdi —
    foydalanuvchi tushunarsiz "xatolik" ko'rib, profilsiz qoldi. Endi uzunlik
    ikkala tomonda ham `[...str].length` (belgi bo'yicha) sanaladi.
    **Qoida: bazadagi `char_length` CHECK'iga mos tekshiruv — doim `[...str].length`.**

### 12-guruh — Odamlarni jalb qilish (2026-10-22)

56. **[✅ QO'SHILDI] Kutish navbati** (`server/src/waitlist.ts`, `008_waitlist.sql`).
    Onlayn dardkash topilmasa (`/api/session/match` 404), dashboard
    "Navbatga yozilish"ni taklif qiladi (`POST /api/waitlist`). Mos dardkashlarga
    (tasdiqlangan, umumiy til, jins afzalligi) saytda `waitlist_new` socket,
    saytda bo'lmasa Telegram'da "🎧 Suhbatni olish" tugmasi (`wait_take:`,
    bitta dardkashga 15 daqiqada ko'pi bilan bitta xabar). Birinchi olgan
    dardkash (`POST /api/waitlist/:id/take`, `FOR UPDATE` — parallel bosishda
    faqat bittasi) darhol `active` suhbat yaratadi; dardini aytuvchiga
    `listener_found` modali + Telegram'da havola. Navbat 2 soatda `expired`
    (sweeper), bloklanganda yoki boshqa yo'l bilan suhbat boshlanganda
    `cancelled`; hal bo'lgach boshqa dardkashlardagi Telegram tugmalari
    olib tashlanadi (`waitlist_pings`). Telegram tugmalari endi `url` ham
    qabul qiladi (`telegram/bot.ts`).
    **Ehtiyot:** test paytida `pkill -f "<naqsh>"` ishlatmang — serverda
    boshqa loyihalarning Next.js konteynerlari ham bor; faqat aniq PID.
57. **[✅ QO'SHILDI] Dardkashning odatiy bo'sh vaqti** (`009_listener_availability.sql`,
    `server/src/availability.ts`, `src/lib/availability.ts`). Onboarding'ning
    dardkash qadamida kunlar + soat oralig'i (ixtiyoriy, Toshkent vaqti,
    `from > to` — tun bo'yi). Kartochkada "Odatda: Du–Ju, 20:00–23:00".
    Onlayn dardkash topilmaganda navbat taklifida
    `GET /api/listeners/next-available` asosida "dardkashlar odatda bugun
    20:00 dan bo'sh bo'ladi". `availability` yuborilmasa saqlangan qiymat
    o'zgarmaydi, `null` — olib tashlaydi.
58. **[✅ QO'SHILDI] Bosh sahifada jonli ma'lumot** (`GET /api/public/overview` —
    login'siz, 30 soniya kesh, IP bo'yicha rate limit). Hero ostida
    "Hozir N ta dardkash onlayn" yoki "dardkashlar odatda bugun 20:00 dan
    bo'sh" + tasdiqlangan dardkashlar soni (`LiveStatus.tsx`); "Tinglovchi
    qanday ko'rinadi" bloki tasdiqlangan dardkashlar bo'lsa 3 ta haqiqiy
    kartochkaga almashadi (`LiveListenerPreview.tsx`), aks holda namuna.
    Ochiq API faqat taxallus, mavzular, tillar, reyting, suhbatlar soni,
    onlayn holati va bo'sh vaqtni beradi (bio, yosh, telefon, ID yo'q).
59. **[✅ QO'SHILDI] Kayfiyat o'lchovi** (`010_mood_before.sql`, `MoodCheck.tsx`,
    `src/lib/mood.ts`). Dardini aytuvchi suhbat boshida (qo'ng'iroq kutish
    ekranida yoki suhbatdosh hali kirmagan paytda) 5 emoji'dan birini
    tanlaydi — `POST /api/session/:id/mood-before`, ixtiyoriy, bloklamaydi.
    Keyingi kayfiyat — FeedbackModal'dagi mavjud `mood`. Kabinetda so'nggi
    suhbatlar qatorida "😕 → 😊" va "N tadan M tasidan keyin yaxshiroq"
    xulosasi; bosh sahifada kamida 5 ta baho bo'lsa "suhbatdan keyin X%
    odam o'zini yaxshiroq his qilgan". `/rating` endi noto'g'ri qiymatga
    500 emas, 400 qaytaradi.
60. **[✅ QO'SHILDI] Saqlangan dardkashlar** (`011_favorites.sql`,
    `/api/favorites`). Kartochkada va so'nggi suhbatlar qatorida ♡ tugma,
    kabinetda "Saqlangan dardkashlaringiz" bo'limi (onlaynlar birinchi),
    baholash oynasida (dardini aytuvchi tomonida) "Bu dardkashni saqlash".
    Saqlangan dardkash oflayn → onlayn bo'lganda (`/api/listeners/presence`
    o'tishni aniqlaydi) saqlagan odamga, agar saytda bo'lsa, `favorite_online`
    toast'i — bir juftlikka 6 soatda ko'pi bilan bir marta (xotirada).
61. **[✅ QO'SHILDI] Dardkash rag'batlari** (`012_thanks.sql`). Baholash
    oynasida dardini aytuvchi dardkashga "rahmat xati" yozadi
    (`session_ratings.thanks`, ≤300 belgi; avvalgi `comment` dardkashga
    ko'rinmasdi) — dardkashga saytda `thanks_received` toast'i va Telegram
    xabari. Dardkash kabinetida "Sizning hissangiz" (`GET /api/listener/impact`:
    suhbatlar, reyting, nechta odam yengillik his qilgani, rahmat xatlari).
    Kartochkalarda "Yangi dardkash" (<3 suhbat) / "Tajribali" (≥10 suhbat,
    ★≥4) belgisi (`src/lib/listenerBadge.ts`). `/guide` — "Qanday yaxshi
    tinglash kerak" qo'llanmasi (onboarding qoidalari, kabinet, footer,
    sitemap).
62. **[✅ QO'SHILDI] "Xat" rejimi** (`013_letters.sql`, `server/src/letters.ts` —
    `/api/letters` router'i, `/letters` va `/letters/[id]` sahifalari).
    Yozma, kechikkan suhbat: muallif xat yozadi (≤2000 belgi, bir vaqtda ko'pi
    bilan 3 ta ochiq), mos dardkashlarga (til, jins afzalligi) saytda
    `letter_new` yoki Telegram'da havola (navbat bilan umumiy 15 daqiqalik
    cheklov); birinchi olgan dardkash (`/take`, atomar UPDATE) javob yozadi,
    keyin navbatma-navbat. Javob kelganda ikkinchi tomonga `letter_reply`
    (saytda bo'lmasa Telegram). "Yangi javob" belgisi `author_seen_at` /
    `listener_seen_at` orqali. Muallif yakunlaydi (`/close`), dardkash
    boshqasiga qoldiradi (`/release`), ikkalasi shikoyat qila oladi
    (`/report` → umumiy `fileReport()`, `moderation.ts`). Sweeper: 7 kunda
    hech kim olmagan xat `expired`; olingan, lekin 48 soatda javob yozilmagan
    xat qaytadan `open`. Kabinetda "Xat yozish" tugmasi, navbat taklifida
    "yoki xat yozing" havolasi, ochiq xatlar / yangi javob banneri.
    Sanalar endi raqamli oy bilan (`month: "2-digit"`) — brauzerlarda
    o'zbekcha qisqa oy nomlari yo'q, "M10" chiqardi.
63. **[✅ QO'SHILDI] Telegram Mini App.** Bot'ning `/start` javobida
    "📱 Dardkash'ni ochish" (`web_app`) tugmasi; sayt Telegram ichida ochilganda
    `TelegramMiniApp.tsx` (layout) URL hash'idagi imzolangan `tgWebAppData`ni
    `POST /api/auth/telegram-webapp`ga yuboradi → `verifyTelegramWebAppData()`
    (`auth/telegram.ts`, "WebAppData" HMAC; `signature` maydoni bilan ham,
    usiz ham tekshiriladi, 24 soat) → odatdagi `dardkash_session` cookie,
    bosh sahifadan ochilgan bo'lsa profil bo'yicha `/dashboard` yoki
    `/onboarding`. Telegram SDK skripti faqat Mini App ichida yuklanadi.
    **Cheklov:** Telegram Web (brauzer versiyasi) ilovani iframe'da ochadi —
    nginx'dagi `X-Frame-Options: SAMEORIGIN` va `SameSite=Lax` cookie buni
    bloklaydi; mobil/desktop Telegram ilovalari webview'da ochadi va ishlaydi.
    Menyu tugmasi BotFather'da qo'lda sozlanadi (Bot Settings → Menu Button →
    URL `https://dardkash.uz/`).
64. **[✅ QO'SHILDI] Xatlar moderatsiyasi** (`014_letter_moderation.sql`,
    foydalanuvchi qarori). Akkauntning birinchi xati (`open/taken/closed/expired`
    holatidagi xati hali yo'q bo'lsa) `pending` bo'lib, admin'ga Telegram'da
    `letter_ok:` / `letter_no:` tugmalari bilan boradi; keyingilari darhol
    `open`. Dardkash ochiq xatni (olmasdan) yoki o'zi olgan xatni "Spam" deb
    belgilaydi (`POST /api/letters/:id/flag`) → `hidden`, admin'ga
    `letter_spam:` (→ `removed` + `users.letters_blocked_until` = 14 kun,
    muallifning boshqa ochiq xatlari ham yopiladi) yoki `letter_restore:`.
    Cheklangan muallif `POST /api/letters`da 403 `letters_blocked`. 14 kunlik
    cheklov ataylab admin tasdig'i bilan (avtomatik emas) — xato bilan
    "spam" deyilgan chin xat egasi bloklanib qolmasin. Yozish oynasi ostida
    xatni kim o'qishi tushuntiriladi. `ADMIN_TELEGRAM_CHAT_ID` bo'lmasa
    moderatsiya o'tkazib yuboriladi.
65. **[✅ TUZATILDI] Header.** `public/logo.svg`ning viewBox'i rasmning
    o'ziga qirqildi (avval 1000×300 ichida rasm atigi 932×140 joyni egallardi —
    40px balandlikda belgi ~19px ko'rinardi); logo endi `h-7 sm:h-8 md:h-9`.
    Til almashtirgich, profil tugmasi va "Kirish" — hammasi `h-9`; telefonda
    profil tugmasida faqat bosh harf. Desktop menyu havolalari bir xil
    `text-sm font-medium` (avval biri mavjud bo'lmagan `text-md` edi).
66. **[✅ QO'SHILDI] Taklif bilan qisqa xabar** (`015_invite_message.sql`,
    foydalanuvchi taklifi). "Taklif yuborish" endi oyna ochadi — ixtiyoriy
    xabar (≤300 belgi, `sessions.invite_message`). Dardkash uni kabinetdagi
    takliflarda, qo'ng'iroq oynasida va Telegram xabarida (`call-notify.ts`)
    ko'radi. Xabar tekshirilmasdan borgani uchun xabarli taklifda
    "🚩 Shikoyat" bor: Telegram'da `invite_report:` callback, kabinetda —
    mavjud `/api/session/:id/report` + rad etish; ikkalasi ham taklifni
    bekor qilib, admin'ga shikoyat yuboradi.
67. **[✅ QO'SHILDI] Taklif xabariga javob (yozishma).** Taklif xabari
    `chat_messages`ga birinchi qator bo'lib yoziladi; dardkash kabinetdan
    "Javob yozish" (`/session/:id?chat=1` — yozishma darhol ochiq) yoki
    Telegram'da bot xabariga **Reply** qilib javob beradi. Barcha yozishma
    xabarlari endi `server/src/session-chat.ts`dagi `saveChatMessage()` orqali:
    saqlash → chat xonasiga yetkazish → ikkinchi tomon oynada bo'lmasa, saytda
    `chat_message` toast'i yoki Telegram (bir suhbatga 60 soniyada bitta,
    "Reply" uchun `chat_telegram_messages`ga yoziladi, `016_chat_telegram.sql`).
    Webhook bot xabarlariga qilingan Reply'ni admin'ga forward qilishdan
    OLDIN `handleTelegramChatReply()` bilan tekshiradi. Avval REST orqali
    yozilgan xabar chat xonasiga umuman yetib bormasdi — endi boradi.
68. **[✅ QO'SHILDI] Telegram'da "✍️ Javob yozish" tugmasi va saytdagi xabar
    kartochkasi** (foydalanuvchi talabi: "Reply'ni ko'pchilik bilmaydi").
    Taklif va yozishma bildirishnomalarida `chat_reply:<sessionId>` tugmasi →
    bot `force_reply` bilan javob so'raydi (yozish maydoni o'zi ochiladi) →
    keyingi oddiy xabar suhbatga yoziladi (`handleTelegramPendingReply`,
    xotirada, 10 daqiqa, bir martalik; `/`-buyruq bekor qiladi). Reply ham
    ishlayveradi. Saytda yozishma oynasi yopiq bo'lsa, `chat_message` endi
    qisqa toast emas — pastki burchakda kartochka (ism, matn, "Javob yozish",
    yengil signal, 20 soniya).
69. **[✅ QO'SHILDI] Qo'ng'iroqsiz yozishma sahifalari.** `/messages` (ro'yxat,
    `GET /api/conversations` — yozishmasi bor suhbatlar, 60 kun) va
    `/messages/[id]` (yorug' sayt ko'rinishida chat; taklifni qabul/rad
    qilish, bekor qilish, qo'ng'iroqqa qo'shilish tugmalari; yakunlangan
    suhbat — faqat o'qish). Chat ulanish mantig'i
    `src/components/session/useSessionChat.ts` hookiga ajratildi — qo'ng'iroq
    ichidagi `ChatPanel` ham shuni ishlatadi (bir xil xabarlar). Kabinetdagi
    "Javob yozish"/"Yozishma", xabar kartochkasi va Telegram'dagi
    "Yozishmani ochish" endi `/messages/[id]`ga olib boradi. Profil
    menyusida "Xabarlar" va "Xatlar".
70. **[✅ QO'SHILDI] O'qilmagan xabarlar soni va "✉️ Xabar yozish".**
    `017_chat_reads.sql` (`chat_reads` — kim yozishmani qachon o'qigan).
    `GET /api/unread` → yozishmalardagi o'qilmagan xabarlar + yangi javobli
    xatlar; sarlavhadagi profil tugmasida yashil doirachada son (`SiteHeader`:
    yangi xabarda, o'qilganda — `UNREAD_CHANGED_EVENT` — va har 30 soniyada
    yangilanadi), menyuda "Xabarlar"/"Xatlar" yonida, `/messages`
    ro'yxatida har bir yozishma uchun. Yozishma ochilganda (sahifa yoki
    qo'ng'iroq ichidagi ochiq panel — `useSessionChat(..., markRead)`) va
    odam o'zi yozganda (Telegram'dan ham, `saveChatMessage`) o'qilgan deb
    belgilanadi. Dardkash kartochkasida (onlayn bo'lsa ham) "✉️ Xabar
    yozish" → `POST /api/conversations` (qo'ng'iroqsiz, jiringlashsiz
    `scheduled` suhbat + yozishma bildirishnomasi) → `/messages/[id]`.
71. **[✅ YANGILANDI] Kabinet (dashboard) tablar bilan** (foydalanuvchi: "bardak
    bo'lib ketgan"). Tepada faqat e'tibor talab qiladiganlar (kelgan takliflar,
    boshlangan suhbatlar, navbat, yangi xat banneri, Telegram banneri,
    "Suhbatdosh kutayotganlar"); pastda tablar: Dardkashlar ("Hammasi /
    Onlayn / Saqlanganlar" filtri, onlaynlar birinchi), Takliflarim, Suhbatlar
    tarixi, Mening hissam (faqat dardkashga). `?tab=` orqali to'g'ridan-to'g'ri
    ochiladi. Kartochkada baho bo'lmasa "★ 0.0" ko'rsatilmaydi.
72. **[✅ QO'SHILDI] Bot xabarlari: tasdiq, rad etish, xush kelibsiz**
    (`server/src/listener-review.ts`, `018_listener_welcome.sql`). Sayt va
    Telegram tugmalari endi bitta `approveListener()`/`rejectListener()`
    orqali. Tasdiq xabari — 3 qadamli yo'riqnoma + "📱 Dardkash'ni ochish"
    (`web_app`), "📖 Qo'llanma", "🕒 Bo'sh vaqt" tugmalari; rad etishda —
    sabab va "✏️ Profilni tahrirlash". Telegram'da "❌ Rad etish" endi admin'dan
    sabab so'raydi (`force_reply`, keyingi xabar — sabab, "-" — sababsiz,
    10 daqiqa, `handleRejectReason` webhook'da admin chati uchun eng avval).
    Profil birinchi marta yaratilganda Telegram ulangan bo'lsa xush kelibsiz
    xabari (dardkash arizachisiga — "ariza moderatorga yuborildi"). Xabarlar
    `profiles.language` bo'yicha uz/ru. Telegram'siz dardkash uchun kabinetda
    bir martalik "🎉 Tabriklaymiz" kartochkasi (`/api/me` →
    `listener_welcome`, `POST /api/listener/welcome-seen`); migratsiya
    allaqachon tasdiqlanganlarni "ko'rgan" deb belgilaydi.
    **Test usuli:** `NODE_OPTIONS="--require mock-tg.cjs"` bilan `fetch`ni
    ushlab, Telegram'ga ketadigan so'rovlarni faylga yozib tekshirish mumkin.
73. **[✅ TUZATILDI] Telefonda sahifa o'ngga toshardi** (kabinet tablari
    qo'shilgandan beri, 420px'da kenglik 461px). Sabab: `body` — grid,
    `main` grid elementining `min-width: auto`si ichidagi aylantiriladigan
    tablar qatorining to'liq kengligini oldi. `[locale]/layout.tsx`da
    `<main className="min-w-0">`. Barcha asosiy sahifalar 375px'da tekshirildi.
74. **[✅ YANGILANDI] Next.js 16.4.0 → 16.4.2 (xavfsizlik, 2026-10-23).**
    `npm audit`: 16.0.0–16.4.0 da critical zaifliklar (Image Optimization va
    `use cache` orqali RCE, Server Actions DoS). Next 16.4.0 o'zi ham
    `next build`ni `SecurityFatalError` bilan to'xtatardi — ya'ni Docker
    build'i (deploy) yiqilardi. `next` va `eslint-config-next` 16.4.2 ga;
    production `npm audit` toza. Dev-bog'liqliklarda (`braces`,
    `postcss-selector-parser`) qolgan zaifliklar faqat `--force` bilan
    tuzaladi — jonli saytga kirmaydi, tegilmadi.
75. **[✅ QO'SHILDI] Dardkash arizasida "Telegram'ni ulang" qadami**
    (foydalanuvchi talabi: Google orqali kirganlar tasdiq va qo'ng'iroqlardan
    bexabar qolardi — 14 tasdiqlangan dardkashdan 5 tasida Telegram yo'q edi).
    Formaning 4-qadamida (faqat ulanmaganlarga) va "ariza ko'rib chiqilmoqda"
    ekranida tugma; ulangach `telegram_linked` socket hodisasi (yoki oynaga
    qaytilganda `/api/me`) bilan darhol "✓ Telegram ulandi". Majburiy emas —
    "tavsiya etiladi". `GET /api/profile` endi `telegramLinked` qaytaradi.
    Ulash funksiyasi `src/lib/telegramLink.ts`ga ajratildi (kabinet ham shuni
    ishlatadi).
76. **[✅ YANGILANDI] Telefonda tugmalar ixchamroq.** Bosh sahifa CTA'lari
    (`cta.ts`) telefonda 60-64px → ~48px (kompyuterda o'zgarmadi); `Button`
    primary soyasi 6px → 3px. Dardkash kartochkasida asosiy amal va
    "💬 Xabar" (ikonkali, chegarali) tugmasi bir qatorda — avval "Xabar yozish"
    oddiy matnga o'xshab bilinmasdi.
77. **[✅ QO'SHILDI] Profillar va avatarlar** (`019_avatar_about.sql`).
    - **Tayyor avatarlar** (`src/lib/avatars.ts`, `components/ui/Avatar.tsx` —
      12 ta tabiat ikonkasi, haqiqiy rasm ataylab yo'q: anonimlik, moderatsiya).
      Tanlanmagan bo'lsa — bosh harf. Sarlavha, kartochkalar, yozishmalar,
      suhbat ekrani, bosh sahifa. `tailwind.config.ts` endi `src/lib`ni ham
      skanerlaydi (avatar ranglari shu yerda).
    - **Dardkash profili** `/listeners/[id]` (`GET /api/listeners/:id/profile`,
      faqat tasdiqlangan): bio, mavzular, tillar, bo'sh vaqt, reyting,
      suhbatlar, rahmat xatlari SONI; yosh/jins/telefon yo'q. Kartochkadagi
      taxallus/avatar shu sahifaga olib boradi. Formada bio ostida "bu matn
      profilingizda hamma ko'radigan joyda chiqadi" izohi.
    - **Dardini aytuvchining mini-profili** (`GET /api/users/:id/mini-profile`,
      `SpeakerMiniProfile.tsx`) — FAQAT u bilan aloqadagi tasdiqlangan
      dardkashga (60 kun ichidagi suhbat/taklif/yozishma, olingan xat yoki
      navbatda turgan bo'lsa); boshqalarga 404. Avatar, yosh oralig'i, tillar,
      gaplashmoqchi bo'lgan mavzular, ixtiyoriy `profiles.about` (≤200).
      Ommaviy sahifa yo'q — anonimlik dardini aytuvchi uchun asosiy va'da.
78. **[✅ TUZATILDI] Qo'ng'iroqsiz yozishmalar 24 soatda "yakunlanib" qolardi.**
    `session-sweeper.ts`ning `expireInvites()` har qanday `scheduled` suhbatni
    24 soatda `cancelled` qilardi — "✉️ Xabar yozish"/xabarli taklif orqali
    boshlangan yozishmalar ham shunday suhbat, ya'ni odamlar yozishayotgan
    paytda suhbat "faqat o'qish" bo'lib qolardi (production'da 1 ta shunday
    holat bo'lgan). Endi yozishmasi bor `scheduled` suhbat oxirgi xabardan
    `CONVERSATION_IDLE_DAYS` (7) kun o'tmaguncha ochiq; xabarsiz javobsiz
    taklif — avvalgidek 24 soat.
79. **[✅ QO'SHILDI] Telegram'ni boshqa hisobdan ko'chirish** (`server/src/telegram-move.ts`).
    Odam avval Telegram, keyin Google orqali kirsa — ikki alohida hisob; Google
    hisobiga "Telegram'ni ulash" avval "boshqa hisobga bog'langan" deb to'xtardi.
    Endi: eski hisobning profili yo'q bo'lsa — so'ramasdan ko'chiriladi, bo'sh
    hisob o'chadi; aks holda bot eski/yangi taxallus bilan tasdiq so'raydi
    (`tg_move_yes` / `tg_move_no`, 10 daqiqa, faqat o'sha Telegram egasi).
    Google'siz eski hisobga endi kirib bo'lmagani uchun u `banUser()` bilan
    "Birlashtirildi: …" sababida yopiladi (ro'yxat/matching'dan chiqadi; admin
    "Bloklanganlar"da shu sabab bilan ko'rinadi). To'liq ma'lumot birlashtirish
    ataylab yo'q (o'nlab jadval — xavfli). To'qnashuvlar logga yoziladi.
80. **[✅ YANGILANDI] Profilni tahrirlash — tablar** (`?edit=1`): Asosiy /
    Suhbat / Dardkash profili, har bo'lim kartochkada, muammoli tabda qizil
    nuqta, "Saqlash" pastda yopishqoq (sticky). Avval hamma bo'lim bitta juda
    uzun sahifada edi.
81. **[✅ QO'SHILDI] Brauzer push-bildirishnomalari** (`020_push_subscriptions.sql`,
    `server/src/push.ts`, `public/sw.js`, `src/lib/push.ts`, `PushPrompt.tsx`,
    `src/app/manifest.ts`, `public/icon-192.png`/`icon-512.png`). VAPID kalitlari
    `.env`da (`VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT`; yo'q bo'lsa
    push o'chiq, boshqa hech narsa buzilmaydi). `pushIfOffline()` — foydalanuvchi
    saytda bo'lmasa (notify socket ulanmagan): qo'ng'iroq/taklif, yozishma xabari
    (Telegram bilan umumiy 60 soniyalik cheklov), xat javobi, yangi xat va
    "kimdir kutmoqda" (15 daqiqalik umumiy cheklov — endi Telegram'siz
    dardkashlarga ham), "dardkash topildi", ariza natijasi, rahmat xati. 404/410
    javobidagi obuna o'chiriladi. Kabinetda yopiladigan "Bildirishnomalarni
    yoqing" kartochkasi, profil tahrirlashda yoqish/o'chirish; iPhone'da "Bosh
    ekranga qo'shish" yo'riqnomasi (iOS faqat o'rnatilgan saytda push beradi).
    Kirishda obuna joriy hisobga bog'lanadi (`resyncPush`), chiqishda o'chiriladi.
    **Test usuli:** soxta HTTPS push serveri (`http_ece` bilan shifrni ochib)
    + `NODE_TLS_REJECT_UNAUTHORIZED=0` — headless brauzerda push xizmati yo'q.
82. **[✅ TUZATILDI] Profilsiz foydalanuvchi kabinetga tushib qolardi**
    (production'da topildi, 2026-10-23). Google'dan birinchi marta qaytgan
    yangi odam profilsiz `/dashboard`ga tushib, "Suhbatni boshlash"ni bosdi —
    suhbat yaratildi, lekin `GET /api/session/:id` (`profiles` bilan JOIN) 404
    berib, sahifa buzildi; "Xabar yozish" esa "Dardkash topilmadi" deb
    chalg'itdi. Endi: kabinet profilsizni `/onboarding`ga yuboradi; backend'da
    `requireProfile` (`/api/session/start`, `/api/invites`, `/api/session/match`,
    `/api/conversations` → 400 `no_profile`); suhbat ma'lumoti `LEFT JOIN`.
    Profilsiz odam `/onboarding?edit=1`dan kirsa ham — tablar emas, qadamma-qadam
    forma (`hasProfile`). Tahrirlashda "Saqlash" doim bosiladi: chala tab bo'lsa
    o'sha tab ochiladi, izohda "«Suhbat» bo'limida: …" (avval tugma sababsiz
    o'chiq turardi, sababi boshqa tabda yashirin edi).
83. **[✅ QO'SHILDI] Avtomatik integratsion testlar** (`server/tests/`,
    `cd server && npm test`, ~70 soniya, Docker kerak). Har safar vaqtinchalik
    Postgres konteyneri ko'tariladi, barcha migratsiyalar noldan qo'llanadi,
    backend mock Telegram bilan ishga tushadi (`mock-telegram.cjs`), oxirida
    hammasi o'chiriladi — jonli bazaga tegmaydi. Qamrov: profil validatsiyasi
    (emoji, telefon, takror taxallus, mavzular, avatar), profilsiz cheklov,
    maxfiylik (dardkash profili, mini-profil), navbat (parallel olish),
    yozishmalar (o'qilmaganlar, 24 soatlik tozalash), xatlar moderatsiyasi,
    Telegram ko'chirish, tasdiq xabari. `tests` Docker image'ga kirmaydi.
    **Qoida: yangi funksiya yoki tuzatish — shu yerga test qo'shing va deploy'dan
    oldin `npm test` ishga tushiring.**
84. **[✅ QO'SHILDI] Umami hodisalari** (`src/lib/analytics.ts`, `track()`).
    Umami skriptini nginx o'zi qo'shadi (`/etc/nginx/snippets/umami.conf`,
    panel stats.tolipov.uz). Hodisalar: `login_click`, `signup_completed`,
    `profile_updated`, `find_listener` (matched/none_online), `waitlist_joined`,
    `call_started`, `invite_sent`, `message_started`, `letter_sent`,
    `telegram_link_clicked`, `push_prompt`, `feedback_sent`. **Qoida: hodisa
    ma'lumotiga shaxsiy narsa (taxallus, matn, ID) qo'yilmaydi.**
    **Ochiq:** zaxira nusxani serverdan tashqariga chiqarish — bazada shaxsiy
    ma'lumot bor, shifrlash va manzil bo'yicha foydalanuvchi qarori kerak.
