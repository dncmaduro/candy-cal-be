/*
 * Align migrated legacy funnels with the single active Sales CS assigned to
 * their channel. Safe to paste into MongoDB Compass mongosh.
 *
 * First run with EXECUTE = false. Review the plan. Change only EXECUTE to
 * true and paste the whole script again to apply the updates.
 */

{
const EXECUTE = false
const DATABASE_NAME = "data"
const SOURCE_MIGRATION_ID = "sales-lead-legacy-2026-07-18-v1"
const MIGRATION_ID = "sales-lead-channel-owner-sync-2026-07-19-v1"
const appDb = db.getSiblingDB(DATABASE_NAME)
const users = appDb.users
const funnels = appDb.salesfunnels
const channels = appDb.saleschannels
const cases = appDb.salesleadcases
const assignments = appDb.salesleadassignments
const systemLogs = appDb.systemlogs
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

const migratedCases = cases.find(
  { migrationId: SOURCE_MIGRATION_ID },
  { _id: 1, salesFunnelId: 1, currentAssignmentId: 1 }
).toArray()
const funnelIds = migratedCases.map((leadCase) => leadCase.salesFunnelId)
const migratedFunnels = funnels.find(
  { _id: { $in: funnelIds } },
  { _id: 1, user: 1, channel: 1 }
).toArray()
const funnelById = new Map(migratedFunnels.map((funnel) => [funnel._id.toString(), funnel]))
const channelIds = [...new Map(
  migratedFunnels.filter((funnel) => funnel.channel).map((funnel) => [funnel.channel.toString(), funnel.channel])
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

for (const leadCase of migratedCases) {
  const funnel = funnelById.get(leadCase.salesFunnelId.toString())
  if (!funnel) {
    blockers.push({ leadCaseId: leadCase._id.toString(), reason: "Funnel not found" })
    continue
  }
  if (!funnel.channel) {
    blockers.push({ funnelId: funnel._id.toString(), reason: "Funnel has no channel" })
    continue
  }
  if (!leadCase.currentAssignmentId) {
    blockers.push({ funnelId: funnel._id.toString(), reason: "Lead case has no current assignment" })
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
  const eligibleCs = assignedUserIds
    .map((id) => usersById.get(id))
    .filter(isActiveSalesCs)

  if (eligibleCs.length !== 1) {
    blockers.push({
      funnelId: funnel._id.toString(),
      channelId: channel._id.toString(),
      channelName: channel.channelName,
      assignedUserIds,
      activeSalesCsIds: eligibleCs.map((user) => user._id.toString()),
      reason: eligibleCs.length === 0 ? "Channel has no active Sales CS" : "Channel has multiple active Sales CS"
    })
    continue
  }

  const expectedSalesCs = eligibleCs[0]
  const assignment = assignments.findOne(
    { _id: leadCase.currentAssignmentId },
    { _id: 1, salesCsId: 1, status: 1 }
  )
  if (!assignment) {
    blockers.push({ funnelId: funnel._id.toString(), reason: "Current assignment not found" })
    continue
  }

  const funnelOwnerMatches = sameId(funnel.user, expectedSalesCs._id)
  const assignmentOwnerMatches = sameId(assignment.salesCsId, expectedSalesCs._id)
  plans.push({
    funnelId: funnel._id,
    leadCaseId: leadCase._id,
    assignmentId: assignment._id,
    expectedSalesCsId: expectedSalesCs._id,
    funnelOwnerMatches,
    assignmentOwnerMatches
  })
}

const updates = plans.filter((plan) => !plan.funnelOwnerMatches || !plan.assignmentOwnerMatches)
const report = {
  migrationId: MIGRATION_ID,
  sourceMigrationId: SOURCE_MIGRATION_ID,
  execute: EXECUTE,
  generatedAt: now.toISOString(),
  counts: {
    migratedCases: migratedCases.length,
    funnelsWithResolvableChannelOwner: plans.length,
    alreadyInSync: plans.length - updates.length,
    requiresSync: updates.length,
    funnelOwnerUpdates: updates.filter((plan) => !plan.funnelOwnerMatches).length,
    currentAssignmentUpdates: updates.filter((plan) => !plan.assignmentOwnerMatches).length,
    blockers: blockers.length
  },
  blockers
}
printjson(report)

if (blockers.length > 0) {
  throw new Error("Channel-owner sync blocked: review blockers above")
}
if (!EXECUTE) {
  print("Dry plan only. Review the report, then change EXECUTE to true and paste the entire script again.")
} else {
  const session = db.getMongo().startSession()
  const transactionDb = session.getDatabase(DATABASE_NAME)
  const transactionFunnels = transactionDb.salesfunnels
  const transactionAssignments = transactionDb.salesleadassignments
  const transactionSystemLogs = transactionDb.systemlogs
  const summary = { updated: 0, funnelOwners: 0, assignments: 0, skipped: 0 }

  try {
    for (const plan of updates) {
      session.startTransaction()
      try {
        if (!plan.funnelOwnerMatches) {
          transactionFunnels.updateOne(
            { _id: plan.funnelId },
            { $set: { user: plan.expectedSalesCsId, updatedAt: now } }
          )
          summary.funnelOwners += 1
        }
        if (!plan.assignmentOwnerMatches) {
          transactionAssignments.updateOne(
            { _id: plan.assignmentId },
            { $set: { salesCsId: plan.expectedSalesCsId, updatedAt: now } }
          )
          summary.assignments += 1
        }
        transactionSystemLogs.insertOne({
          type: "saleslead-migration",
          action: "legacy_funnel_owner_synced_to_channel",
          userId: hunterId.toString(),
          time: now,
          entity: "salesleadcase",
          entityId: plan.leadCaseId.toString(),
          result: "success",
          meta: {
            migrationId: MIGRATION_ID,
            sourceMigrationId: SOURCE_MIGRATION_ID,
            salesFunnelId: plan.funnelId.toString(),
            salesCsId: plan.expectedSalesCsId.toString()
          }
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
