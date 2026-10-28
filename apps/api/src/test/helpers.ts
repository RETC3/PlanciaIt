import {
  createKdfParams,
  encryptSecret,
  generateToken,
  hashAuthKey,
  type KdfParams,
} from '@planciait/crypto';
import { eq, schema } from '@planciait/db';
import type { UserRole } from '@planciait/shared';
import { Secret, TOTP } from 'otpauth';
import { SERVER_KEYS, type ServerKeys } from '../auth/server-keys.js';
import { SESSION_COOKIE } from '../auth/session.service.js';
import { createTotpSecret } from '../auth/totp.js';
import type { TestApp } from './test-app.js';

/** Minimal HTTP client that keeps the session cookie like a browser would. */
export class TestClient {
  cookie: string | undefined;

  constructor(private readonly testApp: TestApp) {}

  async request(method: string, path: string, body?: unknown): Promise<Response> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (this.cookie) headers.Cookie = `${SESSION_COOKIE}=${this.cookie}`;
    const response = await fetch(`${this.testApp.url}${path}`, {
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

/** The code an authenticator app shows now (or `offsetSteps` periods later). */
export function totpCode(secret: string, offsetSteps = 0): string {
  const totp = new TOTP({ secret: Secret.fromBase32(secret) });
  return totp.generate({ timestamp: Date.now() + offsetSteps * 30_000 });
}

export interface TestUser {
  id: string;
  username: string;
  authKey: string;
  kdf: KdfParams;
  totpSecret: string;
}

let userCounter = 0;

/** Inserts an active user directly, by default with MFA already enrolled. */
export async function createTestUser(
  testApp: TestApp,
  options: { role?: UserRole; mfaEnrolled?: boolean } = {},
): Promise<TestUser> {
  const username = `user${userCounter++}`;
  const authKey = await generateToken();
  const kdf = await createKdfParams();
  const totpSecret = await createTotpSecret();
  const [row] = await testApp.database.db
    .insert(schema.users)
    .values({
      username,
      displayName: username,
      role: options.role ?? 'technician',
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
  return { id: row.id, username, authKey, kdf, totpSecret };
}

/** Full login (password + TOTP). Clears the replay guard so a user can sign in repeatedly. */
export async function signIn(testApp: TestApp, user: TestUser): Promise<TestClient> {
  await testApp.database.db
    .update(schema.users)
    .set({ totpLastStep: null })
    .where(eq(schema.users.id, user.id));
  const client = new TestClient(testApp);
  const login = await client.request('POST', '/auth/login', {
    username: user.username,
    authKey: user.authKey,
  });
  if (login.status !== 200) throw new Error(`login failed: ${login.status}`);
  const verify = await client.request('POST', '/auth/mfa/verify', {
    code: totpCode(user.totpSecret),
  });
  if (verify.status !== 200) throw new Error(`MFA failed: ${verify.status}`);
  return client;
}

/** Audit actions performed by a user, oldest first. */
export async function auditActions(testApp: TestApp, actorUserId: string): Promise<string[]> {
  const rows = await testApp.database.db
    .select({ action: schema.auditLog.action })
    .from(schema.auditLog)
    .where(eq(schema.auditLog.actorUserId, actorUserId))
    .orderBy(schema.auditLog.occurredAt);
  return rows.map((row) => row.action);
}
