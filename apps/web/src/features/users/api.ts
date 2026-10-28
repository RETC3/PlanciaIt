import {
  invitationResponseSchema,
  userListResponseSchema,
  userResponseSchema,
  type CreateUserRequest,
  type InvitationResponse,
  type UpdateUserRequest,
  type UserSummary,
} from '@planciait/shared';
import { apiRequest } from '@/lib/api';

export const usersQueryKey = ['users'] as const;

export function userQueryKey(id: string) {
  return ['users', id] as const;
}

export async function listUsers(): Promise<UserSummary[]> {
  return (await apiRequest('/users', userListResponseSchema)).users;
}

export async function getUser(id: string): Promise<UserSummary> {
  return (await apiRequest(`/users/${id}`, userResponseSchema)).user;
}

export async function createUser(request: CreateUserRequest): Promise<InvitationResponse> {
  return apiRequest('/users', invitationResponseSchema, { method: 'POST', body: request });
}

export async function updateUser(id: string, request: UpdateUserRequest): Promise<UserSummary> {
  return (await apiRequest(`/users/${id}`, userResponseSchema, { method: 'PATCH', body: request }))
    .user;
}

export async function reissueInvitation(id: string): Promise<InvitationResponse> {
  return apiRequest(`/users/${id}/invitation`, invitationResponseSchema, { method: 'POST' });
}

export async function resetMfa(id: string): Promise<UserSummary> {
  return (await apiRequest(`/users/${id}/mfa-reset`, userResponseSchema, { method: 'POST' })).user;
}

/** The token goes in the fragment so it is never sent to the server by the browser. */
export function invitationLink(token: string): string {
  return `${window.location.origin}/invite#${token}`;
}
