import type { AssetSummary, Relation } from '@planciait/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RelationsCard } from './relations-card';

const area = { id: '00000000-0000-4000-8000-000000000001', name: 'Sede' };
const elementId = '00000000-0000-4000-8000-000000000010';

const host: AssetSummary = {
  id: '00000000-0000-4000-8000-000000000011',
  name: 'esx-01',
  status: 'in_use',
  area,
  type: { id: '00000000-0000-4000-8000-000000000002', name: 'Server' },
  hostname: null,
  ipAddress: null,
  location: null,
  updatedAt: new Date().toISOString(),
};

const relation: Relation = {
  id: '00000000-0000-4000-8000-000000000020',
  kind: 'runs_on',
  direction: 'outgoing',
  other: { type: 'asset', id: host.id, name: host.name, area },
  note: 'Cluster principale',
  canDelete: true,
  createdAt: new Date().toISOString(),
};

interface Call {
  url: string;
  method: string;
  body: unknown;
}

function mockApi(): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      calls.push({
        url,
        method,
        body: typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined,
      });
      const body = url.startsWith('/api/relations?')
        ? { relations: [relation] }
        : url.startsWith('/api/assets?')
          ? { assets: [host], total: 1 }
          : { relation: { ...relation, kind: 'backed_up_to', direction: 'incoming' } };
      return Promise.resolve(
        new Response(JSON.stringify(body), { status: method === 'POST' ? 201 : 200 }),
      );
    }),
  );
  return calls;
}

function renderCard(canEdit: boolean) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => (
        <RelationsCard element={{ type: 'asset', id: elementId }} canEdit={canEdit} />
      ),
    }),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('RelationsCard', () => {
  it('lists relations as read from the element', async () => {
    mockApi();
    renderCard(false);
    expect(await screen.findByText('È ospitato su')).toBeDefined();
    expect(screen.getByRole('link', { name: 'esx-01' })).toBeDefined();
    expect(screen.getByText('Cluster principale')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Collega' })).toBeNull();
  });

  it('creates an incoming relation with the chosen asset as source', async () => {
    const calls = mockApi();
    renderCard(true);

    fireEvent.change(await screen.findByLabelText('Tipo di collegamento'), {
      target: { value: 'backed_up_to:incoming' },
    });
    fireEvent.change(screen.getByLabelText('Cerca un asset'), { target: { value: 'esx' } });
    fireEvent.change(await screen.findByLabelText('Asset da collegare'), {
      target: { value: host.id },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Collega' }));

    await waitFor(() => {
      expect(calls.find((call) => call.method === 'POST')?.body).toEqual({
        kind: 'backed_up_to',
        source: { type: 'asset', id: host.id },
        target: { type: 'asset', id: elementId },
        note: '',
      });
    });
  });
});
