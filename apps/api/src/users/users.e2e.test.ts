import { createKdfParams, generateToken } from '@planciait/crypto';
import { eq, schema } from '@planciait/db';
import {
  inspectInvitationResponseSchema,
  invitationResponseSchema,
  mfaConfirmResponseSchema,
  mfaEnrollmentResponseSchema,
  userListResponseSchema,
  userResponseSchema,
  type InvitationResponse,
} from '@planciait/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  auditActions,
  createTestUser,
  signIn,
  TestClient,
  totpCode,
  type TestUser,
} from '../test/helpers.js';
import { startTestApp, type TestApp } from '../test/test-app.js';

let testApp: TestApp;
let admin: TestUser;
let adminClient: TestClient;

beforeAll(async () => {
  testApp = await startTestApp();
  admin = await createTestUser(testApp, { role: 'admin' });
  adminClient = await signIn(testApp, admin);
}, 30_000);

afterAll(async () => {
  await testApp.close();
});

let nameCounter = 0;

async function invite(role: 'admin' | 'technician' = 'technician'): Promise<InvitationResponse> {
  const response = await adminClient.request('POST', '/users', {
    username: `invited${nameCounter++}`,
    displayName: 'Tecnico di prova',
    role,
  });
  expect(response.status).toBe(201);
  return invitationResponseSchema.parse(await response.json());
}

/** Accepts an invitation and completes MFA enrollment, like the invited user's browser. */
async function activate(
  invitation: InvitationResponse,
): Promise<TestUser & { client: TestClient }> {
  const client = new TestClient(testApp);
  const kdf = await createKdfParams();
  const authKey = await generateToken();
  const accepted = await client.request('POST', '/auth/invitations/accept', {
    token: invitation.invitationToken,
    kdf,
    authKey,
  });
  expect(accepted.status).toBe(200);
  expect(await accepted.json()).toEqual({ stage: 'mfa_enrollment' });
  const enrollment = mfaEnrollmentResponseSchema.parse(
    await (await client.request('POST', '/auth/mfa/enrollment')).json(),
  );
  const confirmed = await client.request('POST', '/auth/mfa/enrollment/confirm', {
    code: totpCode(enrollment.secret),
  });
  mfaConfirmResponseSchema.parse(await confirmed.json());
  return {
    id: invitation.user.id,
    username: invitation.user.username,
    authKey,
    kdf,
    totpSecret: enrollment.secret,
    client,
  };
}

async function statusOf(userId: string): Promise<string> {
  const response = await adminClient.request('GET', `/users/${userId}`);
  return userResponseSchema.parse(await response.json()).user.status;
}

describe('access control', () => {
  it('requires a session', async () => {
    expect((await new TestClient(testApp).request('GET', '/users')).status).toBe(401);
  });

  it('is reserved to administrators', async () => {
    const technician = await createTestUser(testApp);
    const client = await signIn(testApp, technician);
    expect((await client.request('GET', '/users')).status).toBe(403);
    expect(
      (
        await client.request('POST', '/users', {
          username: 'sneaky',
          displayName: 'Sneaky',
          role: 'admin',
        })
      ).status,
    ).toBe(403);
  });

  it('validates the user id', async () => {
    expect((await adminClient.request('GET', '/users/not-a-uuid')).status).toBe(400);
    expect(
      (await adminClient.request('GET', '/users/00000000-0000-4000-8000-000000000000')).status,
    ).toBe(404);
  });
});

describe('creating users and invitations', () => {
  it('creates an invited user and lists it without credential material', async () => {
    const invitation = await invite();
    expect(invitation.user.status).toBe('invited');
    expect(invitation.invitationToken).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const response = await adminClient.request('GET', '/users');
    const text = await response.text();
    const list = userListResponseSchema.parse(JSON.parse(text));
    expect(list.users.map((user) => user.username)).toContain(invitation.user.username);
    expect(text).not.toContain(invitation.invitationToken);
    expect(text).not.toMatch(/authKey|kdfSalt|totp|invitationToken/);
  });

  it('rejects a duplicate username, case-insensitively', async () => {
    const invitation = await invite();
    const response = await adminClient.request('POST', '/users', {
      username: invitation.user.username.toUpperCase(),
      displayName: 'Doppione',
      role: 'technician',
    });
    expect(response.status).toBe(409);
  });

  it('lets the invited user set a password, enroll MFA and sign in', async () => {
    const invitation = await invite();
    const inspect = await new TestClient(testApp).request('POST', '/auth/invitations/inspect', {
      token: invitation.invitationToken,
    });
    expect(inspectInvitationResponseSchema.parse(await inspect.json())).toEqual({
      username: invitation.user.username,
      displayName: 'Tecnico di prova',
    });

    const user = await activate(invitation);
    expect(await statusOf(user.id)).toBe('active');
    expect((await user.client.request('GET', '/auth/session')).status).toBe(200);
    await signIn(testApp, user);
    expect(await auditActions(testApp, user.id)).toContain('user.invitation_accepted');
  });

  it('accepts an invitation only once', async () => {
    const invitation = await invite();
    await activate(invitation);
    const again = await new TestClient(testApp).request('POST', '/auth/invitations/accept', {
      token: invitation.invitationToken,
      kdf: await createKdfParams(),
      authKey: await generateToken(),
    });
    expect(again.status).toBe(404);
  });

  it('rejects unknown and expired invitations', async () => {
    const unknown = await new TestClient(testApp).request('POST', '/auth/invitations/inspect', {
      token: await generateToken(),
    });
    expect(unknown.status).toBe(404);

    const invitation = await invite();
    await testApp.database.db
      .update(schema.users)
      .set({ invitationExpiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.users.id, invitation.user.id));
    const expired = await new TestClient(testApp).request('POST', '/auth/invitations/inspect', {
      token: invitation.invitationToken,
    });
    expect(expired.status).toBe(404);
    expect(await statusOf(invitation.user.id)).toBe('invitation_expired');
  });

  it('does not let invited users sign in before accepting', async () => {
    const invitation = await invite();
    const response = await new TestClient(testApp).request('POST', '/auth/login', {
      username: invitation.user.username,
      authKey: await generateToken(),
    });
    expect(response.status).toBe(401);
  });
});

describe('updating users', () => {
  it('renames a user and changes the role with immediate effect', async () => {
    const user = await activate(await invite());
    expect((await user.client.request('GET', '/users')).status).toBe(403);

    const response = await adminClient.request('PATCH', `/users/${user.id}`, {
      displayName: 'Nuovo Nome',
      role: 'admin',
    });
    expect(response.status).toBe(200);
    const updated = userResponseSchema.parse(await response.json()).user;
    expect(updated.displayName).toBe('Nuovo Nome');
    expect(updated.role).toBe('admin');

    expect((await user.client.request('GET', '/users')).status).toBe(200);
    expect(await auditActions(testApp, admin.id)).toEqual(
      expect.arrayContaining(['user.updated', 'user.role_changed']),
    );
  });

  it('prevents administrators from demoting or deactivating themselves', async () => {
    const demote = await adminClient.request('PATCH', `/users/${admin.id}`, {
      role: 'technician',
    });
    expect(demote.status).toBe(400);
    const deactivate = await adminClient.request('PATCH', `/users/${admin.id}`, {
      isActive: false,
    });
    expect(deactivate.status).toBe(400);
    const rename = await adminClient.request('PATCH', `/users/${admin.id}`, {
      displayName: 'IT Manager',
    });
    expect(rename.status).toBe(200);
  });

  it('rejects an empty update', async () => {
    const user = await createTestUser(testApp);
    expect((await adminClient.request('PATCH', `/users/${user.id}`, {})).status).toBe(400);
  });

  it('deactivation signs the user out and blocks login until reactivation', async () => {
    const user = await activate(await invite());
    const deactivate = await adminClient.request('PATCH', `/users/${user.id}`, {
      isActive: false,
    });
    expect(deactivate.status).toBe(200);
    expect(await statusOf(user.id)).toBe('disabled');
    expect((await user.client.request('GET', '/auth/session')).status).toBe(401);
    await expect(signIn(testApp, user)).rejects.toThrow(/login failed/);

    await adminClient.request('PATCH', `/users/${user.id}`, { isActive: true });
    await signIn(testApp, user);
    expect(await auditActions(testApp, admin.id)).toEqual(
      expect.arrayContaining(['user.deactivated', 'user.reactivated']),
    );
  });

  it('a deactivated user cannot accept an invitation', async () => {
    const invitation = await invite();
    await adminClient.request('PATCH', `/users/${invitation.user.id}`, { isActive: false });
    const response = await new TestClient(testApp).request('POST', '/auth/invitations/inspect', {
      token: invitation.invitationToken,
    });
    expect(response.status).toBe(404);
  });
});

describe('resetting access', () => {
  it('MFA reset signs the user out and requires a new enrollment', async () => {
    const user = await activate(await invite());
    const response = await adminClient.request('POST', `/users/${user.id}/mfa-reset`);
    expect(response.status).toBe(200);
    expect(userResponseSchema.parse(await response.json()).user.status).toBe('mfa_pending');
    expect((await user.client.request('GET', '/auth/session')).status).toBe(401);

    const login = await new TestClient(testApp).request('POST', '/auth/login', {
      username: user.username,
      authKey: user.authKey,
    });
    expect(await login.json()).toEqual({ stage: 'mfa_enrollment' });

    const again = await adminClient.request('POST', `/users/${user.id}/mfa-reset`);
    expect(again.status).toBe(400);
  });

  it('a new invitation discards the old master password', async () => {
    const user = await activate(await invite());
    const response = await adminClient.request('POST', `/users/${user.id}/invitation`);
    expect(response.status).toBe(200);
    const invitation = invitationResponseSchema.parse(await response.json());
    expect(invitation.user.status).toBe('invited');
    expect((await user.client.request('GET', '/auth/session')).status).toBe(401);
    await expect(signIn(testApp, user)).rejects.toThrow(/login failed/);

    const reactivated = await activate(invitation);
    await signIn(testApp, reactivated);
  });

  it('administrators cannot reset their own access', async () => {
    expect((await adminClient.request('POST', `/users/${admin.id}/mfa-reset`)).status).toBe(400);
    expect((await adminClient.request('POST', `/users/${admin.id}/invitation`)).status).toBe(400);
  });
});
