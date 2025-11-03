# Sales Dashboard APIs

Module cung cấp các API để xem thống kê và phân tích doanh số bán hàng.

## Endpoints

### 1. GET /sales-dashboard/revenue-stats

Lấy thống kê doanh thu trong một khoảng thời gian.

**Query Parameters:**

- `startDate` (required): Ngày bắt đầu (ISO 8601 format: YYYY-MM-DD)
- `endDate` (required): Ngày kết thúc (ISO 8601 format: YYYY-MM-DD)

**Response:**

```json
{
  "totalRevenue": 50000000,
  "totalOrders": 125,
  "newCustomerRevenue": 30000000,
  "returningCustomerRevenue": 20000000,
  "totalItemsSold": 350,
  "revenueByChannel": [
    {
      "channelId": "65f1234567890abcdef12345",
      "channelName": "Facebook Ads",
      "revenue": 25000000,
      "orders": 60
    },
    {
      "channelId": "65f1234567890abcdef12346",
      "channelName": "Website",
      "revenue": 25000000,
      "orders": 65
    }
  ],
  "revenueByUser": [
    {
      "userId": "65f1234567890abcdef12347",
      "userName": "Nguyen Van A",
      "revenue": 30000000,
      "orders": 75
    },
    {
      "userId": "65f1234567890abcdef12348",
      "userName": "Tran Thi B",
      "revenue": 20000000,
      "orders": 50
    }
  ]
}
```

**Authorization:** Requires role `admin`, `sales-emp`, or `system-emp`

---

### 2. GET /sales-dashboard/monthly-metrics

Lấy các chỉ số kinh doanh theo tháng (CAC, CRR, churn rate, conversion rate, etc.)

**Query Parameters:**

- `year` (required): Năm (ví dụ: 2024)
- `month` (required): Tháng (1-12)

**Response:**

```json
{
  "cac": 150000,
  "crr": 85.5,
  "churnRate": 14.5,
  "conversionRate": 35.2,
  "avgDealSize": 450000,
  "salesCycleLength": 7.5,
  "stageTransitions": {
    "lead": 150,
    "contacted": 100,
    "customer": 45,
    "closed": 5
  }
}
```

**Metrics Explained:**

- **CAC (Customer Acquisition Cost)**: Chi phí trung bình để có được một khách hàng mới
  - Công thức: `Tổng chi phí marketing / Số khách hàng mới`
- **CRR (Customer Retention Rate)**: Tỷ lệ giữ chân khách hàng (%)
  - Công thức: `((Khách hàng cuối tháng - Khách hàng mới) / Khách hàng đầu tháng) × 100`
- **Churn Rate**: Tỷ lệ khách hàng rời bỏ (%)
  - Công thức: `100 - CRR`
- **Conversion Rate**: Tỷ lệ chuyển đổi từ contacted sang customer (%)
  - Công thức: `(Số contacted chuyển thành customer / Tổng số contacted) × 100`
- **Average Deal Size**: Giá trị đơn hàng trung bình
  - Công thức: `Tổng doanh thu / Số đơn hàng`
- **Sales Cycle Length**: Thời gian trung bình để chuyển đổi từ contacted sang customer (ngày)
  - Công thức: Trung bình số ngày giữa hai stage transitions
- **Stage Transitions**: Số lượng khách hàng chuyển sang mỗi stage trong tháng

**Authorization:** Requires role `admin`, `sales-emp`, or `system-emp`

---

## Dependencies

Module này phụ thuộc vào:

- `SalesOrdersModule`: Để lấy dữ liệu đơn hàng và doanh thu
- `SalesFunnelModule`: Để lấy dữ liệu về funnel và stage transitions
- `SalesChannelsModule`: Để lấy thông tin kênh bán hàng (`channelName`)
- `UsersModule`: Để lấy thông tin nhân viên (`name`)
- `SystemLogsModule`: Để ghi log các action

## Data Flow

### Revenue Stats

1. Lấy tất cả orders trong khoảng thời gian
2. Populate `salesFunnelId` với:
   - `channel`: Lấy `channelName` từ `SalesChannel`
   - `user`: Lấy `name` từ `User`
3. Tính toán:
   - **Total revenue**: Sum của `order.total`
   - **Revenue by channel**: Group theo `channel._id`, sum theo `order.total`
   - **Revenue by user**: Group theo `user._id`, sum theo `order.total`
   - **Revenue by item**: Group theo `item.code`, sum theo `item.price * item.quantity`

### Monthly Metrics

1. Lấy orders trong tháng
2. Lấy tất cả funnels và populate channel, user
3. Tính toán các metrics dựa trên:
   - Orders: `avgDealSize`
   - Funnels: `CAC`, `CRR`, `churnRate`
   - Stage logs: `conversionRate`, `salesCycleLength`, `stageTransitions`

## Notes

- Tất cả các API yêu cầu JWT authentication
- Stage transitions được tự động ghi lại trong trường `updateStageLogs` của SalesFunnel khi stage thay đổi
- Nếu không có dữ liệu trong khoảng thời gian được chỉ định, các giá trị metric sẽ là 0 hoặc null
- Channel name được lấy từ field `channelName` trong schema `SalesChannel`
- User name được lấy từ field `name` trong schema `User`
