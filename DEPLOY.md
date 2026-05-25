# Triển khai Nano.Agent lên Internet

Hướng dẫn đưa **toàn bộ website** (landing, đăng nhập Clerk, Marketplace, Studio, Wallet, API x402, SQLite) lên production.

> **Host 0 đồng:** xem [FREE-HOSTING.md](./FREE-HOSTING.md) (Render Free — không cần thẻ; Oracle VPS free mãi nếu cần lưu SQLite lâu dài).

## Chọn nền tảng

| Cách | Phù hợp | SQLite / ledger |
|------|---------|-----------------|
| **Docker** (VPS, Render, Railway) | Khuyến nghị — đủ tính năng | Có (`/data/bookanai.db`) |
| **Docker + Caddy** | VPS có domain + HTTPS tự động | Có |
| **Cloudflare Workers** (`npm run deploy`) | Chỉ khi đã migrate DB sang D1 | Chưa hỗ trợ trong repo |

---

## Bước 1 — Chuẩn bị môi trường

```bash
cp .env.local.example .env.local
# Điền đủ: Clerk, Circle, MASTER_AGENT_PRIVATE_KEY, X402_DISCOVERY_URL

npm install
npm run setup:register-secret   # lần đầu
npm run setup:wallets
npm run init:master
npm run deploy:check            # kiểm tra biến trước khi deploy
```

**Master wallet (bắt buộc cho Studio):** nạp USDC + ETH gas trên Base:

```bash
npm run show:x402
```

---

## Bước 2A — VPS / máy chủ Linux (Docker + HTTPS)

### 2A.1 Cài Docker trên server

```bash
git clone <repo-url> bookanai && cd bookanai
cp .env.local.example .env.local
nano .env.local   # dán secret production
```

### 2A.2 Chạy app (HTTP port 3000)

```bash
docker compose up -d --build
curl -s http://localhost:3000/api/health
```

### 2A.3 HTTPS với domain (Caddy)

Trỏ DNS **A record** `app.yourdomain.com` → IP server.

```bash
export DOMAIN=app.yourdomain.com
docker compose -f docker-compose.prod.yml up -d --build
```

Site: `https://app.yourdomain.com`

**Hoặc Nginx + Certbot:** xem `nginx/bookanai.conf.example`.

---

## Bước 2B — Render.com (không cần VPS)

1. Đẩy repo lên GitHub.
2. [Render Dashboard](https://dashboard.render.com) → **New** → **Blueprint** → chọn repo (`render.yaml`).
3. Trong **Environment**, điền các secret (Clerk, Circle, Master key…).
4. Bật **Persistent Disk** mount `/data` (đã khai báo trong `render.yaml`).
5. Deploy → mở URL `https://nano-agent-xxxx.onrender.com`.

**Clerk:** thêm URL Render vào **Allowed origins** và redirect URLs.

---

## Bước 2C — Railway / Fly.io (tương tự)

- **Railway:** New Project → Deploy from GitHub → Dockerfile → mount volume `/data` → thêm env từ `.env.local`.
- **Fly.io:** `fly launch` + volume `bookanai_data` mount `/data`, `DATABASE_URL=file:/data/bookanai.db`.

---

## Bước 3 — Clerk (bắt buộc sau khi có domain)

Trong [Clerk Dashboard](https://dashboard.clerk.com) → Application → **Domains**:

| Mục | Giá trị |
|-----|---------|
| Home URL | `https://your-domain.com` |
| Sign-in redirect | `https://your-domain.com/marketplace` |
| Allowed redirect URLs | `https://your-domain.com/sign-in`, `/sign-up`, `/marketplace` |
| Allowed origins | `https://your-domain.com` |

Production nên dùng `pk_live_` / `sk_live_` thay cho `pk_test_`.

---

## Bước 4 — Cron settlement (production)

Tạo secret dài (≥16 ký tự) trong `.env.local`:

```env
SETTLEMENT_CRON_SECRET=your-long-random-secret
```

Gọi mỗi 5–15 phút (cron server, GitHub Actions, hoặc [cron-job.org](https://cron-job.org)):

```http
POST https://your-domain.com/api/cron/settle-batch
Authorization: Bearer <SETTLEMENT_CRON_SECRET>
```

Kiểm tra Master:

```http
GET https://your-domain.com/api/master/status
Authorization: Bearer <SETTLEMENT_CRON_SECRET>
```

---

## Bước 5 — Kiểm tra sau deploy

| URL | Kỳ vọng |
|-----|---------|
| `/` | Landing (EN mặc định, nút Tiếng Việt) |
| `/sign-up` | Form Clerk |
| `/api/health` | `{"ok":true,...}` |
| Đăng nhập → `/marketplace` | Marketplace |
| `/wallet` | Số dư + địa chỉ nạp USDC |

```bash
curl -s https://your-domain.com/api/health | jq
```

---

## Cloudflare Workers (tùy chọn, chưa đủ DB)

```bash
npx wrangler login
npm run build
cd dist/server
npx wrangler secret put CLERK_SECRET_KEY
# ... lặp cho từng biến trong .env.local
npx wrangler deploy
```

Workers **không** chạy `better-sqlite3` local — cần D1 hoặc dùng Docker ở trên.

---

## Xử lý sự cố

| Triệu chứng | Hướng xử lý |
|-------------|-------------|
| Clerk redirect loop | Kiểm tra domain + redirect URLs |
| Studio “payment failed” | Nạp USDC + ETH cho **Master** (`npm run show:x402`) |
| Balance 0 sau nạp user | Đợi sync on-chain; chạy `npm run fix:stale-settlements` trên server (volume DB) |
| Container unhealthy | Đợi ~90s khởi động; xem `docker logs` |
| Mất DB | Backup volume `bookanai-data` hoặc `/data` trên disk |

---

## Tóm tắt lệnh nhanh (VPS)

```bash
git pull
docker compose -f docker-compose.prod.yml up -d --build
# DOMAIN=app.example.com đã export trước đó
```

Sau deploy, gửi user link `https://your-domain.com` — họ đăng ký, nạp USDC Base, chạy agent.
