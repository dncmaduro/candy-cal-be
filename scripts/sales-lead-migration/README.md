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
- danh sách `sales-emp` cần chuyển role đã được xác nhận.

## Execute

Sau khi preflight sạch, mở `execute.mongosh.js` và kiểm tra `MIGRATION_ID`,
`HUNTER_ID`. Paste script lần đầu với `EXECUTE = false` để xem kế hoạch. Nếu
đúng, đổi duy nhất `EXECUTE = true`, paste lại toàn bộ script để thực thi.

Script sẽ:

1. đổi account `sales-emp` thành `sales-cs` và bật nhận lead mới;
2. tạo case/assignment cho từng funnel legacy trong transaction;
3. phân `retained` theo order official sớm nhất (`date`, rồi `createdAt`);
4. tạo `active` assignment cho funnel chưa official đến hết tháng hiện tại;
5. ghi `systemlogs` mang `MIGRATION_ID` để audit/rollback.

## Postflight (chỉ đọc)

Ngay sau execute, paste toàn bộ `postflight.mongosh.js` vào chính tab mongosh
trong Compass. Với dữ liệu preflight hiện tại, report phải có:

- toàn bộ `checks` là `true`;
- `migratedCases: 200`;
- `salesEmpUsersRemaining: 0`;
- ba mảng trong `blockers` đều rỗng.

## Đồng bộ CS theo channel legacy

Sau migration lead, nếu owner cũ của funnel không khớp CSKH duy nhất đang được
gán cho channel, dùng `sync-channel-owner.mongosh.js`. Script chỉ áp dụng cho
case có `migrationId` legacy nêu trong script và update đồng thời:

1. `salesfunnels.user` để scope danh sách funnel/đơn hàng đúng người phụ trách;
2. `salesleadassignments.salesCsId` của current assignment để luồng chăm sóc
   không bị lệch.

`legacyOwnerId` không bị thay đổi để giữ lịch sử audit. Chạy thử với
`EXECUTE = false`; report phải có `blockers: 0` trước khi đổi sang `true`.
Sau khi chạy thật, paste `verify-channel-owner-sync.mongosh.js`; cả ba check
phải là `true` và `mismatches: 0`.
