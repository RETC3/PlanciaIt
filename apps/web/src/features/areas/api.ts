import {
  areaListResponseSchema,
  areaMemberListResponseSchema,
  areaMemberResponseSchema,
  areaResponseSchema,
  type AreaMember,
  type AreaPermission,
  type AreaSummary,
  type CreateAreaRequest,
  type UpdateAreaRequest,
} from '@planciait/shared';
import { apiRequest, apiRequestNoContent } from '@/lib/api';

export const areasQueryKey = ['areas'] as const;

export function areaQueryKey(id: string) {
  return ['areas', id] as const;
}

export function areaMembersQueryKey(id: string) {
  return ['areas', id, 'members'] as const;
}

export async function listAreas(): Promise<AreaSummary[]> {
  return (await apiRequest('/areas', areaListResponseSchema)).areas;
}

export async function getArea(id: string): Promise<AreaSummary> {
  return (await apiRequest(`/areas/${id}`, areaResponseSchema)).area;
}

export async function createArea(request: CreateAreaRequest): Promise<AreaSummary> {
  return (await apiRequest('/areas', areaResponseSchema, { method: 'POST', body: request })).area;
}

export async function updateArea(id: string, request: UpdateAreaRequest): Promise<AreaSummary> {
  return (await apiRequest(`/areas/${id}`, areaResponseSchema, { method: 'PATCH', body: request }))
    .area;
}

export async function deleteArea(id: string): Promise<void> {
  await apiRequestNoContent(`/areas/${id}`, { method: 'DELETE' });
}

export async function listAreaMembers(id: string): Promise<AreaMember[]> {
  return (await apiRequest(`/areas/${id}/members`, areaMemberListResponseSchema)).members;
}

export async function setAreaMember(
  areaId: string,
  userId: string,
  permission: AreaPermission,
): Promise<AreaMember> {
  return (
    await apiRequest(`/areas/${areaId}/members/${userId}`, areaMemberResponseSchema, {
      method: 'PUT',
      body: { permission },
    })
  ).member;
}

export async function removeAreaMember(areaId: string, userId: string): Promise<void> {
  await apiRequestNoContent(`/areas/${areaId}/members/${userId}`, { method: 'DELETE' });
}
