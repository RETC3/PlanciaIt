import type { AssetDetail, AssetType } from '@planciait/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AreaPermissionBadge } from '@/features/areas/area-permission-badge';
import { areasQueryKey, listAreas } from '@/features/areas/api';
import { FormError } from '@/features/auth/form';
import { ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import {
  assetQueryKey,
  assetsQueryKey,
  assetTypesQueryKey,
  deleteAsset,
  getAsset,
  listAssetTypes,
  updateAsset,
} from './api';
import { AssetStatusBadge } from './asset-badges';
import { AssetForm } from './asset-form';
import { inventoryErrorMessage } from './errors';

function EditAssetCard({ asset, types }: { asset: AssetDetail; types: AssetType[] }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const areas = useQuery({ queryKey: areasQueryKey, queryFn: listAreas });
  const [saved, setSaved] = useState(false);
  const readOnly = asset.permission !== 'write';

  const mutation = useMutation({
    mutationFn: (request: Parameters<typeof updateAsset>[1]) => updateAsset(asset.id, request),
    onSuccess: async (updated) => {
      setSaved(true);
      queryClient.setQueryData(assetQueryKey(updated.id), updated);
      await queryClient.invalidateQueries({ queryKey: [...assetsQueryKey, 'list'] });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('inventory.detail.data')}</CardTitle>
      </CardHeader>
      <CardContent>
        {areas.isPending ? (
          <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : (
          <AssetForm
            asset={asset}
            areas={areas.data?.filter((area) => area.permission === 'write') ?? []}
            types={types}
            error={mutation.isError ? mutation.error : null}
            disabled={readOnly || mutation.isPending}
            onSubmit={(request) => {
              setSaved(false);
              mutation.mutate(request);
            }}
          >
            {readOnly ? (
              <p className="text-sm text-muted-foreground">{t('inventory.detail.readOnly')}</p>
            ) : (
              <div className="flex items-center gap-3">
                <Button type="submit" disabled={mutation.isPending}>
                  {t('common.save')}
                </Button>
                {saved ? (
                  <span className="text-sm text-muted-foreground">{t('common.saved')}</span>
                ) : null}
              </div>
            )}
          </AssetForm>
        )}
      </CardContent>
    </Card>
  );
}

function DeleteAssetButton({ asset }: { asset: AssetDetail }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => deleteAsset(asset.id),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: assetQueryKey(asset.id) });
      await queryClient.invalidateQueries({ queryKey: assetsQueryKey });
      await navigate({ to: '/assets' });
    },
  });

  return (
    <div className="grid gap-2">
      <div>
        <Button
          variant="destructive"
          disabled={mutation.isPending}
          onClick={() => {
            if (window.confirm(t('inventory.confirm.delete', { name: asset.name }))) {
              mutation.mutate();
            }
          }}
        >
          <Trash2 aria-hidden="true" className="size-4" />
          {t('inventory.detail.delete')}
        </Button>
      </div>
      <FormError message={mutation.isError ? inventoryErrorMessage(mutation.error, t) : null} />
    </div>
  );
}

export function AssetDetailPage({ assetId }: { assetId: string }) {
  const { t, i18n } = useTranslation();
  const asset = useQuery({ queryKey: assetQueryKey(assetId), queryFn: () => getAsset(assetId) });
  const types = useQuery({ queryKey: assetTypesQueryKey, queryFn: listAssetTypes });

  return (
    <div className="grid max-w-3xl gap-6">
      <Link
        to="/assets"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        {t('inventory.title')}
      </Link>

      {asset.isPending || types.isPending ? (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : asset.isError || types.isError ? (
        <FormError
          message={
            asset.error instanceof ApiError && asset.error.status === 404
              ? t('inventory.errors.notFound')
              : t('auth.errors.generic')
          }
        />
      ) : (
        <>
          <div className="grid gap-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-xl font-semibold">{asset.data.name}</h1>
              <AssetStatusBadge status={asset.data.status} />
              <AreaPermissionBadge permission={asset.data.permission} />
            </div>
            <p className="text-sm text-muted-foreground">
              {t('inventory.detail.summary', {
                type: asset.data.type.name,
                area: asset.data.area.name,
                date: formatDateTime(asset.data.updatedAt, i18n.language),
              })}
            </p>
          </div>

          <EditAssetCard key={asset.data.id} asset={asset.data} types={types.data} />

          {asset.data.permission === 'write' ? <DeleteAssetButton asset={asset.data} /> : null}
        </>
      )}
    </div>
  );
}
