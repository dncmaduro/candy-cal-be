const assert = require("node:assert/strict")
const {
  classifyOrderChannel,
  countOrdersByChannel
} = require("../dist/income/utils/order-channel.util")

const run = () => {
  const liveOnly = [{ products: [{ content: "Phát trực tiếp" }] }]
  const shopOnly = [{ products: [{ content: "Video ngắn" }] }]
  const mixed = [
    { products: [{ content: "livestream buổi tối" }, { content: "video" }] }
  ]

  assert.equal(classifyOrderChannel(liveOnly[0].products), "live")
  assert.equal(classifyOrderChannel(shopOnly[0].products), "shop")

  // Mixed rule: if an order has both live + shop products, classify as live.
  assert.equal(classifyOrderChannel(mixed[0].products), "live")

  const counts = countOrdersByChannel([...liveOnly, ...shopOnly, ...mixed])
  assert.deepEqual(counts, { total: 3, live: 2, shop: 1 })
  assert.equal(counts.live + counts.shop, counts.total)

  console.log("PASS: range-stats order split cases (live/shop/mixed)")
}

run()
