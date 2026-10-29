import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { asc, eq, schema, sql, type Database, type DbExecutor } from '@planciait/db';
import {
  assetFieldDefinitionsSchema,
  type AssetFieldDefinition,
  type AssetType,
  type CreateAssetTypeRequest,
  type UpdateAssetTypeRequest,
} from '@planciait/shared';
import { AuditService, type AuditEntry } from '../audit/audit.service.js';
import type { ClientInfo, ResolvedSession } from '../auth/session.service.js';
import { isForeignKeyViolation, isUniqueViolation } from '../common/database-errors.js';
import { DATABASE } from '../database/database.module.js';

type AssetTypeRow = typeof schema.assetTypes.$inferSelect;

/** Field definitions were validated on write; parsing again guards against hand-edited rows. */
export function fieldsOf(type: AssetTypeRow): AssetFieldDefinition[] {
  return assetFieldDefinitionsSchema.parse(type.fields);
}

function toAssetType(type: AssetTypeRow, assetCount: number): AssetType {
  return {
    id: type.id,
    name: type.name,
    description: type.description,
    fields: fieldsOf(type),
    assetCount,
  };
}

const assetCount = sql<number>`(select count(*)::int from ${schema.assets} where ${schema.assets.typeId} = ${schema.assetTypes.id})`;

/** Asset types are global: everyone reads them, only administrators change them. */
@Injectable()
export class AssetTypesService {
  constructor(
    @Inject(DATABASE) private readonly database: Database,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<AssetType[]> {
    const rows = await this.database.db
      .select({ type: schema.assetTypes, assetCount })
      .from(schema.assetTypes)
      .orderBy(asc(sql`lower(${schema.assetTypes.name})`));
    return rows.map((row) => toAssetType(row.type, row.assetCount));
  }

  async get(id: string): Promise<AssetType> {
    const [row] = await this.database.db
      .select({ type: schema.assetTypes, assetCount })
      .from(schema.assetTypes)
      .where(eq(schema.assetTypes.id, id))
      .limit(1);
    if (!row) throw new NotFoundException('Asset type not found');
    return toAssetType(row.type, row.assetCount);
  }

  /** The raw row, for services that validate assets against the type. */
  async find(id: string, tx: DbExecutor = this.database.db): Promise<AssetTypeRow | null> {
    const [row] = await tx
      .select()
      .from(schema.assetTypes)
      .where(eq(schema.assetTypes.id, id))
      .limit(1);
    return row ?? null;
  }

  async create(
    actor: ResolvedSession,
    request: CreateAssetTypeRequest,
    client: ClientInfo,
  ): Promise<AssetType> {
    try {
      const type = await this.database.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(schema.assetTypes)
          .values({
            name: request.name,
            description: request.description ?? null,
            fields: request.fields,
          })
          .returning();
        if (!row) throw new Error('Asset type insert returned no row');
        await this.record(tx, actor, client, row.id, 'asset_type.created', { name: row.name });
        return row;
      });
      return toAssetType(type, 0);
    } catch (error) {
      throw this.nameConflict(error);
    }
  }

  /**
   * Changing the fields never rewrites existing assets: values of removed or
   * changed fields stay stored but are hidden until they match again, and new
   * required fields are enforced the next time an asset is saved.
   */
  async update(
    actor: ResolvedSession,
    id: string,
    request: UpdateAssetTypeRequest,
    client: ClientInfo,
  ): Promise<AssetType> {
    const type = await this.find(id);
    if (!type) throw new NotFoundException('Asset type not found');
    try {
      await this.database.db.transaction(async (tx) => {
        const [row] = await tx
          .update(schema.assetTypes)
          .set({ name: request.name, description: request.description, fields: request.fields })
          .where(eq(schema.assetTypes.id, type.id))
          .returning();
        if (!row) throw new NotFoundException('Asset type not found');
        if (row.name !== type.name) {
          await this.record(tx, actor, client, row.id, 'asset_type.updated', {
            field: 'name',
            from: type.name,
            to: row.name,
          });
        }
        if (row.description !== type.description) {
          await this.record(tx, actor, client, row.id, 'asset_type.updated', {
            field: 'description',
          });
        }
        if (JSON.stringify(row.fields) !== JSON.stringify(type.fields)) {
          await this.record(tx, actor, client, row.id, 'asset_type.updated', {
            field: 'fields',
            fieldCount: row.fields.length,
          });
        }
      });
    } catch (error) {
      throw this.nameConflict(error);
    }
    return this.get(type.id);
  }

  /** Only a type no asset uses can be removed. */
  async remove(actor: ResolvedSession, id: string, client: ClientInfo): Promise<void> {
    try {
      await this.database.db.transaction(async (tx) => {
        const [row] = await tx
          .delete(schema.assetTypes)
          .where(eq(schema.assetTypes.id, id))
          .returning();
        if (!row) throw new NotFoundException('Asset type not found');
        await this.record(tx, actor, client, row.id, 'asset_type.deleted', { name: row.name });
      });
    } catch (error) {
      if (isForeignKeyViolation(error)) throw new ConflictException('Asset type is in use');
      throw error;
    }
  }

  private nameConflict(error: unknown): unknown {
    return isUniqueViolation(error)
      ? new ConflictException('Asset type name already exists')
      : error;
  }

  private async record(
    tx: DbExecutor,
    actor: ResolvedSession,
    client: ClientInfo,
    typeId: string,
    action: AuditEntry['action'],
    details?: AuditEntry['details'],
  ): Promise<void> {
    await this.audit.record(
      {
        action,
        actorUserId: actor.user.id,
        ipAddress: client.ipAddress,
        targetType: 'asset_type',
        targetId: typeId,
        details,
      },
      tx,
    );
  }
}
