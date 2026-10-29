import type { SearchResponse } from '@planciait/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
  type AnyRouter,
} from '@tanstack/react-router';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SearchBox } from './search-box';
import { SearchPage } from './search-page';

const area = { id: '00000000-0000-4000-8000-000000000001', name: 'Sede' };

const response: SearchResponse = {
  assets: {
    results: [
      {
        id: '00000000-0000-4000-8000-000000000010',
        name: 'srv-dc01',
        status: 'in_use',
        area,
        type: { id: '00000000-0000-4000-8000-000000000002', name: 'Server' },
        match: null,
      },
      {
        id: '00000000-0000-4000-8000-000000000011',
        name: 'srv-files',
        status: 'maintenance',
        area,
        type: { id: '00000000-0000-4000-8000-000000000002', name: 'Server' },
        match: { field: 'customField', label: 'Sistema operativo', value: 'Windows dc01' },
      },
      {
        id: '00000000-0000-4000-8000-000000000012',
        name: 'sw-core',
        status: 'in_use',
        area,
        type: { id: '00000000-0000-4000-8000-000000000003', name: 'Switch' },
        match: { field: 'hostname', label: null, value: 'dc01-sw.azienda.local' },
      },
    ],
    total: 14,
  },
  areas: { results: [], total: 0 },
};

function mockApi(): string[] {
  const urls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      urls.push(url);
      return Promise.resolve(new Response(JSON.stringify(response), { status: 200 }));
    }),
  );
  return urls;
}

function renderWithRouter(component: () => ReactNode): AnyRouter {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createRouter({
    routeTree: createRootRoute({ component }),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SearchPage', () => {
  it('shows grouped results with the matching property, and loads more on request', async () => {
    const urls = mockApi();
    renderWithRouter(() => <SearchPage q=" dc01 " />);

    expect(await screen.findByRole('link', { name: 'srv-dc01' })).toBeDefined();
    expect(screen.getByText('Risultati per “dc01”')).toBeDefined();
    expect(screen.getByText('3 di 14')).toBeDefined();
    expect(screen.getByText('Sistema operativo: Windows dc01')).toBeDefined();
    expect(screen.getByText('Hostname: dc01-sw.azienda.local')).toBeDefined();
    expect(screen.queryByText('Aree')).toBeNull();
    expect(urls).toEqual(['/api/search?q=dc01&limit=10']);

    fireEvent.click(screen.getByRole('button', { name: 'Mostra altri risultati' }));
    await waitFor(() => expect(urls).toContain('/api/search?q=dc01&limit=50'));
  });

  it('does not search for less than two characters', () => {
    const urls = mockApi();
    renderWithRouter(() => <SearchPage q="d" />);
    expect(urls).toEqual([]);
  });
});

describe('SearchBox', () => {
  it('focuses on "/" and opens the results page', async () => {
    const router = renderWithRouter(SearchBox);
    const input = await screen.findByRole('searchbox', { name: 'Cerca' });

    fireEvent.keyDown(window, { key: '/' });
    expect(document.activeElement).toBe(input);

    fireEvent.change(input, { target: { value: ' 10.0.0.1 ' } });
    fireEvent.submit(input);
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/search');
      expect(router.state.location.search).toEqual({ q: '10.0.0.1' });
    });
  });
});
