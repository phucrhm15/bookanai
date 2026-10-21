# Nano.Agent (BookanAI)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22.12-brightgreen)](package.json)

Open-source Arc research app: users sign in with **Clerk**, fund a Circle wallet with **USDC on Arc Mainnet**, and pay for live AI web/news research through **x402**. The service uses a live provider quote and returns a sourced answer. Built with **TanStack Start**, **Circle Programmable Wallets**, and a SQLite ledger.

**Live demo:** https://bookanai.onrender.com  
**Repo:** https://github.com/phucrhm15/bookanai

---

Ứng dụng nghiên cứu crypto cho phép user đăng nhập bằng **Clerk**, nạp **USDC trên Arc Mainnet**, rồi gọi API tìm kiếm AI có trả phí qua **x402**. Giá được lấy trực tiếp từ báo giá của nhà cung cấp và câu trả lời có kèm nguồn.

## Tính năng

- **Landing** công khai tại `/`
- **Arc Research Studio / Wallet** sau đăng nhập
- Ví **Circle** cho mỗi user
- Thanh toán x402 theo báo giá động HTTP 402 trên Arc Mainnet
- Ledger SQLite (lịch sử giao dịch)
- **Circle App Kit** — Gateway deposit, bridge, withdraw, swap (`@circle-fin/app-kit` + DCW adapter)

## Yêu cầu (người vận hành server)

| Dịch vụ | Mục đích |
|---------|----------|
| [Clerk](https://clerk.com) | Đăng ký / đăng nhập user |
| [Circle](https://developers.circle.com) | API key, entity secret, wallet set |
| Ví thanh toán dịch vụ (`MASTER_AGENT_PRIVATE_KEY`) | Ký khoản thanh toán x402 cho nhà cung cấp trên Arc Mainnet; cần USDC và gas bằng USDC trên Arc |
| `CIRCLE_KIT_KEY` (tùy chọn) | Bật **Swap** trong App Kit trên trang Wallet |
| RPC | `ARC_MAINNET_RPC_URL` (**HTTPS only**) |

## Cài đặt local (dev)

```bash
cp .env.local.example .env.local
# Điền Clerk + Circle + MASTER_AGENT_PRIVATE_KEY

npm install
npm run setup:register-secret   # lần đầu
npm run setup:wallets           # tạo wallet set + master key
npm run init:master

npm run dev
```

Mở http://localhost:8080 (hoặc port Vite in ra).

### User mới (end user)

1. Vào `/` → **Bắt đầu miễn phí** (Clerk sign-up)
2. **Wallet** → copy địa chỉ ví → nạp **USDC trên Arc Mainnet**
3. Mở **Arc Research**, nhập câu hỏi → bấm **Run Agent**. App lấy báo giá x402 mới nhất rồi gọi dịch vụ tìm kiếm AI và trả về phần tóm tắt cùng nguồn.

### Vận hành Master (admin)

```bash
npm run show:x402          # địa chỉ ví thanh toán x402
npm run health
npm run cron:settle        # xử lý các khoản user→master đang chờ settlement
```

`GET /api/master/status` và `GET /api/debug/x402` — cần header `Authorization: Bearer <SETTLEMENT_CRON_SECRET>` trên production (operator only).

## Host miễn phí (0 đồng server)

**Hướng dẫn từng bước:** [FREE-HOSTING.md](./FREE-HOSTING.md) — Render Free + Clerk free (SQLite trên Render free có thể reset sau redeploy).

## Triển khai lên Internet (production)

**Hướng dẫn đầy đủ:** [DEPLOY.md](./DEPLOY.md) (VPS + HTTPS, Render, Clerk, cron).

```bash
npm run deploy:check          # kiểm tra .env.local trước khi deploy
docker compose up -d --build  # local / VPS (port 3000)
```

### Docker (khuyến nghị — đủ SQLite + API)

```bash
cp .env.local.example .env.local
# điền đủ biến môi trường

docker compose up -d --build
```

App: http://localhost:3000  
Database: volume `bookanai-data` → `/data/bookanai.db`

**HTTPS + domain (VPS):**

```bash
export DOMAIN=app.yourdomain.com
docker compose -f docker-compose.prod.yml up -d --build
```

**Clerk:** thêm domain production vào Allowed origins + redirect URLs (`/sign-in`, `/sign-up`, `/marketplace`).

**Render.com:** push GitHub → New Blueprint → `render.yaml` → điền secrets trong dashboard.

### Cloudflare Workers (tùy chọn)

```bash
npx wrangler login
npm run deploy
```

> Workers **không** chạy `better-sqlite3` local. Cần **D1** (chưa có trong repo) hoặc dùng Docker/VPS ở trên.

### Cron settlement (production)

Đặt `SETTLEMENT_CRON_SECRET` (≥16 ký tự). Gọi mỗi vài phút:

```http
POST https://your-domain.com/api/cron/settle-batch
Authorization: Bearer <SETTLEMENT_CRON_SECRET>
```

## Scripts hữu ích

| Script | Mô tả |
|--------|--------|
| `npm run dev` | Dev server |
| `npm run build` | Build Workers + client |
| `npm run health` | Kiểm tra env + Circle |
| `npm run fix:stale-settlements` | Dọn settlement treo (local DB) |
| `npm run wallet:audit` | Xem ledger SQLite |

## Cấu trúc routes

| URL | Ai xem được |
|-----|-------------|
| `/` | Công khai — landing |
| `/sign-in`, `/sign-up` | Công khai |
| `/marketplace`, `/studio`, `/wallet` | Đã đăng nhập |
| `/api/health` | Công khai — health check |

## Bảo mật

- Không commit `.env.local`
- `MASTER_AGENT_PRIVATE_KEY` chỉ trên server
- Mỗi user chỉ truy cập ví của mình (Clerk session + `userWalletId` check)

## Open source

- **License:** [MIT](./LICENSE)
- **Contributing:** [CONTRIBUTING.md](./CONTRIBUTING.md)
- **Security:** [SECURITY.md](./SECURITY.md)

Fork and deploy with your own Circle + Clerk accounts. Do not use production keys from any public demo.

## License

[MIT](./LICENSE) — Circle, Clerk, and third-party APIs remain subject to their own terms.
