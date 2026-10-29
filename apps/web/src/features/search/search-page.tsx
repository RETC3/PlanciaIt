import {
  SEARCH_LIMIT_MAX,
  SEARCH_MIN_LENGTH,
  type AssetSearchResult,
  type SearchResponse,
} from '@planciait/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FormError } from '@/features/auth/form';
import { AssetStatusBadge } from '@/features/inventory/asset-badges';
import { search, searchQueryKey } from './api';

const FIRST_LIMIT = 10;

function AssetMatch({ match }: { match: NonNullable<AssetSearchResult['match']> }) {
  const { t } = useTranslation();
  return (
    <p className="truncate text-xs text-muted-foreground">
      {match.field === 'customField'
        ? t('search.matchCustom', { label: match.label, value: match.value })
        : t('search.match', { field: t(`inventory.fields.${match.field}`), value: match.value })}
    </p>
  );
}

function ResultGroup({
  title,
  group,
  children,
}: {
  title: string;
  group: { results: unknown[]; total: number };
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-baseline justify-between gap-2">
          {title}
          <span className="text-sm font-normal text-muted-foreground">
            {t('search.count', { shown: group.results.length, total: group.total })}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">{children}</ul>
      </CardContent>
    </Card>
  );
}

function Results({ data }: { data: SearchResponse }) {
  const { t } = useTranslation();
  return (
    <>
      {data.assets.total > 0 ? (
        <ResultGroup title={t('search.groups.assets')} group={data.assets}>
          {data.assets.results.map((asset) => (
            <li key={asset.id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <Link
                  to="/assets/$assetId"
                  params={{ assetId: asset.id }}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {asset.name}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {asset.type.name} · {asset.area.name}
                </p>
                {asset.match ? <AssetMatch match={asset.match} /> : null}
              </div>
              <AssetStatusBadge status={asset.status} />
            </li>
          ))}
        </ResultGroup>
      ) : null}
      {data.areas.total > 0 ? (
        <ResultGroup title={t('search.groups.areas')} group={data.areas}>
          {data.areas.results.map((area) => (
            <li key={area.id} className="py-2">
              <Link
                to="/areas/$areaId"
                params={{ areaId: area.id }}
                className="font-medium underline-offset-4 hover:underline"
              >
                {area.name}
              </Link>
              {area.description ? (
                <p className="truncate text-xs text-muted-foreground">{area.description}</p>
              ) : null}
            </li>
          ))}
        </ResultGroup>
      ) : null}
    </>
  );
}

/** Results of the header search box, grouped by kind of element. */
export function SearchPage({ q }: { q: string }) {
  const { t } = useTranslation();
  const text = q.trim();
  const [expanded, setExpanded] = useState(false);
  const limit = expanded ? SEARCH_LIMIT_MAX : FIRST_LIMIT;
  const query = { q: text, limit };
  const enabled = text.length >= SEARCH_MIN_LENGTH;
  const results = useQuery({
    queryKey: searchQueryKey(query),
    queryFn: () => search(query),
    enabled,
    placeholderData: keepPreviousData,
  });

  const data = results.data;
  const hasMore =
    data !== undefined &&
    (data.assets.total > data.assets.results.length ||
      data.areas.total > data.areas.results.length);

  return (
    <div className="grid max-w-3xl gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        {enabled ? t('search.resultsFor', { q: text }) : t('search.title')}
      </h1>

      {!enabled ? (
        <p className="text-sm text-muted-foreground">
          {t('search.tooShort', { count: SEARCH_MIN_LENGTH })}
        </p>
      ) : results.isPending ? (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : results.isError || !data ? (
        <FormError message={t('auth.errors.generic')} />
      ) : data.assets.total + data.areas.total === 0 ? (
        <p className="text-sm text-muted-foreground">{t('search.empty')}</p>
      ) : (
        <>
          <Results data={data} />
          {hasMore ? (
            expanded ? (
              <p className="text-sm text-muted-foreground">
                {t('search.truncated', { count: SEARCH_LIMIT_MAX })}
              </p>
            ) : (
              <div>
                <Button variant="outline" onClick={() => setExpanded(true)}>
                  {t('search.more')}
                </Button>
              </div>
            )
          ) : null}
        </>
      )}
    </div>
  );
}
