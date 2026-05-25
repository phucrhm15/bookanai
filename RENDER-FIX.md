# Render build failed — xử lý nhanh

## 1. Sửa trong Dashboard (Settings)

| Mục | Giá trị |
|-----|---------|
| **Dockerfile Path** | `Dockerfile` (không phải `.`) |
| **Docker Build Context** | `.` |
| **Docker Command** | *(để trống)* |
| **Health Check Path** | `/api/health` |

## 2. Pull code mới (đã tối ưu Docker)

Repo cần commit mới nhất (Dockerfile + `scripts/start-prod.mjs`).

**Manual Deploy** → Deploy latest commit.

## 3. Xem log lỗi thật

Trong tab **Logs**, kéo xuống **cuối**, tìm dòng:

- `npm ERR!`
- `error: failed to solve`
- `Killed` → hết RAM khi build

Gửi 10–20 dòng cuối nếu vẫn fail.

## 4. Lỗi `package-lock.json` out of sync / `utf-8-validate`

Đã sửa trong repo: chạy `npm install` local rồi push `package-lock.json` mới + Dockerfile **Node 22**.

## 5. Vẫn fail? — Đổi sang Node (không Docker)

**Settings** → đổi **Language** từ Docker sang **Node**:

| Mục | Giá trị |
|-----|---------|
| **Build Command** | `npm ci && npm rebuild better-sqlite3` |
| **Start Command** | `npm run start:prod` |
| **Node version** | `22` |

Giữ nguyên Environment Variables. Save → Deploy.

## 6. Health check timeout (`bookanai.onrender.com:10000/api/health`)

Build OK nhưng deploy fail → app chưa kịp lên (trước đây dùng `vite dev`, rất chậm trên Free).

**Đã sửa:** Docker chạy `npm run build` + `node scripts/serve-worker.mjs` (khởi động nhanh).

Trên Render → **Settings** → **Health Checks**:

- **Health Check Path:** `/api/health`
- **Health Check Grace Period:** `180` giây (nếu có ô này)

Deploy lại commit mới nhất.

## 7. Sau khi Live

- URL: `https://bookanai.onrender.com` (hoặc URL Render cấp)
- Clerk: thêm domain + `/sign-in`, `/sign-up`, `/marketplace`
- Test: `/api/health`
