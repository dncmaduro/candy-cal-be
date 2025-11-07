# Sales Orders APIs

Module quản lý đơn hàng bán hàng.

## Endpoints

### 1. POST /salesorders

Tạo đơn hàng mới.

**Request Body:**

```json
{
  "salesFunnelId": "65f1234567890abcdef12345",
  "items": [
    {
      "code": "ITEM001",
      "quantity": 2
    }
  ],
  "storage": "position_HaNam",
  "date": "2024-11-03T00:00:00.000Z"
}
```

**Response:**

```json
{
  "_id": "65f1234567890abcdef12346",
  "salesFunnelId": "65f1234567890abcdef12345",
  "items": [
    {
      "code": "ITEM001",
      "name": "Kẹo dẻo",
      "price": 50000,
      "quantity": 2
    }
  ],
  "returning": false,
  "storage": "position_HaNam",
  "date": "2024-11-03T00:00:00.000Z",
  "total": 100000,
  "tax": 0,
  "shippingCost": 0,
  "createdAt": "2024-11-03T10:00:00.000Z",
  "updatedAt": "2024-11-03T10:00:00.000Z"
}
```

**Notes:**

- `price` và `name` của mỗi item sẽ được tự động lấy từ bảng `SalesItem` dựa trên `code`
- `total` được tính tự động: `sum(item.price * item.quantity)`
- `returning` được tự động xác định dựa trên `hasBuyed` của funnel
- Sau khi tạo đơn đầu tiên, funnel sẽ được đánh dấu `hasBuyed = true`

**Authorization:** Requires role `admin` or `sales-emp`

---

### 2. PATCH /salesorders/:id/items

Cập nhật items của đơn hàng.

**Request Body:**

```json
{
  "items": [
    {
      "code": "ITEM001",
      "quantity": 3,
      "price": 45000
    },
    {
      "code": "ITEM002",
      "quantity": 1
    }
  ],
  "storage": "position_MKT"
}
```

**Response:**

```json
{
  "_id": "65f1234567890abcdef12346",
  "items": [
    {
      "code": "ITEM001",
      "name": "Kẹo dẻo",
      "price": 45000,
      "quantity": 3
    },
    {
      "code": "ITEM002",
      "name": "Socola",
      "price": 80000,
      "quantity": 1
    }
  ],
  "storage": "position_MKT",
  "total": 215000,
  "updatedAt": "2024-11-03T11:00:00.000Z"
}
```

**Notes:**

- `price` là **optional**:
  - Nếu **không truyền** `price`: Sẽ tự động lấy từ bảng `SalesItem`
  - Nếu **có truyền** `price`: Sẽ sử dụng giá được truyền vào (cho trường hợp giá đặc biệt, giảm giá, etc.)
- `name` luôn được lấy từ bảng `SalesItem` để đảm bảo nhất quán
- `total` được tính lại: `sum(item.price * item.quantity)`
- `storage` là optional, nếu không truyền thì giữ nguyên storage cũ

**Authorization:** Requires role `admin` or `sales-emp`

---

### 3. PATCH /salesorders/:id/shipping

Cập nhật thông tin vận chuyển.

**Request Body:**

```json
{
  "shippingCode": "VTP123456789",
  "shippingType": "shipping_vtp"
}
```

**Notes:**

- Cả `shippingCode` và `shippingType` đều là optional
- Chỉ cập nhật những field được truyền vào

**Authorization:** Requires role `admin` or `sales-emp`

---

### 4. DELETE /salesorders/:id

Xóa đơn hàng.

**Notes:**

- Nếu xóa đơn hàng cuối cùng của funnel, `hasBuyed` sẽ được đặt lại về `false`

**Authorization:** Requires role `admin` or `sales-emp`

---

### 5. GET /salesorders/:id

Lấy thông tin chi tiết đơn hàng.

**Response:**

```json
{
  "_id": "65f1234567890abcdef12346",
  "salesFunnelId": {
    "_id": "65f1234567890abcdef12345",
    "name": "Nguyen Van A",
    "facebook": "fb.com/nguyenvana",
    "stage": "customer"
  },
  "items": [
    {
      "code": "ITEM001",
      "name": "Kẹo dẻo",
      "price": 50000,
      "quantity": 2,
      "factory": "candy",
      "source": "china"
    }
  ],
  "total": 100000
}
```

**Notes:**

- Mỗi item sẽ được enriched với thông tin `factory` và `source` từ bảng `SalesItem`

**Authorization:** Requires role `admin`, `sales-emp`, or `system-emp`

---

### 6. GET /salesorders

Tìm kiếm và lọc đơn hàng.

**Query Parameters:**

- `salesFunnelId` (optional): Lọc theo funnel ID
- `returning` (optional): `true` | `false` - Lọc theo khách hàng mới/cũ
- `shippingType` (optional): `shipping_vtp` | `shipping_cargo` - Lọc theo loại vận chuyển
- `startDate` (optional): Ngày bắt đầu (ISO 8601)
- `endDate` (optional): Ngày kết thúc (ISO 8601)
- `searchText` (optional): Tìm kiếm theo shipping code, item code, item name
- `page` (optional, default: 1): Trang
- `limit` (optional, default: 10): Số lượng kết quả mỗi trang

**Response:**

```json
{
  "data": [
    {
      "_id": "65f1234567890abcdef12346",
      "items": [
        {
          "code": "ITEM001",
          "name": "Kẹo dẻo",
          "price": 50000,
          "quantity": 2,
          "factory": "candy",
          "source": "china"
        }
      ],
      "total": 100000
    }
  ],
  "total": 25
}
```

**Notes:**

- Mỗi item sẽ được enriched với `factory` và `source`

**Authorization:** Requires role `admin`, `sales-emp`, or `system-emp`

---

### 7. PATCH /salesorders/:id/storage

Cập nhật kho lưu trữ.

**Request Body:**

```json
{
  "storage": "position_MKT"
}
```

**Authorization:** Requires role `admin` or `sales-emp`

---

### 8. GET /salesorders/options/storages

Lấy danh sách các kho có sẵn.

**Response:**

```json
{
  "data": [
    { "value": "position_HaNam", "label": "Hà Nam" },
    { "value": "position_MKT", "label": "MKT" }
  ]
}
```

**Authorization:** Requires role `admin`, `sales-emp`, or `system-emp`

---

### 9. GET /salesorders/options/shipping-types

Lấy danh sách các loại vận chuyển có sẵn.

**Response:**

```json
{
  "data": [
    { "value": "shipping_vtp", "label": "Viettel Post" },
    { "value": "shipping_cargo", "label": "Chành xe" }
  ]
}
```

**Authorization:** Requires role `admin`, `sales-emp`, or `system-emp`

---

### 10. GET /salesorders/export/xlsx

Export đơn hàng ra file Excel với format chi tiết theo từng sản phẩm.

**Query Parameters:**

- Tương tự như API search: `salesFunnelId`, `returning`, `shippingType`, `startDate`, `endDate`, `searchText`
- **Không có** pagination (export tất cả kết quả)

**Response:**

- File Excel (.xlsx) được download trực tiếp
- Filename format: `orders_<timestamp>.xlsx`

**Excel Format:**

Mỗi sản phẩm trong mỗi đơn hàng tương ứng với 1 dòng, với các cột:

| Cột                     | Mô tả                      | Nguồn dữ liệu                |
| ----------------------- | -------------------------- | ---------------------------- |
| Mã sp                   | Mã sản phẩm                | `item.code`                  |
| Ngày tháng              | Ngày đặt hàng (dd/mm/yyyy) | `order.date`                 |
| Tên Sp                  | Tên sản phẩm tiếng Việt    | `item.name`                  |
| Tên Sp tiếng trung      | Tên sản phẩm tiếng Trung   | `salesItem.name.cn`          |
| Số lượng                | Số lượng                   | `item.quantity`              |
| Đơn giá                 | Đơn giá                    | `item.price`                 |
| Thành tiền              | Tổng tiền                  | `item.price * item.quantity` |
| Thuế                    | (trống)                    | -                            |
| Tiền ship               | (trống)                    | -                            |
| Khách trả tiền xe trước | (trống)                    | -                            |
| Thu tiền                | Tổng tiền cần thu          | `item.price * item.quantity` |
| Cần phải thu            | (trống)                    | -                            |
| Nhà phân phối           | Tên khách hàng             | `funnel.name`                |
| Kiểu vận chuyển         | Loại vận chuyển            | `order.shippingType` (label) |
| Xưởng                   | Xưởng sản xuất             | `salesItem.factory` (label)  |
| (trống)                 | Cột trống                  | -                            |
| Nguồn gốc               | Nguồn gốc                  | `salesItem.source` (label)   |
| Kho xuất hàng           | Kho                        | `order.storage` (label)      |

**Factory Labels Mapping:**

| Factory Code     | Excel Label    |
| ---------------- | -------------- |
| candy            | Xưởng kẹo mút  |
| jelly            | Xưởng thạch    |
| import           | Hàng nhập khẩu |
| manufacturing    | Xưởng gia công |
| position_MongCai | Móng Cái       |

**Source Labels Mapping:**

| Source Code | Excel Label        |
| ----------- | ------------------ |
| inside      | Hàng trong nhà máy |
| outside     | Hàng ngoài nhà máy |

**Storage Labels Mapping:**

| Storage Code   | Excel Label |
| -------------- | ----------- |
| position_HaNam | Kho Hà Nam  |
| position_MKT   | Kho MKT     |

**Shipping Type Labels Mapping:**

| Shipping Type Code | Excel Label        |
| ------------------ | ------------------ |
| shipping_vtp       | VIETTEL POST       |
| shipping_cargo     | SHIPCODE LÊN CHÀNH |

**Excel Formatting:**

- **Font**: Times New Roman, size 11
- **Alignment**: Left-aligned, vertically centered
- **Column widths**: Auto-adjusted for readability

**Example Request:**

```
GET /salesorders/export/xlsx?startDate=2024-11-01&endDate=2024-11-30&shippingType=shipping_vtp
```

**Notes:**

- Export tất cả đơn hàng matching filter (không có giới hạn)
- Mỗi item trong order tạo thành 1 dòng riêng trong Excel
- Các cột trống được để để người dùng điền thủ công nếu cần

**Authorization:** Requires role `admin`, `sales-emp`, or `system-emp`

---

## Price Management

### Cơ chế lưu giá

Khi tạo hoặc cập nhật đơn hàng:

1. **Mặc định**: Giá được lấy từ bảng `SalesItem` dựa trên `code`
2. **Override (chỉ khi update)**: Có thể truyền vào `price` để ghi đè giá (ví dụ: giảm giá, giá đặc biệt)
3. **Lưu vào DB**: Giá được lưu trực tiếp vào `items[].price` của order
4. **Tính toán**: Dashboard sẽ dựa vào `items[].price * items[].quantity` để tính doanh thu

### Lợi ích của việc lưu price trong order

1. **Lịch sử chính xác**: Giữ lại giá tại thời điểm mua, không bị ảnh hưởng khi giá trong `SalesItem` thay đổi
2. **Báo cáo đúng**: Dashboard luôn tính doanh thu chính xác dựa trên giá thực tế đã bán
3. **Linh hoạt**: Cho phép áp dụng giá đặc biệt cho từng đơn hàng mà không cần thay đổi master data

---

## Dependencies

Module này phụ thuộc vào:

- `SalesItemsModule`: Để lấy thông tin item (name, price, factory, source)
- `SalesFunnelModule`: Để quản lý trạng thái hasBuyed
- `SystemLogsModule`: Để ghi log các action
