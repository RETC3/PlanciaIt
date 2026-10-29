import { assetStatusSchema, type AssetStatus } from '@planciait/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Plus, Search, Settings2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { areasQueryKey, listAreas } from '@/features/areas/api';
import { fetchSession, sessionQueryKey } from '@/features/auth/api';
import { FormError } from '@/features/auth/form';
import { formatDateTime } from '@/lib/format';
import { assetListQueryKey, assetTypesQueryKey, listAssets, listAssetTypes } from './api';
import { AssetStatusBadge } from './asset-badges';

const PAGE_SIZE = 50;

const linkClass =
  'inline-flex h-9 items-center gap-2 rounded-md px-4 text-sm font-medium whitespace-nowrap';

export function AssetsPage() {
  const { t, i18n } = useTranslation();
  const session = useQuery({ queryKey: sessionQueryKey, queryFn: fetchSession });
  const areas = useQuery({ queryKey: areasQueryKey, queryFn: listAreas });
  const types = useQuery({ queryKey: assetTypesQueryKey, queryFn: listAssetTypes });
  const [areaId, setAreaId] = useState('');
  const [typeId, setTypeId] = useState('');
  const [status, setStatus] = useState<AssetStatus | ''>('');
  const [searchInput, setSearchInput] = useState('');
  const [q, setQ] = useState('');
  const [offset, setOffset] = useState(0);

  const query = {
    areaId: areaId || undefined,
    typeId: typeId || undefined,
    status: status || undefined,
    q: q || undefined,
    limit: PAGE_SIZE,
    offset,
  };
  const assets = useQuery({
    queryKey: assetListQueryKey(query),
    queryFn: () => listAssets(query),
    placeholderData: keepPreviousData,
  });

  const isAdmin = session.data?.user.role === 'admin';
  // UX only: the API checks the area permission of every write.
  const canCreate = areas.data?.some((area) => area.permission === 'write') ?? false;

  function filter<T>(set: (value: T) => void) {
    return (value: T) => {
      set(value);
      setOffset(0);
    };
  }

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setQ(searchInput.trim());
    setOffset(0);
  }

  const total = assets.data?.total ?? 0;

  return (
    <div className="grid max-w-6xl gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">{t('inventory.title')}</h1>
        <div className="flex flex-wrap gap-2">
          {isAdmin ? (
            <Link to="/asset-types" className={`${linkClass} border hover:bg-secondary`}>
              <Settings2 aria-hidden="true" className="size-4" />
              {t('inventory.types.title')}
            </Link>
          ) : null}
          {canCreate ? (
            <Link
              to="/assets/new"
              className={`${linkClass} bg-primary text-primary-foreground hover:bg-primary/90`}
            >
              <Plus aria-hidden="true" className="size-4" />
              {t('inventory.create.open')}
            </Link>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <form className="flex min-w-64 flex-1 items-end gap-2" onSubmit={handleSearch}>
          <div className="grid flex-1 gap-2">
            <Label htmlFor="assetSearch">{t('inventory.filters.search')}</Label>
            <Input
              id="assetSearch"
              type="search"
              placeholder={t('inventory.filters.searchPlaceholder')}
              maxLength={200}
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
          </div>
          <Button type="submit" variant="outline" aria-label={t('inventory.filters.search')}>
            <Search aria-hidden="true" className="size-4" />
          </Button>
        </form>
        <div className="grid w-44 gap-2">
          <Label htmlFor="filterArea">{t('inventory.fields.area')}</Label>
          <NativeSelect
            id="filterArea"
            value={areaId}
            onChange={(event) => filter(setAreaId)(event.target.value)}
          >
            <option value="">{t('inventory.filters.all')}</option>
            {areas.data?.map((area) => (
              <option key={area.id} value={area.id}>
                {area.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="grid w-44 gap-2">
          <Label htmlFor="filterType">{t('inventory.fields.type')}</Label>
          <NativeSelect
            id="filterType"
            value={typeId}
            onChange={(event) => filter(setTypeId)(event.target.value)}
          >
            <option value="">{t('inventory.filters.all')}</option>
            {types.data?.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="grid w-44 gap-2">
          <Label htmlFor="filterStatus">{t('inventory.fields.status')}</Label>
          <NativeSelect
            id="filterStatus"
            value={status}
            onChange={(event) => filter(setStatus)(event.target.value as AssetStatus | '')}
          >
            <option value="">{t('inventory.filters.all')}</option>
            {assetStatusSchema.options.map((value) => (
              <option key={value} value={value}>
                {t(`inventory.status.${value}`)}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>

      {assets.isPending ? (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : assets.isError ? (
        <FormError message={t('auth.errors.generic')} />
      ) : assets.data.assets.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {query.areaId || query.typeId || query.status || query.q
            ? t('inventory.emptyFiltered')
            : t('inventory.empty')}
        </p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-secondary text-left">
                <tr>
                  <th className="px-4 py-2 font-medium">{t('inventory.fields.name')}</th>
                  <th className="px-4 py-2 font-medium">{t('inventory.fields.type')}</th>
                  <th className="px-4 py-2 font-medium">{t('inventory.fields.area')}</th>
                  <th className="px-4 py-2 font-medium">{t('inventory.fields.ipAddress')}</th>
                  <th className="px-4 py-2 font-medium">{t('inventory.fields.location')}</th>
                  <th className="px-4 py-2 font-medium">{t('inventory.fields.status')}</th>
                  <th className="px-4 py-2 font-medium">{t('inventory.fields.updatedAt')}</th>
                </tr>
              </thead>
              <tbody>
                {assets.data.assets.map((asset) => (
                  <tr key={asset.id} className="border-t">
                    <td className="px-4 py-2">
                      <Link
                        to="/assets/$assetId"
                        params={{ assetId: asset.id }}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {asset.name}
                      </Link>
                      {asset.hostname ? (
                        <p className="font-mono text-xs text-muted-foreground">{asset.hostname}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-2">{asset.type.name}</td>
                    <td className="px-4 py-2">{asset.area.name}</td>
                    <td className="px-4 py-2 font-mono text-xs">{asset.ipAddress}</td>
                    <td className="px-4 py-2 text-muted-foreground">{asset.location}</td>
                    <td className="px-4 py-2">
                      <AssetStatusBadge status={asset.status} />
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {formatDateTime(asset.updatedAt, i18n.language)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">
              {t('inventory.pagination.range', {
                from: offset + 1,
                to: offset + assets.data.assets.length,
                total,
              })}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              >
                {t('inventory.pagination.previous')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={offset + PAGE_SIZE >= total}
                onClick={() => setOffset(offset + PAGE_SIZE)}
              >
                {t('inventory.pagination.next')}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
