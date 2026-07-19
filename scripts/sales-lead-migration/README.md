# Sales Lead migration scripts

Các script ở đây chạy bằng `mongosh` trên production. Không nhúng URI, user
ID hoặc credentials vào source code.

## Bước tiếp theo sau backup: preflight chỉ đọc

Chạy từ checkout đúng version sẽ deploy production:

```bash
SALES_LEAD_DB_NAME=data \
mongosh "$DATABASE_URL" --quiet \
  --file scripts/sales-lead-migration/preflight.mongosh.js \
  > sales-lead-preflight.json
```

`DATABASE_URL` phải là secret production. Script không ghi DB; output JSON
không chứa số điện thoại, địa chỉ, hoặc dữ liệu đơn hàng.

Chỉ viết script execute sau khi review report:

- `exactlyOneActiveSalesHunter` phải là `true`;
- không có duplicate/dangling record;
- tất cả funnel có order official phải có owner map được sang Sales CS;

## Execute

Sau khi preflight sạch, mở `execute.mongosh.js` và kiểm tra `MIGRATION_ID`.
Script tự xác nhận có đúng một Sales Hunter đang active. Paste script lần đầu với `EXECUTE = false` để xem kế hoạch. Nếu
đúng, đổi duy nhất `EXECUTE = true`, paste lại toàn bộ script để thực thi.

Script sẽ:

1. tạo case/assignment cho từng funnel legacy trong transaction;
2. phân `retained` theo order official sớm nhất (`date`, rồi `createdAt`);
3. tạo `active` assignment cho funnel chưa official đến hết tháng hiện tại;
4. ghi `systemlogs` mang `MIGRATION_ID` để audit/rollback.

Script không đổi role hoặc trạng thái active của `sales-emp`; funnel cần được
đồng bộ sang CSKH mới trước khi execute.

## Postflight (chỉ đọc)

Ngay sau execute, paste toàn bộ `postflight.mongosh.js` vào chính tab mongosh
trong Compass. Với dữ liệu preflight hiện tại, report phải có:

- toàn bộ `checks` là `true`;
- `migratedCases` bằng tổng số funnel của môi trường;
- ba mảng trong `blockers` đều rỗng.

## Đồng bộ CS theo channel legacy

Trước migration lead, nếu owner cũ của funnel không khớp CSKH duy nhất đang
được gán cho channel, dùng `sync-legacy-funnel-owner.mongosh.js`. Script độc
lập với migration ở môi trường khác và chỉ chọn funnel chưa có lead case.

Script chỉ chấp nhận `sales-cs` đang active trên channel.

Chạy thử với `EXECUTE = false`; report phải có `blockers: 0` trước khi đổi sang
`true`. Sau đó chạy `execute.mongosh.js`: lúc này `legacyOwnerId` sẽ ghi đúng
CS đang tiếp quản funnel.
