import { and, eq, or, schema } from '@planciait/db';
import {
  areaResponseSchema,
  assetResponseSchema,
  assetTypeResponseSchema,
  relationListResponseSchema,
  relationResponseSchema,
  type AssetDetail,
  type AssetType,
  type Relation,
  type RelationKind,
} from '@planciait/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestUser, signIn, TestClient } from '../test/helpers.js';
import { startTestApp, type TestApp } from '../test/test-app.js';

let testApp: TestApp;
let adminClient: TestClient;
let type: AssetType;

beforeAll(async () => {
  testApp = await startTestApp();
  const admin = await createTestUser(testApp, { role: 'admin' });
  adminClient = await signIn(testApp, admin);
  const response = await adminClient.request('POST', '/asset-types', {
    name: 'Tipo per relazioni',
  });
  type = assetTypeResponseSchema.parse(await response.json()).assetType;
}, 30_000);

afterAll(async () => {
  await testApp.close();
});

let counter = 0;

async function createArea(): Promise<string> {
  const response = await adminClient.request('POST', '/areas', { name: `Rel area ${counter++}` });
  return areaResponseSchema.parse(await response.json()).area.id;
}

async function createAsset(areaId: string): Promise<AssetDetail> {
  const response = await adminClient.request('POST', '/assets', {
    areaId,
    typeId: type.id,
    name: `rel-${counter++}`,
  });
  return assetResponseSchema.parse(await response.json()).asset;
}

function relate(
  client: TestClient,
  kind: RelationKind,
  source: AssetDetail,
  target: AssetDetail,
  note?: string,
): Promise<Response> {
  return client.request('POST', '/relations', {
    kind,
    source: { type: 'asset', id: source.id },
    target: { type: 'asset', id: target.id },
    note,
  });
}

async function relationsOf(client: TestClient, asset: AssetDetail): Promise<Relation[]> {
  const response = await client.request(
    'GET',
    `/relations?elementType=asset&elementId=${asset.id}`,
  );
  expect(response.status).toBe(200);
  return relationListResponseSchema.parse(await response.json()).relations;
}

async function technician(memberships: [string, 'read' | 'write'][]): Promise<TestClient> {
  const user = await createTestUser(testApp);
  for (const [areaId, permission] of memberships) {
    await adminClient.request('PUT', `/areas/${areaId}/members/${user.id}`, { permission });
  }
  return signIn(testApp, user);
}

describe('relations between assets', () => {
  it('requires a session', async () => {
    const response = await new TestClient(testApp).request(
      'GET',
      `/relations?elementType=asset&elementId=${crypto.randomUUID()}`,
    );
    expect(response.status).toBe(401);
  });

  it('links two assets, shows the link from both ends and deletes it, with audit entries', async () => {
    const area = await createArea();
    const vm = await createAsset(area);
    const host = await createAsset(area);

    const created = await relate(adminClient, 'runs_on', vm, host, ' Cluster principale ');
    expect(created.status).toBe(201);
    const relation = relationResponseSchema.parse(await created.json()).relation;
    expect(relation).toMatchObject({
      kind: 'runs_on',
      direction: 'outgoing',
      other: { type: 'asset', id: host.id, name: host.name, area: { id: area } },
      note: 'Cluster principale',
      canDelete: true,
    });

    expect(await relationsOf(adminClient, vm)).toEqual([relation]);
    expect(await relationsOf(adminClient, host)).toMatchObject([
      { id: relation.id, direction: 'incoming', other: { id: vm.id } },
    ]);

    expect((await adminClient.request('DELETE', `/relations/${relation.id}`)).status).toBe(204);
    expect(await relationsOf(adminClient, vm)).toEqual([]);
    expect((await adminClient.request('DELETE', `/relations/${relation.id}`)).status).toBe(404);

    const audit = await testApp.database.db
      .select({ action: schema.auditLog.action })
      .from(schema.auditLog)
      .where(
        and(eq(schema.auditLog.targetType, 'relation'), eq(schema.auditLog.targetId, relation.id)),
      )
      .orderBy(schema.auditLog.occurredAt);
    expect(audit.map((row) => row.action)).toEqual(['relation.created', 'relation.deleted']);
  });

  it('rejects duplicates, also the reverse of a symmetric relation', async () => {
    const area = await createArea();
    const a = await createAsset(area);
    const b = await createAsset(area);

    expect((await relate(adminClient, 'depends_on', a, b)).status).toBe(201);
    expect((await relate(adminClient, 'depends_on', a, b)).status).toBe(409);
    // A directed kind can be stated the other way round: it means something else.
    expect((await relate(adminClient, 'depends_on', b, a)).status).toBe(201);

    expect((await relate(adminClient, 'connected_to', b, a)).status).toBe(201);
    expect((await relate(adminClient, 'connected_to', a, b)).status).toBe(409);
    expect(await relationsOf(adminClient, a)).toHaveLength(3);
  });

  it('rejects self-relations, unknown elements and malformed requests', async () => {
    const area = await createArea();
    const a = await createAsset(area);
    expect((await relate(adminClient, 'related_to', a, a)).status).toBe(400);
    const missing = { ...a, id: crypto.randomUUID() };
    expect((await relate(adminClient, 'related_to', a, missing)).status).toBe(404);
    expect(
      (await adminClient.request('GET', `/relations?elementType=asset&elementId=x`)).status,
    ).toBe(400);
    expect(
      (await adminClient.request('GET', `/relations?elementType=asset&elementId=${missing.id}`))
        .status,
    ).toBe(404);
  });

  it('deletes the relations of a deleted asset', async () => {
    const area = await createArea();
    const a = await createAsset(area);
    const b = await createAsset(area);
    const c = await createAsset(area);
    expect((await relate(adminClient, 'located_in', a, b)).status).toBe(201);
    expect((await relate(adminClient, 'backed_up_to', c, b)).status).toBe(201);
    expect((await relate(adminClient, 'related_to', a, c)).status).toBe(201);

    expect((await adminClient.request('DELETE', `/assets/${b.id}`)).status).toBe(204);
    const left = await testApp.database.db
      .select({ id: schema.relations.id })
      .from(schema.relations)
      .where(or(eq(schema.relations.sourceId, b.id), eq(schema.relations.targetId, b.id)));
    expect(left).toEqual([]);
    expect(await relationsOf(adminClient, a)).toMatchObject([{ other: { id: c.id } }]);
  });
});

describe('relation permissions', () => {
  it('needs read on both ends and write on at least one', async () => {
    const [own, shared, hidden] = [await createArea(), await createArea(), await createArea()];
    const app = await createAsset(own);
    const database = await createAsset(shared);
    const storage = await createAsset(shared);
    const secret = await createAsset(hidden);
    const tech = await technician([
      [own, 'write'],
      [shared, 'read'],
    ]);

    // Write on the source is enough, even if the target is read-only.
    const dependsOn = await relate(tech, 'depends_on', app, database);
    expect(dependsOn.status).toBe(201);
    // So is write on the target.
    expect((await relate(tech, 'backed_up_to', storage, app)).status).toBe(201);
    // Read-only on both ends: forbidden.
    expect((await relate(tech, 'connected_to', database, storage)).status).toBe(403);
    // An end the technician cannot see looks missing.
    expect((await relate(tech, 'depends_on', app, secret)).status).toBe(404);

    // Relations towards elements the technician cannot see are left out.
    expect((await relate(adminClient, 'depends_on', app, secret)).status).toBe(201);
    expect(await relationsOf(tech, app)).toHaveLength(2);
    expect(await relationsOf(adminClient, app)).toHaveLength(3);
    expect(
      (await tech.request('GET', `/relations?elementType=asset&elementId=${secret.id}`)).status,
    ).toBe(404);
    const [hiddenRelation] = (await relationsOf(adminClient, secret)).filter(
      (relation) => relation.other.id === app.id,
    );
    expect((await tech.request('DELETE', `/relations/${hiddenRelation?.id ?? ''}`)).status).toBe(
      404,
    );

    // A reader of both ends sees the relation but cannot delete it.
    const reader = await technician([
      [own, 'read'],
      [shared, 'read'],
    ]);
    const [seen] = (await relationsOf(reader, database)).filter(
      (relation) => relation.other.id === app.id,
    );
    expect(seen).toMatchObject({ kind: 'depends_on', direction: 'incoming', canDelete: false });
    expect((await reader.request('DELETE', `/relations/${seen?.id ?? ''}`)).status).toBe(403);
    expect((await tech.request('DELETE', `/relations/${seen?.id ?? ''}`)).status).toBe(204);
  });
});
