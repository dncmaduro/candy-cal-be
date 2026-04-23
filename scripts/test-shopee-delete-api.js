require("dotenv").config()

const mongoose = require("mongoose")
const { fromZonedTime } = require("date-fns-tz")

const API_BASE_URL = process.env.API_BASE_URL || "http://127.0.0.1:3333/api/v1"
const DATABASE_URL = process.env.DATABASE_URL
const DB_NAME = process.env.DB_NAME || "data"
const SHOPEE_TZ = "Asia/Ho_Chi_Minh"

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function businessDayStart(dateText) {
  return fromZonedTime(`${dateText}T00:00:00`, SHOPEE_TZ)
}

async function requestJson(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, options)
  const raw = await response.text()
  const body = raw ? JSON.parse(raw) : null

  if (!response.ok) {
    throw new Error(
      `Request failed ${response.status} ${response.statusText}: ${raw}`
    )
  }

  return body
}

async function login() {
  const user = await mongoose.connection.db.collection("users").findOne({
    roles: { $in: ["admin", "shopee-emp"] },
    active: { $ne: false }
  })

  assert(user, "No active admin/shopee-emp user found for API login test")

  const auth = await requestJson("/users/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      username: user.username,
      password: user.password
    })
  })

  assert(auth?.accessToken, "Login did not return accessToken")

  return auth.accessToken
}

async function getShopeeChannelId() {
  const channel = await mongoose.connection.db
    .collection("livestreamchannels")
    .findOne({ platform: "shopee" })

  assert(channel, "No Shopee channel found")

  return channel._id
}

async function getShopeeProductId() {
  const product = await mongoose.connection.db.collection("shopeeproducts").findOne({
    deletedAt: null
  })

  assert(product, "No active Shopee product found")

  return product._id
}

async function testDeleteDailyAds(token, channelId) {
  const collection = mongoose.connection.db.collection("shopeedailyads")
  const businessDate = "2026-04-22"
  const normalizedDate = businessDayStart(businessDate)
  const inserted = await collection.insertOne({
    date: normalizedDate,
    channel: channelId,
    adsCost: 123456
  })

  const response = await requestJson(
    `/shopeedailyads?channel=${channelId.toString()}&date=${encodeURIComponent("2026-04-21T17:00:00.000Z")}`,
    {
      method: "DELETE",
      headers: {
        authorization: `Bearer ${token}`
      }
    }
  )

  assert(
    response?.deletedId === inserted.insertedId.toString(),
    "Shopee daily ads delete returned unexpected deletedId"
  )

  const deleted = await collection.findOne({ _id: inserted.insertedId })
  assert(!deleted, "Shopee daily ads document still exists after delete API")
}

async function testDeleteDailyLiveRevenue(token, channelId) {
  const collection = mongoose.connection.db.collection("shopeedailyliverevenues")
  const businessDate = "2026-04-23"
  const normalizedDate = businessDayStart(businessDate)
  const inserted = await collection.insertOne({
    date: normalizedDate,
    channel: channelId,
    liveRevenue: 654321
  })

  const response = await requestJson(
    `/shopeedailyliverevenues?channel=${channelId.toString()}&date=${encodeURIComponent("2026-04-22T17:00:00.000Z")}`,
    {
      method: "DELETE",
      headers: {
        authorization: `Bearer ${token}`
      }
    }
  )

  assert(
    response?.deletedId === inserted.insertedId.toString(),
    "Shopee daily live revenue delete returned unexpected deletedId"
  )

  const deleted = await collection.findOne({ _id: inserted.insertedId })
  assert(
    !deleted,
    "Shopee daily live revenue document still exists after delete API"
  )
}

async function testDeleteShopeeIncomes(token, channelId, productId) {
  const collection = mongoose.connection.db.collection("shopeeincomes")
  const orderDate = new Date("2026-04-22T09:15:00.000Z")
  const controlDate = new Date("2026-04-23T09:15:00.000Z")
  const orderIdPrefix = `codex-delete-test-${Date.now()}`

  const inserted = await collection.insertMany([
    {
      channel: channelId,
      orderId: `${orderIdPrefix}-target`,
      packageId: "pkg-target",
      orderDate,
      orderStatus: "completed",
      cancelReason: "",
      trackingNumber: "tracking-target",
      expectedDeliveryDate: null,
      shippedDate: null,
      deliveryTime: null,
      products: [
        {
          variantSku: productId,
          originalPrice: 100000,
          sellerDiscount: 0,
          buyerPaidTotal: 100000
        }
      ],
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      channel: channelId,
      orderId: `${orderIdPrefix}-control`,
      packageId: "pkg-control",
      orderDate: controlDate,
      orderStatus: "completed",
      cancelReason: "",
      trackingNumber: "tracking-control",
      expectedDeliveryDate: null,
      shippedDate: null,
      deliveryTime: null,
      products: [
        {
          variantSku: productId,
          originalPrice: 200000,
          sellerDiscount: 0,
          buyerPaidTotal: 200000
        }
      ],
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ])

  const response = await requestJson(
    `/shopeeincomes?channelId=${channelId.toString()}&orderDate=2026-04-22`,
    {
      method: "DELETE",
      headers: {
        authorization: `Bearer ${token}`
      }
    }
  )

  assert(
    response?.deletedCount === 1,
    `Shopee incomes delete expected deletedCount=1, got ${response?.deletedCount}`
  )

  const target = await collection.findOne({ _id: inserted.insertedIds["0"] })
  const control = await collection.findOne({ _id: inserted.insertedIds["1"] })

  assert(!target, "Target Shopee income still exists after delete API")
  assert(control, "Control Shopee income should not be deleted")

  await collection.deleteOne({ _id: inserted.insertedIds["1"] })
}

async function main() {
  assert(DATABASE_URL, "DATABASE_URL is required")

  await mongoose.connect(DATABASE_URL, { dbName: DB_NAME })

  try {
    const token = await login()
    const channelId = await getShopeeChannelId()
    const productId = await getShopeeProductId()

    await testDeleteDailyAds(token, channelId)
    await testDeleteDailyLiveRevenue(token, channelId)
    await testDeleteShopeeIncomes(token, channelId, productId)

    console.log("Shopee delete API integration checks passed")
  } finally {
    await mongoose.disconnect()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
