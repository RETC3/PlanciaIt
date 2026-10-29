import {
  assetListResponseSchema,
  assetResponseSchema,
  assetTypeListResponseSchema,
  assetTypeResponseSchema,
  importAssetsResponseSchema,
  type AssetDetail,
  type AssetListQueryInput,
  type AssetListResponse,
  type AssetType,
  type CreateAssetRequest,
  type CreateAssetTypeRequest,
  type ImportAssetsRequest,
  type UpdateAssetRequest,
  type UpdateAssetTypeRequest,
} from '@planciait/shared';
import { apiRequest, apiRequestNoContent } from '@/lib/api';

export const assetTypesQueryKey = ['asset-types'] as const;
export const assetsQueryKey = ['assets'] as const;

export function assetListQueryKey(query: AssetListQueryInput) {
  return ['assets', 'list', query] as const;
}

export function assetQueryKey(id: string) {
  return ['assets', id] as const;
}

export async function listAssetTypes(): Promise<AssetType[]> {
  return (await apiRequest('/asset-types', assetTypeListResponseSchema)).assetTypes;
}

export async function createAssetType(request: CreateAssetTypeRequest): Promise<AssetType> {
  return (
    await apiRequest('/asset-types', assetTypeResponseSchema, { method: 'POST', body: request })
  ).assetType;
}

export async function updateAssetType(
  id: string,
  request: UpdateAssetTypeRequest,
): Promise<AssetType> {
  return (
    await apiRequest(`/asset-types/${id}`, assetTypeResponseSchema, {
      method: 'PATCH',
      body: request,
    })
  ).assetType;
}

export async function deleteAssetType(id: string): Promise<void> {
  await apiRequestNoContent(`/asset-types/${id}`, { method: 'DELETE' });
}

export async function listAssets(query: AssetListQueryInput): Promise<AssetListResponse> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    // Paging parameters are typed loosely (coerced by the API); only scalars are sent.
    if ((typeof value === 'string' && value !== '') || typeof value === 'number') {
      params.set(key, String(value));
    }
  }
  const search = params.toString();
  return apiRequest(`/assets${search ? `?${search}` : ''}`, assetListResponseSchema);
}

export async function getAsset(id: string): Promise<AssetDetail> {
  return (await apiRequest(`/assets/${id}`, assetResponseSchema)).asset;
}

export async function createAsset(request: CreateAssetRequest): Promise<AssetDetail> {
  return (await apiRequest('/assets', assetResponseSchema, { method: 'POST', body: request }))
    .asset;
}

export async function updateAsset(id: string, request: UpdateAssetRequest): Promise<AssetDetail> {
  return (
    await apiRequest(`/assets/${id}`, assetResponseSchema, { method: 'PATCH', body: request })
  ).asset;
}

export async function deleteAsset(id: string): Promise<void> {
  await apiRequestNoContent(`/assets/${id}`, { method: 'DELETE' });
}

/** All or nothing: the API rejects the whole batch if any row is invalid. */
export async function importAssets(request: ImportAssetsRequest): Promise<number> {
  return (
    await apiRequest('/assets/import', importAssetsResponseSchema, {
      method: 'POST',
      body: request,
    })
  ).imported;
}
