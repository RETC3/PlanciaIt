import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, inArray, or, schema, type Database, type DbExecutor } from '@planciait/db';
import {
  elementTypeSchema,
  isSymmetricRelation,
  type AreaPermission,
  type CreateRelationRequest,
  type CurrentUser,
  type ElementRef,
  type ElementType,
  type Relation,
} from '@planciait/shared';
import { AuditService } from '../audit/audit.service.js';
import type { ClientInfo, ResolvedSession } from '../auth/session.service.js';
import { AreaAccessService, permits } from '../common/access/area-access.service.js';
import { isUniqueViolation } from '../common/database-errors.js';
import { DATABASE } from '../database/database.module.js';

type RelationRow = typeof schema.relations.$inferSelect;

/** What a relation needs to know about one of its ends. */
interface ElementInfo {
  type: ElementType;
  id: string;
  name: string;
  areaId: string;
  areaName: string;
}

function refKey(ref: ElementRef): string {
  return `${ref.type}:${ref.id}`;
}

function sourceOf(row: RelationRow): ElementRef {
  return { type: row.sourceType, id: row.sourceId };
}

function targetOf(row: RelationRow): ElementRef {
  return { type: row.targetType, id: row.targetId };
}

function notFound(): NotFoundException {
  return new NotFoundException('Element not found');
}

/**
 * Links between elements of any type. A relation inherits the permissions of
 * both ends: it is visible only to who can read both elements, and created or
 * deleted by who can also write at least one of them. An element the user
 * cannot see is reported as missing.
 */
@Injectable()
export class RelationsService {
  constructor(
    @Inject(DATABASE) private readonly database: Database,
    private readonly access: AreaAccessService,
    private readonly audit: AuditService,
  ) {}

  /** The relations of an element whose other end the user can also see. */
  async list(user: CurrentUser, ref: ElementRef): Promise<Relation[]> {
    const permissionOf = await this.access.permissionLookup(user);
    const [element] = await this.loadElements([ref]);
    const elementPermission = element ? permissionOf(element.areaId) : null;
    if (elementPermission === null) throw notFound();

    const rows = await this.database.db
      .select()
      .from(schema.relations)
      .where(
        or(
          and(eq(schema.relations.sourceType, ref.type), eq(schema.relations.sourceId, ref.id)),
          and(eq(schema.relations.targetType, ref.type), eq(schema.relations.targetId, ref.id)),
        ),
      )
      .orderBy(asc(schema.relations.createdAt), asc(schema.relations.id));

    const ends = rows.map((row) => {
      const outgoing = refKey(sourceOf(row)) === refKey(ref);
      return { row, outgoing, other: outgoing ? targetOf(row) : sourceOf(row) };
    });
    const others = new Map(
      (await this.loadElements(ends.map((end) => end.other))).map((info) => [refKey(info), info]),
    );

    return ends.flatMap(({ row, outgoing, other }) => {
      const info = others.get(refKey(other));
      const otherPermission = info ? permissionOf(info.areaId) : null;
      if (!info || otherPermission === null) return [];
      return [toRelation(row, outgoing, info, elementPermission, otherPermission)];
    });
  }

  async create(
    actor: ResolvedSession,
    request: CreateRelationRequest,
    client: ClientInfo,
  ): Promise<Relation> {
    const { source, target } = request;
    const ends = await this.checkEnds(actor.user, source, target);
    // Symmetric relations are stored with their ends in a canonical order, so
    // that "A connected to B" and "B connected to A" are the same row.
    const swap = isSymmetricRelation(request.kind) && refKey(source) > refKey(target);
    const [from, to] = swap ? [target, source] : [source, target];

    const row = await this.database.db
      .transaction(async (tx) => {
        const [inserted] = await tx
          .insert(schema.relations)
          .values({
            kind: request.kind,
            sourceType: from.type,
            sourceId: from.id,
            targetType: to.type,
            targetId: to.id,
            note: request.note ?? null,
            createdBy: actor.user.id,
          })
          .returning();
        if (!inserted) throw new Error('Relation insert returned no row');
        await this.record(tx, actor, client, inserted, 'relation.created');
        return inserted;
      })
      .catch((error: unknown) => {
        throw isUniqueViolation(error) ? new ConflictException('Relation already exists') : error;
      });
    // Described as seen from the source of the request.
    return toRelation(row, !swap, ends.target.info, ends.source.permission, ends.target.permission);
  }

  async remove(actor: ResolvedSession, id: string, client: ClientInfo): Promise<void> {
    const [relation] = await this.database.db
      .select()
      .from(schema.relations)
      .where(eq(schema.relations.id, id))
      .limit(1);
    if (!relation) throw new NotFoundException('Relation not found');
    await this.checkEnds(actor.user, sourceOf(relation), targetOf(relation));

    await this.database.db.transaction(async (tx) => {
      const [row] = await tx
        .delete(schema.relations)
        .where(eq(schema.relations.id, relation.id))
        .returning();
      if (!row) throw new NotFoundException('Relation not found');
      await this.record(tx, actor, client, row, 'relation.deleted');
    });
  }

  /**
   * 404 unless the user can see both ends, 403 unless they can write at least
   * one.
   */
  private async checkEnds(
    user: CurrentUser,
    source: ElementRef,
    target: ElementRef,
  ): Promise<Record<'source' | 'target', { info: ElementInfo; permission: AreaPermission }>> {
    const permissionOf = await this.access.permissionLookup(user);
    const elements = new Map(
      (await this.loadElements([source, target])).map((info) => [refKey(info), info]),
    );
    const sourceInfo = elements.get(refKey(source));
    const targetInfo = elements.get(refKey(target));
    const sourcePermission = sourceInfo ? permissionOf(sourceInfo.areaId) : null;
    const targetPermission = targetInfo ? permissionOf(targetInfo.areaId) : null;
    if (!sourceInfo || !targetInfo || sourcePermission === null || targetPermission === null) {
      throw notFound();
    }
    if (!permits(sourcePermission, 'write') && !permits(targetPermission, 'write')) {
      throw new ForbiddenException();
    }
    return {
      source: { info: sourceInfo, permission: sourcePermission },
      target: { info: targetInfo, permission: targetPermission },
    };
  }

  /** Name and area of each existing element; unknown ones are left out. */
  private async loadElements(
    refs: ElementRef[],
    tx: DbExecutor = this.database.db,
  ): Promise<ElementInfo[]> {
    const loaded: ElementInfo[] = [];
    for (const type of elementTypeSchema.options) {
      const ids = [...new Set(refs.filter((ref) => ref.type === type).map((ref) => ref.id))];
      if (ids.length === 0) continue;
      switch (type) {
        case 'asset': {
          const rows = await tx
            .select({
              id: schema.assets.id,
              name: schema.assets.name,
              areaId: schema.assets.areaId,
              areaName: schema.areas.name,
            })
            .from(schema.assets)
            .innerJoin(schema.areas, eq(schema.areas.id, schema.assets.areaId))
            .where(inArray(schema.assets.id, ids));
          loaded.push(...rows.map((row) => ({ type, ...row })));
          break;
        }
      }
    }
    return loaded;
  }

  private async record(
    tx: DbExecutor,
    actor: ResolvedSession,
    client: ClientInfo,
    row: RelationRow,
    action: 'relation.created' | 'relation.deleted',
  ): Promise<void> {
    await this.audit.record(
      {
        action,
        actorUserId: actor.user.id,
        ipAddress: client.ipAddress,
        targetType: 'relation',
        targetId: row.id,
        details: {
          kind: row.kind,
          sourceType: row.sourceType,
          sourceId: row.sourceId,
          targetType: row.targetType,
          targetId: row.targetId,
        },
      },
      tx,
    );
  }
}

function toRelation(
  row: RelationRow,
  outgoing: boolean,
  other: ElementInfo,
  elementPermission: AreaPermission,
  otherPermission: AreaPermission,
): Relation {
  return {
    id: row.id,
    kind: row.kind,
    direction: outgoing ? 'outgoing' : 'incoming',
    other: {
      type: other.type,
      id: other.id,
      name: other.name,
      area: { id: other.areaId, name: other.areaName },
    },
    note: row.note,
    canDelete: permits(elementPermission, 'write') || permits(otherPermission, 'write'),
    createdAt: row.createdAt.toISOString(),
  };
}
