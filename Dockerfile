# Render / VPS — Node 22, build once, serve via scripts/serve-worker.mjs (fast health check)
FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ curl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./

ENV NODE_OPTIONS=--max-old-space-size=1536
RUN npm ci --ignore-scripts --no-audit --no-fund

COPY . .

RUN npm rebuild better-sqlite3
# Dashboard env vars (incl. VITE_CLERK_PUBLISHABLE_KEY) are available during Render Docker builds
RUN npm run build

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV DATABASE_URL=file:/data/bookanai.db

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=5 \
  CMD sh -c 'curl -fsS "http://127.0.0.1:${PORT:-3000}/api/health" || exit 1'

CMD ["node", "scripts/serve-worker.mjs"]
