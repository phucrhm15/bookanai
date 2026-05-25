# Render / VPS — Node 22. Runtime capped for 512MB free tier (avoid OOM → 502).
FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ curl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./

# High memory only during install/build (not kept for runtime)
RUN NODE_OPTIONS=--max-old-space-size=1536 npm ci --ignore-scripts --no-audit --no-fund

COPY . .

RUN npm rebuild better-sqlite3
RUN NODE_OPTIONS=--max-old-space-size=1536 npm run build

# 512MB Render Free — do not request 1.5GB heap at runtime
ENV NODE_ENV=production
ENV NODE_OPTIONS=--max-old-space-size=448
ENV HOST=0.0.0.0
ENV PORT=3000
ENV DATABASE_URL=file:/tmp/bookanai.db

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=90s --retries=5 \
  CMD sh -c 'curl -fsS "http://127.0.0.1:${PORT:-3000}/api/health" || exit 1'

CMD ["node", "scripts/serve-worker.mjs"]
