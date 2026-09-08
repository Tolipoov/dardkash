# ===== 1-bosqich: bog'liqliklarni o'rnatish =====
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ===== 2-bosqich: build =====
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Build vaqtida kerak bo'lishi mumkin bo'lgan ochiq (public) o'zgaruvchilar
# docker-compose.yml orqali "build.args" sifatida uzatiladi.
ARG NEXT_PUBLIC_TELEGRAM_BOT_USERNAME
ENV NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=$NEXT_PUBLIC_TELEGRAM_BOT_USERNAME
ARG NEXT_PUBLIC_LIVEKIT_URL
ENV NEXT_PUBLIC_LIVEKIT_URL=$NEXT_PUBLIC_LIVEKIT_URL
# Faqat frontend va backend bitta domen ostida (nginx orqali) BIRLASHTIRIL-
# MAGAN muhitlar uchun (masalan lokal docker-compose) — productionda bo'sh
# qoldiriladi. Qarang: next.config.mjs, .env.example.
ARG NEXT_PUBLIC_API_ORIGIN
ENV NEXT_PUBLIC_API_ORIGIN=$NEXT_PUBLIC_API_ORIGIN
RUN npm run build

# ===== 3-bosqich: yakuniy, kichik ishga tushirish image'i =====
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# Xavfsizlik: root emas, alohida foydalanuvchi ostida ishlaydi
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
