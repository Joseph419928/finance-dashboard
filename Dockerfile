FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat openssl

FROM base AS deps
WORKDIR /app
COPY package*.json ./
# Copy the Prisma schema BEFORE install so the postinstall `prisma generate`
# finds it and downloads the engines into node_modules/@prisma/engines.
COPY prisma ./prisma
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL="postgresql://user:pass@localhost:5432/db"
RUN npx prisma generate
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Copy the full app + node_modules (includes Next, Prisma CLI and the generated
# query engine) so `next start` and `prisma db push` both work reliably.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.mjs ./next.config.mjs
COPY --from=builder /app/prisma ./prisma

EXPOSE 3000

# Sync schema, seed in the background (non-blocking), then start the Next server.
CMD ["sh", "-c", "node node_modules/prisma/build/index.js db push --skip-generate --accept-data-loss && { (node prisma/seed-prod.cjs || true) & echo '>>> starting next'; exec node node_modules/next/dist/bin/next start -H 0.0.0.0 -p ${PORT:-3000}; }"]
