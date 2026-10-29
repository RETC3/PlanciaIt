import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, schema, type Database, type DbExecutor } from '@planciait/db';
import type { AreaPermission, CurrentUser } from '@planciait/shared';
import { DATABASE } from '../../database/database.module.js';

/** True if `granted` allows an action that needs `needed`. */
export function permits(granted: AreaPermission, needed: AreaPermission): boolean {
  return needed === 'read' || granted === 'write';
}

/**
 * The single place that decides what a user may do in an area. Administrators
 * have `write` on every area; technicians only what their membership grants.
 * Used by AccessGuard for routes with an area id, and by services that load
 * an element first and then check the permissions of the area it belongs to.
 */
@Injectable()
export class AreaAccessService {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  /** The user's permission on the area, or null if the area is unknown or not theirs. */
  async permissionFor(
    user: CurrentUser,
    areaId: string,
    tx: DbExecutor = this.database.db,
  ): Promise<AreaPermission | null> {
    if (user.role === 'admin') {
      const [area] = await tx
        .select({ id: schema.areas.id })
        .from(schema.areas)
        .where(eq(schema.areas.id, areaId))
        .limit(1);
      return area ? 'write' : null;
    }
    const [membership] = await tx
      .select({ permission: schema.areaMembers.permission })
      .from(schema.areaMembers)
      .where(and(eq(schema.areaMembers.areaId, areaId), eq(schema.areaMembers.userId, user.id)))
      .limit(1);
    return membership?.permission ?? null;
  }

  /**
   * For checks on many areas at once (e.g. both ends of each relation): loads
   * the user's memberships once and answers like permissionFor for areas that
   * exist. It does not check that an area exists, so callers pass area ids
   * read from existing elements.
   */
  async permissionLookup(
    user: CurrentUser,
    tx: DbExecutor = this.database.db,
  ): Promise<(areaId: string) => AreaPermission | null> {
    if (user.role === 'admin') return () => 'write';
    const memberships = await tx
      .select({ areaId: schema.areaMembers.areaId, permission: schema.areaMembers.permission })
      .from(schema.areaMembers)
      .where(eq(schema.areaMembers.userId, user.id));
    const byArea = new Map(memberships.map((row) => [row.areaId, row.permission]));
    return (areaId) => byArea.get(areaId) ?? null;
  }

  /**
   * Throws unless the user holds `needed` on the area. An area the user cannot
   * see at all is reported as missing (404) so its existence is not revealed;
   * read-only access to a write action is a 403.
   */
  async require(
    user: CurrentUser,
    areaId: string,
    needed: AreaPermission,
    tx?: DbExecutor,
  ): Promise<AreaPermission> {
    const granted = await this.permissionFor(user, areaId, tx);
    if (granted === null) throw new NotFoundException('Area not found');
    if (!permits(granted, needed)) throw new ForbiddenException();
    return granted;
  }
}
