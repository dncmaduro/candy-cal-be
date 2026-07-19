/*
 * Read-only production preflight for the legacy Sales → Sales Lead migration.
 *
 * Run with mongosh. This script never writes data or creates indexes.
 * It only prints a JSON report and intentionally contains no credentials.
 */

const databaseName =
  typeof process !== "undefined" && process.env.SALES_LEAD_DB_NAME
    ? process.env.SALES_LEAD_DB_NAME
    : "data"
const appDb = db.getSiblingDB(databaseName)

const toId = (value) => (value ? value.toString() : null)
const hasRole = (user, role) => Array.isArray(user?.roles) && user.roles.includes(role)
const isActive = (user) => user?.active !== false

const activeHunters = appDb.users
  .find(
    { roles: "sales-hunter", active: { $ne: false } },
    { _id: 1, username: 1, name: 1, roles: 1, active: 1 }
  )
  .toArray()

const legacyFunnels = appDb.salesfunnels
  .aggregate([
    {
      $lookup: {
        from: "salesleadcases",
        localField: "_id",
        foreignField: "salesFunnelId",
        as: "leadCases"
      }
    },
    { $match: { leadCases: { $eq: [] } } },
    {
      $lookup: {
        from: "users",
        localField: "user",
        foreignField: "_id",
        as: "owner"
      }
    },
    { $unwind: { path: "$owner", preserveNullAndEmptyArrays: true } },
    { $project: { _id: 1, user: 1, owner: 1 } }
  ])
  .toArray()

const legacyFunnelIds = legacyFunnels.map((funnel) => funnel._id)
const officialOrdersByFunnel = new Map(
  appDb.salesorders
    .aggregate([
      {
        $match: {
          status: "official",
          salesFunnelId: { $in: legacyFunnelIds }
        }
      },
      {
        $group: {
          _id: "$salesFunnelId",
          count: { $sum: 1 },
          earliestDate: { $min: "$date" }
        }
      }
    ])
    .toArray()
    .map((row) => [row._id.toString(), row])
)

const ownerBuckets = {}
const unresolvedOwners = []
let legacyOfficialFunnels = 0
let legacyNonOfficialFunnels = 0
let migratableOwners = 0

for (const funnel of legacyFunnels) {
  const owner = funnel.owner
  const ownerId = toId(funnel.user)
  const ownerKind = !owner
    ? "missing_user"
    : !isActive(owner)
      ? "inactive_user"
      : hasRole(owner, "sales-cs")
        ? "sales_cs"
        : hasRole(owner, "sales-emp")
          ? "sales_emp_to_convert"
          : hasRole(owner, "sales-hunter")
            ? "sales_hunter"
            : "other_role"

  ownerBuckets[ownerKind] = (ownerBuckets[ownerKind] || 0) + 1
  const hasOfficial = officialOrdersByFunnel.has(funnel._id.toString())
  if (hasOfficial) legacyOfficialFunnels += 1
  else legacyNonOfficialFunnels += 1

  if (ownerKind === "sales_cs" || ownerKind === "sales_emp_to_convert") {
    migratableOwners += 1
  } else {
    unresolvedOwners.push({
      funnelId: funnel._id.toString(),
      ownerId,
      ownerKind,
      hasOfficial
    })
  }
}

const duplicateCases = appDb.salesleadcases
  .aggregate([
    { $group: { _id: "$salesFunnelId", count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $project: { _id: 0, salesFunnelId: "$_id", count: 1 } }
  ])
  .toArray()

const casesWithoutFunnels = appDb.salesleadcases
  .aggregate([
    {
      $lookup: {
        from: "salesfunnels",
        localField: "salesFunnelId",
        foreignField: "_id",
        as: "funnel"
      }
    },
    { $match: { funnel: { $eq: [] } } },
    { $count: "count" }
  ])
  .toArray()[0]?.count || 0

const ordersWithoutFunnels = appDb.salesorders
  .aggregate([
    {
      $lookup: {
        from: "salesfunnels",
        localField: "salesFunnelId",
        foreignField: "_id",
        as: "funnel"
      }
    },
    { $match: { funnel: { $eq: [] } } },
    { $count: "count" }
  ])
  .toArray()[0]?.count || 0

const report = {
  generatedAt: new Date().toISOString(),
  database: databaseName,
  checks: {
    exactlyOneActiveSalesHunter: activeHunters.length === 1,
    noDuplicateCases: duplicateCases.length === 0,
    noCasesWithoutFunnels: casesWithoutFunnels === 0,
    noOrdersWithoutFunnels: ordersWithoutFunnels === 0
  },
  activeSalesHunters: activeHunters.map((user) => ({
    id: user._id.toString(),
    username: user.username,
    name: user.name
  })),
  counts: {
    funnels: appDb.salesfunnels.countDocuments(),
    existingLeadCases: appDb.salesleadcases.countDocuments(),
    legacyFunnels: legacyFunnels.length,
    legacyOfficialFunnels,
    legacyNonOfficialFunnels,
    legacyFunnelsWithConvertibleOwner: migratableOwners,
    ownerBuckets,
    currentSalesEmpUsers: appDb.users.countDocuments({ roles: "sales-emp" }),
    currentSalesCsUsers: appDb.users.countDocuments({ roles: "sales-cs" }),
    duplicateCases: duplicateCases.length,
    casesWithoutFunnels,
    ordersWithoutFunnels
  },
  blockers: {
    duplicateCases: duplicateCases.map((row) => ({
      salesFunnelId: row.salesFunnelId.toString(),
      count: row.count
    })),
    unresolvedOwners
  },
  requiredDecisionBeforeExecute:
    "Every unresolved owner with hasOfficial=true must be mapped to an active sales-cs. " +
    "Unresolved owners without official orders may be migrated to the pool."
}

printjson(report)
