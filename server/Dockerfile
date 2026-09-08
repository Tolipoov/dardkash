# ===== 1-bosqich: bog'liqliklarni o'rnatish va build =====
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ===== 2-bosqich: faqat production bog'liqliklari =====
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ===== 3-bosqich: yakuniy, kichik ishga tushirish image'i =====
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# Xavfsizlik: root emas, alohida foydalanuvchi ostida ishlaydi
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 dardkash

COPY --from=builder /app/package.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder --chown=dardkash:nodejs /app/dist ./dist
# migrations/ — dist/'ning yonida turishi shart (server/src/migrate.ts
# uni __dirname/../migrations orqali topadi), aks holda server ishga
# tushishda migratsiya fayllarini topa olmay yiqiladi.
COPY --from=builder --chown=dardkash:nodejs /app/migrations ./migrations

USER dardkash
EXPOSE 4000
CMD ["node", "dist/index.js"]
