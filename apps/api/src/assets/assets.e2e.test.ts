import { and, eq, schema } from '@planciait/db';
import {
  areaResponseSchema,
  assetListResponseSchema,
  assetResponseSchema,
  assetTypeResponseSchema,
  type AreaSummary,
  type AssetDetail,
  type AssetType,
} from '@planciait/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestUser, signIn, TestClient, type TestUser } from '../test/helpers.js';
import { startTestApp, type TestApp } from '../test/test-app.js';

let testApp: TestApp;
let adminClient: TestClient;
let serverType: AssetType;

beforeAll(async () => {
  testApp = await startTestApp();
  const admin = await createTestUser(testApp, { role: 'admin' });
  adminClient = await signIn(testApp, admin);
  const response = await adminClient.request('POST', '/asset-types', {
    name: 'Server di prova',
    fields: [
      { key: 'os', label: 'Sistema operativo', kind: 'text', required: true },
      { key: 'cores', label: 'Core', kind: 'number' },
    ],
  });
  serverType = assetTypeResponseSchema.parse(await response.json()).assetType;
}, 30_000);

afterAll(async () => {
  await testApp.close();
});

let counter = 0;

async function createArea(): Promise<AreaSummary> {
  const response = await adminClient.request('POST', '/areas', { name: `Area ${counter++}` });
  return areaResponseSchema.parse(await response.json()).area;
}

async function createAsset(
  client: TestClient,
  areaId: string,
  body: Record<string, unknown> = {},
): Promise<Response> {
  return client.request('POST', '/assets', {
    areaId,
    typeId: serverType.id,
    name: `srv-${counter++}`,
    customFields: { os: 'Debian 13' },
    ...body,
  });
}

async function adminAsset(areaId: string, body: Record<string, unknown> = {}) {
  const response = await createAsset(adminClient, areaId, body);
  expect(response.status).toBe(201);
  return assetResponseSchema.parse(await response.json()).asset;
}

async function technician(
  memberships: [string, 'read' | 'write'][] = [],
): Promise<TestUser & { client: TestClient }> {
  const user = await createTestUser(testApp);
  for (const [areaId, permission] of memberships) {
    await adminClient.request('PUT', `/areas/${areaId}/members/${user.id}`, { permission });
  }
  return { ...user, client: await signIn(testApp, user) };
}

async function assetAudit(asset: AssetDetail): Promise<string[]> {
  const rows = await testApp.database.db
    .select({ action: schema.auditLog.action })
    .from(schema.auditLog)
    .where(and(eq(schema.auditLog.targetType, 'asset'), eq(schema.auditLog.targetId, asset.id)))
    .orderBy(schema.auditLog.occurredAt);
  return rows.map((row) => row.action);
}

describe('creating and editing assets', () => {
  it('requires a session', async () => {
    expect((await new TestClient(testApp).request('GET', '/assets')).status).toBe(401);
  });

  it('creates, updates and deletes an asset, with audit entries', async () => {
    const area = await createArea();
    const asset = await adminAsset(area.id, {
      name: 'srv-dc01',
      hostname: 'dc01.azienda.local',
      ipAddress: '10.0.0.10',
      location: '',
      customFields: { os: 'Windows Server 2025', cores: 8 },
    });
    expect(asset).toMatchObject({
      name: 'srv-dc01',
      status: 'in_use',
      area: { id: area.id, name: area.name },
      type: { id: serverType.id, name: serverType.name },
      ipAddress: '10.0.0.10',
      location: null,
      customFields: { os: 'Windows Server 2025', cores: 8 },
      permission: 'write',
    });

    const updated = await adminClient.request('PATCH', `/assets/${asset.id}`, {
      status: 'maintenance',
      customFields: { os: 'Windows Server 2025' },
    });
    expect(updated.status).toBe(200);
    expect(assetResponseSchema.parse(await updated.json()).asset).toMatchObject({
      status: 'maintenance',
      customFields: { os: 'Windows Server 2025' },
    });

    expect((await adminClient.request('DELETE', `/assets/${asset.id}`)).status).toBe(204);
    expect((await adminClient.request('GET', `/assets/${asset.id}`)).status).toBe(404);
    expect(await assetAudit(asset)).toEqual(['asset.created', 'asset.updated', 'asset.deleted']);
  });

  it('validates custom fields against the asset type', async () => {
    const area = await createArea();
    const missing = await createAsset(adminClient, area.id, { customFields: {} });
    expect(missing.status).toBe(400);
    expect(await missing.json()).toMatchObject({
      issues: [{ path: 'customFields.os', message: 'Required' }],
    });
    const wrong = await createAsset(adminClient, area.id, {
      customFields: { os: 'Linux', cores: 'otto' },
    });
    expect(wrong.status).toBe(400);
    const unknownField = await createAsset(adminClient, area.id, {
      customFields: { os: 'Linux', colour: 'blue' },
    });
    expect(unknownField.status).toBe(400);
    const unknownType = await createAsset(adminClient, area.id, {
      typeId: '00000000-0000-4000-8000-000000000000',
    });
    expect(unknownType.status).toBe(400);
    const badIp = await createAsset(adminClient, area.id, { ipAddress: '999.1.1.1' });
    expect(badIp.status).toBe(400);
  });

  it('keeps fitting custom values when the type changes', async () => {
    const area = await createArea();
    const asset = await adminAsset(area.id, { customFields: { os: 'Linux', cores: 4 } });
    const otherType = assetTypeResponseSchema.parse(
      await (
        await adminClient.request('POST', '/asset-types', {
          name: `Altro tipo ${counter++}`,
          fields: [{ key: 'cores', label: 'Core', kind: 'number' }],
        })
      ).json(),
    ).assetType;

    const response = await adminClient.request('PATCH', `/assets/${asset.id}`, {
      typeId: otherType.id,
    });
    expect(response.status).toBe(200);
    expect(assetResponseSchema.parse(await response.json()).asset).toMatchObject({
      type: { id: otherType.id },
      customFields: { cores: 4 },
    });
  });
});

describe('area permissions on assets', () => {
  it('technicians list and read only assets in their areas', async () => {
    const mine = await createArea();
    const other = await createArea();
    const visible = await adminAsset(mine.id);
    const hidden = await adminAsset(other.id);
    const user = await technician([[mine.id, 'read']]);

    const list = assetListResponseSchema.parse(
      await (await user.client.request('GET', '/assets')).json(),
    );
    expect(list.assets.map((asset) => asset.id)).toEqual([visible.id]);
    expect(list.total).toBe(1);

    // Filtering on someone else's area does not widen access.
    const filtered = assetListResponseSchema.parse(
      await (await user.client.request('GET', `/assets?areaId=${other.id}`)).json(),
    );
    expect(filtered.assets).toEqual([]);

    const read = await user.client.request('GET', `/assets/${visible.id}`);
    expect(assetResponseSchema.parse(await read.json()).asset.permission).toBe('read');
    expect((await user.client.request('GET', `/assets/${hidden.id}`)).status).toBe(404);
  });

  it('read permission cannot create, change or delete', async () => {
    const area = await createArea();
    const asset = await adminAsset(area.id);
    const user = await technician([[area.id, 'read']]);

    expect((await createAsset(user.client, area.id)).status).toBe(403);
    expect(
      (await user.client.request('PATCH', `/assets/${asset.id}`, { name: 'nuovo' })).status,
    ).toBe(403);
    expect((await user.client.request('DELETE', `/assets/${asset.id}`)).status).toBe(403);
  });

  it('write permission can create, change and delete', async () => {
    const area = await createArea();
    const user = await technician([[area.id, 'write']]);
    const created = await createAsset(user.client, area.id);
    expect(created.status).toBe(201);
    const asset = assetResponseSchema.parse(await created.json()).asset;
    expect(
      (await user.client.request('PATCH', `/assets/${asset.id}`, { name: 'rinominato' })).status,
    ).toBe(200);
    expect((await user.client.request('DELETE', `/assets/${asset.id}`)).status).toBe(204);
  });

  it('creating in an area the technician cannot see answers 404', async () => {
    const area = await createArea();
    const user = await technician();
    expect((await createAsset(user.client, area.id)).status).toBe(404);
  });

  it('moving an asset needs write on both areas', async () => {
    const source = await createArea();
    const readOnly = await createArea();
    const target = await createArea();
    const asset = await adminAsset(source.id);
    const user = await technician([
      [source.id, 'write'],
      [readOnly.id, 'read'],
      [target.id, 'write'],
    ]);

    const denied = await user.client.request('PATCH', `/assets/${asset.id}`, {
      areaId: readOnly.id,
    });
    expect(denied.status).toBe(403);
    const moved = await user.client.request('PATCH', `/assets/${asset.id}`, {
      areaId: target.id,
    });
    expect(moved.status).toBe(200);
    expect(assetResponseSchema.parse(await moved.json()).asset.area.id).toBe(target.id);
    expect(await assetAudit(asset)).toContain('asset.moved');
  });
});

describe('listing assets', () => {
  it('filters, searches and pages', async () => {
    const area = await createArea();
    const names = ['alpha-01', 'alpha-02', 'beta-01'];
    for (const name of names) await adminAsset(area.id, { name });
    await adminAsset(area.id, { name: 'gamma', serialNumber: 'SN-ALPHA-9', status: 'retired' });

    const search = assetListResponseSchema.parse(
      await (await adminClient.request('GET', `/assets?areaId=${area.id}&q=alpha`)).json(),
    );
    expect(search.assets.map((asset) => asset.name)).toEqual(['alpha-01', 'alpha-02', 'gamma']);

    const retired = assetListResponseSchema.parse(
      await (await adminClient.request('GET', `/assets?areaId=${area.id}&status=retired`)).json(),
    );
    expect(retired.assets.map((asset) => asset.name)).toEqual(['gamma']);

    const page = assetListResponseSchema.parse(
      await (await adminClient.request('GET', `/assets?areaId=${area.id}&limit=2&offset=2`)).json(),
    );
    expect(page.total).toBe(4);
    expect(page.assets.map((asset) => asset.name)).toEqual(['beta-01', 'gamma']);

    const literal = assetListResponseSchema.parse(
      await (await adminClient.request('GET', `/assets?areaId=${area.id}&q=%25`)).json(),
    );
    expect(literal.assets).toEqual([]);

    expect((await adminClient.request('GET', '/assets?limit=0')).status).toBe(400);
  });
});

describe('deleting containers', () => {
  it('an area or a type that still holds assets cannot be deleted', async () => {
    const area = await createArea();
    const asset = await adminAsset(area.id);
    expect((await adminClient.request('DELETE', `/areas/${area.id}`)).status).toBe(409);
    expect((await adminClient.request('DELETE', `/asset-types/${serverType.id}`)).status).toBe(409);
    await adminClient.request('DELETE', `/assets/${asset.id}`);
    expect((await adminClient.request('DELETE', `/areas/${area.id}`)).status).toBe(204);
  });
});
