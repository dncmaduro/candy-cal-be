export type RoutingSource = "storageitems" | "products" | "storagelogs" | "unknown"

export type RoutingTable = {
  source: Exclude<RoutingSource, "unknown">
  table: string
  description: string
  exampleQuestions: string[]
}

export const AI_ROUTING_TABLES: RoutingTable[] = [
  {
    source: "storageitems",
    table: "storageitems",
    description:
      "Thong tin ton kho, nhap kho, xuat kho, so luong moi thung/hop cua mat hang",
    exampleQuestions: [
      "Mat hang ABC con bao nhieu?",
      "Ma hang ABC ton kho bao nhieu?",
      "Ma mat hang ABC da nhap kho bao nhieu?",
      "Item ABC da xuat bao nhieu?",
      "So luong moi thung cua ABC la bao nhieu?"
    ]
  },
  {
    source: "products",
    table: "products",
    description: "Thong tin san pham va cac mat hang (item) cau thanh san pham",
    exampleQuestions: [
      "San pham ABC gom nhung mat hang nao?",
      "Product ABC co nhung item gi?",
      "San pham ABC co bao nhieu item?"
    ]
  },
  {
    source: "storagelogs",
    table: "storagelogs",
    description: "Lich su nhap kho, xuat kho, tra hang theo mat hang",
    exampleQuestions: [
      "Lich su nhap kho cua ma hang ABC",
      "Nhat ky xuat kho cua item ABC",
      "Mat hang nay xuat nhu nao trong ngay 23/1/2026 - 25/1/2026?",
      "Co bao nhieu item Thach kem da duoc xuat/nhap trong khoang thoi gian?"
    ]
  }
]
