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

## 4. Vẫn fail? — Đổi sang Node (không Docker)

**Settings** → đổi **Language** từ Docker sang **Node**:

| Mục | Giá trị |
|-----|---------|
| **Build Command** | `npm ci && npm rebuild better-sqlite3` |
| **Start Command** | `npm run start:prod` |
| **Node version** | `20` |

Giữ nguyên Environment Variables. Save → Deploy.

## 5. Sau khi Live

- URL: `https://bookanai.onrender.com` (hoặc URL Render cấp)
- Clerk: thêm domain + `/sign-in`, `/sign-up`, `/marketplace`
- Test: `/api/health`
