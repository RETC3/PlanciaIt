import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HealthStatus } from './health-status';

function renderWithQuery() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <HealthStatus />
    </QueryClientProvider>,
  );
}

function mockFetch(status: number, body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status }))),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('HealthStatus', () => {
  it('shows an operational system', async () => {
    mockFetch(200, {
      status: 'ok',
      checks: { api: 'ok', database: 'ok' },
      timestamp: new Date().toISOString(),
    });
    renderWithQuery();
    expect(await screen.findByText('Operativo')).toBeDefined();
  });

  it('shows a degraded system from a 503 response', async () => {
    mockFetch(503, {
      status: 'degraded',
      checks: { api: 'ok', database: 'error' },
      timestamp: new Date().toISOString(),
    });
    renderWithQuery();
    expect(await screen.findByText('Degradato')).toBeDefined();
    expect(screen.getByText('Errore')).toBeDefined();
  });

  it('shows the server as unreachable on unexpected responses', async () => {
    mockFetch(502, {});
    renderWithQuery();
    expect(await screen.findByText('Server non raggiungibile')).toBeDefined();
  });
});
