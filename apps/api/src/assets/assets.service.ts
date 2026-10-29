import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  type BadRequestException,
} from '@nestjs/common';
import {
  and,
  asc,
  count,
  eq,
  ilike,
  or,
  schema,
  sql,
  type Database,
  type DbExecutor,
} from '@planciait/db';
import {
  currentCustomFields,
  validateCustomFields,
  type AreaPermission,
  type AssetDetail,
  type AssetListQuery,
  type AssetSummary,
  type CreateAssetRequest,
  type CurrentUser,
  type CustomFieldInput,
  type CustomFieldValues,
  type ImportAssetRow,
  type ImportAssetsRequest,
  type UpdateAssetRequest,
} from '@planciait/shared';
import { fieldsOf, AssetTypesService } from '../asset-types/asset-types.service.js';
import { AuditService, type AuditEntry } from '../audit/audit.service.js';
import type { ClientInfo, ResolvedSession } from '../auth/session.service.js';
import { AreaAccessService, permits } from '../common/access/area-access.service.js';
import { containsPattern } from '../common/like.js';
import { invalidRequest, type ValidationIssue } from '../common/validation/zod.pipe.js';
import { DATABASE } from '../database/database.module.js';

type AssetRow = typeof schema.assets.$inferSelect;
type AssetTypeRow = typeof schema.assetTypes.$inferSelect;

/** Columns copied as-is between requests and rows; checked for changes on update. */
const plainFields = [
  'name',
  'status',
  'hostname',
  'ipAddress',
  'serialNumber',
  'manufacturer',
  'model',
  'location',
  'notes',
] as const;

function checkedCustomFields(type: AssetTypeRow, input: CustomFieldInput): CustomFieldValues {
  const result = validateCustomFields(fieldsOf(type), input);
  if (!result.success) {
    throw invalidRequest(
      result.issues.map((issue) => ({ path: `customFields.${issue.key}`, message: issue.message })),
    );
  }
  return result.values;
}

function unknownType(): BadRequestException {
  return invalidRequest([{ path: 'typeId', message: 'Unknown asset type' }]);
}

/** Insert values for a new asset; optional text left out becomes null. */
function newAssetValues(
  areaId: string,
  typeId: string,
  request: ImportAssetRow,
  customFields: CustomFieldValues,
): typeof schema.assets.$inferInsert {
  return {
    areaId,
    typeId,
    name: request.name,
    status: request.status,
    hostname: request.hostname ?? null,
    ipAddress: request.ipAddress ?? null,
    serialNumber: request.serialNumber ?? null,
    manufacturer: request.manufacturer ?? null,
    model: request.model ?? null,
    location: request.location ?? null,
    notes: request.notes ?? null,
    customFields,
  };
}

const summaryColumns = {
  asset: schema.assets,
  areaName: schema.areas.name,
  typeName: schema.assetTypes.name,
};

function toSummary(row: { asset: AssetRow; areaName: string; typeName: string }): AssetSummary {
  const { asset } = row;
  return {
    id: asset.id,
    name: asset.name,
    status: asset.status,
    area: { id: asset.areaId, name: row.areaName },
    type: { id: asset.typeId, name: row.typeName },
    hostname: asset.hostname,
    ipAddress: asset.ipAddress,
    location: asset.location,
    updatedAt: asset.updatedAt.toISOString(),
  };
}

/**
 * Inventory items. Every asset belongs to an area and inherits its
 * permissions: `read` to see it, `write` to create, change or delete it.
 * Moving an asset needs `write` on both areas.
 */
@Injectable()
export class AssetsService {
  constructor(
    @Inject(DATABASE) private readonly database: Database,
    private readonly access: AreaAccessService,
    private readonly assetTypes: AssetTypesService,
    private readonly audit: AuditService,
  ) {}

  /** Only assets in areas the user can see; technicians never get others, whatever the filters. */
  async list(
    user: CurrentUser,
    query: AssetListQuery,
  ): Promise<{ assets: AssetSummary[]; total: number }> {
    const conditions = [
      query.areaId ? eq(schema.assets.areaId, query.areaId) : undefined,
      query.typeId ? eq(schema.assets.typeId, query.typeId) : undefined,
      query.status ? eq(schema.assets.status, query.status) : undefined,
      query.q
        ? or(
            ilike(schema.assets.name, containsPattern(query.q)),
            ilike(schema.assets.hostname, containsPattern(query.q)),
            ilike(schema.assets.ipAddress, containsPattern(query.q)),
            ilike(schema.assets.serialNumber, containsPattern(query.q)),
          )
        : undefined,
      this.access.readableAreas(user, schema.assets.areaId),
    ];
    const where = and(...conditions);

    const [rows, totals] = await Promise.all([
      this.database.db
        .select(summaryColumns)
        .from(schema.assets)
        .innerJoin(schema.areas, eq(schema.areas.id, schema.assets.areaId))
        .innerJoin(schema.assetTypes, eq(schema.assetTypes.id, schema.assets.typeId))
        .where(where)
        .orderBy(asc(sql`lower(${schema.assets.name})`), asc(schema.assets.id))
        .limit(query.limit)
        .offset(query.offset),
      this.database.db.select({ total: count() }).from(schema.assets).where(where),
    ]);
    return { assets: rows.map(toSummary), total: totals[0]?.total ?? 0 };
  }

  async get(user: CurrentUser, id: string): Promise<AssetDetail> {
    const asset = await this.requireAsset(id);
    const permission = await this.access.permissionFor(user, asset.areaId);
    // Assets in areas the user cannot see look exactly like missing ones.
    if (permission === null) throw new NotFoundException('Asset not found');
    return this.detail(asset.id, permission);
  }

  async create(
    actor: ResolvedSession,
    request: CreateAssetRequest,
    client: ClientInfo,
  ): Promise<AssetDetail> {
    await this.access.require(actor.user, request.areaId, 'write');
    const type = await this.assetTypes.find(request.typeId);
    if (!type) throw unknownType();
    const values = newAssetValues(
      request.areaId,
      type.id,
      request,
      checkedCustomFields(type, request.customFields),
    );

    const asset = await this.database.db.transaction(async (tx) => {
      const [row] = await tx.insert(schema.assets).values(values).returning();
      if (!row) throw new Error('Asset insert returned no row');
      await this.record(tx, actor, client, row, 'asset.created', {
        name: row.name,
        areaId: row.areaId,
        typeId: row.typeId,
      });
      return row;
    });
    return this.detail(asset.id, 'write');
  }

  /**
   * Creates a batch of assets of one type in one area, all or nothing: a
   * single invalid row rejects the whole request, listing every problem.
   */
  async importMany(
    actor: ResolvedSession,
    request: ImportAssetsRequest,
    client: ClientInfo,
  ): Promise<number> {
    await this.access.require(actor.user, request.areaId, 'write');
    const type = await this.assetTypes.find(request.typeId);
    if (!type) throw unknownType();

    const fields = fieldsOf(type);
    const issues: ValidationIssue[] = [];
    const values = request.assets.map((row, index) => {
      const result = validateCustomFields(fields, row.customFields);
      if (!result.success) {
        for (const issue of result.issues) {
          issues.push({
            path: `assets.${index}.customFields.${issue.key}`,
            message: issue.message,
          });
        }
        return null;
      }
      return newAssetValues(request.areaId, type.id, row, result.values);
    });
    if (issues.length > 0) throw invalidRequest(issues);

    return this.database.db.transaction(async (tx) => {
      const rows = await tx
        .insert(schema.assets)
        .values(values.filter((value) => value !== null))
        .returning();
      await this.audit.recordMany(
        [
          ...rows.map((row) => ({
            action: 'asset.created' as const,
            actorUserId: actor.user.id,
            ipAddress: client.ipAddress,
            targetType: 'asset',
            targetId: row.id,
            details: { name: row.name, areaId: row.areaId, typeId: row.typeId, imported: true },
          })),
          {
            action: 'asset.imported',
            actorUserId: actor.user.id,
            ipAddress: client.ipAddress,
            targetType: 'area',
            targetId: request.areaId,
            details: { typeId: type.id, count: rows.length },
          },
        ],
        tx,
      );
      return rows.length;
    });
  }

  async update(
    actor: ResolvedSession,
    id: string,
    request: UpdateAssetRequest,
    client: ClientInfo,
  ): Promise<AssetDetail> {
    const asset = await this.requireWritable(actor.user, id);
    if (request.areaId !== undefined && request.areaId !== asset.areaId) {
      await this.access.require(actor.user, request.areaId, 'write');
    }

    const typeChanging = request.typeId !== undefined && request.typeId !== asset.typeId;
    const type = await this.assetTypes.find(request.typeId ?? asset.typeId);
    if (!type) throw unknownType();
    // New values replace all custom fields; on a type change without new
    // values, whatever still fits the new type is kept.
    const customFields =
      request.customFields !== undefined
        ? checkedCustomFields(type, request.customFields)
        : typeChanging
          ? checkedCustomFields(type, currentCustomFields(fieldsOf(type), asset.customFields))
          : asset.customFields;

    await this.database.db.transaction(async (tx) => {
      const [row] = await tx
        .update(schema.assets)
        .set({
          areaId: request.areaId,
          typeId: request.typeId,
          name: request.name,
          status: request.status,
          hostname: request.hostname,
          ipAddress: request.ipAddress,
          serialNumber: request.serialNumber,
          manufacturer: request.manufacturer,
          model: request.model,
          location: request.location,
          notes: request.notes,
          customFields,
        })
        .where(eq(schema.assets.id, asset.id))
        .returning();
      if (!row) throw new NotFoundException('Asset not found');

      const changed: string[] = plainFields.filter((field) => row[field] !== asset[field]);
      if (row.typeId !== asset.typeId) changed.push('typeId');
      if (JSON.stringify(row.customFields) !== JSON.stringify(asset.customFields)) {
        changed.push('customFields');
      }
      if (changed.length > 0) {
        await this.record(tx, actor, client, row, 'asset.updated', { fields: changed.join(',') });
      }
      if (row.areaId !== asset.areaId) {
        await this.record(tx, actor, client, row, 'asset.moved', {
          from: asset.areaId,
          to: row.areaId,
        });
      }
    });
    return this.detail(asset.id, 'write');
  }

  async remove(actor: ResolvedSession, id: string, client: ClientInfo): Promise<void> {
    const asset = await this.requireWritable(actor.user, id);
    await this.database.db.transaction(async (tx) => {
      const [row] = await tx
        .delete(schema.assets)
        .where(eq(schema.assets.id, asset.id))
        .returning();
      if (!row) throw new NotFoundException('Asset not found');
      await this.record(tx, actor, client, row, 'asset.deleted', {
        name: row.name,
        areaId: row.areaId,
      });
    });
  }

  private async requireAsset(id: string): Promise<AssetRow> {
    const [asset] = await this.database.db
      .select()
      .from(schema.assets)
      .where(eq(schema.assets.id, id))
      .limit(1);
    if (!asset) throw new NotFoundException('Asset not found');
    return asset;
  }

  /** 404 if the user cannot see the asset's area, 403 if they can only read it. */
  private async requireWritable(user: CurrentUser, id: string): Promise<AssetRow> {
    const asset = await this.requireAsset(id);
    const permission = await this.access.permissionFor(user, asset.areaId);
    if (permission === null) throw new NotFoundException('Asset not found');
    if (!permits(permission, 'write')) throw new ForbiddenException();
    return asset;
  }

  private async detail(id: string, permission: AreaPermission): Promise<AssetDetail> {
    const [row] = await this.database.db
      .select({ ...summaryColumns, type: schema.assetTypes })
      .from(schema.assets)
      .innerJoin(schema.areas, eq(schema.areas.id, schema.assets.areaId))
      .innerJoin(schema.assetTypes, eq(schema.assetTypes.id, schema.assets.typeId))
      .where(eq(schema.assets.id, id))
      .limit(1);
    if (!row) throw new NotFoundException('Asset not found');
    const { asset } = row;
    return {
      ...toSummary(row),
      serialNumber: asset.serialNumber,
      manufacturer: asset.manufacturer,
      model: asset.model,
      notes: asset.notes,
      customFields: currentCustomFields(fieldsOf(row.type), asset.customFields),
      permission,
      createdAt: asset.createdAt.toISOString(),
    };
  }

  private async record(
    tx: DbExecutor,
    actor: ResolvedSession,
    client: ClientInfo,
    asset: AssetRow,
    action: AuditEntry['action'],
    details?: AuditEntry['details'],
  ): Promise<void> {
    await this.audit.record(
      {
        action,
        actorUserId: actor.user.id,
        ipAddress: client.ipAddress,
        targetType: 'asset',
        targetId: asset.id,
        details,
      },
      tx,
    );
  }
}
