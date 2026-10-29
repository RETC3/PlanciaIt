import { Controller, HttpCode, Param, Post } from '@nestjs/common';
import { and, eq, schema } from '@planciait/db';
import {
  areaListResponseSchema,
  areaMemberListResponseSchema,
  areaMemberResponseSchema,
  areaResponseSchema,
  type AreaSummary,
} from '@planciait/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AreaAccess } from '../common/access/area-access.decorator.js';
import { createTestUser, signIn, TestClient, type TestUser } from '../test/helpers.js';
import { startTestApp, type TestApp } from '../test/test-app.js';

/** Stands in for a future area-scoped write endpoint (e.g. editing an asset). */
@Controller('area-write-test')
class AreaWriteTestController {
  @Post(':areaId')
  @AreaAccess('write', 'areaId')
  @HttpCode(200)
  write(@Param('areaId') areaId: string): { areaId: string } {
    return { areaId };
  }
}

const unknownId = '00000000-0000-4000-8000-000000000000';

let testApp: TestApp;
let admin: TestUser;
let adminClient: TestClient;

beforeAll(async () => {
  testApp = await startTestApp([AreaWriteTestController]);
  admin = await createTestUser(testApp, { role: 'admin' });
  adminClient = await signIn(testApp, admin);
}, 30_000);

afterAll(async () => {
  await testApp.close();
});

let nameCounter = 0;

async function createArea(name = `Area ${nameCounter++}`): Promise<AreaSummary> {
  const response = await adminClient.request('POST', '/areas', { name });
  expect(response.status).toBe(201);
  return areaResponseSchema.parse(await response.json()).area;
}

async function technician(): Promise<TestUser & { client: TestClient }> {
  const user = await createTestUser(testApp);
  return { ...user, client: await signIn(testApp, user) };
}

async function setMember(areaId: string, userId: string, permission: 'read' | 'write') {
  return adminClient.request('PUT', `/areas/${areaId}/members/${userId}`, { permission });
}

async function areaAudit(areaId: string): Promise<string[]> {
  const rows = await testApp.database.db
    .select({ action: schema.auditLog.action })
    .from(schema.auditLog)
    .where(and(eq(schema.auditLog.targetType, 'area'), eq(schema.auditLog.targetId, areaId)))
    .orderBy(schema.auditLog.occurredAt);
  return rows.map((row) => row.action);
}

describe('managing areas', () => {
  it('requires a session', async () => {
    expect((await new TestClient(testApp).request('GET', '/areas')).status).toBe(401);
  });

  it('creates, renames and deletes an area, with audit entries', async () => {
    const created = await adminClient.request('POST', '/areas', {
      name: '  Rete aziendale ',
      description: 'Switch, firewall e access point',
    });
    expect(created.status).toBe(201);
    const area = areaResponseSchema.parse(await created.json()).area;
    expect(area).toMatchObject({
      name: 'Rete aziendale',
      description: 'Switch, firewall e access point',
      permission: 'write',
    });

    const renamed = await adminClient.request('PATCH', `/areas/${area.id}`, {
      name: 'Rete',
      description: '',
    });
    expect(renamed.status).toBe(200);
    expect(areaResponseSchema.parse(await renamed.json()).area).toMatchObject({
      name: 'Rete',
      description: null,
    });

    expect((await adminClient.request('DELETE', `/areas/${area.id}`)).status).toBe(204);
    expect((await adminClient.request('GET', `/areas/${area.id}`)).status).toBe(404);
    expect((await adminClient.request('DELETE', `/areas/${area.id}`)).status).toBe(404);
    expect(await areaAudit(area.id)).toEqual([
      'area.created',
      'area.updated',
      'area.updated',
      'area.deleted',
    ]);
  });

  it('rejects a duplicate name, case-insensitively', async () => {
    const area = await createArea();
    const duplicate = await adminClient.request('POST', '/areas', {
      name: area.name.toUpperCase(),
    });
    expect(duplicate.status).toBe(409);

    const other = await createArea();
    const rename = await adminClient.request('PATCH', `/areas/${other.id}`, { name: area.name });
    expect(rename.status).toBe(409);
  });

  it('validates input and ids', async () => {
    expect((await adminClient.request('POST', '/areas', { name: ' ' })).status).toBe(400);
    expect((await adminClient.request('PATCH', `/areas/${unknownId}`, {})).status).toBe(400);
    expect((await adminClient.request('GET', '/areas/not-a-uuid')).status).toBe(400);
    expect((await adminClient.request('GET', `/areas/${unknownId}`)).status).toBe(404);
  });

  it('lists every area for administrators, sorted by name', async () => {
    const zeta = await createArea('zeta');
    const alfa = await createArea('Alfa');
    const response = await adminClient.request('GET', '/areas');
    const names = areaListResponseSchema.parse(await response.json()).areas.map((a) => a.name);
    expect(names.indexOf(alfa.name)).toBeLessThan(names.indexOf(zeta.name));
  });

  it('is changed only by administrators', async () => {
    const area = await createArea();
    const { client } = await technician();
    expect((await client.request('POST', '/areas', { name: 'Mia' })).status).toBe(403);
    expect((await client.request('PATCH', `/areas/${area.id}`, { name: 'Mia' })).status).toBe(403);
    expect((await client.request('DELETE', `/areas/${area.id}`)).status).toBe(403);
    expect((await client.request('GET', `/areas/${area.id}/members`)).status).toBe(403);
  });
});

describe('area membership', () => {
  it('technicians see only the areas assigned to them', async () => {
    const assigned = await createArea();
    const hidden = await createArea();
    const user = await technician();
    expect((await setMember(assigned.id, user.id, 'read')).status).toBe(200);

    const list = areaListResponseSchema.parse(
      await (await user.client.request('GET', '/areas')).json(),
    );
    expect(list.areas).toEqual([expect.objectContaining({ id: assigned.id, permission: 'read' })]);

    expect((await user.client.request('GET', `/areas/${assigned.id}`)).status).toBe(200);
    // A hidden area looks exactly like a missing one.
    expect((await user.client.request('GET', `/areas/${hidden.id}`)).status).toBe(404);
  });

  it('adds, changes and removes members, with audit entries', async () => {
    const area = await createArea();
    const user = await technician();

    const added = await setMember(area.id, user.id, 'read');
    expect(areaMemberResponseSchema.parse(await added.json()).member).toMatchObject({
      userId: user.id,
      permission: 'read',
      status: 'active',
    });
    // Setting the same permission again is a no-op.
    expect((await setMember(area.id, user.id, 'read')).status).toBe(200);
    expect((await setMember(area.id, user.id, 'write')).status).toBe(200);

    const members = areaMemberListResponseSchema.parse(
      await (await adminClient.request('GET', `/areas/${area.id}/members`)).json(),
    ).members;
    expect(members).toEqual([expect.objectContaining({ userId: user.id, permission: 'write' })]);

    const removed = await adminClient.request('DELETE', `/areas/${area.id}/members/${user.id}`);
    expect(removed.status).toBe(204);
    expect(
      (await adminClient.request('DELETE', `/areas/${area.id}/members/${user.id}`)).status,
    ).toBe(404);
    expect((await user.client.request('GET', `/areas/${area.id}`)).status).toBe(404);

    expect(await areaAudit(area.id)).toEqual([
      'area.created',
      'area.member_added',
      'area.member_permission_changed',
      'area.member_removed',
    ]);
  });

  it('accepts only existing technicians as members', async () => {
    const area = await createArea();
    const otherAdmin = await createTestUser(testApp, { role: 'admin' });
    expect((await setMember(area.id, otherAdmin.id, 'read')).status).toBe(400);
    expect((await setMember(area.id, unknownId, 'read')).status).toBe(404);
    expect((await setMember(unknownId, otherAdmin.id, 'read')).status).toBe(404);
    const invalid = await adminClient.request('PUT', `/areas/${area.id}/members/${otherAdmin.id}`, {
      permission: 'owner',
    });
    expect(invalid.status).toBe(400);
  });

  it('deleting an area removes its memberships', async () => {
    const area = await createArea();
    const user = await technician();
    await setMember(area.id, user.id, 'write');
    await adminClient.request('DELETE', `/areas/${area.id}`);
    const rows = await testApp.database.db
      .select()
      .from(schema.areaMembers)
      .where(eq(schema.areaMembers.userId, user.id));
    expect(rows).toEqual([]);
  });

  it('promotion to administrator drops memberships, so demotion starts from none', async () => {
    const area = await createArea();
    const user = await technician();
    await setMember(area.id, user.id, 'write');

    await adminClient.request('PATCH', `/users/${user.id}`, { role: 'admin' });
    await adminClient.request('PATCH', `/users/${user.id}`, { role: 'technician' });

    const list = areaListResponseSchema.parse(
      await (await user.client.request('GET', '/areas')).json(),
    );
    expect(list.areas).toEqual([]);
  });
});

describe('area permission guard', () => {
  it('allows write actions only with write permission', async () => {
    const area = await createArea();
    const user = await technician();
    const path = `/area-write-test/${area.id}`;

    expect((await user.client.request('POST', path)).status).toBe(404);
    await setMember(area.id, user.id, 'read');
    expect((await user.client.request('POST', path)).status).toBe(403);
    await setMember(area.id, user.id, 'write');
    expect((await user.client.request('POST', path)).status).toBe(200);

    expect((await adminClient.request('POST', path)).status).toBe(200);
    expect((await adminClient.request('POST', `/area-write-test/${unknownId}`)).status).toBe(404);
    expect((await adminClient.request('POST', '/area-write-test/nope')).status).toBe(400);
    expect((await new TestClient(testApp).request('POST', path)).status).toBe(401);
  });
});
