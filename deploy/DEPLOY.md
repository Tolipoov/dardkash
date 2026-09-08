# Dardkash.uz — Contabo serverga joylashtirish (boshqa loyihalarga tegmasdan)

Bu qo'llanma serveringizda allaqachon Docker'da va oddiy (PM2/systemd) tarzda
ishlayotgan boshqa loyihalar borligini hisobga olib yozilgan. Har bir qadamda
**faqat shu loyihaga tegishli** fayllar yaratiladi/o'zgartiriladi.

## 0. Oldindan tekshirish (juda muhim)

Serverga SSH orqali kirib, quyidagilarni tekshiring — bu boshqa loyihalarga
zarar yetkazmaslik uchun:

```bash
# Docker o'rnatilganini tasdiqlash
docker --version
docker compose version

# 3001-port band emasligini tekshirish (agar band bo'lsa, docker-compose.yml
# va nginx konfida boshqa raqamga, masalan 3002 ga o'zgartiring)
sudo ss -tulpn | grep 3001

# Nginx bor-yo'qligini va sites-enabled papkasini tekshirish
nginx -v
ls /etc/nginx/sites-enabled/

# Boshqa loyihalaringiz qaysi domenlarda ekanini ko'rish (solishtirish uchun)
grep -r "server_name" /etc/nginx/sites-enabled/
```

Agar 3001-port band bo'lsa: `docker-compose.yml` faylida `"127.0.0.1:3001:3000"`
qatoridagi `3001` ni bo'sh portga almashtiring, va `deploy/dardkash.uz.conf`
faylidagi `proxy_pass http://127.0.0.1:3001;` qatorlarini ham mos ravishda
yangilang.

## 1. Kodni serverga yuklash

Lokal kompyuteringizdan (loyiha papkasi ichida turib):

```bash
rsync -avz --exclude node_modules --exclude .next ./ \
  root@SERVER_IP:/var/www/dardkash.uz/
```

Yoki agar loyiha GitHub'da bo'lsa, to'g'ridan-to'g'ri serverda:

```bash
sudo mkdir -p /var/www/dardkash.uz
sudo chown $USER:$USER /var/www/dardkash.uz
git clone <repo-manzili> /var/www/dardkash.uz
```

## 2. Muhit o'zgaruvchilarini sozlash

Serverda:

```bash
cd /var/www/dardkash.uz
cp .env.example .env
nano .env   # POSTGRES_*, JWT_SECRET, GOOGLE_*, TELEGRAM_*, LIVEKIT_* kalitlarini kiriting
```

## 3. Docker konteynerini qurish va ishga tushirish

```bash
cd /var/www/dardkash.uz
docker compose up -d --build
```

Tekshirish:

```bash
docker ps | grep dardkash-web        # konteyner "Up" holatda bo'lishi kerak
curl http://127.0.0.1:3001           # HTML qaytishi kerak
docker logs dardkash-web --tail 50   # xato bo'lsa shu yerda ko'rinadi
```

**Bu boshqa loyihalaringizga tegmaydi**, chunki:
- Konteyner nomi (`dardkash-web`) va tarmog'i (`dardkash-net`) faqat shu loyihaga tegishli, unikal.
- Port faqat `127.0.0.1` ga bog'langan — boshqa konteynerlar yoki tashqi dunyo bilan to'qnashmaydi.
- Boshqa `docker-compose.yml` fayllaringizga hech narsa qo'shilmaydi.

## 4. Nginx konfiguratsiyasi

```bash
sudo cp /var/www/dardkash.uz/deploy/dardkash.uz.conf /etc/nginx/sites-available/dardkash.uz
sudo ln -s /etc/nginx/sites-available/dardkash.uz /etc/nginx/sites-enabled/dardkash.uz

# ALBATTA sinab ko'ring — xato bo'lsa boshqa saytlar ham ishlamay qolishi mumkin
sudo nginx -t

# Faqat "syntax is ok" va "test is successful" chiqsa davom eting
sudo systemctl reload nginx   # "restart" EMAS — reload boshqa saytlarni uzmaydi
```

## 5. DNS

Domen provayderingizda (masalan Cloudflare yoki reg.uz) `dardkash.uz` va
`www.dardkash.uz` uchun **A record** yaratib, Contabo serveringizning
IP-manziliga yo'naltiring. Bu boshqa domenlaringizga ta'sir qilmaydi —
har bir domen alohida DNS yozuvi.

## 6. SSL sertifikat (HTTPS)

Agar Certbot allaqachon serverda o'rnatilgan bo'lsa (boshqa saytlar uchun
ishlatilgan bo'lsa), shunchaki yangi domen qo'shasiz:

```bash
sudo certbot --nginx -d dardkash.uz -d www.dardkash.uz
```

Bu **faqat** `dardkash.uz` uchun sertifikat oladi va faqat shu Nginx
faylini (`/etc/nginx/sites-available/dardkash.uz`) HTTPS bloki bilan
yangilaydi — boshqa domenlaringizning sertifikatlariga tegmaydi.

Agar Certbot hali o'rnatilmagan bo'lsa:

```bash
sudo apt update
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d dardkash.uz -d www.dardkash.uz
```

## 7. Tekshirish

Brauzerda `https://dardkash.uz` oching — sayt ochilishi kerak.

```bash
# Boshqa saytlaringiz hali ham ishlayotganini tasdiqlang
curl -I https://boshqa-loyihangiz.uz
```

## 8. Yangilanish qilish (keyingi safar)

```bash
cd /var/www/dardkash.uz
git pull   # yoki rsync bilan yangi fayllarni yuklash
docker compose up -d --build
```

Bu faqat `dardkash-web` konteynerini qayta quradi, boshqa konteynerlar
(Docker'dagi boshqa loyihalaringiz) tegilmaydi va ishlashda davom etadi.

## Muammo yuzaga kelsa

| Muammo | Tekshirish |
|---|---|
| Sayt ochilmayapti | `docker logs dardkash-web` va `sudo tail -f /var/log/nginx/error.log` |
| 502 Bad Gateway | Konteyner ishlamayapti — `docker ps` bilan tekshiring, `docker compose up -d` qayta bajaring |
| Boshqa sayt ishlamay qoldi | `sudo nginx -t` xato ko'rsatadimi tekshiring, agar shu loyiha konfida xato bo'lsa `sudo rm /etc/nginx/sites-enabled/dardkash.uz && sudo systemctl reload nginx` bilan vaqtincha o'chiring |
| Port band xatosi | `sudo ss -tulpn \| grep 3001`, boshqa portga o'zgartiring |
