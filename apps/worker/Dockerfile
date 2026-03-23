# ── Stage 1: Builder ─────────────────────────────────────────────────────────
# Full monorepo install + build + pnpm deploy to produce a standalone prod bundle.
FROM node:22-alpine AS builder

# corepack activates the pnpm version declared in root package.json
RUN corepack enable

WORKDIR /app

# Copy manifests first so pnpm install is cached independently of source changes.
# All workspace members must be present for pnpm to resolve the workspace graph.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/config/package.json  ./packages/config/package.json
COPY packages/shared/package.json  ./packages/shared/package.json
COPY packages/database/package.json ./packages/database/package.json
COPY apps/bot-api/package.json     ./apps/bot-api/package.json
COPY apps/worker/package.json      ./apps/worker/package.json
COPY apps/admin-web/package.json   ./apps/admin-web/package.json

# Install all deps (devDeps included — required for TypeScript compilation).
RUN pnpm install --frozen-lockfile

# Copy source files after install to preserve the install cache layer.
COPY tsconfig.base.json ./
COPY packages/ ./packages/
COPY apps/worker/ ./apps/worker/

# Build workspace packages in dependency order, then worker.
RUN pnpm --filter @aqsha-ai/shared   build \
 && pnpm --filter @aqsha-ai/config   build \
 && pnpm --filter @aqsha-ai/database build \
 && pnpm --filter @aqsha-ai/worker   build

# Create standalone production deployment:
# - installs only prod deps (no devDeps)
# - copies workspace packages (with their built dist/) into node_modules
# - worker's own dist/ is NOT included; copied separately below
RUN pnpm --filter @aqsha-ai/worker deploy /deploy

# Copy the compiled app into the deployment bundle.
RUN cp -r ./apps/worker/dist /deploy/dist


# ── Stage 2: Runner ───────────────────────────────────────────────────────────
# Minimal runtime image — only the production bundle.
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy the standalone production bundle from the builder stage.
COPY --from=builder /deploy/node_modules ./node_modules
COPY --from=builder /deploy/dist         ./dist
COPY --from=builder /deploy/package.json ./package.json

# Worker is a background process — no port exposed.
CMD ["node", "dist/main.js"]
