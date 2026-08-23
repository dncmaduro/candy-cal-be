import { SetMetadata } from "@nestjs/common"

export const PERMISSIONS_KEY = "permissions"

/**
 * Marks an endpoint as permission-protected.
 *
 * With no explicit key, PermissionsGuard derives the stable API key from the
 * controller path and handler name (for example api.users.admin-list-users).
 * An explicit key is available for non-HTTP or shared business capabilities.
 */
export const Permissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions)
