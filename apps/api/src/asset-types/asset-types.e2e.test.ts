import {
  assetTypeListResponseSchema,
  assetTypeResponseSchema,
  type AssetType,
} from '@planciait/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  auditActions,
  createTestUser,
  signIn,
  TestClient,
  type TestUser,
} from '../test/helpers.js';
import { startTestApp, type TestApp } from '../test/test-app.js';

let testApp: TestApp;
let admin: TestUser;
let adminClient: TestClient;

beforeAll(async () => {
  testApp = await startTestApp();
  admin = await createTestUser(testApp, { role: 'admin' });
  adminClient = await signIn(testApp, admin);
}, 30_000);

afterAll(async () => {
  await testApp.close();
});

let nameCounter = 0;

async function createType(body: Record<string, unknown> = {}): Promise<AssetType> {
  const response = await adminClient.request('POST', '/asset-types', {
    name: `Tipo ${nameCounter++}`,
    ...body,
  });
  expect(response.status).toBe(201);
  return assetTypeResponseSchema.parse(await response.json()).assetType;
}

describe('asset types', () => {
  it('ships with default types that every role can read', async () => {
    const technician = await signIn(testApp, await createTestUser(testApp));
    const response = await technician.request('GET', '/asset-types');
    expect(response.status).toBe(200);
    const names = assetTypeListResponseSchema
      .parse(await response.json())
      .assetTypes.map((type) => type.name);
    expect(names).toEqual(expect.arrayContaining(['Server', 'Dispositivo di rete', 'Altro']));
  });

  it('creates and updates a type with custom fields, with audit entries', async () => {
    const type = await createType({
      description: 'Gruppi di continuità',
      fields: [
        { key: 'power_va', label: 'Potenza (VA)', kind: 'number', required: true },
        { key: 'battery_date', label: 'Data batterie', kind: 'date' },
      ],
    });
    expect(type.fields).toEqual([
      { key: 'power_va', label: 'Potenza (VA)', kind: 'number', required: true },
      { key: 'battery_date', label: 'Data batterie', kind: 'date', required: false },
    ]);
    expect(type.assetCount).toBe(0);

    const updated = await adminClient.request('PATCH', `/asset-types/${type.id}`, {
      name: 'UPS',
      fields: [{ key: 'power_va', label: 'Potenza (VA)', kind: 'number', required: false }],
    });
    expect(updated.status).toBe(200);
    expect(assetTypeResponseSchema.parse(await updated.json()).assetType).toMatchObject({
      name: 'UPS',
      fields: [{ key: 'power_va', required: false }],
    });
    expect(await auditActions(testApp, admin.id)).toEqual(
      expect.arrayContaining(['asset_type.created', 'asset_type.updated']),
    );
  });

  it('rejects invalid field definitions and duplicate names', async () => {
    const invalid = await adminClient.request('POST', '/asset-types', {
      name: 'Duplicati',
      fields: [
        { key: 'a', label: 'A', kind: 'text' },
        { key: 'a', label: 'B', kind: 'text' },
      ],
    });
    expect(invalid.status).toBe(400);
    const duplicate = await adminClient.request('POST', '/asset-types', { name: 'server' });
    expect(duplicate.status).toBe(409);
  });

  it('is changed only by administrators', async () => {
    const type = await createType();
    const technician = await signIn(testApp, await createTestUser(testApp));
    expect((await technician.request('POST', '/asset-types', { name: 'Mio' })).status).toBe(403);
    expect(
      (await technician.request('PATCH', `/asset-types/${type.id}`, { name: 'Mio' })).status,
    ).toBe(403);
    expect((await technician.request('DELETE', `/asset-types/${type.id}`)).status).toBe(403);
  });

  it('deletes an unused type', async () => {
    const type = await createType();
    expect((await adminClient.request('DELETE', `/asset-types/${type.id}`)).status).toBe(204);
    expect((await adminClient.request('GET', `/asset-types/${type.id}`)).status).toBe(404);
  });
});
