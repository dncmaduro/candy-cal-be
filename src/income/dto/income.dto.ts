export class InsertIncomeFileDto {
  file: Express.Multer.File
  type: "affiliate" | "ads" | "other"
  date: Date
  channel: string
}

export class InsertIncomeRequest {
  type: "affiliate" | "ads" | "other"
  date: Date
  channel: string
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
  "SKU Platform Discount": number
  "SKU Seller Discount": number
  "SKU Subtotal After Discount": number
  "Cancelation/Return Type": string
  "Shipping Provider Name"?: string
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
  "Tên người dùng nhà sáng tạo": string
  "Thanh toán hoa hồng Quảng cáo cửa hàng ước tính": number
  "Thanh toán hoa hồng tiêu chuẩn ước tính": number
  "Thời gian đã tạo": string // dd/MM/YYYY hh:mm:ss
  "Tổng phụ sau chiết khấu (SKU)": number // Income amount
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
