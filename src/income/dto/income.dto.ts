export class InsertIncomeFileDto {
  file: Express.Multer.File
  type: "affiliate" | "ads" | "other"
  date: Date
}

export class InsertIncomeRequest {
  type: "affiliate" | "ads" | "other"
  date: Date
}

export class XlsxIncomeData {
  "Order ID": string
  "Seller SKU": string
  "Product Name": string
  "Buyer Username": string
  "Province": string
  "Quantity": number
  "SKU Unit Original Price": number
  "SKU Subtotal Before Discount": number
}

export class UpdateAffiliateTypeDto {
  file: Express.Multer.File
}

export class XlsxAffiliateData {
  "ID đơn hàng": string
  "Sku người bán": string
  "Số lượng": number
  "Tên người dùng": string
  "Loại nội dung": string
  "Tỉ lệ hoa hồng tiêu chuẩn": number
  "Tỉ lệ hoa hồng Quảng cáo cửa hàng": number
}

export class AffiliateType {
  orderId: string
  code: string
  quantity: number
  customer: string
  content: string
  standardCommissionRate: number
  affiliateAdsCommissionRate: number
}
