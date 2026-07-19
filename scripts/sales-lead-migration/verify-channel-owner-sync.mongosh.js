/*
 * Read-only verification after sync-channel-owner.mongosh.js.
 * Safe to paste into MongoDB Compass mongosh.
 */

{
const DATABASE_NAME = "data"
const SOURCE_MIGRATION_ID = "sales-lead-legacy-2026-07-18-v1"

const appDb = db.getSiblingDB(DATABASE_NAME)
const users = appDb.users
const funnels = appDb.salesfunnels
const channels = appDb.saleschannels
const cases = appDb.salesleadcases
const assignments = appDb.salesleadassignments

const sameId = (left, right) => left && right && left.toString() === right.toString()
const isActiveSalesCs = (user) =>
  user?.active !== false && Array.isArray(user?.roles) && user.roles.includes("sales-cs")

const migratedCases = cases.find(
  { migrationId: SOURCE_MIGRATION_ID },
  { _id: 1, salesFunnelId: 1, currentAssignmentId: 1 }
).toArray()
const funnelIds = migratedCases.map((leadCase) => leadCase.salesFunnelId)
const funnelRows = funnels.find(
  { _id: { $in: funnelIds } },
  { _id: 1, user: 1, channel: 1 }
).toArray()
const funnelById = new Map(funnelRows.map((funnel) => [funnel._id.toString(), funnel]))
const channelIds = [...new Map(
  funnelRows.filter((funnel) => funnel.channel).map((funnel) => [funnel.channel.toString(), funnel.channel])
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
  users.find({ _id: { $in: candidateUserIds } }, { _id: 1, roles: 1, active: 1 })
    .toArray()
    .map((user) => [user._id.toString(), user])
)

const mismatches = []
const blockers = []
for (const leadCase of migratedCases) {
  const funnel = funnelById.get(leadCase.salesFunnelId.toString())
  const channel = funnel?.channel && channelById.get(funnel.channel.toString())
  const assignment = leadCase.currentAssignmentId && assignments.findOne(
    { _id: leadCase.currentAssignmentId },
    { _id: 1, salesCsId: 1 }
  )

  if (!funnel || !channel || !assignment) {
    blockers.push({ funnelId: leadCase.salesFunnelId.toString(), reason: "Missing funnel, channel, or current assignment" })
    continue
  }

  const expectedCs = [...new Set([channel.assignedTo, ...(channel.assignedTos || [])]
    .filter(Boolean)
    .map((id) => id.toString()))]
    .map((id) => usersById.get(id))
    .filter(isActiveSalesCs)
  if (expectedCs.length !== 1) {
    blockers.push({
      funnelId: funnel._id.toString(),
      channelId: channel._id.toString(),
      reason: "Channel does not have exactly one active Sales CS"
    })
    continue
  }

  if (!sameId(funnel.user, expectedCs[0]._id) || !sameId(assignment.salesCsId, expectedCs[0]._id)) {
    mismatches.push({
      funnelId: funnel._id.toString(),
      funnelOwnerMatches: sameId(funnel.user, expectedCs[0]._id),
      currentAssignmentMatches: sameId(assignment.salesCsId, expectedCs[0]._id)
    })
  }
}

printjson({
  sourceMigrationId: SOURCE_MIGRATION_ID,
  generatedAt: new Date().toISOString(),
  checks: {
    everyChannelHasExactlyOneActiveSalesCs: blockers.length === 0,
    everyFunnelOwnerMatchesChannel: mismatches.every((item) => item.funnelOwnerMatches),
    everyCurrentAssignmentMatchesChannel: mismatches.every((item) => item.currentAssignmentMatches)
  },
  counts: { migratedCases: migratedCases.length, mismatches: mismatches.length, blockers: blockers.length },
  blockers,
  mismatches
})
}
