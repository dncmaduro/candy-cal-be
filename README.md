# Candy Cal Backend

NestJS + Mongoose backend cho hệ thống quản lý đơn hàng, kho, doanh thu, KPI và logging nội bộ.

## Kiến trúc tổng quan

- Framework: NestJS (REST + WebSocket Gateway cho notifications)
- Database: MongoDB qua Mongoose
- Auth: JWT + Role-based Guard (`@Roles` + `RolesGuard`)
- Logging nội bộ: Module `systemlogs` chuẩn hoá type/action/entity/result
- Exception Handling: Global `AllExceptionsFilter` (hiện chỉ log lỗi không phải HttpException)
- Realtime: `NotificationsGateway` (WebSocket) (nếu đã khai báo trong notifications module)

## Các Domain Chính

| Module                  | Chức năng chính                                                    | Điểm nổi bật                                                  |
| ----------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------- |
| users                   | Đăng nhập, refresh token, thông tin cá nhân, đổi avatar & mật khẩu | Log các sự kiện quan trọng (login thành công / thất bại ... ) |
| items                   | Quản lý item bán (tạo / sửa / xoá / tìm kiếm)                      | Log CRUD, search GET mở cho system-emp                        |
| products                | Quản lý sản phẩm + import tính toán từ XLSX                        | Cập nhật items, tính sẵn box, log hành động                   |
| readycombos             | Quản lý combo sẵn                                                  | Toggle trạng thái, log đầy đủ                                 |
| storageitems            | Danh mục vật tư tồn kho                                            | CRUD + search                                                 |
| storagelogs             | Log nhập / xuất / điều chỉnh kho                                   | Filter theo tháng, trạng thái, tag                            |
| orderlogs & logs        | Ghi nhận log sản xuất / đóng hàng theo phiên / khoảng thời gian    | Có endpoint range tổng hợp quantity                           |
| sessionlogs / dailylogs | Phiên làm việc & nhật ký ngày                                      | Hỗ trợ truy vấn phân trang                                    |
| deliveredrequests       | Yêu cầu giao hàng (comment, accept, undo)                          | Log theo hành động                                            |
| notifications           | Thông báo & đếm chưa xem                                           | Mark read/unread/all viewed                                   |
| packingrules            | Quy tắc đóng gói (suy ra box)                                      | Dùng trong cập nhật box doanh thu                             |
| income                  | Import doanh thu Shopee (3 file), phân loại nguồn & kênh           | Tự động cập nhật box sau import; KPI split theo channel       |
| monthgoals              | Mục tiêu tháng: livestream & shop                                  | Trả KPI split + tổng hợp theo tháng                           |
| systemlogs              | Lưu hoạt động hệ thống / nhân sự                                   | FE option endpoints + tiếng Việt                              |

## Phân Quyền Roles

- `admin`: Toàn quyền
- `order-emp`: Nghiệp vụ đơn hàng / sản xuất
- `accounting-emp`: Kế toán / doanh thu / kho
- `system-emp`: Quyền xem (read-only) hầu hết GET

Các endpoint GET đã được mở thêm `system-emp` để quan sát dữ liệu (không ghi).

## System Logs

Chuẩn hoá record:

```
{
  type: string,        // ví dụ: users, income, products, orders, storage, system, security
  action: string,      // ví dụ: created, updated, deleted, inserted, export_xlsx, ...
  entity?: string,     // product, income, storage_item, ...
  entityId?: string,
  result: 'success' | 'failed',
  meta?: Record<string, any>,
  ip?: string,
  userAgent?: string,
  time: Date
}
```

Chỉ log unexpected (non-HTTP) errors hiện tại. Các lỗi Http (400/403/...) không còn ghi vào systemlogs theo yêu cầu.

### API chính

- `POST /systemlogs` (admin, system-emp)
- `GET /systemlogs` + bộ lọc (admin, system-emp)
- `GET /systemlogs/options/*` trả danh sách users/types/actions/entities/entity-ids (label tiếng Việt)
- `DELETE /systemlogs/cleanup?days=90` (admin)

## Income & KPI

### Import

- API `POST /incomes` nhận file (Shopee export) + `type` (affiliate|ads|...)
- Loại bỏ entries `Cancelation/Return Type = Cancel`
- Xoá products trùng source trong ngày rồi append dữ liệu mới
- Sau khi import: tự động chạy cập nhật box (`updateIncomesBox`) dựa vào `packingrules`

### Split theo kênh (livestream vs shop)

- Thuật toán nhận diện livestream: regex `/Phát trực tiếp|livestream/i` trên `content`
- API:
  - `GET /incomes/income-split-by-month?month=&year=`
  - `GET /incomes/quantity-split-by-month?month=&year=`
  - `GET /incomes/kpi-percentage-split-by-month?month=&year=` (dựa `MonthGoal` liveStreamGoal + shopGoal)

### Thống kê ngày

- `GET /incomes/daily-stats?date=YYYY-MM-DD`
  Trả:
  ```
  {
    boxes: [{ box, quantity }],
    totalIncome: number,
    sources: { ads, affiliate, affiliateAds, other }
  }
  ```

### Xuất Excel

- `GET /incomes/export-xlsx` với filter (startDate, endDate, productSource, productCode, orderId)
- Gộp ô chung cho thông tin đơn hàng, liệt kê từng product.

## Month Goals

- Schema: { month, year, liveStreamGoal, shopGoal }
- Dịch vụ trả tổng doanh thu/quantity & KPI tách kênh cho mỗi tháng.

## Packing Rules & Box

- `packingrules` lưu logic đóng gói (suy ra box loại hộp: small, big, long, big-35, square)
- `updateIncomesBox` duyệt tất cả products ngày để cập nhật `product.box` nếu thay đổi.
- Được gọi tự động sau import income.

## Notifications

- Đếm chưa xem: `GET /notifications/unviewed-count`
- Đánh dấu đã xem: PATCH /:id/read, allread, allviewed.

## Bảo mật & Thực hành Logging

- Không lưu mật khẩu plaintext.
- Hạn chế meta chi tiết, chỉ lưu số lượng / id.
- Có endpoint dọn log cũ thủ công.

## Chạy Dự Án

(Điền nếu cần: docker-compose, .env mẫu, v.v.)

## Mở Rộng Tương Lai

- Bổ sung cron cleanup cho systemlogs
- Thêm cache cho các endpoint options
- Thêm chỉ số phân tích nâng cao (conversion, AOV)
- Bổ sung test e2e / unit

## License

Private.
