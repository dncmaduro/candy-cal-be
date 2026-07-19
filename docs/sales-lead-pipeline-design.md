# Thiết kế: phân phối lead mới cho Sales CS

## 1. Mục tiêu và quyết định đã chốt

Hệ thống hiện tại dùng `SalesFunnel.user` làm cả người mang khách về lẫn
người chăm sóc. Luồng mới tách hai trách nhiệm nhưng **không sửa schema cũ**
(`SalesFunnel`, `SalesOrder`, `SalesActivity`, `SalesTask`, `SalesChannel`).

| Quy tắc | Quyết định |
| --- | --- |
| Người tìm lead | `sales-hunter` nhập số mới vào hệ thống. |
| Người chăm sóc | Hunter phân lead cho `sales-cs`. CS chỉ thấy khách đã được phân cho mình, không thấy lead thô hay hàng chờ. |
| Mức gọi tối thiểu | CS ghi ít nhất một cuộc gọi và tình trạng trong chu kỳ tháng. |
| Lead chưa có đơn | Hết tháng dương lịch mà chưa có đơn `official` thì tự về hàng chờ. |
| Phân lại | Hunter chọn CS đang bật nhận khách từ hàng chờ; hiển thị CS đã care tháng trước nhưng không bắt buộc tránh. |
| Lead đã có đơn `official` | CS hiện tại giữ khách dài hạn; không tự trả pool nữa. |
| Chuyển khách thủ công | CS được chuyển khách cho một CS đang bật nhận khách. |
| Khách/funnel cũ | Không tạo vào pipeline mới, không chạy quy tắc trả pool; giữ nguyên người `user` hiện tại. |
| Lịch sử và quyền | CS cũ chỉ đọc snapshot và nhật ký thuộc kỳ mình quản lý. Hunter chỉ xem trạng thái tổng quát của lead mình tạo, không đọc nhật ký gọi/ghi chú CS. Admin và sales leader xem toàn bộ. |

## 2. Luồng nghiệp vụ

```text
Hunter nhập số mới
       |
       v
Tạo SalesFunnel cũ (để dùng luồng đơn hàng hiện hữu)
+ SalesLeadCase mới
       |
       v
Lead ở trạng thái chưa gán -> Hunter phân cho Sales CS -> SalesLeadAssignment (kỳ YYYY-MM)
       |
       +---- CS ghi >= 1 SalesLeadCall trong tháng
       |
       +---- đơn chuyển official -> case = retained, CS giữ khách
       |
       `---- 00:05 ngày đầu tháng kế tiếp, không có official
                 -> đóng assignment -> case = pooled
                 -> hàng chờ để Hunter phân lại
```

Việc "lead mới" chỉ có ý nghĩa trong một kỳ chưa có đơn `official`. Khi
phân lại ở tháng sau, cùng số điện thoại được tính là một lead mới cho CS
mới, nhưng lịch sử phân công vẫn được giữ để truy vết.

## 3. Roles và tương thích legacy

### Roles mới

- `sales-hunter`: tạo lead, phân CS cho lead chưa gán/trong hàng chờ, bật/tắt
  người nhận khách và xem danh sách lead do mình tạo ở mức tổng quan; không có
  quyền gọi, ghi log hay chuyển khách.
- `sales-cs`: gọi/ghi log và quản lý khách đã được phân cho mình, chuyển
  khách cho CS đang bật. CS không xem pool hoặc lead chưa được phân.
- `sales-leader`, `admin`: quản trị toàn bộ pipeline, xem báo cáo và toàn bộ
  audit trail.

`User.roles` hiện là mảng string, không có enum, nên thêm hai role trên
không đòi hỏi sửa schema `User`. Toàn bộ quyền legacy từng cấp cho
`sales-emp` được chuyển sang `sales-cs`; không giữ role tương thích.

### Legacy funnel/order

Mỗi lead mới tạo đồng thời:

1. một `SalesFunnel` theo schema cũ, để `SalesOrder` hiện hữu vẫn liên kết
   qua `salesFunnelId`;
2. một `SalesLeadCase` mới, liên kết 1-1 với funnel trên và là nguồn chân
   lý cho assignment, call log và quyền của luồng mới.

Không tạo `SalesLeadCase` cho funnel đã tồn tại trước ngày rollout. Sự vắng
mặt của case là cờ loại trừ pipeline mới, nhờ vậy không cần sửa hay migrate
schema/dữ liệu cũ.

## 4. Schema mới

Tên collection giữ convention lowercase plural đang có trong repo.

### 4.1 `SalesLeadCase` (`salesleadcases`)

Một case là vòng đời pipeline của một số lead mới. Case có thể được phân
nhiều kỳ, nhưng chỉ được tạo một lần cho một funnel mới.

```ts
type SalesLeadCaseStatus = "unassigned" | "assigned" | "pooled" | "retained"

interface SalesLeadCase extends Document {
  salesFunnelId: Types.ObjectId // unique, ref salesfunnel
  hunterId: Types.ObjectId // người nhập lead đầu tiên
  sourceChannelId: Types.ObjectId // ref saleschannels
  status: SalesLeadCaseStatus
  currentAssignmentId?: Types.ObjectId // ref salesleadassignments
  firstOfficialOrderId?: Types.ObjectId // ref salesorders
  firstOfficialAt?: Date
  createdAt: Date
  updatedAt: Date
}
```

Indexes:

- unique `{ salesFunnelId: 1 }`;
- `{ status: 1, updatedAt: -1 }` cho pool;
- `{ hunterId: 1, createdAt: -1 }` cho danh sách hunter.

`firstOfficialOrderId` chỉ được set một lần. Khi đã set, case không bao giờ
tự quay lại pool.

### 4.2 `SalesLeadAssignment` (`salesleadassignments`)

Mỗi record là một kỳ quyền sở hữu. Đây là bảng audit và nguồn kiểm soát
quyền đọc lịch sử.

```ts
type SalesLeadAssignmentKind = "initial" | "recycled" | "manual_transfer"
type SalesLeadAssignmentStatus =
  | "active"
  | "retained"
  | "recycled"
  | "transferred"

interface SalesLeadAssignment extends Document {
  leadCaseId: Types.ObjectId
  salesCsId: Types.ObjectId
  assignedById: Types.ObjectId // hunter, CS hoặc leader/admin
  kind: SalesLeadAssignmentKind
  status: SalesLeadAssignmentStatus
  cycleKey?: string // YYYY-MM; có ở lead chưa official
  cycleStartAt: Date
  cycleEndAt?: Date // 23:59:59.999 ngày cuối tháng
  startedAt: Date
  endedAt?: Date
  endReason?: "official" | "month_expired" | "manual_transfer"
  previousSalesCsId?: Types.ObjectId
  customerSnapshot: {
    name: string
    phoneNumber?: string
    secondaryPhoneNumbers: string[]
    address?: string
    provinceId?: Types.ObjectId
    channelId: Types.ObjectId
  }
  createdAt: Date
  updatedAt: Date
}
```

Indexes:

- partial unique `{ leadCaseId: 1, status: 1 }` với điều kiện `status: "active"`;
- `{ salesCsId: 1, status: 1, cycleEndAt: 1 }` cho màn hình việc cần gọi;
- `{ leadCaseId: 1, startedAt: 1 }` cho timeline;
- `{ cycleKey: 1, status: 1 }` cho cron cuối tháng.

`customerSnapshot` được chụp ngay khi giao assignment. Vì vậy người đã
chuyển khách vẫn có thể xem khách và lịch sử đúng như tại thời điểm mình sở
hữu, không bị lộ cập nhật sau đó.

### 4.3 `SalesLeadCall` (`salesleadcalls`)

Đây là log gọi của pipeline mới; không dùng `SalesActivity` cũ vì schema cũ
thiếu người thực hiện và kết quả gọi.

```ts
type SalesLeadCallOutcome =
  | "no_answer"
  | "not_interested"
  | "call_back"
  | "considering"
  | "closed"
  | "wrong_number"
  | "other"

interface SalesLeadCall extends Document {
  leadCaseId: Types.ObjectId
  assignmentId: Types.ObjectId
  salesCsId: Types.ObjectId // denormalized để report nhanh
  calledAt: Date
  outcome: SalesLeadCallOutcome
  note: string // bắt buộc, ghi tình trạng cuộc gọi
  createdAt: Date
  updatedAt: Date
}
```

Indexes:

- `{ assignmentId: 1, calledAt: -1 }`;
- `{ leadCaseId: 1, calledAt: -1 }`;
- `{ salesCsId: 1, calledAt: -1 }` cho báo cáo tương lai.

Một call chỉ được tạo bởi CS của assignment đang active. Call log được coi là
immutable: sửa/xóa chỉ cho admin/leader và phải ghi SystemLog. Điều này giữ
độ tin cậy của báo cáo gọi điện.

### 4.4 `SalesCsAvailability` (`salescsavailabilities`)

```ts
interface SalesCsAvailability extends Document {
  salesCsId: Types.ObjectId // unique, ref users
  isReceivingLeads: boolean
  changedById: Types.ObjectId
  changedAt: Date
  note?: string
}
```

Chỉ `sales-cs` active trong `User` và có `isReceivingLeads: true` được xuất
hiện trong picker chuyển khách. Sales leader/admin thay đổi nút này; mọi thay
đổi có SystemLog.

## 5. Lifecycle và giao dịch nguyên tử

### 5.1 Tạo và phân lead

1. Hunter nhập thông tin khách; channel và `salesCsId` đều là tùy chọn.
2. Nếu chưa chọn CS, transaction tạo funnel cũ và case mới ở trạng thái
   `unassigned`, không tạo assignment cho tới khi được phân công.
3. Vì `SalesFunnel.user` là field legacy bắt buộc, trong lúc chưa có CS nó tạm
   lưu hunter; đây không phải là phân công chăm sóc.
4. Khi có CS được chọn lúc tạo hoặc khi lead được phân từ hàng chờ, API kiểm
   tra CS có phụ trách kênh, tài khoản active và trạng thái nhận lead, rồi tạo
   assignment và đồng bộ `SalesFunnel.user` sang CS đó.

Nên chuẩn hóa số điện thoại trước khi lưu và cảnh báo (không chặn) nếu trùng
với một case active/retained/unassigned/pooled. Hunter cần xác nhận để vẫn có
thể nhập trường hợp trùng hợp lệ.

### 5.2 Gọi và cảnh báo

- Ngay sau khi nhận, lead xuất hiện tại danh sách "Cần gọi" của CS.
- Một `SalesLeadCall` hợp lệ trong assignment là đủ điều kiện tối thiểu của
  tháng.
- Cron chạy mỗi ngày 08:30 Asia/Ho_Chi_Minh: case active chưa có call nhận
  badge cảnh báo; gửi notification ở ngày thứ 3, thứ 7 và ba ngày cuối
  tháng để tránh spam. Báo cáo tương lai dùng chính call logs này.
- Kết quả `closed` chỉ là kết quả tư vấn; trạng thái giữ khách chỉ đổi khi
  đơn thật sự chuyển `official`.

### 5.3 Đơn official

Ngay sau khi `SalesOrdersService.transitionOrderStatus()` lưu một order
official, gọi `SalesLeadLifecycleService.handleOfficialOrder(order)`:

1. tìm case theo `order.salesFunnelId`; nếu không có thì bỏ qua (legacy);
2. nếu chưa từng official, set `firstOfficialOrderId/firstOfficialAt`;
3. assignment active chuyển thành `retained`, đóng `cycleEndAt`;
4. case chuyển `retained` và không bị cron cuối tháng thu hồi.

Đây là thay đổi code ở service cũ, **không** thay đổi schema cũ.

### 5.4 Trả pool đầu tháng

Cron `0 5 0 1 * *` với timezone `Asia/Ho_Chi_Minh`:

1. tìm assignment active có `cycleEndAt < now` và case chưa có
   `firstOfficialOrderId`;
2. trong transaction, chuyển assignment thành `recycled` với
   `endReason: "month_expired"`, xóa `currentAssignmentId`, set case là
   `pooled`;
3. gửi notification cho CS vừa care và tạo notification cho Sales Hunter để
   phân lại;
4. cron idempotent: query chỉ lấy record `active`, vì vậy chạy lại không tạo
   bản ghi trùng.

Khi Hunter phân lại từ hàng chờ, API tạo assignment `recycled` cho tháng mới (hoặc
`initial` nếu đây là lead mới chưa từng được gán). Response phải trả
`previousSalesCs` và `previousCycleKey` để UI hiển thị người care tháng trước.
Việc claim case và tạo assignment diễn ra trong một transaction; request thứ
hai nhận `409 Conflict` nếu lead đã được nhận.

### 5.5 Chuyển khách thủ công

- CS chỉ chọn được recipient đang bật nhận khách.
- Assignment cũ kết thúc `manual_transfer`, snapshot được giữ lại.
- Assignment mới bắt đầu tại thời điểm chuyển và mang `previousSalesCsId`.
- Nếu case chưa official, assignment mới kế thừa `cycleKey/cycleEndAt` cũ;
  cuối tháng vẫn trả pool nếu không có official. Nếu case retained thì
  assignment mới không có hạn theo tháng.

## 6. Quyền truy cập

| Dữ liệu/hành động | Hunter | CS hiện tại | CS cũ | Leader/Admin |
| --- | --- | --- | --- | --- |
| Tạo lead | Có | Không | Không | Có |
| Xem/nhận lead từ hàng chờ | Có, chọn CS nhận lead | Không | Không | Có |
| Xem case đang assigned | Chỉ trạng thái tổng quát lead do mình tạo | Có | Không | Có |
| Gọi/ghi note | Không | Chỉ assignment active của mình | Không | Có |
| Xem kỳ đã kết thúc | Không có call/note CS | Nếu là kỳ mình từng sở hữu: snapshot + call của kỳ đó | Snapshot + call của kỳ đó | Toàn bộ |
| Chuyển khách | Không | Có, chỉ recipient đang bật | Không | Có |
| Bật/tắt nhận lead | Có | Không | Không | Có |

Tất cả endpoint mới tự kiểm tra assignment ở backend. Không dựa vào việc ẩn
nút trên FE. Legacy endpoint không được dùng để hiển thị lead pipeline mới;
FE mới chỉ gọi endpoint `sales-leads`.

### Bảo vệ đường legacy trong giai đoạn chuyển tiếp

`SalesFunnel.user` của funnel mới được đồng bộ với CS hiện tại để các thao
tác đơn hàng cũ vẫn có một owner hợp lệ. Đây chỉ là compatibility field,
không phải nguồn quyền cho lead pipeline.

Các service legacy có thể lộ dữ liệu pipeline (`SalesFunnel`, `SalesOrder`,
`SalesActivity`) phải gọi `SalesLeadAccessService` trước khi trả/sửa dữ liệu:

- không có `SalesLeadCase` tương ứng: giữ nguyên rule legacy;
- có case: áp rule assignment ở bảng trên;
- CS cũ chỉ nhận snapshot/call log từ endpoint mới, không được dùng API cũ
  để xem dữ liệu sau lúc chuyển.

Đây là thay đổi code guard/service, không thay đổi schema legacy, và là điều
kiện bắt buộc để việc hạn chế lịch sử có hiệu lực ở backend thay vì chỉ trên
giao diện.

## 7. API đề xuất

Base path: `/v1/sales-leads`.

### Hunter

- `POST /` — tạo funnel/case; channel và `salesCsId` đều là tùy chọn. Khi cả
  hai được nhập, CS phải là người phụ trách kênh đó.
- `GET /mine/acquired` — lead hunter tạo, chỉ thông tin tổng quan.
- `GET /pool` — lead chưa gán hoặc đã trả hàng chờ.
- `POST /:id/assign` — chọn `salesCsId` đang bật để phân lead.

### Sales CS

- `GET /mine/active` — danh sách case/khách hiện tại, filter `needsCall`.
- `GET /:id` — detail đã được cắt dữ liệu theo quyền và assignment.
- `POST /:id/calls` — tạo call log, outcome + note bắt buộc.
- `GET /:id/calls` — chỉ trả call log thuộc các assignment được phép xem.
- `POST /:id/transfer` — chuyển cho `salesCsId` đang bật.

### Leader/Admin

- `GET /` — tìm kiếm mọi case, assignment history và call compliance.
- `GET /availability` — danh sách CS và trạng thái nhận lead.
- `PATCH /availability/:salesCsId` — bật/tắt nhận lead.
- `GET /reports/call-compliance` — chuẩn bị từ đầu cho báo cáo: số lead,
  số có >=1 call, số chưa gọi, outcome theo CS/kỳ.

Mọi mutation ghi `SystemLog` với case/assignment id, actor và action.

## 8. UI frontend đề xuất

Thêm các route dưới `/sales`:

- `/sales/leads/new`: hunter tạo lead; có thể để trống channel và Sales CS.
- `/sales/leads?view=acquired`: màn mặc định của Hunter, có filter trạng thái
  `unassigned`/`assigned`/`pooled`/`retained`; lead `pooled` được phân lại
  ngay trên danh sách này.
- `/sales/leads/my-customers`: CS xem active + retained; tab "Cần gọi" đặt
  mặc định, badge đỏ cho lead chưa có call trong kỳ.
- `/sales/leads/:id`: timeline assignment, call log đúng phạm vi quyền, form
  ghi cuộc gọi và chuyển khách.
- `/sales/leads/availability`: hunter/leader/admin bật/tắt CS nhận số.
- `/sales/leads/report/call-compliance`: ẩn feature flag ở phase đầu, nhưng
  API/schema đã đủ dữ liệu để mở ở phase sau.

Chỉ các role phù hợp thấy nav. Tất cả notification dùng component hiện có và
link thẳng đến detail/pool.

## 9. Migration và rollout

1. Thêm role labels/permissions cho `sales-hunter`, `sales-cs`.
2. Gán role cho Hạnh, Quân, Khiến và tài khoản liên quan; quyền cũ
   `sales-emp` được chuyển hoàn toàn sang `sales-cs`.
3. Tạo `SalesCsAvailability` ban đầu cho từng CS, mặc định tắt để leader
   chủ động mở người nhận số.
4. Deploy schema/module/API mới và UI mới, không backfill funnel cũ.
5. Bật pipeline mới bằng feature flag sau khi role và availability hoàn tất.
6. Chỉ các lead được tạo sau thời điểm bật flag đi vào pipeline mới.

Không chạy migration sửa collection cũ. Nếu một funnel legacy cần được đưa
vào pipeline mới về sau, phải có action admin "adopt legacy funnel" rõ ràng;
không tự động làm trong phase đầu.

## 10. Test acceptance bắt buộc

1. CS không thể nhận lead khi tài khoản tắt hoặc không có role `sales-cs`.
2. Hai Hunter cùng phân một lead trong hàng chờ: chỉ một request thành công.
3. CS không ghi call cho case không thuộc assignment active của mình.
4. Case có ít nhất một call không còn trong danh sách "chưa gọi".
5. Case không official bị trả pool đúng 00:05 đầu tháng theo Asia/Ho_Chi_Minh.
6. Case có official trước deadline không bị trả pool; CS vẫn sở hữu sau tháng.
7. Chuyển thủ công chỉ list recipient bật; CS cũ chỉ đọc snapshot/call của kỳ
   cũ sau khi chuyển.
8. Hunter chỉ thấy trạng thái tổng quan của lead đã tạo, không thấy note/call.
9. Funnel legacy không xuất hiện trong pool và không bị cron thu hồi.
10. Chạy cron lần hai không tạo thêm assignment/pool entry/notification.

## 11. Phạm vi phase 1 và để ngỏ

Phase 1 có warning vận hành và dữ liệu báo cáo. Màn hình report hoàn chỉnh,
quota nâng cao theo số lần gọi và tự chia lead round-robin để phase sau.

Một policy có thể thay đổi mà không ảnh hưởng schema: duplicate phone. Phase
1 cảnh báo + hunter xác nhận, không chặn tạo. Nếu sau này cần chặn trùng,
thêm rule nghiệp vụ trên số điện thoại đã chuẩn hóa.
