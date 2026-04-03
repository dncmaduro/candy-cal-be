#!/usr/bin/env node

const fs = require("fs")
const path = require("path")
const mongoose = require("mongoose")

const LEGACY_ROLE = "order-emp"
const TARGET_ROLE = "tiktokshop-emp"
const DEFAULT_DB_NAME = "data"

function parseArgs(argv) {
  return {
    apply: argv.includes("--apply"),
    envFile: getArgValue(argv, "--env-file") || ".env",
    dbName: getArgValue(argv, "--db-name") || DEFAULT_DB_NAME,
    databaseUrl: getArgValue(argv, "--database-url")
  }
}

function getArgValue(argv, flag) {
  const index = argv.indexOf(flag)
  if (index === -1 || index === argv.length - 1) {
    return undefined
  }

  return argv[index + 1]
}

function loadDatabaseUrl(envFilePath) {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL
  }

  const absoluteEnvFilePath = path.resolve(process.cwd(), envFilePath)
  if (!fs.existsSync(absoluteEnvFilePath)) {
    return undefined
  }

  const envContent = fs.readFileSync(absoluteEnvFilePath, "utf8")
  const lines = envContent.split(/\r?\n/)

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#") || !trimmed.startsWith("DATABASE_URL=")) {
      continue
    }

    const rawValue = trimmed.slice("DATABASE_URL=".length).trim()
    return stripWrappingQuotes(rawValue)
  }

  return undefined
}

function stripWrappingQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }

  return value
}

function buildMigratedRoles(roles) {
  const sourceRoles = Array.isArray(roles) ? roles : []
  const migratedRoles = []

  for (const role of sourceRoles) {
    const normalizedRole = role === LEGACY_ROLE ? TARGET_ROLE : role
    if (!migratedRoles.includes(normalizedRole)) {
      migratedRoles.push(normalizedRole)
    }
  }

  return migratedRoles
}

async function main() {
  const { apply, envFile, dbName, databaseUrl: argDatabaseUrl } = parseArgs(process.argv)
  const databaseUrl = argDatabaseUrl || loadDatabaseUrl(envFile)

  if (!databaseUrl) {
    throw new Error(
      "Missing DATABASE_URL. Set env var, pass --database-url, or provide an .env file with DATABASE_URL=..."
    )
  }

  await mongoose.connect(databaseUrl, { dbName })

  try {
    const usersCollection = mongoose.connection.collection("users")
    const users = await usersCollection
      .find({ roles: LEGACY_ROLE }, { projection: { username: 1, name: 1, roles: 1 } })
      .toArray()

    if (!users.length) {
      console.log(`No users found with legacy role "${LEGACY_ROLE}".`)
      return
    }

    const updates = users
      .map(user => {
        const nextRoles = buildMigratedRoles(user.roles)
        const changed = JSON.stringify(user.roles || []) !== JSON.stringify(nextRoles)

        return {
          _id: user._id,
          username: user.username || "",
          currentRoles: user.roles || [],
          nextRoles,
          changed
        }
      })
      .filter(user => user.changed)

    console.log(`Matched users: ${users.length}`)
    console.log(`Users requiring update: ${updates.length}`)

    for (const user of updates) {
      console.log(
        `- ${user.username || user._id}: ${JSON.stringify(user.currentRoles)} -> ${JSON.stringify(
          user.nextRoles
        )}`
      )
    }

    if (!apply) {
      console.log("")
      console.log("Dry run only. Re-run with --apply to write changes.")
      return
    }

    if (!updates.length) {
      console.log("No write needed.")
      return
    }

    const result = await usersCollection.bulkWrite(
      updates.map(user => ({
        updateOne: {
          filter: { _id: user._id },
          update: { $set: { roles: user.nextRoles } }
        }
      }))
    )

    console.log("")
    console.log(`Applied updates: ${result.modifiedCount}`)
  } finally {
    await mongoose.disconnect()
  }
}

main().catch(error => {
  console.error(error.message || error)
  process.exitCode = 1
})
