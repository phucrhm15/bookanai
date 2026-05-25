# Self-host: Node 20 + SQLite on /data. Full stack (SSR + API + better-sqlite3).
# Cloudflare Workers: `npm run deploy` — SQLite not supported without D1 migration.
FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y python3 make g++ curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm rebuild better-sqlite3

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV DATABASE_URL=file:/data/bookanai.db

EXPOSE 3000
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
  CMD curl -f http://127.0.0.1:3000/api/health || exit 1

CMD ["npm", "run", "start:prod"]