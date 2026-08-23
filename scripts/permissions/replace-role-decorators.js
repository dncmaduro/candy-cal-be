#!/usr/bin/env node

/*
 * Mechanical one-time migration of controller authorization declarations.
 *
 * Every @Roles(...) becomes @Permissions(). PermissionsGuard derives the same
 * api.<controller>.<handler> key seeded by generate-role-permission-migration.
 * Use --write to apply; without it this script only reports its plan.
 */

const fs = require("fs")
const path = require("path")

const write = process.argv.includes("--write")
const sourceRoot = path.resolve(__dirname, "../../src")
const roleDecorator = /@Roles\(\s*(?:(?:"[^"]*"|'[^']*')\s*,?\s*)+\)/gs

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filePath = path.join(directory, entry.name)
    if (entry.isDirectory()) return walk(filePath)
    return entry.name.endsWith(".controller.ts") ? [filePath] : []
  })
}

const changes = []
for (const filePath of walk(sourceRoot)) {
  const original = fs.readFileSync(filePath, "utf8")
  const protectedEndpointCount = (original.match(roleDecorator) || []).length
  if (!protectedEndpointCount) continue

  let next = original
    .replace(
      /import \{ Roles \} from "\.\.\/roles\/roles\.decorator"/g,
      'import { Permissions } from "../permissions/permissions.decorator"'
    )
    .replace(
      /import \{ RolesGuard \} from "\.\.\/roles\/roles\.guard"/g,
      'import { PermissionsGuard } from "../permissions/permissions.guard"'
    )
    .replace(roleDecorator, "@Permissions()")
    .replace(/RolesGuard/g, "PermissionsGuard")

  if (!next.includes("@UseGuards(JwtAuthGuard, PermissionsGuard)")) {
    if (!next.includes('from "../auth/jwt-auth.guard"')) {
      next = `import { JwtAuthGuard } from "../auth/jwt-auth.guard"\n${next}`
    }
    if (!next.includes('from "../permissions/permissions.guard"')) {
      next = `import { PermissionsGuard } from "../permissions/permissions.guard"\n${next}`
    }
    if (!next.includes("UseGuards")) {
      next = `import { UseGuards } from "@nestjs/common"\n${next}`
    }
    next = next.replace(
      /(@Controller\([^\n]+\)\n)(export class)/,
      "$1@UseGuards(JwtAuthGuard, PermissionsGuard)\n$2"
    )
  }

  const resultCount = (next.match(/@Permissions\(\)/g) || []).length
  if (resultCount !== protectedEndpointCount) {
    throw new Error(`${filePath}: expected ${protectedEndpointCount} permissions, found ${resultCount}`)
  }
  changes.push({ filePath, protectedEndpointCount })
  if (write) fs.writeFileSync(filePath, next)
}

console.log(JSON.stringify({ write, files: changes.length, endpoints: changes.reduce((total, item) => total + item.protectedEndpointCount, 0), changes }, null, 2))
