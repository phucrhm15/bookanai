# Host website miễn phí (0 đồng hosting)

Hướng dẫn đưa **Nano.Agent** lên Internet **không trả tiền server**. Repo GitHub: `https://github.com/phucrhm15/bookanai`

---

## Miễn phí vs có phí

| Hạng mục | Miễn phí? | Ghi chú |
|----------|-----------|---------|
| **Hosting** (Render Free, Oracle VPS) | Có | Xem bên dưới |
| **Clerk** (đăng ký / đăng nhập) | Có (free tier) | ~10.000 user/tháng |
| **GitHub** (lưu code) | Có | Repo public/private |
| **Gọi agent Messari / Perplexity** | **Không** | Trả **USDC** mỗi lần Run (x402) — đây là phí API, không phải hosting |

User có thể **dùng website free**, nhưng chạy Studio vẫn cần **USDC trong ví** (và Master wallet của bạn cần USDC để trả API).

---

## Cách 1 — Render.com (dễ nhất, ~10 phút)

**Ưu:** Không cần VPS, không cần Docker trên máy bạn, HTTPS sẵn.  
**Nhược:** Sau 15 phút không ai vào → web **ngủ** (~1 phút mới tỉnh). **SQLite mất** khi redeploy/restart (số dư ledger có thể reset).

### Bước 1 — Tạo Web Service

1. Vào [dashboard.render.com](https://dashboard.render.com) → đăng nhập (GitHub).
2. **New +** → **Web Service**.
3. Connect repo **`phucrhm15/bookanai`**.
4. Cấu hình:

| Mục | Giá trị |
|-----|---------|
| Name | `nano-agent` (tùy ý) |
| Region | Singapore |
| Branch | `main` |
| Runtime | **Docker** |
| Instance type | **Free** |
| Health Check Path | `/api/health` |

5. **Không** bật Persistent Disk (free không hỗ trợ).

### Bước 2 — Biến môi trường

**Environment** → Add từ file `.env.local` trên máy (copy từng dòng, **không** upload file):

```
NODE_ENV=production
DATABASE_URL=file:/tmp/bookanai.db
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
CIRCLE_API_KEY=...
ENTITY_SECRET=...
CIRCLE_WALLET_SET_ID=...
MASTER_AGENT_PRIVATE_KEY=0x...
X402_DISCOVERY_URL=https://api.circle.com/v2/x402/discovery/resources
BASE_RPC_URL=https://mainnet.base.org
SETTLEMENT_CRON_SECRET=<chuỗi ngẫu nhiên dài>
```

6. **Create Web Service** → đợi build 5–15 phút.

URL dạng: `https://nano-agent-xxxx.onrender.com`

### Bước 3 — Clerk (bắt buộc)

[Clerk Dashboard](https://dashboard.clerk.com) → app của bạn → **Configure** → **Domains**:

- **Allowed origins:** `https://nano-agent-xxxx.onrender.com`
- **Redirect URLs:**  
  `https://nano-agent-xxxx.onrender.com/sign-in`  
  `https://nano-agent-xxxx.onrender.com/sign-up`  
  `https://nano-agent-xxxx.onrender.com/marketplace`

### Bước 4 — Kiểm tra

```text
https://nano-agent-xxxx.onrender.com/api/health
```

→ `{"ok":true,...}`

Mở `/` → landing, **Tiếng Việt** / English, đăng ký thử.

### Blueprint (tùy chọn)

**New → Blueprint** → repo → chọn file **`render.free.yaml`** (không dùng `render.yaml` — file đó cần gói trả phí vì có disk).

---

## Cách 2 — Oracle Cloud Always Free (free mãi + lưu SQLite)

**Ưu:** VPS **miễn phí vĩnh viễn**, Docker + volume → **ledger không mất** khi restart.  
**Nhược:** Đăng ký Oracle, cấu hình server ~30–60 phút.

1. [cloud.oracle.com](https://www.oracle.com/cloud/free/) → tạo **Always Free** VM (Ubuntu, ARM).
2. SSH vào server:

```bash
sudo apt update && sudo apt install -y docker.io docker-compose-plugin git
sudo usermod -aG docker $USER
# logout/login lại

git clone https://github.com/phucrhm15/bookanai.git
cd bookanai
nano .env.local   # dán secret (scp từ máy Windows cũng được)

docker compose up -d --build
```

3. Mở port **3000** trong Security List (hoặc dùng Caddy HTTPS — xem [DEPLOY.md](./DEPLOY.md)).

---

## Cách 3 — Chạy demo trên máy (free, chỉ bạn xem)

```bash
cd c:\bookanai-main
npm install
npm run dev
```

→ `http://localhost:8080` — không public Internet (trừ khi dùng ngrok).

---

## Cron settlement (free Render)

Dùng [cron-job.org](https://cron-job.org) (free):

- URL: `POST https://your-app.onrender.com/api/cron/settle-batch`
- Header: `Authorization: Bearer <SETTLEMENT_CRON_SECRET>`
- Mỗi 15 phút

---

## Khi nào nên trả phí?

| Nhu cầu | Gợi ý |
|---------|--------|
| Ledger / lịch sử ví **ổn định** | Render **Starter** + disk, hoặc Oracle free VPS |
| Web **không ngủ** | Gói trả phí Render hoặc VPS |
| Nhiều user production | Clerk `pk_live_`, domain riêng |

---

## Checklist nhanh (Render Free)

- [ ] Repo đã push GitHub `phucrhm15/bookanai`
- [ ] Render Web Service, **Free**, Docker
- [ ] Env đủ (Clerk + Circle + Master key)
- [ ] Clerk thêm URL Render
- [ ] `/api/health` OK
- [ ] Hiểu: SQLite free có thể **reset** sau redeploy

Sau khi xong, gửi link `https://....onrender.com` cho bạn bè đăng ký miễn phí (Clerk); họ tự nạp USDC nếu muốn chạy agent.
