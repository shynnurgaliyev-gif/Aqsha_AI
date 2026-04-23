FROM node:22-alpine AS base
RUN npm install -g pnpm@10

# ── Dependencies ──────────────────────────────────────────────────────────────
FROM base AS deps
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/config/package.json  ./packages/config/
COPY packages/database/package.json ./packages/database/
COPY apps/admin-web/package.json   ./apps/admin-web/
RUN pnpm install --frozen-lockfile

# ── Build ─────────────────────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules                        ./node_modules
COPY --from=deps /app/packages/config/node_modules        ./packages/config/node_modules
COPY --from=deps /app/packages/database/node_modules      ./packages/database/node_modules
COPY --from=deps /app/apps/admin-web/node_modules         ./apps/admin-web/node_modules
COPY . .

# Build shared packages first
RUN pnpm --filter @aqsha-ai/config build
RUN pnpm --filter @aqsha-ai/database build

ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_OUTPUT=standalone
ENV NEXT_TELEMETRY_DISABLED=1

RUN pnpm --filter admin-web build

# ── Runner ────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder /app/apps/admin-web/.next/standalone ./
COPY --from=builder /app/apps/admin-web/.next/static     ./apps/admin-web/.next/static
COPY --from=builder /app/apps/admin-web/public           ./apps/admin-web/public

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "apps/admin-web/server.js"]
