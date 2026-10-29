import { count, schema, SeedRefusedError, seedDatabase } from '@planciait/db';
import {
  areaListResponseSchema,
  areaMemberListResponseSchema,
  assetListResponseSchema,
  assetResponseSchema,
  assetTypeListResponseSchema,
  createAssetRequestSchema,
  isSymmetricRelation,
  relationListResponseSchema,
  searchResponseSchema,
  userListResponseSchema,
  validateCustomFields,
} from '@planciait/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestUser, signIn, type TestClient } from './helpers.js';
import { startTestApp, type TestApp } from './test-app.js';

let testApp: TestApp;

beforeAll(async () => {
  testApp = await startTestApp();
}, 30_000);

afterAll(async () => {
  await testApp.close();
});

async function json(client: TestClient, path: string): Promise<unknown> {
  const response = await client.request('GET', path);
  expect(response.status).toBe(200);
  return response.json();
}

describe('pnpm db:seed', () => {
  let admin: TestClient;

  it('refuses to run before the first-run setup', async () => {
    await expect(seedDatabase(testApp.database.db)).rejects.toBeInstanceOf(SeedRefusedError);
    const [areas] = await testApp.database.db.select({ total: count() }).from(schema.areas);
    expect(areas?.total).toBe(0);
  });

  it('loads demo data that the API accepts as valid', async () => {
    admin = await signIn(testApp, await createTestUser(testApp, { role: 'admin' }));
    const result = await seedDatabase(testApp.database.db);
    expect(result).toEqual({ areas: 4, technicians: 3, assets: 29, relations: 39 });

    const types = assetTypeListResponseSchema.parse(await json(admin, '/asset-types')).assetTypes;
    const list = assetListResponseSchema.parse(await json(admin, '/assets?limit=200'));
    expect(list.total).toBe(result.assets);
    for (const summary of list.assets) {
      const asset = assetResponseSchema.parse(await json(admin, `/assets/${summary.id}`)).asset;
      // Every row would also pass the create endpoint's validation.
      const type = types.find((candidate) => candidate.id === asset.type.id);
      expect(validateCustomFields(type?.fields ?? [], asset.customFields).success).toBe(true);
      expect(
        createAssetRequestSchema.safeParse({
          ...asset,
          areaId: asset.area.id,
          typeId: asset.type.id,
        }).success,
      ).toBe(true);
    }

    const esx = list.assets.find((asset) => asset.name === 'esx-01');
    const relations = relationListResponseSchema.parse(
      await json(admin, `/relations?elementType=asset&elementId=${esx?.id ?? ''}`),
    ).relations;
    // Symmetric relations have no meaningful direction: it depends on the ids.
    const readings = relations.map((relation) =>
      isSymmetricRelation(relation.kind) ? relation.kind : `${relation.kind}:${relation.direction}`,
    );
    expect(readings.sort()).toEqual(
      [
        'connected_to',
        'depends_on:outgoing',
        'located_in:outgoing',
        'runs_on:incoming',
        'runs_on:incoming',
        'runs_on:incoming',
        'runs_on:incoming',
      ].sort(),
    );

    const found = searchResponseSchema.parse(await json(admin, '/search?q=dc01'));
    expect(found.assets.results[0]?.name).toBe('srv-dc01');
  });

  it('creates technicians waiting for an invitation, with their area permissions', async () => {
    const users = userListResponseSchema.parse(await json(admin, '/users')).users;
    const luca = users.find((user) => user.username === 'luca.bianchi');
    expect(luca).toMatchObject({ role: 'technician', status: 'invitation_expired' });

    const areas = areaListResponseSchema.parse(await json(admin, '/areas')).areas;
    const network = areas.find((area) => area.name === 'Rete');
    const members = areaMemberListResponseSchema.parse(
      await json(admin, `/areas/${network?.id ?? ''}/members`),
    ).members;
    expect(members.map((member) => [member.username, member.permission]).sort()).toEqual([
      ['giulia.verdi', 'read'],
      ['luca.bianchi', 'write'],
    ]);
  });

  it('refuses to run again on an installation with areas', async () => {
    await expect(seedDatabase(testApp.database.db)).rejects.toThrow(/Areas already exist/);
    const [assets] = await testApp.database.db.select({ total: count() }).from(schema.assets);
    expect(assets?.total).toBe(29);
  });
});
