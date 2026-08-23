#!/usr/bin/env node

/*
 * Generates a self-contained mongosh migration from the current @Roles()
 * decorators. Each protected controller action becomes one permission:
 *
 *   api.<controller>.<handler>
 *
 * The generated script is intentionally dry-run by default. It preserves the
 * effective access granted by every non-retired legacy role, while retaining
 * users.roles until the application has switched to PermissionGuard.
 *
 * Usage:
 *   node scripts/permissions/generate-role-permission-migration.js > /tmp/role-permissions.mongosh.js
 *
 * Paste /tmp/role-permissions.mongosh.js into MongoDB Compass mongosh and
 * review the printed plan. Change EXECUTE to true only after review.
 */

const fs = require("fs")
const path = require("path")

const projectRoot = path.resolve(__dirname, "../..")
const sourceRoot = path.join(projectRoot, "src")
const retiredRoles = ["", "order-emp", "sales-emp"]

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name)
    if (entry.isDirectory()) return walk(fullPath)
    return entry.name.endsWith(".controller.ts") ? [fullPath] : []
  })
}

function camelToKebab(value) {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase()
}

function parseController(filePath) {
  const source = fs.readFileSync(filePath, "utf8")
  const controller = source.match(/@Controller\(\s*["']([^"']+)["']\s*\)/)?.[1]
  if (!controller) return []

  const lines = source.split(/\r?\n/)
  const rows = []
  let collectingRoles = false
  let roleDecorator = ""
  let roles = []
  let httpMethod = null
  let httpPath = ""

  const reset = () => {
    collectingRoles = false
    roleDecorator = ""
    roles = []
    httpMethod = null
    httpPath = ""
  }

  for (const line of lines) {
    if (line.includes("@Roles(")) {
      collectingRoles = true
      roleDecorator = line.slice(line.indexOf("@Roles("))
      if (roleDecorator.includes(")")) collectingRoles = false
    } else if (collectingRoles) {
      roleDecorator += `\n${line}`
      if (line.includes(")")) collectingRoles = false
    }

    if (!collectingRoles && roleDecorator) {
      roles = [...roleDecorator.matchAll(/["']([^"']+)["']/g)].map((match) => match[1])
      roleDecorator = ""
    }

    const route = line.match(/@(Get|Post|Put|Patch|Delete)\(\s*(["']?)([^"')]*?)\2\s*\)/)
    if (route) {
      httpMethod = route[1].toUpperCase()
      httpPath = route[3] || ""
    }

    if (!roles.length || !httpMethod) continue

    // Covers both conventional `async handler()` declarations and compact
    // declarations such as `@Post() @Roles(...) create(...)`. Anchoring the
    // normal form avoids mistaking decorators such as FileInterceptor() for a
    // controller handler.
    const trimmed = line.trimStart()
    const inlineMethod = line.match(/@Roles\([^)]*\)\s*(?:async\s+)?([A-Za-z_$][\w$]*)\s*\(/)
    const declaredMethod = trimmed.match(/^(?:async\s+)?([A-Za-z_$][\w$]*)\s*\(/)
    const method = inlineMethod || declaredMethod
    if (!method) continue
    if (new Set(["FileInterceptor", "UseInterceptors", "Body", "Param", "Query", "Req", "Res"]).has(method[1])) continue

    const handler = method[1]
    const endpointPath = `/${controller}/${httpPath}`.replace(/\/+/g, "/")
    rows.push({
      key: `api.${controller}.${camelToKebab(handler)}`,
      controller,
      handler,
      method: httpMethod,
      path: endpointPath,
      roles: [...new Set(roles)].sort()
    })
    reset()
  }

  return rows
}

const permissions = walk(sourceRoot)
  .flatMap(parseController)
  .sort((a, b) => a.key.localeCompare(b.key))

if (!permissions.length) {
  throw new Error(
    "No @Roles decorators remain. This is a one-time legacy migration and must not be rerun after the PermissionGuard cutover."
  )
}

const duplicateKeys = permissions
  .map((permission) => permission.key)
  .filter((key, index, keys) => keys.indexOf(key) !== index)
if (duplicateKeys.length) {
  throw new Error(`Duplicate permission keys: ${[...new Set(duplicateKeys)].join(", ")}`)
}

const rolePermissions = new Map()
for (const permission of permissions) {
  for (const role of permission.roles) {
    if (retiredRoles.includes(role)) continue
    if (!rolePermissions.has(role)) rolePermissions.set(role, [])
    rolePermissions.get(role).push(permission.key)
  }
}

const permissionDocuments = permissions.map((permission) => ({
  key: permission.key,
  label: `${permission.method} ${permission.path}`,
  description: permission.handler,
  module: permission.controller,
  source: { method: permission.method, path: permission.path, handler: permission.handler }
}))

const groupDocuments = [...rolePermissions.entries()]
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([key, permissionKeys]) => ({
    key,
    label: key,
    permissionKeys: [...new Set(permissionKeys)].sort()
  }))

const migration = {
  generatedAt: new Date().toISOString(),
  retiredRoles,
  permissions: permissionDocuments,
  groups: groupDocuments
}

const script = `/*
 * Generated by scripts/permissions/generate-role-permission-migration.js.
 *
 * This migration has one permission per current @Roles-protected API action,
 * so its legacy role-to-permission mapping is lossless. Permission groups are
 * display/select presets only; users receive direct permission keys.
 *
 * IMPORTANT: the old users.roles field is deliberately retained. Do not remove
 * it until the backend and frontend have fully switched to permissions.
 */
{
const EXECUTE = false
const DATABASE_NAME = "data"
const MIGRATION_ID = "role-to-direct-permissions-2026-08-23-v1"
const appDb = db.getSiblingDB(DATABASE_NAME)
const users = appDb.users
const permissions = appDb.permissions
const permissionGroups = appDb.permissiongroups
const migration = ${JSON.stringify(migration, null, 2)}
const now = new Date()

const normalizeRoles = (value) =>
  (Array.isArray(value) ? value : []).map((role) => String(role || "").trim())

const knownGroups = new Map(migration.groups.map((group) => [group.key, group]))
const knownRoles = new Set([...knownGroups.keys(), ...migration.retiredRoles])
const allUsers = users.find({}, { _id: 1, username: 1, active: 1, roles: 1, permissions: 1 }).toArray()
const unknownRoleUsers = allUsers
  .map((user) => ({
    userId: user._id,
    username: user.username,
    roles: normalizeRoles(user.roles).filter((role) => !knownRoles.has(role))
  }))
  .filter((user) => user.roles.length)

const plan = allUsers.map((user) => {
  const roles = normalizeRoles(user.roles)
  const applicableRoles = roles.filter((role) => knownGroups.has(role))
  const retiredRoles = roles.filter((role) => migration.retiredRoles.includes(role))
  const permissionKeys = [...new Set(
    applicableRoles.flatMap((role) => knownGroups.get(role).permissionKeys)
  )].sort()

  return {
    userId: user._id,
    username: user.username,
    active: user.active !== false,
    applicableRoles,
    retiredRoles,
    existingPermissionCount: Array.isArray(user.permissions) ? user.permissions.length : 0,
    newPermissionCount: permissionKeys.length,
    permissionKeys
  }
})

printjson({
  migrationId: MIGRATION_ID,
  execute: EXECUTE,
  generatedAt: migration.generatedAt,
  permissionCount: migration.permissions.length,
  groupCount: migration.groups.length,
  retiredRoles: migration.retiredRoles,
  userCount: allUsers.length,
  unknownRoleUsers,
  users: plan.map(({ permissionKeys, ...user }) => user)
})

if (unknownRoleUsers.length) {
  throw new Error("Migration blocked: unknown legacy roles exist. Add an explicit mapping before executing.")
}

if (!EXECUTE) {
  print("Dry run only. Review the plan, change EXECUTE to true, and paste the entire script again.")
} else {
  const session = db.getMongo().startSession()
  try {
    const transactionDb = session.getDatabase(DATABASE_NAME)
    const transactionUsers = transactionDb.users
    const transactionPermissions = transactionDb.permissions
    const transactionGroups = transactionDb.permissiongroups

    session.startTransaction()
    try {
      for (const permission of migration.permissions) {
        transactionPermissions.updateOne(
          { key: permission.key },
          { $set: { ...permission, updatedAt: now }, $setOnInsert: { createdAt: now } },
          { upsert: true }
        )
      }

      for (const group of migration.groups) {
        transactionGroups.updateOne(
          { key: group.key },
          {
            $set: {
              ...group,
              kind: "legacy-role-preset",
              updatedAt: now,
              migrationId: MIGRATION_ID
            },
            $setOnInsert: { createdAt: now }
          },
          { upsert: true }
        )
      }

      for (const user of plan) {
        transactionUsers.updateOne(
          { _id: user.userId },
          {
            $set: {
              permissions: user.permissionKeys,
              permissionMigration: {
                id: MIGRATION_ID,
                migratedAt: now,
                sourceRoles: user.applicableRoles,
                retiredRoles: user.retiredRoles
              }
            },
            // order-emp and sales-emp are obsolete and have no current API
            // access. Remove only those values; retain every active role until
            // the application cutover is complete.
            $pull: { roles: { $in: migration.retiredRoles } }
          }
        )
      }

      session.commitTransaction()
      printjson({
        ok: true,
        migrationId: MIGRATION_ID,
        usersUpdated: plan.length,
        permissionsUpserted: migration.permissions.length,
        groupsUpserted: migration.groups.length
      })
    } catch (error) {
      session.abortTransaction()
      throw error
    }
  } finally {
    session.endSession()
  }
}
}
`

process.stdout.write(script)
