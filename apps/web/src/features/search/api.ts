import { searchResponseSchema, type SearchResponse } from '@planciait/shared';
import { apiRequest } from '@/lib/api';

export interface SearchParams {
  q: string;
  /** Per kind of result; the API default applies when left out. */
  limit?: number;
}

export function searchQueryKey(params: SearchParams) {
  return ['search', params] as const;
}

export async function search(params: SearchParams): Promise<SearchResponse> {
  const query = new URLSearchParams({ q: params.q });
  if (params.limit !== undefined) query.set('limit', String(params.limit));
  return apiRequest(`/search?${query.toString()}`, searchResponseSchema);
}
