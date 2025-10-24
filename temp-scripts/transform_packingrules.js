const fs = require('fs')
const path = '/Users/maduro/Downloads/data.packingrules.json'
const outPath = path // overwrite

try {
  const raw = fs.readFileSync(path, 'utf8')
  const arr = JSON.parse(raw)
  const out = arr.map((item) => {
    const result = {}
    if (item._id) result._id = item._id

    // Normalize products array
    result.products = []

    // Case A: legacy had `requirements` array + top-level productCode
    if (Array.isArray(item.requirements) && item.requirements.length > 0) {
      const r = item.requirements[0]
      if (item.productCode) {
        result.products.push({
          productCode: item.productCode,
          minQuantity: r.minQuantity !== undefined ? r.minQuantity : null,
          maxQuantity: r.maxQuantity !== undefined ? r.maxQuantity : null
        })
      }
    } else if (Array.isArray(item.products) && item.products.length > 0) {
      // Case B: already has products array - normalize each product entry
      result.products = item.products.map((p) => ({
        productCode: p.productCode,
        minQuantity: p.minQuantity !== undefined ? p.minQuantity : null,
        maxQuantity: p.maxQuantity !== undefined ? p.maxQuantity : null
      }))
    } else if (item.productCode) {
      // Case C: has top-level min/max/p.t fields
      result.products.push({
        productCode: item.productCode,
        minQuantity: item.minQuantity !== undefined ? item.minQuantity : null,
        maxQuantity: item.maxQuantity !== undefined ? item.maxQuantity : null
      })
    }

    // packingType may be top-level or inside requirements
    if (item.packingType) {
      result.packingType = item.packingType
    } else if (Array.isArray(item.requirements) && item.requirements.length > 0) {
      const r = item.requirements[0]
      if (r.packingType) result.packingType = r.packingType
    }

    if (item.__v !== undefined) result.__v = item.__v
    return result
  })
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8')
  console.log('Transformed', outPath)
} catch (e) {
  console.error('Error:', e.message)
  process.exit(1)
}
