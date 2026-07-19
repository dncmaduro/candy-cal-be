/*
 * Before migrating legacy funnels to Sales Lead, align each funnel's `user`
 * with its channel's single active Sales CS.
 *
 * This script changes only legacy funnels that have no Sales Lead case yet.
 * Safe to paste into MongoDB Compass mongosh.
 */

{
const EXECUTE = false
const DATABASE_NAME = "data"
const MIGRATION_ID = "sales-legacy-funnel-owner-sync-2026-07-19-v1"

const appDb = db.getSiblingDB(DATABASE_NAME)
const users = appDb.users
const funnels = appDb.salesfunnels
const channels = appDb.saleschannels
const now = new Date()

const sameId = (left, right) => left && right && left.toString() === right.toString()
const isActiveSalesCs = (user) =>
  user?.active !== false && Array.isArray(user?.roles) && user.roles.includes("sales-cs")

const activeHunters = users
  .find({ roles: "sales-hunter", active: { $ne: false } }, { _id: 1, username: 1, name: 1 })
  .toArray()
if (activeHunters.length !== 1) {
  throw new Error("Expected exactly one active Sales Hunter")
}
const hunterId = activeHunters[0]._id

const legacyFunnels = funnels.aggregate([
  {
    $lookup: {
      from: "salesleadcases",
      localField: "_id",
      foreignField: "salesFunnelId",
      as: "leadCases"
    }
  },
  { $match: { leadCases: { $eq: [] } } },
  { $project: { _id: 1, user: 1, channel: 1 } }
]).toArray()
if (legacyFunnels.length === 0) {
  throw new Error("No legacy funnels without a Sales Lead case were found")
}

const channelIds = [...new Map(
  legacyFunnels.filter((funnel) => funnel.channel).map((funnel) => [funnel.channel.toString(), funnel.channel])
).values()]
const channelRows = channels.find(
  { _id: { $in: channelIds } },
  { _id: 1, channelName: 1, assignedTo: 1, assignedTos: 1 }
).toArray()
const channelById = new Map(channelRows.map((channel) => [channel._id.toString(), channel]))
const candidateUserIds = [...new Map(
  channelRows.flatMap((channel) => [channel.assignedTo, ...(channel.assignedTos || [])])
    .filter(Boolean)
    .map((id) => [id.toString(), id])
).values()]
const usersById = new Map(
  users.find(
    { _id: { $in: candidateUserIds } },
    { _id: 1, username: 1, name: 1, roles: 1, active: 1 }
  ).toArray().map((user) => [user._id.toString(), user])
)

const blockers = []
const plans = []
for (const funnel of legacyFunnels) {
  if (!funnel.channel) {
    blockers.push({ funnelId: funnel._id.toString(), reason: "Funnel has no channel" })
    continue
  }
  const channel = channelById.get(funnel.channel.toString())
  if (!channel) {
    blockers.push({ funnelId: funnel._id.toString(), channelId: funnel.channel.toString(), reason: "Channel not found" })
    continue
  }

  const assignedUserIds = [...new Set(
    [channel.assignedTo, ...(channel.assignedTos || [])]
      .filter(Boolean)
      .map((id) => id.toString())
  )]
  const salesCsOwners = assignedUserIds.map((id) => usersById.get(id)).filter(isActiveSalesCs)
  if (salesCsOwners.length !== 1) {
    blockers.push({
      funnelId: funnel._id.toString(),
      channelId: channel._id.toString(),
      channelName: channel.channelName,
      assignedUserIds,
      activeSalesCsIds: salesCsOwners.map((user) => user._id.toString()),
      reason: salesCsOwners.length === 0
        ? "Channel has no active Sales CS"
        : "Channel has multiple active Sales CS"
    })
    continue
  }

  const expectedOwner = salesCsOwners[0]
  plans.push({
    funnelId: funnel._id,
    expectedOwnerId: expectedOwner._id,
    ownerMatches: sameId(funnel.user, expectedOwner._id)
  })
}

const updates = plans.filter((plan) => !plan.ownerMatches)
const report = {
  migrationId: MIGRATION_ID,
  execute: EXECUTE,
  generatedAt: now.toISOString(),
  activeHunter: { id: hunterId.toString(), username: activeHunters[0].username, name: activeHunters[0].name },
  counts: {
    legacyFunnels: legacyFunnels.length,
    funnelsWithResolvableChannelOwner: plans.length,
    alreadyInSync: plans.length - updates.length,
    requiresSync: updates.length,
    blockers: blockers.length
  },
  blockers
}
printjson(report)

if (blockers.length > 0) {
  throw new Error("Legacy funnel owner sync blocked: review blockers above")
}
if (!EXECUTE) {
  print("Dry plan only. Review the report, then change EXECUTE to true and paste the entire script again.")
} else {
  const session = db.getMongo().startSession()
  const transactionDb = session.getDatabase(DATABASE_NAME)
  const transactionFunnels = transactionDb.salesfunnels
  const transactionSystemLogs = transactionDb.systemlogs
  const summary = { updated: 0 }
  try {
    for (const plan of updates) {
      session.startTransaction()
      try {
        transactionFunnels.updateOne(
          { _id: plan.funnelId },
          { $set: { user: plan.expectedOwnerId, updatedAt: now } }
        )
        transactionSystemLogs.insertOne({
          type: "saleslead-migration",
          action: "legacy_funnel_owner_synced_to_channel",
          userId: hunterId.toString(),
          time: now,
          entity: "salesfunnel",
          entityId: plan.funnelId.toString(),
          result: "success",
          meta: { migrationId: MIGRATION_ID, salesCsId: plan.expectedOwnerId.toString() }
        })
        session.commitTransaction()
        summary.updated += 1
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
