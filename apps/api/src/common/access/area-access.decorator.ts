import { SetMetadata } from '@nestjs/common';
import type { AreaPermission } from '@planciait/shared';

export const AREA_ACCESS_KEY = 'access:area';

export interface AreaAccessRequirement {
  permission: AreaPermission;
  /** Route parameter holding the area id. */
  param: string;
}

/**
 * Requires the given permission on the area whose id is in the route
 * parameter `param`. Checked by AccessGuard after the session and roles.
 */
export const AreaAccess = (permission: AreaPermission, param = 'id') =>
  SetMetadata(AREA_ACCESS_KEY, { permission, param } satisfies AreaAccessRequirement);
