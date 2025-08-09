# candy-cal-be

Backend service (NestJS + Mongoose).

## System Logs

Theo dõi hoạt động nhân viên và hệ thống với cấu trúc log chuẩn hoá, tránh log dữ liệu nhạy cảm.

- Tránh log dữ liệu nhạy cảm (mật khẩu, token, payload thô). Chỉ lưu ID, số lượng, trạng thái tóm tắt trong `meta`.
- Tự động log lỗi qua Global Exception Filter (400 validation_failed, 403 permission_denied, còn lại unexpected_error/system).
- Trường log: `type`, `action`, (tuỳ chọn) `entity`, `entityId`, `result` (success|failed), `meta`, `ip`, `userAgent`, `time`.

### Endpoints

- POST `/systemlogs`
  - Tạo log theo DTO chuẩn hoá.
- GET `/systemlogs`
  - Bộ lọc: `userId`, `type`, `action`, `entity`, `entityId`, `result`, `startTime`, `endTime`, `page`, `limit`.
- DELETE `/systemlogs/cleanup?days=90`
  - Dọn log cũ theo số ngày giữ lại (ví dụ 90 ngày).

### Ghi chú

- Đã tránh log dữ liệu nhạy cảm.
- Có endpoint dọn log cũ: `DELETE /systemlogs/cleanup?days=90`.
- Cron cleanup chưa bật do xung đột dependency; có thể thêm sau khi đồng bộ Nest v11.
