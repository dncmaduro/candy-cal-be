export type DbTableContext = {
  collection: string
  schemaFile: string
  keyFields: string[]
  description: string
  primaryKeys: string[]
  searchableFields: string[]
  dateFields: string[]
  statusFields: string[]
  relationships: string[]
  commonFilters: string[]
  queryHints: string[]
  examples: string[]
}

export const AI_DB_TABLES: DbTableContext[] = [
  {
    collection: "users",
    schemaFile: "User",
    keyFields: ["avatarUrl", "name", "password", "roles", "username"],
    description:
      "Schema User. Cac truong chinh: avatarUrl, name, password, roles, username. Day la bang quan ly nguoi dung, gom cac thong tin dung de phan quyen cho nguoi dung.",
    primaryKeys: ["name", "username"],
    searchableFields: ["name", "username"],
    dateFields: [],
    statusFields: [],
    relationships: [],
    commonFilters: [],
    queryHints: [],
    examples: [
      "Lay du lieu tu bang users theo dieu kien phu hop",
      "Tim kiem trong bang users"
    ]
  },
  {
    collection: "products",
    schemaFile: "Product",
    keyFields: ["_id", "quantity"],
    description:
      "San pham gom nhieu item (StorageItem) va so luong moi item. Day la bang quan ly cac SKU cua nen tang Tiktok Shop. Cac SKU duoc tao tu cac mat hang (Item) co ton kho.",
    primaryKeys: ["name", "_id"],
    searchableFields: ["name"],
    dateFields: [],
    statusFields: [],
    relationships: ["items._id -> storageitems"],
    commonFilters: ["deletedAt: null"],
    queryHints: [],
    examples: [
      "San pham ABC gom nhung item nao?",
      "Product ABC co bao nhieu item?"
    ]
  },
  {
    collection: "items",
    schemaFile: "Item",
    keyFields: ["name", "note", "variants"],
    description:
      "Schema Item. Cac truong chinh: name, note, variants. Day la bang quan ly cac mat hang (Item) co ton kho. Bang nay hien tai da deprecated.",
    primaryKeys: ["name"],
    searchableFields: ["name"],
    dateFields: [],
    statusFields: [],
    relationships: [],
    commonFilters: [],
    queryHints: [],
    examples: [
      "Lay du lieu tu bang items theo dieu kien phu hop",
      "Tim kiem trong bang items"
    ]
  },
  {
    collection: "commonorders",
    schemaFile: "CommonOrder",
    keyFields: ["products"],
    description:
      "Schema CommonOrder. Cac truong chinh: products. Day la bang quan ly cac don hang chung, chua thong tin so luong cac mat hang (Item) can mua. Bang nay hien tai da deprecated.",
    primaryKeys: [],
    searchableFields: [],
    dateFields: [],
    statusFields: [],
    relationships: [],
    commonFilters: [],
    queryHints: [],
    examples: [
      "Lay du lieu tu bang commonorders theo dieu kien phu hop",
      "Tim kiem trong bang commonorders"
    ]
  },
  {
    collection: "logs",
    schemaFile: "Log",
    keyFields: ["date", "items", "orders", "updatedAt"],
    description:
      "Schema Log. Cac truong chinh: date, items, orders, updatedAt. Day la bang quan ly cac nhat ky nhap/xuat/tra kho. Bang nay hien tai da deprecated.",
    primaryKeys: [],
    searchableFields: [],
    dateFields: ["date", "updatedAt"],
    statusFields: [],
    relationships: [],
    commonFilters: [],
    queryHints: [],
    examples: [
      "Lay du lieu tu bang logs theo dieu kien phu hop",
      "Tim kiem trong bang logs"
    ]
  },
  {
    collection: "storageitems",
    schemaFile: "StorageItem",
    keyFields: [
      "code",
      "deletedAt",
      "deliveredQuantity",
      "name",
      "note",
      "quantityPerBox",
      "receivedQuantity",
      "restQuantity"
    ],
    description:
      "Ton kho theo ma hang. Luu so luong nhap/xuat/ton va so luong moi thung. Day la bang quan ly ton kho cua toan bo he thong. Cac ma hang o trong kho co the tao lenh nhap kho, lenh tra kho, lenh xuat kho. Lenh xuat kho co the xuat theo thu cong, theo SKU cua Tiktok Shop hoac SKU cua Shopee. Moi cau hoi ve ton kho bat buoc truy van bang storageitems.",
    primaryKeys: ["code"],
    searchableFields: ["code", "name"],
    dateFields: [],
    statusFields: ["deletedAt"],
    relationships: [],
    commonFilters: ["deletedAt: null"],
    queryHints: [
      "Tim theo code bang regex ^code$ va $options:i",
      "Tim theo name bang regex i"
    ],
    examples: [
      "Ma hang ABC ton kho bao nhieu?",
      "Mat hang Thach kem co bao nhieu thung?"
    ]
  },
  {
    collection: "storagelogs",
    schemaFile: "StorageLog",
    keyFields: ["_id", "quantity"],
    description:
      "Nhat ky nhap/xuat/tra kho theo mat hang. Co the luu 1 item hoac nhieu items. Day la bang quan ly cac lenh nhap/xuat/tra kho.",
    primaryKeys: ["_id"],
    searchableFields: ["note", "tag"],
    dateFields: ["date"],
    statusFields: ["status"],
    relationships: [
      "item._id -> storageitems",
      "items._id -> storageitems",
      "deliveredRequestId -> deliveredrequests"
    ],
    commonFilters: [],
    queryHints: [
      "Filter theo status (received/delivered/returned)",
      "Filter theo date range"
    ],
    examples: [
      "Tu ngay 20/11/2025 den 20/12/2026, co bao nhieu mat hang Thach kem duoc xuat?",
      "Nhat ky nhap kho cua ma hang ABC"
    ]
  },
  {
    collection: "deliveredrequests",
    schemaFile: "DeliveredRequest",
    keyFields: ["_id", "quantity"],
    description:
      "Schema DeliveredRequest. Cac truong chinh: _id, quantity. Day la bang quan ly cac lenh giao hang. Khi Tiktok Shop hoac Shopee tao lenh giao hang, co the tao lenh xuat kho tuong ung.",
    primaryKeys: ["_id"],
    searchableFields: [],
    dateFields: [],
    statusFields: [],
    relationships: [],
    commonFilters: [],
    queryHints: [],
    examples: [
      "Lay du lieu tu bang deliveredrequests theo dieu kien phu hop",
      "Tim kiem trong bang deliveredrequests"
    ]
  },
  {
    collection: "readycombos",
    schemaFile: "ReadyCombo",
    keyFields: ["_id", "quantity"],
    description:
      "Schema ReadyCombo. Cac truong chinh: _id, quantity. Day la bang quan ly cac combo co san. Bang nay hien tai dang pending, khong su dung nhieu.",
    primaryKeys: ["_id"],
    searchableFields: [],
    dateFields: [],
    statusFields: [],
    relationships: [],
    commonFilters: [],
    queryHints: [],
    examples: [
      "Lay du lieu tu bang readycombos theo dieu kien phu hop",
      "Tim kiem trong bang readycombos"
    ]
  },
  {
    collection: "orderlogs",
    schemaFile: "OrderLog",
    keyFields: ["afternoon", "date", "morning", "updatedAt"],
    description:
      "Schema OrderLog. Cac truong chinh: afternoon, date, morning, updatedAt. Day la bang quan ly cac nhat ky viec xuat hang cho TiktokShop/Shopee. Bang nay hien tai dang pending, khong su dung nhieu.",
    primaryKeys: [],
    searchableFields: [],
    dateFields: ["date", "updatedAt"],
    statusFields: [],
    relationships: [],
    commonFilters: [],
    queryHints: [],
    examples: [
      "Lay du lieu tu bang orderlogs theo dieu kien phu hop",
      "Tim kiem trong bang orderlogs"
    ]
  },
  {
    collection: "monthgoals",
    schemaFile: "MonthGoal",
    keyFields: [
      "channel",
      "liveAdsPercentageGoal",
      "liveStreamGoal",
      "month",
      "shopAdsPercentageGoal",
      "shopGoal",
      "year"
    ],
    description:
      "Schema MonthGoal. Cac truong chinh: channel, liveAdsPercentageGoal, liveStreamGoal, month, shopAdsPercentageGoal, shopGoal, year. Day la bang quan ly KPI cua cac kenh Tiktok Shop/Shopee.",
    primaryKeys: [],
    searchableFields: [],
    dateFields: [],
    statusFields: [],
    relationships: [],
    commonFilters: [],
    queryHints: [],
    examples: [
      "Lay du lieu tu bang monthgoals theo dieu kien phu hop",
      "Tim kiem trong bang monthgoals"
    ]
  },
  {
    collection: "incomes",
    schemaFile: "Income",
    keyFields: [
      "channel",
      "customer",
      "date",
      "orderId",
      "products",
      "province",
      "shippingProvider"
    ],
    description:
      "Schema Income. Cac truong chinh: channel, customer, date, orderId, products, province, shippingProvider. Day la bang quan ly doanh thu va cac thong tin lien quan den doanh thu (nhu hoa hong, nguon doanh thu, ...) cua cac kenh Tiktok Shop.",
    primaryKeys: ["orderId"],
    searchableFields: ["orderId"],
    dateFields: ["date"],
    statusFields: [],
    relationships: [],
    commonFilters: [],
    queryHints: [],
    examples: [
      "Lay du lieu tu bang incomes theo dieu kien phu hop",
      "Tim kiem trong bang incomes"
    ]
  },
  {
    collection: "packingrules",
    schemaFile: "PackingRule",
    keyFields: ["packingType", "products"],
    description:
      "Schema PackingRule. Cac truong chinh: packingType, products. Day la bang quan ly cac quy tac dong goi cua Tiktok Shop.",
    primaryKeys: [],
    searchableFields: [],
    dateFields: [],
    statusFields: [],
    relationships: [],
    commonFilters: [],
    queryHints: [],
    examples: [
      "Lay du lieu tu bang packingrules theo dieu kien phu hop",
      "Tim kiem trong bang packingrules"
    ]
  },
  {
    collection: "sessionlogs",
    schemaFile: "SessionLog",
    keyFields: ["items", "orders", "time", "updatedAt"],
    description:
      "Schema SessionLog. Cac truong chinh: items, orders, time, updatedAt. Day la bang quan ly cac nhat ky viec xuat hang cho TiktokShop/Shopee. Bang nay hien tai dang pending, khong su dung nhieu.",
    primaryKeys: [],
    searchableFields: [],
    dateFields: ["time", "updatedAt"],
    statusFields: [],
    relationships: [],
    commonFilters: [],
    queryHints: [],
    examples: [
      "Lay du lieu tu bang sessionlogs theo dieu kien phu hop",
      "Tim kiem trong bang sessionlogs"
    ]
  },
  {
    collection: "dailylogs",
    schemaFile: "DailyLog",
    keyFields: ["channel", "date", "items", "orders", "updatedAt"],
    description:
      "Schema DailyLog. Cac truong chinh: channel, date, items, orders, updatedAt. Day la bang quan ly cac nhat ky viec xuat hang hang ngay cho TiktokShop/Shopee.",
    primaryKeys: [],
    searchableFields: [],
    dateFields: ["date", "updatedAt"],
    statusFields: [],
    relationships: [],
    commonFilters: [],
    queryHints: [],
    examples: [
      "Lay du lieu tu bang dailylogs theo dieu kien phu hop",
      "Tim kiem trong bang dailylogs"
    ]
  },
  {
    collection: "systemlogs",
    schemaFile: "SystemLog",
    keyFields: [
      "action",
      "entity",
      "entityId",
      "ip",
      "meta",
      "result",
      "time",
      "type",
      "userAgent",
      "userId"
    ],
    description:
      "Schema SystemLog. Cac truong chinh: action, entity, entityId, ip, meta, result, time, type, userAgent, userId. Day la bang quan ly cac hanh dong trong he thong, luu vet lich su hoat dong cua cac tai khoan trong he thong.",
    primaryKeys: [],
    searchableFields: [],
    dateFields: ["time"],
    statusFields: [],
    relationships: [],
    commonFilters: [],
    queryHints: [],
    examples: [
      "Lay du lieu tu bang systemlogs theo dieu kien phu hop",
      "Tim kiem trong bang systemlogs"
    ]
  },
  {
    collection: "dailyads",
    schemaFile: "DailyAds",
    keyFields: [
      "before4pmLiveAdsCost",
      "before4pmShopAdsCost",
      "channel",
      "date",
      "liveAdsCost",
      "shopAdsCost",
      "updatedAt"
    ],
    description:
      "Schema DailyAds. Cac truong chinh: before4pmLiveAdsCost, before4pmShopAdsCost, channel, date, liveAdsCost, shopAdsCost, updatedAt. Day la bang quan ly chi phi quang cao hang ngay cho Tiktok Shop.",
    primaryKeys: [],
    searchableFields: [],
    dateFields: ["date", "updatedAt"],
    statusFields: [],
    relationships: [],
    commonFilters: [],
    queryHints: [],
    examples: [
      "Lay du lieu tu bang dailyads theo dieu kien phu hop",
      "Tim kiem trong bang dailyads"
    ]
  },
  {
    collection: "livestreamperiods",
    schemaFile: "LivestreamPeriod",
    keyFields: ["channel", "endTime", "for", "startTime"],
    description:
      "Schema LivestreamPeriod. Cac truong chinh: channel, endTime, for, startTime. Day la bang quan ly cac ca livestream cua cac kenh Tiktok/Shopee.",
    primaryKeys: [],
    searchableFields: [],
    dateFields: ["endTime", "startTime"],
    statusFields: [],
    relationships: [],
    commonFilters: [],
    queryHints: [],
    examples: [
      "Lay du lieu tu bang livestreamperiods theo dieu kien phu hop",
      "Tim kiem trong bang livestreamperiods"
    ]
  },
  {
    collection: "livestreamemployees",
    schemaFile: "LivestreamEmployee",
    keyFields: ["active", "name"],
    description:
      "Schema LivestreamEmployee. Cac truong chinh: active, name. Day la bang quan ly cac nhan vien livestream cua Tiktok Shop. Bang nay hien tai da deprecated.",
    primaryKeys: ["name"],
    searchableFields: ["name"],
    dateFields: [],
    statusFields: ["active"],
    relationships: [],
    commonFilters: [],
    queryHints: [],
    examples: [
      "Lay du lieu tu bang livestreamemployees theo dieu kien phu hop",
      "Tim kiem trong bang livestreamemployees"
    ]
  },
  {
    collection: "livestreams",
    schemaFile: "Livestream",
    keyFields: [
      "adsCost",
      "altAssignee",
      "altNote",
      "altOtherAssignee",
      "assignee",
      "avgViewingDuration",
      "clickRate",
      "comments",
      "income",
      "orders",
      "ordersNote",
      "period",
      "rating",
      "realIncome",
      "salary",
      "snapshotKpi"
    ],
    description:
      "Schema Livestream. Cac truong chinh: adsCost, altAssignee, altNote, altOtherAssignee, assignee, avgViewingDuration, clickRate, comments, income, orders, ordersNote, period, rating, realIncome, salary, snapshotKpi. Day la bang quan ly lich livestream cua Tiktok Shop. Moi document tuong ung voi 1 buoi livestream trong 1 ngay cua 1 kenh, trong do co cac ca livestream cua cac nhan vien. Trong moi ca se co cac thong tin ket qua cua livestream va thong tin ve luong, hieu suat lam viec cua nhan vien.",
    primaryKeys: [],
    searchableFields: [],
    dateFields: [],
    statusFields: [],
    relationships: [],
    commonFilters: [],
    queryHints: [],
    examples: [
      "Lay du lieu tu bang livestreams theo dieu kien phu hop",
      "Tim kiem trong bang livestreams"
    ]
  },
  {
    collection: "shopeeproducts",
    schemaFile: "ShopeeProduct",
    keyFields: ["_id", "quantity"],
    description:
      "Schema ShopeeProduct. Cac truong chinh: _id, quantity. Day la bang quan ly cac san pham/SKU duoc ban tren Shopee. Moi SKU tuong ung voi cac mat hang trong storageitems.",
    primaryKeys: ["_id"],
    searchableFields: [],
    dateFields: [],
    statusFields: [],
    relationships: [],
    commonFilters: [],
    queryHints: [],
    examples: [
      "Lay du lieu tu bang shopeeproducts theo dieu kien phu hop",
      "Tim kiem trong bang shopeeproducts"
    ]
  },
  {
    collection: "livestreammonthgoals",
    schemaFile: "LivestreamGoal",
    keyFields: ["channel", "goal", "month", "year"],
    description:
      "Schema LivestreamGoal. Cac truong chinh: channel, goal, month, year. Day la bang quan ly KPI cua cac kenh livestream.",
    primaryKeys: [],
    searchableFields: [],
    dateFields: [],
    statusFields: [],
    relationships: [],
    commonFilters: [],
    queryHints: [],
    examples: [
      "Lay du lieu tu bang livestreammonthgoals theo dieu kien phu hop",
      "Tim kiem trong bang livestreammonthgoals"
    ]
  },
  {
    collection: "salespriceitems",
    schemaFile: "SalesPriceItem",
    keyFields: ["createdAt", "deletedAt", "itemId", "price", "updatedAt"],
    description:
      "Schema SalesPriceItem. Cac truong chinh: createdAt, deletedAt, itemId, price, updatedAt. Day la bang quan ly cac don gia mua hang cua cac mat hang cho kenh ban hang si le.",
    primaryKeys: [],
    searchableFields: [],
    dateFields: ["createdAt", "updatedAt"],
    statusFields: ["deletedAt"],
    relationships: [],
    commonFilters: ["deletedAt: null"],
    queryHints: [],
    examples: [
      "Lay du lieu tu bang salespriceitems theo dieu kien phu hop",
      "Tim kiem trong bang salespriceitems"
    ]
  },
  {
    collection: "saleschannels",
    schemaFile: "SalesChannel",
    keyFields: [
      "address",
      "assignedTo",
      "avatarUrl",
      "channelName",
      "createdAt",
      "deletedAt",
      "phoneNumber",
      "updatedAt"
    ],
    description:
      "Schema SalesChannel. Cac truong chinh: address, assignedTo, avatarUrl, channelName, createdAt, deletedAt, phoneNumber, updatedAt. Day la bang quan ly cac kenh ban hang cho kenh ban hang si le.",
    primaryKeys: ["channelName"],
    searchableFields: ["channelName"],
    dateFields: ["createdAt", "updatedAt"],
    statusFields: ["deletedAt"],
    relationships: [],
    commonFilters: ["deletedAt: null"],
    queryHints: [],
    examples: [
      "Lay du lieu tu bang saleschannels theo dieu kien phu hop",
      "Tim kiem trong bang saleschannels"
    ]
  },
  {
    collection: "provinces",
    schemaFile: "Province",
    keyFields: ["code", "createdAt", "name", "updatedAt"],
    description:
      "Schema Province. Cac truong chinh: code, createdAt, name, updatedAt. Day la bang quan ly cac tinh/thanh pho cua Viet Nam.",
    primaryKeys: ["code", "name"],
    searchableFields: ["code", "name"],
    dateFields: ["createdAt", "updatedAt"],
    statusFields: [],
    relationships: [],
    commonFilters: [],
    queryHints: [],
    examples: [
      "Lay du lieu tu bang provinces theo dieu kien phu hop",
      "Tim kiem trong bang provinces"
    ]
  },
  {
    collection: "salesfunnel",
    schemaFile: "SalesFunnel",
    keyFields: [
      "address",
      "channel",
      "cost",
      "createdAt",
      "deletedAt",
      "fromSystem",
      "funnelSource",
      "hasBuyed",
      "name",
      "phoneNumber",
      "province",
      "psid",
      "secondaryPhoneNumbers",
      "stage",
      "updateStageLogs",
      "updatedAt",
      "user"
    ],
    description:
      "Schema SalesFunnel. Cac truong chinh: address, channel, cost, createdAt, deletedAt, fromSystem, funnelSource, hasBuyed, name, phoneNumber, province, psid, secondaryPhoneNumbers, stage, updateStageLogs, updatedAt, user. Day la bang quan ly cac khach hang (sales funnel) cho kenh ban hang si le.",
    primaryKeys: ["name"],
    searchableFields: ["name"],
    dateFields: ["createdAt", "updatedAt"],
    statusFields: ["deletedAt", "stage"],
    relationships: [],
    commonFilters: ["deletedAt: null"],
    queryHints: [],
    examples: [
      "Lay du lieu tu bang salesfunnel theo dieu kien phu hop",
      "Tim kiem trong bang salesfunnel"
    ]
  },
  {
    collection: "salesorders",
    schemaFile: "SalesOrder",
    keyFields: [
      "address",
      "createdAt",
      "date",
      "deposit",
      "items",
      "orderDiscount",
      "otherDiscount",
      "phoneNumber",
      "province",
      "receivedDate",
      "returning",
      "salesFunnelId",
      "shippingCode",
      "shippingCost",
      "shippingType",
      "status",
      "storage",
      "tax",
      "total",
      "updatedAt"
    ],
    description:
      "Schema SalesOrder. Cac truong chinh: address, createdAt, date, deposit, items, orderDiscount, otherDiscount, phoneNumber, province, receivedDate, returning, salesFunnelId, shippingCode, shippingCost, shippingType, status, storage, tax, total, updatedAt. Day la bang quan ly cac don hang cho kenh ban hang si le.",
    primaryKeys: ["shippingCode"],
    searchableFields: ["shippingCode"],
    dateFields: ["createdAt", "date", "receivedDate", "updatedAt"],
    statusFields: ["status"],
    relationships: [],
    commonFilters: [],
    queryHints: [],
    examples: [
      "Lay du lieu tu bang salesorders theo dieu kien phu hop",
      "Tim kiem trong bang salesorders"
    ]
  },
  {
    collection: "salesitems",
    schemaFile: "SalesItem",
    keyFields: [
      "area",
      "code",
      "createdAt",
      "factory",
      "mass",
      "name",
      "price",
      "size",
      "source",
      "specification",
      "updatedAt"
    ],
    description:
      "Schema SalesItem. Cac truong chinh: area, code, createdAt, factory, mass, name, price, size, source, specification, updatedAt. Day la bang quan ly cac mat hang cho kenh ban hang si le.",
    primaryKeys: ["code", "name"],
    searchableFields: ["code", "name"],
    dateFields: ["createdAt", "updatedAt"],
    statusFields: [],
    relationships: [],
    commonFilters: [],
    queryHints: [],
    examples: [
      "Lay du lieu tu bang salesitems theo dieu kien phu hop",
      "Tim kiem trong bang salesitems"
    ]
  },
  {
    collection: "salescustomerranks",
    schemaFile: "SalesCustomerRank",
    keyFields: ["minIncome", "rank"],
    description:
      "Schema SalesCustomerRank. Cac truong chinh: minIncome, rank. Day la bang quan ly cac rank cua khach hang cho kenh ban hang si le.",
    primaryKeys: [],
    searchableFields: [],
    dateFields: [],
    statusFields: [],
    relationships: [],
    commonFilters: [],
    queryHints: [],
    examples: [
      "Lay du lieu tu bang salescustomerranks theo dieu kien phu hop",
      "Tim kiem trong bang salescustomerranks"
    ]
  },
  {
    collection: "salesactivities",
    schemaFile: "SalesActivity",
    keyFields: [
      "createdAt",
      "note",
      "salesFunnelId",
      "time",
      "type",
      "updatedAt"
    ],
    description:
      "Schema SalesActivity. Cac truong chinh: createdAt, note, salesFunnelId, time, type, updatedAt. Day la bang quan ly cac hoat dong cho kenh ban hang si le.",
    primaryKeys: [],
    searchableFields: [],
    dateFields: ["createdAt", "time", "updatedAt"],
    statusFields: [],
    relationships: [],
    commonFilters: [],
    queryHints: [],
    examples: [
      "Lay du lieu tu bang salesactivities theo dieu kien phu hop",
      "Tim kiem trong bang salesactivities"
    ]
  },
  {
    collection: "salestasks",
    schemaFile: "SalesTask",
    keyFields: [
      "activityId",
      "assigneeId",
      "completed",
      "completedAt",
      "createdAt",
      "deadline",
      "note",
      "salesFunnelId",
      "type",
      "updatedAt"
    ],
    description:
      "Schema SalesTask. Cac truong chinh: activityId, assigneeId, completed, completedAt, createdAt, deadline, note, salesFunnelId, type, updatedAt. Day la bang quan ly cac cong viec cho kenh ban hang si le.",
    primaryKeys: [],
    searchableFields: [],
    dateFields: ["createdAt", "updatedAt"],
    statusFields: ["completed"],
    relationships: [],
    commonFilters: [],
    queryHints: [],
    examples: [
      "Lay du lieu tu bang salestasks theo dieu kien phu hop",
      "Tim kiem trong bang salestasks"
    ]
  },
  {
    collection: "salesdailyreports",
    schemaFile: "SalesDailyReport",
    keyFields: [
      "accumulatedAdsCost",
      "accumulatedNewFunnelRevenue",
      "accumulatedRevenue",
      "adsCost",
      "channel",
      "createdAt",
      "date",
      "dateKpi",
      "deletedAt",
      "newFunnelRevenue",
      "newOrder",
      "returningFunnelRevenue",
      "returningOrder",
      "revenue",
      "updatedAt"
    ],
    description:
      "Schema SalesDailyReport. Cac truong chinh: accumulatedAdsCost, accumulatedNewFunnelRevenue, accumulatedRevenue, adsCost, channel, createdAt, date, dateKpi, deletedAt, newFunnelRevenue, newOrder, returningFunnelRevenue, returningOrder, revenue, updatedAt. Day la bang quan ly cac bao cao hang ngay cho kenh ban hang si le.",
    primaryKeys: [],
    searchableFields: [],
    dateFields: ["createdAt", "date", "updatedAt"],
    statusFields: ["deletedAt"],
    relationships: [],
    commonFilters: ["deletedAt: null"],
    queryHints: [],
    examples: [
      "Lay du lieu tu bang salesdailyreports theo dieu kien phu hop",
      "Tim kiem trong bang salesdailyreports"
    ]
  },
  {
    collection: "salesmonthkpis",
    schemaFile: "SalesMonthKpi",
    keyFields: ["channel", "kpi", "month", "year"],
    description:
      "Schema SalesMonthKpi. Cac truong chinh: channel, kpi, month, year. Day la bang quan ly cac KPI hang thang cho kenh ban hang si le.",
    primaryKeys: [],
    searchableFields: [],
    dateFields: [],
    statusFields: [],
    relationships: [],
    commonFilters: [],
    queryHints: [],
    examples: [
      "Lay du lieu tu bang salesmonthkpis theo dieu kien phu hop",
      "Tim kiem trong bang salesmonthkpis"
    ]
  },
  {
    collection: "livestreamaltrequests",
    schemaFile: "LivestreamAltRequest",
    keyFields: [
      "altNote",
      "createdAt",
      "createdBy",
      "livestreamId",
      "snapshotId",
      "status",
      "updatedAt"
    ],
    description:
      "Schema LivestreamAltRequest. Cac truong chinh: altNote, createdAt, createdBy, livestreamId, snapshotId, status, updatedAt. Day la bang quan ly cac yeu cau doi nhan vien livestream cho kenh livestream.",
    primaryKeys: [],
    searchableFields: [],
    dateFields: ["createdAt", "updatedAt"],
    statusFields: ["status"],
    relationships: [],
    commonFilters: [],
    queryHints: [],
    examples: [
      "Lay du lieu tu bang livestreamaltrequests theo dieu kien phu hop",
      "Tim kiem trong bang livestreamaltrequests"
    ]
  },
  {
    collection: "livestreamperformance",
    schemaFile: "LivestreamPerformance",
    keyFields: ["bonusPercentage", "maxIncome", "minIncome", "salaryPerHour"],
    description:
      "Schema LivestreamPerformance. Cac truong chinh: bonusPercentage, maxIncome, minIncome, salaryPerHour. Day la bang quan ly cac muc luong cho kenh livestream.",
    primaryKeys: [],
    searchableFields: [],
    dateFields: [],
    statusFields: [],
    relationships: [],
    commonFilters: [],
    queryHints: [],
    examples: [
      "Lay du lieu tu bang livestreamperformance theo dieu kien phu hop",
      "Tim kiem trong bang livestreamperformance"
    ]
  },
  {
    collection: "livestreamsalary",
    schemaFile: "LivestreamSalary",
    keyFields: ["livestreamEmployees", "livestreamPerformances", "name"],
    description:
      "Schema LivestreamSalary. Cac truong chinh: livestreamEmployees, livestreamPerformances, name. Day la bang quan ly luong cho kenh livestream.",
    primaryKeys: ["name"],
    searchableFields: ["name"],
    dateFields: [],
    statusFields: [],
    relationships: [],
    commonFilters: [],
    queryHints: [],
    examples: [
      "Lay du lieu tu bang livestreamsalary theo dieu kien phu hop",
      "Tim kiem trong bang livestreamsalary"
    ]
  },
  {
    collection: "shopeeincomes",
    schemaFile: "ShopeeIncome",
    keyFields: [
      "affPercentage",
      "channel",
      "creator",
      "customer",
      "date",
      "orderId",
      "products",
      "source",
      "total"
    ],
    description:
      "Schema ShopeeIncome. Cac truong chinh: affPercentage, channel, creator, customer, date, orderId, products, source, total. Day la bang quan ly doanh thu cho kenh ban hang Shopee.",
    primaryKeys: ["orderId"],
    searchableFields: ["orderId"],
    dateFields: ["date"],
    statusFields: [],
    relationships: [],
    commonFilters: [],
    queryHints: [],
    examples: [
      "Lay du lieu tu bang shopeeincomes theo dieu kien phu hop",
      "Tim kiem trong bang shopeeincomes"
    ]
  }
]
