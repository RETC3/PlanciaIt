import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import { createDatabase, type Db } from './client.js';
import { databaseUrlFromEnv } from './env.js';
import { areaMembers, areas } from './schema/areas.js';
import { auditLog, users } from './schema/auth.js';
import { assets, assetTypes } from './schema/inventory.js';
import { relations } from './schema/relations.js';
import {
  seedAreas,
  seedAssets,
  seedAssetTypes,
  seedRelations,
  seedTechnicians,
  type SeedAsset,
} from './seed-data.js';

/** A precondition of the seed is not met; the message is for the person running it. */
export class SeedRefusedError extends Error {
  override name = 'SeedRefusedError';
}

export interface SeedResult {
  areas: number;
  technicians: number;
  assets: number;
  relations: number;
}

const symmetricKinds = new Set(['connected_to', 'related_to']);

/** Keys of the custom fields a stored asset type defines. */
function fieldKeys(fields: unknown[]): Set<string> {
  const keys = new Set<string>();
  for (const field of fields) {
    if (typeof field === 'object' && field !== null && 'key' in field) {
      if (typeof field.key === 'string') keys.add(field.key);
    }
  }
  return keys;
}

function customFieldsFor(
  asset: SeedAsset,
  keys: Set<string>,
): Record<string, string | number | boolean> {
  return Object.fromEntries(
    Object.entries(asset.customFields ?? {}).filter(([key]) => keys.has(key)),
  );
}

/**
 * Fills an installation with demo data: areas, technicians with their area
 * permissions, assets and relations. Meant for development and demos only.
 *
 * It runs after the first-run setup, because setup is only offered while no
 * user exists, and only on an installation without areas, so it never mixes
 * with real data. Technicians are created without credentials: the
 * administrator issues their invitation links from the users page. All in
 * one transaction: either everything is created or nothing.
 */
export async function seedDatabase(db: Db): Promise<SeedResult> {
  return db.transaction(async (tx) => {
    const [admin] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.role, 'admin'))
      .limit(1);
    if (!admin) {
      throw new SeedRefusedError(
        'No administrator yet: complete the first-run setup at /setup, then run the seed again.',
      );
    }
    const [existingArea] = await tx.select({ id: areas.id }).from(areas).limit(1);
    if (existingArea) {
      throw new SeedRefusedError(
        'Areas already exist: the seed only runs on an empty installation, so demo data never mixes with real data.',
      );
    }
    const usernames = new Set(seedTechnicians.map((technician) => technician.username));
    const existingUsers = await tx.select({ username: users.username }).from(users);
    const clash = existingUsers.find((user) => usernames.has(user.username));
    if (clash) {
      throw new SeedRefusedError(
        `A user named "${clash.username}" already exists; the demo data needs that username.`,
      );
    }

    const areaRows = await tx
      .insert(areas)
      .values(seedAreas.map(({ name, description }) => ({ name, description })))
      .returning();
    const areaIds = new Map(
      seedAreas.map((area) => [area.key, areaRows.find((row) => row.name === area.name)?.id]),
    );
    function areaId(key: string): string {
      const id = areaIds.get(key);
      if (!id) throw new Error(`Unknown seed area ${key}`);
      return id;
    }

    // Default types may have been renamed or deleted: missing ones are recreated.
    const types = new Map(
      (await tx.select().from(assetTypes)).map((type) => [type.name.toLowerCase(), type]),
    );
    for (const seedType of seedAssetTypes) {
      if (types.has(seedType.name.toLowerCase())) continue;
      const [row] = await tx.insert(assetTypes).values(seedType).returning();
      if (row) types.set(row.name.toLowerCase(), row);
    }
    function typeOf(name: string) {
      const type = types.get(name.toLowerCase());
      if (!type) throw new Error(`Unknown seed asset type ${name}`);
      return type;
    }

    const technicianRows = await tx
      .insert(users)
      .values(
        seedTechnicians.map(({ username, displayName }) => ({
          username,
          displayName,
          role: 'technician' as const,
        })),
      )
      .returning();
    const memberships = seedTechnicians.flatMap((technician) => {
      const userId = technicianRows.find((row) => row.username === technician.username)?.id;
      if (!userId) throw new Error(`Seed technician ${technician.username} not inserted`);
      return Object.entries(technician.areas).flatMap(([key, permission]) =>
        permission ? [{ areaId: areaId(key), userId, permission }] : [],
      );
    });
    await tx.insert(areaMembers).values(memberships);

    const assetRows = await tx
      .insert(assets)
      .values(
        seedAssets.map((asset) => {
          const type = typeOf(asset.type);
          return {
            areaId: areaId(asset.area),
            typeId: type.id,
            name: asset.name,
            status: asset.status ?? 'in_use',
            hostname: asset.hostname ?? null,
            ipAddress: asset.ipAddress ?? null,
            serialNumber: asset.serialNumber ?? null,
            manufacturer: asset.manufacturer ?? null,
            model: asset.model ?? null,
            location: asset.location ?? null,
            notes: asset.notes ?? null,
            customFields: customFieldsFor(asset, fieldKeys(type.fields)),
          };
        }),
      )
      .returning({ id: assets.id, name: assets.name });
    const assetIds = new Map(assetRows.map((row) => [row.name, row.id]));
    function assetId(name: string): string {
      const id = assetIds.get(name);
      if (!id) throw new Error(`Unknown seed asset ${name}`);
      return id;
    }

    await tx.insert(relations).values(
      seedRelations.map((relation) => {
        let source = assetId(relation.source);
        let target = assetId(relation.target);
        // Same canonical order as the API for symmetric kinds (both ends are assets).
        if (symmetricKinds.has(relation.kind) && source > target) {
          [source, target] = [target, source];
        }
        return {
          kind: relation.kind,
          sourceType: 'asset' as const,
          sourceId: source,
          targetType: 'asset' as const,
          targetId: target,
          note: relation.note ?? null,
          createdBy: admin.id,
        };
      }),
    );

    const result: SeedResult = {
      areas: areaRows.length,
      technicians: technicianRows.length,
      assets: assetRows.length,
      relations: seedRelations.length,
    };
    await tx.insert(auditLog).values({ action: 'database.seeded', details: { ...result } });
    return result;
  });
}

// CLI entrypoint: `node dist/seed.js` (used by `pnpm db:seed`).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.env.NODE_ENV === 'production') {
    console.error('The seed loads demo data and does not run with NODE_ENV=production.');
    process.exitCode = 1;
  } else {
    const { db, pool } = createDatabase(databaseUrlFromEnv());
    seedDatabase(db)
      .then((result) => {
        process.stdout.write(
          `Demo data loaded: ${result.areas} areas, ${result.technicians} technicians, ` +
            `${result.assets} assets, ${result.relations} relations.\n` +
            'Technicians have no password yet: issue their invitation links from the users page.\n',
        );
      })
      .catch((error: unknown) => {
        const cause = error instanceof Error && error.cause instanceof Error ? error.cause : error;
        console.error('Seed failed:', cause instanceof Error ? cause.message : cause);
        process.exitCode = 1;
      })
      .finally(() => pool.end());
  }
}
