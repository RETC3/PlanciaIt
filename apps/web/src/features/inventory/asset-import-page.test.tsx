import type { AreaSummary, AssetType } from '@planciait/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AssetImportPage } from './asset-import-page';

const area: AreaSummary = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Sede',
  description: null,
  permission: 'write',
  createdAt: new Date().toISOString(),
};

const type: AssetType = {
  id: '00000000-0000-4000-8000-000000000002',
  name: 'Server',
  description: null,
  assetCount: 0,
  fields: [{ key: 'os', label: 'Sistema operativo', kind: 'text', required: true }],
};

interface Call {
  url: string;
  body: unknown;
}

function mockApi(): Call[] {
  const calls: Call[] = [];
  const responses: Record<string, unknown> = {
    '/areas': { areas: [area] },
    '/asset-types': { assetTypes: [type] },
    '/assets/import': { imported: 1 },
  };
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      calls.push({
        url,
        body: typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined,
      });
      const body = responses[url.replace(/^\/api/, '')];
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
    }),
  );
  return calls;
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createRouter({
    routeTree: createRootRoute({ component: AssetImportPage }),
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

describe('AssetImportPage', () => {
  it('previews the file and sends only the valid rows', async () => {
    const calls = mockApi();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPage();

    const csv = 'Nome;IP;Sistema operativo\nsrv-01;10.0.0.1;Debian\nsrv-02;;\n';
    const file = new File([csv], 'inventario.csv', { type: 'text/csv' });
    fireEvent.change(await screen.findByLabelText('File CSV'), { target: { files: [file] } });

    expect(await screen.findByText('Righe valide: 1 · righe con errori: 1')).toBeDefined();
    expect(screen.getByText('Riga 3: Sistema operativo')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Importa 1 asset' }));
    expect(await screen.findByText('Importato 1 asset.')).toBeDefined();

    await waitFor(() => {
      expect(calls.find((call) => call.url === '/api/assets/import')?.body).toEqual({
        areaId: area.id,
        typeId: type.id,
        assets: [
          expect.objectContaining({
            name: 'srv-01',
            ipAddress: '10.0.0.1',
            customFields: { os: 'Debian' },
          }) as unknown,
        ],
      });
    });
  });
});
