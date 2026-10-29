import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { areasQueryKey, listAreas } from '@/features/areas/api';
import { FormError } from '@/features/auth/form';
import {
  assetQueryKey,
  assetsQueryKey,
  assetTypesQueryKey,
  createAsset,
  listAssetTypes,
} from './api';
import { AssetForm } from './asset-form';

export function AssetNewPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const areas = useQuery({ queryKey: areasQueryKey, queryFn: listAreas });
  const types = useQuery({ queryKey: assetTypesQueryKey, queryFn: listAssetTypes });
  const writableAreas = areas.data?.filter((area) => area.permission === 'write') ?? [];

  const mutation = useMutation({
    mutationFn: createAsset,
    onSuccess: async (asset) => {
      queryClient.setQueryData(assetQueryKey(asset.id), asset);
      await queryClient.invalidateQueries({ queryKey: assetsQueryKey });
      await navigate({ to: '/assets/$assetId', params: { assetId: asset.id } });
    },
  });

  return (
    <div className="grid max-w-3xl gap-6">
      <Link
        to="/assets"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        {t('inventory.title')}
      </Link>
      <Card>
        <CardHeader>
          <CardTitle>{t('inventory.create.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          {areas.isPending || types.isPending ? (
            <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
          ) : areas.isError || types.isError ? (
            <FormError message={t('auth.errors.generic')} />
          ) : writableAreas.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('inventory.create.noWritableArea')}</p>
          ) : types.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('inventory.create.noTypes')}</p>
          ) : (
            <AssetForm
              areas={writableAreas}
              types={types.data}
              error={mutation.isError ? mutation.error : null}
              disabled={mutation.isPending}
              onSubmit={(request) => mutation.mutate(request)}
            >
              <div className="flex gap-2">
                <Button type="submit" disabled={mutation.isPending}>
                  {t('inventory.create.submit')}
                </Button>
                <Button variant="ghost" onClick={() => void navigate({ to: '/assets' })}>
                  {t('common.cancel')}
                </Button>
              </div>
            </AssetForm>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
