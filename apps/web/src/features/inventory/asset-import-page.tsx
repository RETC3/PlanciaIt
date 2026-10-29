import {
  ASSET_IMPORT_MAX_ROWS,
  assetStatusSchema,
  type AssetStatus,
  type AssetType,
} from '@planciait/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, Upload } from 'lucide-react';
import { useMemo, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { areasQueryKey, listAreas } from '@/features/areas/api';
import { FormError } from '@/features/auth/form';
import { parseCsv, type CsvTable } from '@/lib/csv';
import { assetsQueryKey, assetTypesQueryKey, importAssets, listAssetTypes } from './api';
import {
  commonTargets,
  customTarget,
  previewImport,
  suggestMapping,
  type ColumnMapping,
  type CommonTarget,
  type ImportTarget,
} from './csv-import';
import { inventoryErrorMessage } from './errors';

/** Far above any realistic inventory export; keeps the browser responsive. */
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const PREVIEW_ROWS = 5;
const LISTED_ERRORS = 20;

function useLabels() {
  const { t } = useTranslation();
  return useMemo(() => {
    const common = Object.fromEntries(
      commonTargets.map((target) => [target, t(`inventory.fields.${target}`)]),
    ) as Record<CommonTarget, string>;
    const status = Object.fromEntries(
      assetStatusSchema.options.map((value) => [value, t(`inventory.status.${value}`)]),
    ) as Record<AssetStatus, string>;
    return { common, status };
  }, [t]);
}

function targetLabel(
  target: ImportTarget,
  type: AssetType | undefined,
  common: Record<CommonTarget, string>,
): string {
  if (!target.startsWith('custom:')) return common[target as CommonTarget];
  const key = target.slice('custom:'.length);
  return type?.fields.find((field) => field.key === key)?.label ?? key;
}

export function AssetImportPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const labels = useLabels();
  const areas = useQuery({ queryKey: areasQueryKey, queryFn: listAreas });
  const types = useQuery({ queryKey: assetTypesQueryKey, queryFn: listAssetTypes });
  const writableAreas = areas.data?.filter((area) => area.permission === 'write') ?? [];

  const [areaId, setAreaId] = useState('');
  const [typeId, setTypeId] = useState('');
  const [table, setTable] = useState<CsvTable | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [imported, setImported] = useState<number | null>(null);

  const selectedAreaId = areaId || writableAreas[0]?.id || '';
  const selectedTypeId = typeId || types.data?.[0]?.id || '';
  const type = types.data?.find((candidate) => candidate.id === selectedTypeId);
  const fields = type?.fields ?? [];

  // Recomputed on render; the React Compiler memoizes it.
  const preview = table ? previewImport(table, mapping, fields, labels.status) : null;

  const mutation = useMutation({
    mutationFn: importAssets,
    onSuccess: async (count) => {
      setImported(count);
      setTable(null);
      await queryClient.invalidateQueries({ queryKey: assetsQueryKey });
    },
  });

  function changeType(nextTypeId: string) {
    setTypeId(nextTypeId);
    const next = types.data?.find((candidate) => candidate.id === nextTypeId);
    if (table && next) setMapping(suggestMapping(table.headers, next.fields, labels.common));
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setFileError(null);
    setImported(null);
    setTable(null);
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setFileError(t('inventory.import.fileTooLarge'));
      return;
    }
    const parsed = parseCsv(await file.text());
    if (parsed.headers.length === 0 || parsed.rows.length === 0) {
      setFileError(t('inventory.import.fileEmpty'));
      return;
    }
    if (parsed.rows.length > ASSET_IMPORT_MAX_ROWS) {
      setFileError(t('inventory.import.tooManyRows', { max: ASSET_IMPORT_MAX_ROWS }));
      return;
    }
    setTable(parsed);
    setMapping(suggestMapping(parsed.headers, fields, labels.common));
  }

  function handleImport() {
    if (!preview) return;
    if (
      preview.invalid.length > 0 &&
      !window.confirm(t('inventory.import.confirmSkip', { count: preview.invalid.length }))
    ) {
      return;
    }
    mutation.mutate({
      areaId: selectedAreaId,
      typeId: selectedTypeId,
      assets: preview.valid.map((row) => row.asset),
    });
  }

  const targetOptions: ImportTarget[] = [
    ...commonTargets,
    ...fields.map((field) => customTarget(field.key)),
  ];
  const nameMapped = mapping.includes('name');

  return (
    <div className="grid max-w-5xl gap-6">
      <Link
        to="/assets"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        {t('inventory.title')}
      </Link>
      <div>
        <h1 className="text-xl font-semibold">{t('inventory.import.title')}</h1>
        <p className="text-sm text-muted-foreground">
          {t('inventory.import.description', { max: ASSET_IMPORT_MAX_ROWS })}
        </p>
      </div>

      {imported !== null ? (
        <Card className="border-primary">
          <CardHeader>
            <CardTitle>{t('inventory.import.done', { count: imported })}</CardTitle>
          </CardHeader>
          <CardContent>
            <Link to="/assets" className="text-sm font-medium underline underline-offset-4">
              {t('inventory.import.goToInventory')}
            </Link>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t('inventory.import.sourceTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          {areas.isPending || types.isPending ? (
            <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
          ) : writableAreas.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('inventory.create.noWritableArea')}</p>
          ) : !types.data?.length ? (
            <p className="text-sm text-muted-foreground">{t('inventory.create.noTypes')}</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="grid gap-2">
                <Label htmlFor="importArea">{t('inventory.fields.area')}</Label>
                <NativeSelect
                  id="importArea"
                  value={selectedAreaId}
                  onChange={(event) => setAreaId(event.target.value)}
                >
                  {writableAreas.map((area) => (
                    <option key={area.id} value={area.id}>
                      {area.name}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="importType">{t('inventory.fields.type')}</Label>
                <NativeSelect
                  id="importType"
                  value={selectedTypeId}
                  onChange={(event) => changeType(event.target.value)}
                >
                  {types.data.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.name}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="importFile">{t('inventory.import.file')}</Label>
                <Input
                  id="importFile"
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(event) => void handleFile(event)}
                />
              </div>
            </div>
          )}
          <FormError message={fileError} />
        </CardContent>
      </Card>

      {table && preview ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{t('inventory.import.mappingTitle')}</CardTitle>
              <CardDescription>{t('inventory.import.mappingDescription')}</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left">
                  <tr>
                    <th className="py-2 pr-4 font-medium">{t('inventory.import.column')}</th>
                    <th className="py-2 pr-4 font-medium">{t('inventory.import.sample')}</th>
                    <th className="py-2 font-medium">{t('inventory.import.target')}</th>
                  </tr>
                </thead>
                <tbody>
                  {table.headers.map((header, column) => (
                    <tr key={column} className="border-t">
                      <td className="py-2 pr-4 font-medium">{header}</td>
                      <td className="max-w-48 truncate py-2 pr-4 text-muted-foreground">
                        {table.rows[0]?.[column]}
                      </td>
                      <td className="w-64 py-2">
                        <NativeSelect
                          aria-label={t('inventory.import.targetFor', { column: header })}
                          value={mapping[column] ?? ''}
                          onChange={(event) => {
                            const value = (event.target.value || null) as ImportTarget | null;
                            setMapping((current) =>
                              current.map((target, index) =>
                                index === column ? value : target === value ? null : target,
                              ),
                            );
                          }}
                        >
                          <option value="">{t('inventory.import.ignore')}</option>
                          {targetOptions.map((target) => (
                            <option key={target} value={target}>
                              {targetLabel(target, type, labels.common)}
                            </option>
                          ))}
                        </NativeSelect>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('inventory.import.previewTitle')}</CardTitle>
              <CardDescription>
                {t('inventory.import.counts', {
                  valid: preview.valid.length,
                  invalid: preview.invalid.length,
                })}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              {!nameMapped ? <FormError message={t('inventory.import.nameRequired')} /> : null}
              {preview.invalid.length > 0 ? (
                <div className="grid gap-1">
                  <p className="text-sm font-medium">{t('inventory.import.invalidTitle')}</p>
                  <ul className="list-disc pl-5 text-sm text-muted-foreground">
                    {preview.invalid.slice(0, LISTED_ERRORS).map((row) => (
                      <li key={row.line}>
                        {t('inventory.import.invalidRow', {
                          line: row.line,
                          fields: row.targets
                            .map((target) => targetLabel(target, type, labels.common))
                            .join(', '),
                        })}
                      </li>
                    ))}
                  </ul>
                  {preview.invalid.length > LISTED_ERRORS ? (
                    <p className="text-sm text-muted-foreground">
                      {t('inventory.import.moreErrors', {
                        count: preview.invalid.length - LISTED_ERRORS,
                      })}
                    </p>
                  ) : null}
                </div>
              ) : null}
              {preview.valid.length > 0 ? (
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-sm">
                    <thead className="bg-secondary text-left">
                      <tr>
                        <th className="px-4 py-2 font-medium">{t('inventory.import.line')}</th>
                        <th className="px-4 py-2 font-medium">{t('inventory.fields.name')}</th>
                        <th className="px-4 py-2 font-medium">{t('inventory.fields.status')}</th>
                        <th className="px-4 py-2 font-medium">{t('inventory.fields.ipAddress')}</th>
                        <th className="px-4 py-2 font-medium">
                          {t('inventory.fields.serialNumber')}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.valid.slice(0, PREVIEW_ROWS).map(({ line, asset }) => (
                        <tr key={line} className="border-t">
                          <td className="px-4 py-2 text-muted-foreground">{line}</td>
                          <td className="px-4 py-2">{asset.name}</td>
                          <td className="px-4 py-2">{labels.status[asset.status]}</td>
                          <td className="px-4 py-2 font-mono text-xs">{asset.ipAddress}</td>
                          <td className="px-4 py-2 font-mono text-xs">{asset.serialNumber}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
              <FormError
                message={mutation.isError ? inventoryErrorMessage(mutation.error, t) : null}
              />
              <div>
                <Button
                  disabled={!nameMapped || preview.valid.length === 0 || mutation.isPending}
                  onClick={handleImport}
                >
                  <Upload aria-hidden="true" className="size-4" />
                  {t('inventory.import.submit', { count: preview.valid.length })}
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
