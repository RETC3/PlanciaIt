import type { ElementRef, Relation, RelatedElement } from '@planciait/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Trash2 } from 'lucide-react';
import { useDeferredValue, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { FormError } from '@/features/auth/form';
import { assetListQueryKey, listAssets } from '@/features/inventory/api';
import {
  createRelation,
  deleteRelation,
  elementRelationsQueryKey,
  listRelations,
  relationsQueryKey,
} from './api';
import { relationErrorMessage } from './errors';
import { kindChoices, type KindChoice } from './kinds';

const SEARCH_MIN_LENGTH = 2;
const SEARCH_LIMIT = 10;

function ElementLink({ element }: { element: RelatedElement }) {
  const className = 'font-medium underline-offset-4 hover:underline';
  switch (element.type) {
    case 'asset':
      return (
        <Link to="/assets/$assetId" params={{ assetId: element.id }} className={className}>
          {element.name}
        </Link>
      );
  }
}

function RelationLabel({ relation }: { relation: Relation }) {
  const { t } = useTranslation();
  return <>{t(`relations.kinds.${relation.kind}.${relation.direction}`)}</>;
}

/** Links an asset to the current element; the search covers the assets the user can see. */
function AddRelationForm({ element }: { element: ElementRef }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [choice, setChoice] = useState<KindChoice['value']>(
    kindChoices[0]?.value ?? 'depends_on:outgoing',
  );
  const [search, setSearch] = useState('');
  const [targetId, setTargetId] = useState('');
  const [note, setNote] = useState('');
  const deferredSearch = useDeferredValue(search.trim());
  const searching = deferredSearch.length >= SEARCH_MIN_LENGTH;

  const query = { q: deferredSearch, limit: SEARCH_LIMIT };
  const matches = useQuery({
    queryKey: assetListQueryKey(query),
    queryFn: () => listAssets(query),
    enabled: searching,
  });
  const candidates = (matches.data?.assets ?? []).filter(
    (asset) => !(element.type === 'asset' && asset.id === element.id),
  );

  const mutation = useMutation({
    mutationFn: createRelation,
    onSuccess: async () => {
      setTargetId('');
      setNote('');
      await queryClient.invalidateQueries({ queryKey: relationsQueryKey });
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const selected = kindChoices.find((option) => option.value === choice);
    if (!selected || !targetId) return;
    const other: ElementRef = { type: 'asset', id: targetId };
    mutation.mutate({
      kind: selected.kind,
      source: selected.direction === 'outgoing' ? element : other,
      target: selected.direction === 'outgoing' ? other : element,
      note,
    });
  }

  return (
    <form className="grid gap-3" onSubmit={handleSubmit}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="relationKind">{t('relations.fields.kind')}</Label>
          <NativeSelect
            id="relationKind"
            value={choice}
            onChange={(event) => setChoice(event.target.value as KindChoice['value'])}
          >
            {kindChoices.map((option) => (
              <option key={option.value} value={option.value}>
                {t(`relations.kinds.${option.kind}.${option.direction}`)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="relationSearch">{t('relations.fields.search')}</Label>
          <Input
            id="relationSearch"
            type="search"
            value={search}
            maxLength={200}
            onChange={(event) => {
              setSearch(event.target.value);
              setTargetId('');
            }}
          />
        </div>
      </div>

      {!searching ? (
        <p className="text-sm text-muted-foreground">{t('relations.searchHint')}</p>
      ) : matches.isPending ? (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : candidates.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('relations.noMatches')}</p>
      ) : (
        <div className="grid gap-2">
          <Label htmlFor="relationTarget">{t('relations.fields.target')}</Label>
          <NativeSelect
            id="relationTarget"
            value={targetId}
            required
            onChange={(event) => setTargetId(event.target.value)}
          >
            <option value="">{t('relations.choose')}</option>
            {candidates.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.name} · {asset.area.name}
              </option>
            ))}
          </NativeSelect>
        </div>
      )}

      <div className="grid gap-2">
        <Label htmlFor="relationNote">{t('relations.fields.note')}</Label>
        <Input
          id="relationNote"
          value={note}
          maxLength={500}
          onChange={(event) => setNote(event.target.value)}
        />
      </div>
      <div>
        <Button type="submit" disabled={mutation.isPending || !targetId}>
          {t('relations.add')}
        </Button>
      </div>
      <FormError message={mutation.isError ? relationErrorMessage(mutation.error, t) : null} />
    </form>
  );
}

/**
 * The relations of an element. `canEdit` shows the form to add one; whether
 * each relation can be deleted comes from the API.
 */
export function RelationsCard({ element, canEdit }: { element: ElementRef; canEdit: boolean }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const relations = useQuery({
    queryKey: elementRelationsQueryKey(element),
    queryFn: () => listRelations(element),
  });
  const remove = useMutation({
    mutationFn: deleteRelation,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: relationsQueryKey });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('relations.title')}</CardTitle>
        <CardDescription>{t('relations.description')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {relations.isPending ? (
          <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : relations.isError ? (
          <FormError message={t('auth.errors.generic')} />
        ) : relations.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('relations.empty')}</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border bg-card shadow-xs">
            <table className="w-full text-sm">
              <thead className="bg-secondary text-left">
                <tr>
                  <th className="px-4 py-2 font-medium">{t('relations.fields.kind')}</th>
                  <th className="px-4 py-2 font-medium">{t('relations.fields.element')}</th>
                  <th className="px-4 py-2 font-medium">{t('relations.fields.area')}</th>
                  <th className="px-4 py-2 font-medium">{t('relations.fields.note')}</th>
                  <th className="px-4 py-2">
                    <span className="sr-only">{t('relations.actions')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {relations.data.map((relation) => (
                  <tr key={relation.id} className="border-t">
                    <td className="px-4 py-2 text-muted-foreground">
                      <RelationLabel relation={relation} />
                    </td>
                    <td className="px-4 py-2">
                      <ElementLink element={relation.other} />
                    </td>
                    <td className="px-4 py-2">{relation.other.area.name}</td>
                    <td className="px-4 py-2">{relation.note}</td>
                    <td className="px-4 py-2 text-right">
                      {relation.canDelete ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={remove.isPending}
                          aria-label={t('relations.removeLabel', { name: relation.other.name })}
                          onClick={() => {
                            if (
                              window.confirm(
                                t('relations.confirm.remove', { name: relation.other.name }),
                              )
                            ) {
                              remove.mutate(relation.id);
                            }
                          }}
                        >
                          <Trash2 aria-hidden="true" className="size-4" />
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <FormError message={remove.isError ? relationErrorMessage(remove.error, t) : null} />

        {canEdit ? <AddRelationForm element={element} /> : null}
      </CardContent>
    </Card>
  );
}
