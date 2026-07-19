/*
 * Read-only verification after execute.mongosh.js.
 * Safe to paste into the same MongoDB Compass mongosh tab.
 */

{
const DATABASE_NAME = "data"
const MIGRATION_ID = "sales-lead-legacy-2026-07-18-v1"

const appDb = db.getSiblingDB(DATABASE_NAME)
const users = appDb.users
const funnels = appDb.salesfunnels
const orders = appDb.salesorders
const cases = appDb.salesleadcases
const assignments = appDb.salesleadassignments

const activeHunters = users
  .find({ roles: "sales-hunter", active: { $ne: false } }, { _id: 1, username: 1, name: 1 })
  .toArray()
const migratedCases = cases.find({ migrationId: MIGRATION_ID }).toArray()

const report = {
  generatedAt: new Date().toISOString(),
  database: DATABASE_NAME,
  migrationId: MIGRATION_ID,
  checks: {
    exactlyOneActiveSalesHunter: activeHunters.length === 1,
    expectedMigratedCaseCount: migratedCases.length === funnels.countDocuments(),
    noFunnelsWithoutCase: funnels.aggregate([
      { $lookup: { from: "salesleadcases", localField: "_id", foreignField: "salesFunnelId", as: "cases" } },
      { $match: { cases: { $eq: [] } } },
      { $count: "count" }
    ]).toArray()[0]?.count === undefined,
    noOrdersWithoutCase: orders.aggregate([
      { $lookup: { from: "salesleadcases", localField: "salesFunnelId", foreignField: "salesFunnelId", as: "cases" } },
      { $match: { cases: { $eq: [] } } },
      { $count: "count" }
    ]).toArray()[0]?.count === undefined,
    noDuplicateActiveAssignments: assignments.aggregate([
      { $match: { status: "active" } },
      { $group: { _id: "$leadCaseId", count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
      { $count: "count" }
    ]).toArray()[0]?.count === undefined
  },
  counts: {
    funnels: funnels.countDocuments(),
    cases: cases.countDocuments(),
    migratedCases: migratedCases.length,
    migratedByStatus: migratedCases.reduce((result, leadCase) => {
      result[leadCase.status] = (result[leadCase.status] || 0) + 1
      return result
    }, {}),
    migratedAssignments: assignments.countDocuments({ kind: "migrated" }),
    salesEmpUsersKept: users.countDocuments({ roles: "sales-emp" })
  },
  blockers: {
    migratedCasesMissingCurrentAssignment: cases.aggregate([
      { $match: { migrationId: MIGRATION_ID, status: { $in: ["assigned", "retained"] } } },
      { $lookup: { from: "salesleadassignments", localField: "currentAssignmentId", foreignField: "_id", as: "assignment" } },
      { $match: { assignment: { $eq: [] } } },
      { $project: { _id: 1, salesFunnelId: 1, status: 1 } }
    ]).toArray(),
    pooledCasesWithAssignment: cases.find(
      { migrationId: MIGRATION_ID, status: "pooled", currentAssignmentId: { $exists: true } },
      { _id: 1, salesFunnelId: 1 }
    ).toArray(),
    retainedCasesWithoutMatchingOfficialOrder: cases.aggregate([
      { $match: { migrationId: MIGRATION_ID, status: "retained" } },
      {
        $lookup: {
          from: "salesorders",
          let: { orderId: "$firstOfficialOrderId", funnelId: "$salesFunnelId" },
          pipeline: [{
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$_id", "$$orderId"] },
                  { $eq: ["$salesFunnelId", "$$funnelId"] },
                  { $eq: ["$status", "official"] }
                ]
              }
            }
          }],
          as: "officialOrder"
        }
      },
      { $match: { officialOrder: { $eq: [] } } },
      { $project: { _id: 1, salesFunnelId: 1, firstOfficialOrderId: 1 } }
    ]).toArray()
  }
}

report.checks.noMissingCurrentAssignments = report.blockers.migratedCasesMissingCurrentAssignment.length === 0
report.checks.noPooledCaseAssignment = report.blockers.pooledCasesWithAssignment.length === 0
report.checks.retainedCasesPointToOfficialOrders = report.blockers.retainedCasesWithoutMatchingOfficialOrder.length === 0

printjson(report)
}
