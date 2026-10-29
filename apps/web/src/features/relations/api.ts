import {
  relationListResponseSchema,
  relationResponseSchema,
  type CreateRelationRequest,
  type ElementRef,
  type Relation,
} from '@planciait/shared';
import { apiRequest, apiRequestNoContent } from '@/lib/api';

export const relationsQueryKey = ['relations'] as const;

export function elementRelationsQueryKey(element: ElementRef) {
  return ['relations', element.type, element.id] as const;
}

export async function listRelations(element: ElementRef): Promise<Relation[]> {
  const params = new URLSearchParams({ elementType: element.type, elementId: element.id });
  return (await apiRequest(`/relations?${params.toString()}`, relationListResponseSchema))
    .relations;
}

export async function createRelation(request: CreateRelationRequest): Promise<Relation> {
  return (await apiRequest('/relations', relationResponseSchema, { method: 'POST', body: request }))
    .relation;
}

export async function deleteRelation(id: string): Promise<void> {
  await apiRequestNoContent(`/relations/${id}`, { method: 'DELETE' });
}
