import {
  areaResponseSchema,
  assetTypeResponseSchema,
  searchResponseSchema,
  type AssetType,
  type SearchResponse,
} from '@planciait/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestUser, signIn, TestClient } from '../test/helpers.js';
import { startTestApp, type TestApp } from '../test/test-app.js';
import { snippet } from './search.service.js';

let testApp: TestApp;
let adminClient: TestClient;
let type: AssetType;

beforeAll(async () => {
  testApp = await startTestApp();
  const admin = await createTestUser(testApp, { role: 'admin' });
  adminClient = await signIn(testApp, admin);
  const response = await adminClient.request('POST', '/asset-types', {
    name: 'Tipo per ricerca',
    fields: [{ key: 'os', label: 'Sistema operativo', kind: 'text' }],
  });
  type = assetTypeResponseSchema.parse(await response.json()).assetType;
}, 30_000);

afterAll(async () => {
  await testApp.close();
});

/** A token no other test uses, so results only contain this test's data. */
function token(): string {
  return `zq${crypto.randomUUID().slice(0, 8)}`;
}

async function createArea(name: string, description?: string): Promise<string> {
  const response = await adminClient.request('POST', '/areas', { name, description });
  expect(response.status).toBe(201);
  return areaResponseSchema.parse(await response.json()).area.id;
}

async function createAsset(areaId: string, body: Record<string, unknown>): Promise<void> {
  const response = await adminClient.request('POST', '/assets', {
    areaId,
    typeId: type.id,
    ...body,
  });
  expect(response.status).toBe(201);
}

async function search(client: TestClient, q: string, limit?: number): Promise<SearchResponse> {
  const params = new URLSearchParams({ q, ...(limit ? { limit: String(limit) } : {}) });
  const response = await client.request('GET', `/search?${params.toString()}`);
  expect(response.status).toBe(200);
  return searchResponseSchema.parse(await response.json());
}

describe('global search', () => {
  it('requires a session and at least two characters', async () => {
    expect((await new TestClient(testApp).request('GET', '/search?q=srv')).status).toBe(401);
    expect((await adminClient.request('GET', '/search?q=a')).status).toBe(400);
    expect((await adminClient.request('GET', '/search')).status).toBe(400);
  });

  it('ranks assets by name: exact, then prefix, then anywhere', async () => {
    const t = token();
    const area = await createArea(`Area ${t}`);
    await createAsset(area, { name: `vecchio-${t}` });
    await createAsset(area, { name: `${t}-backup` });
    await createAsset(area, { name: t });

    const { assets } = await search(adminClient, t.toUpperCase());
    expect(assets.total).toBe(3);
    expect(assets.results.map((asset) => asset.name)).toEqual([t, `${t}-backup`, `vecchio-${t}`]);
    expect(assets.results[0]).toMatchObject({
      area: { id: area },
      type: { id: type.id },
      match: null,
    });

    const limited = await search(adminClient, t, 2);
    expect(limited.assets.results).toHaveLength(2);
    expect(limited.assets.total).toBe(3);
  });

  it('reports which property matched, including custom fields and long notes', async () => {
    const t = token();
    const area = await createArea(`Area ${t}`);
    await createAsset(area, { name: 'srv-a', hostname: `${t}.azienda.local` });
    await createAsset(area, { name: 'srv-b', customFields: { os: `Debian ${t}` } });
    await createAsset(area, {
      name: 'srv-c',
      notes: `${'Configurazione iniziale. '.repeat(10)}Licenza ${t} rinnovata.`,
    });

    const { assets } = await search(adminClient, t);
    const matches = Object.fromEntries(assets.results.map((asset) => [asset.name, asset.match]));
    expect(matches['srv-a']).toEqual({
      field: 'hostname',
      label: null,
      value: `${t}.azienda.local`,
    });
    expect(matches['srv-b']).toEqual({
      field: 'customField',
      label: 'Sistema operativo',
      value: `Debian ${t}`,
    });
    expect(matches['srv-c']).toMatchObject({ field: 'notes', label: null });
    expect(matches['srv-c']?.value).toMatch(new RegExp(`^….*Licenza ${t} rinnovata\\.$`));
  });

  it('treats LIKE wildcards literally', async () => {
    const t = token();
    const area = await createArea(`Area ${t}`);
    await createAsset(area, { name: `${t}-100%` });
    await createAsset(area, { name: `${t}-1000` });
    const { assets } = await search(adminClient, `${t}-100%`);
    expect(assets.results.map((asset) => asset.name)).toEqual([`${t}-100%`]);
  });

  it('finds areas by name or description', async () => {
    const t = token();
    await createArea(`Rete ${t}`);
    await createArea(`Sede ${token()}`, `Server e rete della sede ${t}`);
    const { areas } = await search(adminClient, t);
    expect(areas.total).toBe(2);
    expect(areas.results.map((area) => area.name)[0]).toBe(`Rete ${t}`);
  });

  it('shows technicians only what is in their areas', async () => {
    const t = token();
    const own = await createArea(`Mia ${t}`);
    const other = await createArea(`Altra ${t}`);
    await createAsset(own, { name: `${t}-mio` });
    await createAsset(other, { name: `${t}-altrui` });
    const user = await createTestUser(testApp);
    await adminClient.request('PUT', `/areas/${own}/members/${user.id}`, { permission: 'read' });
    const tech = await signIn(testApp, user);

    const result = await search(tech, t);
    expect(result.assets.results.map((asset) => asset.name)).toEqual([`${t}-mio`]);
    expect(result.assets.total).toBe(1);
    expect(result.areas.results.map((area) => area.id)).toEqual([own]);
    expect((await search(adminClient, t)).assets.total).toBe(2);
  });
});

describe('snippet', () => {
  it('keeps short values and shortens long ones around the match', () => {
    expect(snippet('breve', 'br')).toBe('breve');
    const long = `${'a'.repeat(200)} trovami ${'b'.repeat(200)}`;
    const result = snippet(long, 'TROVAMI');
    expect(result).toContain('trovami');
    expect(result.startsWith('…') && result.endsWith('…')).toBe(true);
    expect(result.length).toBeLessThanOrEqual(122);
  });
});
