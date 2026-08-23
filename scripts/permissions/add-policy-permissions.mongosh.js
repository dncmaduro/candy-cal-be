// Paste this entire file into MongoDB Compass Mongosh after `use("data")`.
// First run with EXECUTE = false to review, then change it to true and run again.

const EXECUTE = false
const MIGRATION_ID = "role-to-direct-permissions-policy-scopes-2026-08-23-v1"

const POLICY_PERMISSIONS = [
  {
    key: "sales.assignee",
    label: "Có thể được phân công Sales",
    description: "Cho phép chọn người dùng làm người phụ trách Sales.",
    module: "sales",
    legacyRoles: ["sales-cs"]
  },
  {
    key: "sales.activities.read.all",
    label: "Xem toàn bộ hoạt động Sales",
    description: "Không giới hạn hoạt động theo người phụ trách.",
    module: "salesactivities",
    legacyRoles: ["admin", "system-emp", "facebook-ads-emp"]
  },
  {
    key: "sales.funnels.read.all",
    label: "Xem toàn bộ funnel Sales",
    description: "Không giới hạn funnel theo người phụ trách.",
    module: "salesfunnel",
    legacyRoles: [
      "admin",
      "sales-leader",
      "sales-hunter",
      "system-emp",
      "facebook-ads-emp"
    ]
  },
  {
    key: "sales.funnels.manage.all",
    label: "Quản lý mọi funnel Sales",
    description: "Bỏ qua kiểm tra người phụ trách khi cập nhật funnel.",
    module: "salesfunnel",
    legacyRoles: ["admin"]
  },
  {
    key: "sales.orders.read.all",
    label: "Xem toàn bộ đơn Sales",
    description: "Không giới hạn đơn theo người phụ trách.",
    module: "salesorders",
    legacyRoles: ["admin", "sales-leader", "sales-hunter"]
  },
  {
    key: "sales.orders.funnel.read.all",
    label: "Xem mọi đơn theo funnel",
    description: "Xem đơn của một funnel không cần là người phụ trách.",
    module: "salesorders",
    legacyRoles: ["admin", "sales-hunter"]
  },
  {
    key: "sales.leads.pool.notify",
    label: "Nhận thông báo lead chờ nhận",
    description: "Nhận thông báo khi lead được đưa vào pool.",
    module: "sales-leads",
    legacyRoles: ["sales-hunter"]
  },
  {
    key: "inventory.logs.delete.with-negative-quantity",
    label: "Xóa log kho cho phép âm tồn",
    description: "Cho phép xóa log kho dù thao tác làm tồn kho âm.",
    module: "storagelogs",
    legacyRoles: ["admin"]
  }
]

const userSummaries = db.users
  .find({}, { username: 1, roles: 1, permissions: 1 })
  .toArray()
  .map((user) => {
    const roles = Array.isArray(user.roles) ? user.roles : []
    const additions = POLICY_PERMISSIONS.filter((permission) =>
      permission.legacyRoles.some((role) => roles.includes(role))
    ).map((permission) => permission.key)
    return {
      userId: user._id,
      username: user.username,
      legacyRoles: roles,
      additions,
      resultingPermissionCount: new Set([
        ...(user.permissions || []),
        ...additions
      ]).size
    }
  })

const summary = {
  migrationId: MIGRATION_ID,
  execute: EXECUTE,
  permissionCount: POLICY_PERMISSIONS.length,
  usersAffected: userSummaries.filter((user) => user.additions.length > 0)
    .length,
  users: userSummaries
}

if (!EXECUTE) {
  printjson(summary)
} else {
  const now = new Date()
  const permissionOperations = POLICY_PERMISSIONS.map((permission) => ({
    updateOne: {
      filter: { key: permission.key },
      update: {
        $set: {
          key: permission.key,
          label: permission.label,
          description: permission.description,
          module: permission.module,
          updatedAt: now
        },
        $setOnInsert: { createdAt: now }
      },
      upsert: true
    }
  }))

  const userOperations = userSummaries
    .filter((user) => user.additions.length > 0)
    .map((user) => ({
      updateOne: {
        filter: { _id: user.userId },
        update: {
          $addToSet: { permissions: { $each: user.additions } },
          $set: { updatedAt: now }
        }
      }
    }))

  const groupOperations = Array.from(
    new Set(POLICY_PERMISSIONS.flatMap((permission) => permission.legacyRoles))
  ).map((role) => ({
    updateOne: {
      filter: { key: role },
      update: {
        $addToSet: {
          permissionKeys: {
            $each: POLICY_PERMISSIONS.filter((permission) =>
              permission.legacyRoles.includes(role)
            ).map((permission) => permission.key)
          }
        },
        $set: { updatedAt: now }
      }
    }
  }))

  const permissionResult = db.permissions.bulkWrite(permissionOperations)
  const userResult = userOperations.length
    ? db.users.bulkWrite(userOperations)
    : { modifiedCount: 0 }
  const groupResult = groupOperations.length
    ? db.permissiongroups.bulkWrite(groupOperations)
    : { modifiedCount: 0 }

  printjson({
    ok: true,
    migrationId: MIGRATION_ID,
    permissionsUpserted: permissionResult.upsertedCount + permissionResult.modifiedCount,
    usersUpdated: userResult.modifiedCount,
    groupsUpdated: groupResult.modifiedCount
  })
}
