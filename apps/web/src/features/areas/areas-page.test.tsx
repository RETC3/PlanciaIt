import type { AreaSummary, UserRole } from '@planciait/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AreasPage } from './areas-page';

const area: AreaSummary = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Rete',
  description: 'Switch e firewall',
  permission: 'read',
  createdAt: new Date().toISOString(),
};

function mockApi(role: UserRole, areas: AreaSummary[]) {
  const responses: Record<string, unknown> = {
    '/auth/session': {
      stage: 'authenticated',
      user: { id: '00000000-0000-4000-8000-000000000002', username: 'u', displayName: 'U', role },
    },
    '/areas': { areas },
  };
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      Promise.resolve(
        new Response(JSON.stringify(responses[url.replace(/^\/api/, '')]), { status: 200 }),
      ),
    ),
  );
}

/** AreasPage renders links, so it needs a router around it. */
function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createRouter({
    routeTree: createRootRoute({ component: AreasPage }),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AreasPage', () => {
  it('shows a technician their areas and permission, without admin controls', async () => {
    mockApi('technician', [area]);
    renderPage();
    expect(await screen.findByText('Rete')).toBeDefined();
    expect(screen.getByText('Sola lettura')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Nuova area' })).toBeNull();
  });

  it('lets an administrator create areas', async () => {
    mockApi('admin', []);
    renderPage();
    expect(await screen.findByRole('button', { name: 'Nuova area' })).toBeDefined();
    expect(await screen.findByText(/Nessuna area/)).toBeDefined();
  });
});
