# Render Starter — giữ một ví / không tạo địa chỉ mới

## Vì sao trước đây cứ ra ví mới?

1. **`DATABASE_URL=file:/tmp/...`** — SQLite mất khi redeploy → app không nhớ `circleWalletId` → gọi `createWallets` lại.
2. **Circle Console** vẫn giữ mọi ví cũ (cùng Reference ID `user_3…`) — tiền không mất, chỉ app trỏ nhầm ví mới.

Code mới: nếu DB trống, **tìm lại ví Circle theo Clerk `refId`** và chọn ví có **USDC nhiều nhất** trước khi tạo ví mới.

## Cấu hình Render Starter (bắt buộc)

### 1. Persistent Disk

**Settings → Disks → Add Disk**

| Mục | Giá trị |
|-----|---------|
| Mount Path | `/data` |
| Size | 1 GB (đủ) |

### 2. Environment

| Key | Giá trị |
|-----|---------|
| `DATABASE_URL` | `file:/data/bookanai.db` |

**Xóa** hoặc đổi nếu vẫn là `file:/tmp/bookanai.db`.

### 3. Deploy

- **Manual Deploy** commit mới nhất (Dockerfile đã mặc định `file:/data/bookanai.db`).
- Sau deploy, mở **Wallet** một lần → log có thể thấy `Re-linked existing Circle wallet …`.

### 4. Kiểm tra

Logs Render:

```text
[bootstrap-db] schema ok at /data/bookanai.db
[circleService] Re-linked existing Circle wallet 0x8107…
```

Wallet UI phải hiện lại địa chỉ có USDC (thường `0x81072F…` hoặc `0x9561…` nếu đó là ví cao nhất).

## Gom USDC từ ví thừa (tùy chọn)

Console không có nút Send — dùng:

```powershell
npm run recover:usdc -- --from-wallet-id <uuid> --to 0xDIA_CHI_CHINH --amount all --yes
```

Xem `scripts/recover-usdc-transfer.mjs`.
