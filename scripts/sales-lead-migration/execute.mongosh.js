/*
 * Legacy Sales → Sales Lead migration.
 *
 * Run in MongoDB Compass mongosh after a successful preflight. This script is
 * intentionally disabled by default. Change EXECUTE to true only after
 * reviewing the plan printed by the script.
 */

// Keep all declarations block-scoped so the whole script can be pasted again
// in the same MongoDB Compass mongosh tab after changing EXECUTE.
{
const EXECUTE = false
const DATABASE_NAME = "data"
const MIGRATION_ID = "sales-lead-legacy-2026-07-18-v1"
const appDb = db.getSiblingDB(DATABASE_NAME)
const now = new Date()
const users = appDb.users
const funnels = appDb.salesfunnels
const orders = appDb.salesorders
const cases = appDb.salesleadcases
const assignments = appDb.salesleadassignments

const hasRole = (user, role) => Array.isArray(user?.roles) && user.roles.includes(role)
const isActive = (user) => user?.active !== false

function vietnamCycle(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit"
  }).formatToParts(date)
  const values = Object.fromEntries(
    parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value])
  )
  const year = Number(values.year)
  const month = Number(values.month)
  const offsetMs = 7 * 60 * 60 * 1000
  return {
    key: `${year}-${String(month).padStart(2, "0")}`,
    startAt: new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0) - offsetMs),
    endAt: new Date(Date.UTC(year, month, 0, 23, 59, 59, 999) - offsetMs)
  }
}

const cycle = vietnamCycle(now)
const activeHunters = users
  .find({ roles: "sales-hunter", active: { $ne: false } }, { _id: 1, username: 1, name: 1 })
  .toArray()

if (activeHunters.length !== 1) {
  throw new Error(`Expected exactly one active Sales Hunter. Found: ${JSON.stringify(activeHunters)}`)
}
const hunterId = activeHunters[0]._id

const candidateFunnels = funnels
  .aggregate([
    {
      $lookup: {
        from: "salesleadcases",
        localField: "_id",
        foreignField: "salesFunnelId",
        as: "existingCases"
      }
    },
    { $match: { existingCases: { $eq: [] } } },
    {
      $lookup: {
        from: "users",
        localField: "user",
        foreignField: "_id",
        as: "owner"
      }
    },
    { $unwind: { path: "$owner", preserveNullAndEmptyArrays: true } }
  ])
  .toArray()

const officialByFunnel = new Map(
  orders
    .aggregate([
      {
        $match: {
          status: "official",
          salesFunnelId: { $in: candidateFunnels.map((funnel) => funnel._id) }
        }
      },
      { $sort: { date: 1, createdAt: 1, _id: 1 } },
      { $group: { _id: "$salesFunnelId", firstOfficialOrder: { $first: "$$ROOT" } } }
    ])
    .toArray()
    .map((row) => [row._id.toString(), row.firstOfficialOrder])
)

const validationErrors = []
for (const funnel of candidateFunnels) {
  const owner = funnel.owner
  const eligibleOwner = owner && isActive(owner) && hasRole(owner, "sales-cs")
  const hasOfficial = officialByFunnel.has(funnel._id.toString())
  if (hasOfficial && !eligibleOwner) {
    validationErrors.push({
      funnelId: funnel._id.toString(),
      ownerId: funnel.user?.toString() || null,
      reason: "Official customer has no active Sales CS owner"
    })
  }
}

const plan = {
  migrationId: MIGRATION_ID,
  execute: EXECUTE,
  generatedAt: now.toISOString(),
  cycle: {
    key: cycle.key,
    startAt: cycle.startAt.toISOString(),
    endAt: cycle.endAt.toISOString()
  },
  salesEmpUsersKept: users.countDocuments({ roles: "sales-emp" }),
  candidateFunnels: candidateFunnels.length,
  retainedCases: candidateFunnels.filter((funnel) => officialByFunnel.has(funnel._id.toString())).length,
  activeCases: candidateFunnels.filter((funnel) => {
    const owner = funnel.owner
    return !officialByFunnel.has(funnel._id.toString()) && owner && isActive(owner) && hasRole(owner, "sales-cs")
  }).length,
  pooledCases: candidateFunnels.filter((funnel) => {
    const owner = funnel.owner
    return !officialByFunnel.has(funnel._id.toString()) &&
      (!owner || !isActive(owner) || !hasRole(owner, "sales-cs"))
  }).length,
  validationErrors
}

printjson(plan)

if (validationErrors.length) {
  throw new Error("Migration blocked: see validationErrors above")
}
if (!EXECUTE) {
  print("Dry plan only. Review the plan, then change EXECUTE to true and paste the entire script again.")
} else {

// Idempotency and lifecycle indexes. Existing data must be clean; preflight
// has already checked duplicate cases before this point. Do not recreate an
// equivalent Mongoose-created index under a different name.
function ensureIndex(collection, key, options) {
  const existing = collection.getIndexes().find((index) => JSON.stringify(index.key) === JSON.stringify(key))
  if (existing) {
    if (options.unique && !existing.unique) {
      throw new Error(`Index ${JSON.stringify(key)} exists but is not unique`)
    }
    return existing.name
  }
  return collection.createIndex(key, options)
}

ensureIndex(cases, { salesFunnelId: 1 }, { unique: true })
ensureIndex(assignments, { leadCaseId: 1 }, {
  unique: true,
  partialFilterExpression: { status: "active" },
  name: "one_active_assignment_per_case"
})

const session = db.getMongo().startSession()
// Compass mongosh serializes `{ session }` incorrectly for some collection
// methods. Obtain transaction-bound collections from the session instead.
const transactionDb = session.getDatabase(DATABASE_NAME)
const transactionCases = transactionDb.salesleadcases
const transactionAssignments = transactionDb.salesleadassignments
const transactionSystemLogs = transactionDb.systemlogs
const summary = { created: 0, retained: 0, active: 0, pooled: 0, skipped: 0 }

try {
  for (const funnel of candidateFunnels) {
    session.startTransaction()
    try {
      const existingCase = transactionCases.findOne({ salesFunnelId: funnel._id })
      if (existingCase) {
        summary.skipped += 1
        session.abortTransaction()
        continue
      }

      const owner = funnel.owner
      const ownerCanCare = owner && isActive(owner) && hasRole(owner, "sales-cs")
      const firstOfficialOrder = officialByFunnel.get(funnel._id.toString())
      const caseStatus = firstOfficialOrder ? "retained" : ownerCanCare ? "assigned" : "pooled"
      const caseDocument = {
        salesFunnelId: funnel._id,
        hunterId,
        ...(funnel.channel ? { sourceChannelId: funnel.channel } : {}),
        status: caseStatus,
        ...(firstOfficialOrder
          ? { firstOfficialOrderId: firstOfficialOrder._id, firstOfficialAt: firstOfficialOrder.date }
          : {}),
        origin: "legacy",
        migrationId: MIGRATION_ID,
        migratedAt: now,
        legacyOwnerId: funnel.user,
        createdAt: now,
        updatedAt: now
      }
      const caseResult = transactionCases.insertOne(caseDocument)

      if (ownerCanCare) {
        const assignmentStatus = firstOfficialOrder ? "retained" : "active"
        const assignmentDocument = {
          leadCaseId: caseResult.insertedId,
          salesCsId: funnel.user,
          assignedById: hunterId,
          kind: "migrated",
          status: assignmentStatus,
          ...(assignmentStatus === "active"
            ? { cycleKey: cycle.key, cycleStartAt: cycle.startAt, cycleEndAt: cycle.endAt }
            : { cycleStartAt: now }),
          startedAt: now,
          ...(assignmentStatus === "retained" ? { endReason: "official" } : {}),
          customerSnapshot: {
            name: funnel.name,
            ...(funnel.phoneNumber ? { phoneNumber: funnel.phoneNumber } : {}),
            secondaryPhoneNumbers: Array.isArray(funnel.secondaryPhoneNumbers)
              ? funnel.secondaryPhoneNumbers
              : [],
            ...(funnel.address ? { address: funnel.address } : {}),
            ...(funnel.province ? { provinceId: funnel.province } : {}),
            ...(funnel.channel ? { channelId: funnel.channel } : {})
          },
          createdAt: now,
          updatedAt: now
        }
        const assignmentResult = transactionAssignments.insertOne(assignmentDocument)
        transactionCases.updateOne(
          { _id: caseResult.insertedId },
          { $set: { currentAssignmentId: assignmentResult.insertedId } }
        )
        if (assignmentStatus === "retained") summary.retained += 1
        else summary.active += 1
      } else {
        summary.pooled += 1
      }

      transactionSystemLogs.insertOne(
        {
          type: "saleslead-migration",
          action: "legacy_case_migrated",
          userId: hunterId.toString(),
          time: now,
          entity: "salesleadcase",
          entityId: caseResult.insertedId.toString(),
          result: "success",
          meta: { migrationId: MIGRATION_ID, salesFunnelId: funnel._id.toString(), status: caseStatus }
        }
      )
      session.commitTransaction()
      summary.created += 1
    } catch (error) {
      session.abortTransaction()
      throw error
    }
  }
} finally {
  session.endSession()
}

printjson({ migrationId: MIGRATION_ID, completedAt: new Date().toISOString(), summary })
}
}
