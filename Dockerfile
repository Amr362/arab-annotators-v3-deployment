# ============================================================
# AnnotateOS v4 — Dockerfile
# Multi-stage build: builder → production
# ============================================================

# ── Stage 1: Builder ─────────────────────────────────────────
FROM node:22-alpine AS builder

# Set pnpm version to match package.json
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.4.1 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
COPY patches ./patches
RUN pnpm install

COPY . .
RUN pnpm build

# ── Stage 2: Production ───────────────────────────────────────
FROM node:22-alpine AS production

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.4.1 --activate

WORKDIR /app

# Copy only production deps
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches
RUN pnpm install --prod

# Copy built output and config needed for production
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder /app/vite.config.ts ./vite.config.ts
COPY --from=builder /app/client/index.html ./client/index.html
COPY --from=builder /app/tsconfig.json ./tsconfig.json

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node -e "import('http').then(http => http.get('http://localhost:3000/api/health', (r) => {if (r.statusCode !== 200) process.exit(1)}))"

CMD ["sh", "-c", "pnpm db:migrate && node dist/index.js"]
