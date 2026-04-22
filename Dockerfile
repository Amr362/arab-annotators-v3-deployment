# Build stage
FROM node:22-alpine AS builder
ARG VITE_GOOGLE_CLIENT_ID
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
COPY patches/ ./patches/
RUN npm install -g pnpm@10.4.1 && pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build

# Production stage
FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache dumb-init
COPY package.json pnpm-lock.yaml ./
COPY patches/ ./patches/
RUN npm install -g pnpm@10.4.1 && pnpm install --frozen-lockfile
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/drizzle ./drizzle
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
USER nodejs
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"
EXPOSE 3000
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
