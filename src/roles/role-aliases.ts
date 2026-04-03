export const SHOP_EMPLOYEE_ROLES = [
  "order-emp",
  "tiktokshop-emp",
  "shopee-emp"
] as const

const ROLE_ALIAS_GROUPS: readonly (readonly string[])[] = [SHOP_EMPLOYEE_ROLES]

export function expandRoleAliases(roles: string[] = []): string[] {
  const expanded = new Set(roles)

  for (const role of roles) {
    const group = ROLE_ALIAS_GROUPS.find((item) => item.includes(role))
    if (!group) continue
    for (const alias of group) expanded.add(alias)
  }

  return Array.from(expanded)
}

export function buildRoleFilter(role?: string): string | { $in: readonly string[] } | undefined {
  const normalized = String(role || "").trim()
  if (!normalized) return undefined

  const group = ROLE_ALIAS_GROUPS.find((item) => item.includes(normalized))
  if (!group) return normalized

  return { $in: group }
}
