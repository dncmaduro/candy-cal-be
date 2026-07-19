# Runbook migrate dữ liệu Sales cũ sang Sales Lead pipeline

> Trạng thái: **chưa chạy migration và chưa đổi role ở bất kỳ môi trường nào**.
>
> Tài liệu này là checklist để thực hiện sau, trên production. Development chỉ
> dùng để kiểm thử script và xác nhận UI/API.

## 1. Quyết định nghiệp vụ đã chốt

1. Hệ thống chỉ có một Sales Hunter. Tất cả case legacy dùng chính account
   Hunter duy nhất đã được xác nhận ở preflight.
2. Funnel do role Sales cũ giữ không bị trả pool. Account đó được đổi sang
   `sales-cs`, mặc định bật nhận lead mới và tiếp tục chăm sóc khách đang giữ.
3. Funnel chưa có đơn `official` được CS hiện tại tiếp tục chăm sóc đến hết kỳ
   hiện tại; không đưa pool ngay lúc migrate.
4. Case được tạo từ dữ liệu cũ gán `hunterId` cho Sales Hunter duy nhất.
5. `SalesOrder` cũ giữ nguyên collection, `_id` và `salesFunnelId`. Migration
   không copy/nhân bản đơn hàng.
6. `SalesActivity` cũ không được tự chuyển thành `SalesLeadCall`, vì call log
   mới bắt buộc có người gọi và outcome. Nếu cần hiển thị lịch sử cũ thì hiển
   thị như dữ liệu legacy, không tính vào call compliance.
7. Migrate chạy thủ công theo quyết định operator, không cần chờ khung giờ cố
   định. Không backfill call; case active sau migrate cần được CS gọi thực tế.
8. Order official đầu tiên được chọn theo `SalesOrder.date` tăng dần; nếu trùng
   ngày thì dùng `createdAt` tăng dần để phân định.
9. Toàn bộ quyền code từng gán cho `sales-emp` được chuyển sang `sales-cs`.
   Quyền dữ liệu funnel/order của CS vẫn bị giới hạn theo assignment/owner.

## 2. Phạm vi dữ liệu

Mỗi `SalesFunnel` chưa có `SalesLeadCase` sẽ được tạo đúng một case mới với:

- `salesFunnelId`: funnel cũ;
- `hunterId`: Sales Hunter đã chốt ở bước preflight;
- `sourceChannelId`: `SalesFunnel.channel` nếu có;
- `origin: "legacy"`, `migratedAt`, `migrationVersion` (cần bổ sung schema);
- status và assignment được xác định theo đơn official và owner hiện tại.

Không migrate dữ liệu doanh thu sang collection khác. Dashboard/doanh thu vẫn
đọc từ `SalesOrder`; case mới chỉ bổ sung ownership, lifecycle và call log.

## 3. Mapping trạng thái

| Điều kiện funnel | `SalesLeadCase` | `SalesLeadAssignment` |
| --- | --- | --- |
| Có ít nhất một order `official` | `retained`; `firstOfficialOrderId` là đơn official sớm nhất | `retained`, không có hạn kỳ |
| Chưa có official, owner có role `sales-cs` và active | `assigned` | `active`, `cycleKey` là tháng chạy migration, hết hạn cuối tháng |
| Chưa có official, owner là Sales cũ | Chỉ tạo sau khi account đó đã đổi sang `sales-cs` và được bật nhận lead | như dòng trên, vẫn giữ chính người đó |
| Owner không tồn tại, inactive hoặc không phải CS sau khi role migration | `pooled` | không tạo active assignment; cần Hunter phân lại |

Assignment được tạo bởi migration dùng `kind: "migrated"`; cần mở rộng enum
hiện tại (`initial`, `recycled`, `manual_transfer`). `customerSnapshot` lấy
từ funnel tại thời điểm chạy migration.

## 4. Chuẩn bị code trước production

1. Bổ sung metadata legacy cho `SalesLeadCase`: `origin`, `migratedAt`,
   `migrationVersion`; cân nhắc để `hunterId` nullable nếu về sau không muốn
   gán Hunter mặc định.
2. Bổ sung `migrated` vào enum assignment kind.
3. Thêm partial unique index để một case chỉ có tối đa một assignment `active`:

   ```ts
   { leadCaseId: 1 },
   { unique: true, partialFilterExpression: { status: "active" } }
   ```

4. Hoàn thiện `SalesLeadAccessService` hoặc guard tương đương cho toàn bộ API
   legacy đọc/sửa funnel, order và interaction. CS chỉ được thao tác dữ liệu
   thuộc assignment hiện tại của mình.
5. Mở những endpoint funnel/order cần thiết cho `sales-cs`, nhưng luôn kiểm
   tra ownership server-side; không dùng role mở toàn bộ dữ liệu.
6. Viết command migration có `--dry-run`, `--execute`, `--batch-size` và
   `--resume-from`. Mỗi funnel chạy trong transaction và `upsert` theo
   `salesFunnelId` để chạy lại không tạo case/assignment trùng.

## 5. Preflight production bắt buộc

Chạy `--dry-run` và lưu artefact (JSON/CSV) trước khi `--execute`:

- tổng funnel, số đã có case, số cần migrate;
- số funnel có official và không official;
- danh sách owner hiện tại theo role, active/inactive;
- danh sách owner không thể đổi/gán sang `sales-cs`;
- số order không có funnel hợp lệ;
- funnel/case duplicate và dữ liệu ObjectId không hợp lệ;
- Hunter mục tiêu đã active và có role `sales-hunter`;
- account Sales cũ mục tiêu, số funnel đang giữ, trạng thái nhận lead mới và
  tác động RBAC sau đổi role.

Không chạy execute nếu báo cáo có owner không map được mà chưa có quyết định
đưa pool hoặc chỉ định CS nhận khách.

## 6. Thứ tự chạy production

1. Chụp backup database và xuất preflight report.
2. Deploy code/schema/index và migration command (chưa chạy execute).
3. Chuyển các account `sales-emp` đã chốt sang `sales-cs`; xác nhận account
   active và role mới có hiệu lực qua JWT/API `me`.
4. Chạy dry-run lần cuối sau role change; người review xác nhận số liệu.
5. Chạy migration thủ công theo batch; log từng batch gồm funnel id, case id,
   assignment id, branch mapping và lỗi.
6. Chạy reconciliation ở mục 7 ngay sau migration.
7. Theo dõi cron recycle/call reminder ở kỳ đầu tiên. Trong lúc script chạy,
   cron không được thao tác cùng các case đang migrate.

## 7. Đối soát sau migration

- `count(SalesLeadCase)` tăng đúng bằng số funnel legacy hợp lệ;
- mỗi funnel có đúng một case;
- case retained có `firstOfficialOrderId` là order official sớm nhất của funnel;
- case active có đúng một assignment active và `SalesFunnel.user` trùng CS đó;
- không có case active/recycled bị đưa pool sai;
- tổng số/order official, doanh thu và dashboard không đổi;
- CS chỉ thấy funnel được giao; thử truy cập funnel/order/call của CS khác phải
  trả `403`/`404` theo policy;
- call log mới được tạo từ funnel detail phải xuất hiện trong call compliance.

## 8. Rollback

Migration là additive: không xóa funnel/order cũ. Nếu phát hiện lỗi trước khi
người dùng bắt đầu thao tác dữ liệu mới, rollback bằng cách xóa **chỉ** các
case/assignment được đánh dấu `origin: "legacy"` và `migrationVersion` của
lần chạy, sau khi đã dừng cron. Không rollback mù theo thời gian.

Sau khi có call log/transfer/order mới phát sinh trên case đã migrate, không
được xóa trực tiếp. Khôi phục bằng backup hoặc script bù có review dữ liệu.
