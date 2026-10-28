import {
  createKdfParams,
  encryptSecret,
  generateToken,
  hashAuthKey,
  type KdfParams,
} from '@planciait/crypto';
import { eq, schema } from '@planciait/db';
import {
  mfaConfirmResponseSchema,
  mfaEnrollmentResponseSchema,
  pendingSessionResponseSchema,
  preloginResponseSchema,
  sessionResponseSchema,
} from '@planciait/shared';
import { Secret, TOTP } from 'otpauth';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestApp, ProtectedTestController, type TestApp } from '../test/test-app.js';
import { IP_MAX_FAILURES, USER_MAX_FAILURES } from './login-throttle.service.js';
import { SERVER_KEYS, type ServerKeys } from './server-keys.js';
import { SESSION_COOKIE } from './session.service.js';
import { createTotpSecret } from './totp.js';

let testApp: TestApp;

beforeAll(async () => {
  testApp = await startTestApp([ProtectedTestController]);
}, 30_000);

afterAll(async () => {
  await testApp.close();
});

/** Minimal client that keeps the session cookie like a browser would. */
class Client {
  cookie: string | undefined;

  async request(method: string, path: string, body?: unknown): Promise<Response> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (this.cookie) headers.Cookie = `${SESSION_COOKIE}=${this.cookie}`;
    const response = await fetch(`${testApp.url}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const header of response.headers.getSetCookie()) {
      const match = new RegExp(`^${SESSION_COOKIE}=([^;]*)`).exec(header);
      if (match) this.cookie = match[1] || undefined;
    }
    return response;
  }
}

function totpCode(secret: string, offsetSteps = 0): string {
  const totp = new TOTP({ secret: Secret.fromBase32(secret) });
  return totp.generate({ timestamp: Date.now() + offsetSteps * 30_000 });
}

let userCounter = 0;

interface TestUser {
  username: string;
  authKey: string;
  kdf: KdfParams;
  totpSecret: string;
  id: string;
}

/** Inserts an active user with MFA already enrolled (user management comes in a later step). */
async function createUser(options: { mfaEnrolled?: boolean } = {}): Promise<TestUser> {
  const username = `user${userCounter++}`;
  const authKey = await generateToken();
  const kdf = await createKdfParams();
  const totpSecret = await createTotpSecret();
  const [row] = await testApp.database.db
    .insert(schema.users)
    .values({
      username,
      displayName: username,
      role: 'technician',
      authKeyHash: await hashAuthKey(authKey),
      kdfSalt: kdf.salt,
      kdfOpsLimit: kdf.opsLimit,
      kdfMemLimit: kdf.memLimit,
      totpEnabledAt: options.mfaEnrolled === false ? null : new Date(),
    })
    .returning();
  if (!row) throw new Error('insert failed');
  const keys = testApp.app.get<ServerKeys>(SERVER_KEYS);
  await testApp.database.db
    .update(schema.users)
    .set({
      totpSecretEncrypted: await encryptSecret(totpSecret, keys.totpEncryption, `totp:${row.id}`),
    })
    .where(eq(schema.users.id, row.id));
  return { username, authKey, kdf, totpSecret, id: row.id };
}

async function auditActions(userId: string): Promise<string[]> {
  const rows = await testApp.database.db
    .select({ action: schema.auditLog.action })
    .from(schema.auditLog)
    .where(eq(schema.auditLog.actorUserId, userId))
    .orderBy(schema.auditLog.occurredAt);
  return rows.map((row) => row.action);
}

describe('first-run setup and MFA enrollment', () => {
  const admin = { username: 'Admin', displayName: 'IT Manager' };
  let authKey: string;
  let client: Client;
  let totpSecret: string;

  it('reports that setup is required', async () => {
    const response = await new Client().request('GET', '/auth/setup');
    expect(await response.json()).toEqual({ setupRequired: true });
  });

  it('rejects an invalid setup request without echoing values', async () => {
    const response = await new Client().request('POST', '/auth/setup', {
      ...admin,
      kdf: { salt: 'x', opsLimit: 1, memLimit: 1 },
      authKey: 'secret-looking-value',
    });
    expect(response.status).toBe(400);
    expect(await response.text()).not.toContain('secret-looking-value');
  });

  it('creates the administrator with a pending MFA-enrollment session', async () => {
    authKey = await generateToken();
    client = new Client();
    const response = await client.request('POST', '/auth/setup', {
      ...admin,
      kdf: await createKdfParams(),
      authKey,
    });
    expect(response.status).toBe(201);
    expect(pendingSessionResponseSchema.parse(await response.json())).toEqual({
      stage: 'mfa_enrollment',
    });
    const cookie = response.headers.getSetCookie()[0] ?? '';
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Strict');
  });

  it('stores the username lowercase and only a hash of the auth key', async () => {
    const [user] = await testApp.database.db.select().from(schema.users);
    expect(user?.username).toBe('admin');
    expect(user?.role).toBe('admin');
    expect(user?.authKeyHash.startsWith('$argon2id$')).toBe(true);
    expect(user?.authKeyHash).not.toContain(authKey);
  });

  it('refuses a second setup', async () => {
    const response = await new Client().request('POST', '/auth/setup', {
      username: 'intruder',
      displayName: 'Intruder',
      kdf: await createKdfParams(),
      authKey: await generateToken(),
    });
    expect(response.status).toBe(409);
    const status = await new Client().request('GET', '/auth/setup');
    expect(await status.json()).toEqual({ setupRequired: false });
  });

  it('does not let a pending session reach protected routes', async () => {
    expect((await client.request('GET', '/protected')).status).toBe(401);
    const session = sessionResponseSchema.parse(
      await (await client.request('GET', '/auth/session')).json(),
    );
    expect(session.stage).toBe('mfa_enrollment');
  });

  it('starts enrollment and stores the TOTP secret encrypted', async () => {
    const response = await client.request('POST', '/auth/mfa/enrollment');
    expect(response.status).toBe(200);
    const body = mfaEnrollmentResponseSchema.parse(await response.json());
    totpSecret = body.secret;
    expect(body.otpauthUri).toMatch(/^otpauth:\/\/totp\/PlanciaIT:admin\?/);

    const [user] = await testApp.database.db.select().from(schema.users);
    expect(user?.totpSecretEncrypted).toBeTruthy();
    expect(user?.totpSecretEncrypted).not.toContain(totpSecret);
  });

  it('rejects a wrong confirmation code', async () => {
    const wrong = totpCode(totpSecret) === '000000' ? '111111' : '000000';
    const response = await client.request('POST', '/auth/mfa/enrollment/confirm', {
      code: wrong,
    });
    expect(response.status).toBe(401);
  });

  it('confirms enrollment, returns backup codes and rotates the session', async () => {
    const pendingCookie = client.cookie;
    const response = await client.request('POST', '/auth/mfa/enrollment/confirm', {
      code: totpCode(totpSecret),
    });
    expect(response.status).toBe(200);
    const body = mfaConfirmResponseSchema.parse(await response.json());
    expect(body.backupCodes).toHaveLength(10);
    expect(body.user.username).toBe('admin');
    expect(client.cookie).not.toBe(pendingCookie);

    expect((await client.request('GET', '/protected')).status).toBe(200);

    const stale = new Client();
    stale.cookie = pendingCookie;
    expect((await stale.request('GET', '/auth/session')).status).toBe(401);
  });

  it('logs out and revokes the session', async () => {
    const response = await client.request('POST', '/auth/logout');
    expect(response.status).toBe(204);
    expect(client.cookie).toBeUndefined();
    const [user] = await testApp.database.db.select().from(schema.users);
    const actions = await auditActions(user?.id ?? '');
    expect(actions).toEqual(
      expect.arrayContaining([
        'auth.setup_completed',
        'user.created',
        'auth.mfa_failed',
        'auth.mfa_enrolled',
        'auth.login_succeeded',
        'auth.logout',
      ]),
    );
  });
});

describe('login', () => {
  async function loginWithPassword(user: TestUser, client = new Client()): Promise<Client> {
    const response = await client.request('POST', '/auth/login', {
      username: user.username,
      authKey: user.authKey,
    });
    expect(response.status).toBe(200);
    return client;
  }

  it('returns the stored KDF parameters at prelogin', async () => {
    const user = await createUser();
    const response = await new Client().request('POST', '/auth/prelogin', {
      username: user.username.toUpperCase(),
    });
    expect(preloginResponseSchema.parse(await response.json())).toEqual(user.kdf);
  });

  it('returns stable fake parameters for unknown users', async () => {
    const first = await new Client().request('POST', '/auth/prelogin', { username: 'nobody' });
    const second = await new Client().request('POST', '/auth/prelogin', { username: 'nobody' });
    const other = await new Client().request('POST', '/auth/prelogin', { username: 'nobody2' });
    const a = preloginResponseSchema.parse(await first.json());
    expect(preloginResponseSchema.parse(await second.json())).toEqual(a);
    expect(preloginResponseSchema.parse(await other.json()).salt).not.toBe(a.salt);
  });

  it('gives the same answer for an unknown user and a wrong key', async () => {
    const user = await createUser();
    const wrongKey = await new Client().request('POST', '/auth/login', {
      username: user.username,
      authKey: await generateToken(),
    });
    const unknown = await new Client().request('POST', '/auth/login', {
      username: 'ghost',
      authKey: await generateToken(),
    });
    expect(wrongKey.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(await wrongKey.json()).toEqual(await unknown.json());
  });

  it('requires MFA after the password and completes with a TOTP code', async () => {
    const user = await createUser();
    const client = await loginWithPassword(user);
    expect((await client.request('GET', '/protected')).status).toBe(401);

    const response = await client.request('POST', '/auth/mfa/verify', {
      code: totpCode(user.totpSecret),
    });
    expect(response.status).toBe(200);
    expect((await client.request('GET', '/protected')).status).toBe(200);
    expect(await auditActions(user.id)).toContain('auth.login_succeeded');
  });

  it('sends users without MFA to enrollment', async () => {
    const user = await createUser({ mfaEnrolled: false });
    const response = await new Client().request('POST', '/auth/login', {
      username: user.username,
      authKey: user.authKey,
    });
    expect(await response.json()).toEqual({ stage: 'mfa_enrollment' });
  });

  it('rejects a replayed TOTP code', async () => {
    const user = await createUser();
    const code = totpCode(user.totpSecret);
    const first = await loginWithPassword(user);
    expect((await first.request('POST', '/auth/mfa/verify', { code })).status).toBe(200);
    const second = await loginWithPassword(user);
    expect((await second.request('POST', '/auth/mfa/verify', { code })).status).toBe(401);
  });

  it('accepts each backup code only once', async () => {
    const admin = await createUser({ mfaEnrolled: false });
    const enrolling = await loginWithPassword(admin);
    const enrollment = mfaEnrollmentResponseSchema.parse(
      await (await enrolling.request('POST', '/auth/mfa/enrollment')).json(),
    );
    const confirmed = mfaConfirmResponseSchema.parse(
      await (
        await enrolling.request('POST', '/auth/mfa/enrollment/confirm', {
          code: totpCode(enrollment.secret),
        })
      ).json(),
    );
    const backupCode = (confirmed.backupCodes[0] ?? '').toLowerCase();

    const first = await loginWithPassword(admin);
    expect((await first.request('POST', '/auth/mfa/verify', { backupCode })).status).toBe(200);
    const second = await loginWithPassword(admin);
    expect((await second.request('POST', '/auth/mfa/verify', { backupCode })).status).toBe(401);
    expect(await auditActions(admin.id)).toContain('auth.backup_code_used');
  });

  it('locks the account after repeated failures, even for the right key', async () => {
    const user = await createUser();
    for (let i = 0; i < USER_MAX_FAILURES; i++) {
      const response = await new Client().request('POST', '/auth/login', {
        username: user.username,
        authKey: await generateToken(),
      });
      expect(response.status).toBe(401);
    }
    const response = await new Client().request('POST', '/auth/login', {
      username: user.username,
      authKey: user.authKey,
    });
    expect(response.status).toBe(401);
    expect(await auditActions(user.id)).toContain('auth.account_locked');
  });

  it('rate limits an address after too many failures', async () => {
    await testApp.database.db
      .insert(schema.authFailures)
      .values(Array.from({ length: IP_MAX_FAILURES }, () => ({ ipAddress: '127.0.0.1' })));
    const user = await createUser();
    const response = await new Client().request('POST', '/auth/login', {
      username: user.username,
      authKey: user.authKey,
    });
    expect(response.status).toBe(429);
    await testApp.database.db
      .delete(schema.authFailures)
      .where(eq(schema.authFailures.ipAddress, '127.0.0.1'));
  });

  it('rejects requests with an unknown session cookie', async () => {
    const client = new Client();
    client.cookie = await generateToken();
    expect((await client.request('GET', '/auth/session')).status).toBe(401);
  });
});
