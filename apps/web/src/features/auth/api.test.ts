import { afterEach, describe, expect, it, vi } from 'vitest';
import { login, setup } from './api';

const PASSWORD = 'una-master-password-molto-lunga';

interface Call {
  url: string;
  body: string;
}

/** Records every request and answers like the API would. */
function mockApi(responses: Record<string, unknown>): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      calls.push({ url, body: typeof init?.body === 'string' ? init.body : '' });
      const path = url.replace(/^\/api/, '');
      return Promise.resolve(new Response(JSON.stringify(responses[path]), { status: 200 }));
    }),
  );
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('auth API', () => {
  it('never sends the password at setup', async () => {
    const calls = mockApi({ '/auth/setup': { stage: 'mfa_enrollment' } });
    await setup({ username: 'admin', displayName: 'IT Manager', password: PASSWORD });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.body).not.toContain(PASSWORD);
    const body = JSON.parse(calls[0]?.body ?? '{}') as { authKey: string };
    expect(body.authKey).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('derives the same auth key at login and never sends the password', async () => {
    const kdf = { salt: 'AAAAAAAAAAAAAAAAAAAAAA', opsLimit: 2, memLimit: 19 * 1024 * 1024 };
    const calls = mockApi({
      '/auth/prelogin': kdf,
      '/auth/login': { stage: 'mfa_verification' },
    });

    expect(await login('admin', PASSWORD)).toEqual({ stage: 'mfa_verification' });
    await login('admin', PASSWORD);

    expect(calls.map((call) => call.url)).toEqual([
      '/api/auth/prelogin',
      '/api/auth/login',
      '/api/auth/prelogin',
      '/api/auth/login',
    ]);
    for (const call of calls) {
      expect(call.body).not.toContain(PASSWORD);
    }
    expect(calls[1]?.body).toBe(calls[3]?.body);
  });
});
