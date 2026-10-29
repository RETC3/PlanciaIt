import {
  assetFieldDefinitionsSchema,
  assetFieldKindSchema,
  type AssetFieldKind,
  type AssetType,
} from '@planciait/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { Field, FormError } from '@/features/auth/form';
import {
  assetTypesQueryKey,
  createAssetType,
  deleteAssetType,
  listAssetTypes,
  updateAssetType,
} from './api';
import { fieldKeyFromLabel } from './custom-fields';
import { inventoryErrorMessage } from './errors';

interface FieldDraft {
  /** Stable React key; field keys can be edited while the row is new. */
  rowId: number;
  key: string;
  label: string;
  kind: AssetFieldKind;
  required: boolean;
  /** One option per line, for select fields. */
  options: string;
  /** Saved fields keep their key: stored values are filed under it. */
  saved: boolean;
}

let nextRowId = 0;

function draftsFromType(type: AssetType | null): FieldDraft[] {
  return (type?.fields ?? []).map((field) => ({
    rowId: nextRowId++,
    key: field.key,
    label: field.label,
    kind: field.kind,
    required: field.required,
    options: field.kind === 'select' ? field.options.join('\n') : '',
    saved: true,
  }));
}

function FieldRow({
  draft,
  onChange,
  onRemove,
}: {
  draft: FieldDraft;
  onChange: (draft: FieldDraft) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const id = `field-${draft.rowId}`;
  return (
    <div className="grid gap-3 rounded-md border p-3 sm:grid-cols-[1fr_1fr_10rem_auto]">
      <div className="grid gap-2">
        <Label htmlFor={`${id}-label`}>{t('inventory.types.fieldLabel')}</Label>
        <Input
          id={`${id}-label`}
          required
          maxLength={100}
          value={draft.label}
          onChange={(event) => onChange({ ...draft, label: event.target.value })}
          onBlur={() => {
            if (!draft.saved && draft.key === '' && draft.label.trim() !== '') {
              onChange({ ...draft, key: fieldKeyFromLabel(draft.label) });
            }
          }}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${id}-key`}>{t('inventory.types.fieldKey')}</Label>
        <Input
          id={`${id}-key`}
          required
          pattern="[a-z][a-z0-9_]{0,39}"
          className="font-mono"
          disabled={draft.saved}
          value={draft.key}
          onChange={(event) => onChange({ ...draft, key: event.target.value })}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${id}-kind`}>{t('inventory.types.fieldKind')}</Label>
        <NativeSelect
          id={`${id}-kind`}
          value={draft.kind}
          onChange={(event) => onChange({ ...draft, kind: event.target.value as AssetFieldKind })}
        >
          {assetFieldKindSchema.options.map((kind) => (
            <option key={kind} value={kind}>
              {t(`inventory.types.kinds.${kind}`)}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="flex items-end gap-3">
        <label className="flex h-9 items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4"
            checked={draft.required}
            onChange={(event) => onChange({ ...draft, required: event.target.checked })}
          />
          {t('inventory.types.fieldRequired')}
        </label>
        <Button
          variant="ghost"
          size="sm"
          aria-label={t('inventory.types.removeField', { label: draft.label || draft.key })}
          onClick={onRemove}
        >
          <Trash2 aria-hidden="true" className="size-4" />
        </Button>
      </div>
      {draft.kind === 'select' ? (
        <div className="grid gap-2 sm:col-span-4">
          <Label htmlFor={`${id}-options`}>{t('inventory.types.fieldOptions')}</Label>
          <Textarea
            id={`${id}-options`}
            required
            value={draft.options}
            onChange={(event) => onChange({ ...draft, options: event.target.value })}
          />
        </div>
      ) : null}
    </div>
  );
}

function TypeEditor({ type, onDone }: { type: AssetType | null; onDone: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [name, setName] = useState(type?.name ?? '');
  const [description, setDescription] = useState(type?.description ?? '');
  const [fields, setFields] = useState<FieldDraft[]>(() => draftsFromType(type));
  const [invalid, setInvalid] = useState(false);

  const mutation = useMutation({
    mutationFn: (request: Parameters<typeof createAssetType>[0]) =>
      type ? updateAssetType(type.id, request) : createAssetType(request),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: assetTypesQueryKey });
      onDone();
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = assetFieldDefinitionsSchema.safeParse(
      fields.map((field) => ({
        key: field.key,
        label: field.label,
        kind: field.kind,
        required: field.required,
        ...(field.kind === 'select'
          ? {
              options: field.options
                .split('\n')
                .map((option) => option.trim())
                .filter((option) => option !== ''),
            }
          : {}),
      })),
    );
    if (!parsed.success) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    mutation.mutate({ name, description, fields: parsed.data });
  }

  return (
    <Card className="border-primary">
      <CardHeader>
        <CardTitle>
          {type
            ? t('inventory.types.editTitle', { name: type.name })
            : t('inventory.types.newTitle')}
        </CardTitle>
        {type && type.assetCount > 0 ? (
          <CardDescription>
            {t('inventory.types.inUseHint', { count: type.assetCount })}
          </CardDescription>
        ) : null}
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:max-w-md">
            <Field
              id="typeName"
              label={t('inventory.types.name')}
              required
              maxLength={100}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <div className="grid gap-2">
              <Label htmlFor="typeDescription">{t('inventory.types.description')}</Label>
              <Textarea
                id="typeDescription"
                maxLength={1000}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-3">
            <p className="text-sm font-medium">{t('inventory.types.fields')}</p>
            {fields.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('inventory.types.noFields')}</p>
            ) : null}
            {fields.map((field) => (
              <FieldRow
                key={field.rowId}
                draft={field}
                onChange={(next) =>
                  setFields((current) =>
                    current.map((candidate) => (candidate.rowId === next.rowId ? next : candidate)),
                  )
                }
                onRemove={() =>
                  setFields((current) =>
                    current.filter((candidate) => candidate.rowId !== field.rowId),
                  )
                }
              />
            ))}
            <div>
              <Button
                variant="outline"
                size="sm"
                disabled={fields.length >= 30}
                onClick={() =>
                  setFields((current) => [
                    ...current,
                    {
                      rowId: nextRowId++,
                      key: '',
                      label: '',
                      kind: 'text',
                      required: false,
                      options: '',
                      saved: false,
                    },
                  ])
                }
              >
                <Plus aria-hidden="true" className="size-4" />
                {t('inventory.types.addField')}
              </Button>
            </div>
          </div>

          <FormError
            message={
              invalid
                ? t('inventory.types.invalidFields')
                : mutation.isError
                  ? inventoryErrorMessage(mutation.error, t)
                  : null
            }
          />
          <div className="flex gap-2">
            <Button type="submit" disabled={mutation.isPending}>
              {t('common.save')}
            </Button>
            <Button variant="ghost" onClick={onDone}>
              {t('common.cancel')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export function AssetTypesPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const types = useQuery({ queryKey: assetTypesQueryKey, queryFn: listAssetTypes });
  /** null: editor closed; 'new' or the type being edited. */
  const [editing, setEditing] = useState<AssetType | 'new' | null>(null);

  const removal = useMutation({
    mutationFn: deleteAssetType,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: assetTypesQueryKey }),
  });

  return (
    <div className="grid max-w-5xl gap-6">
      <Link
        to="/assets"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        {t('inventory.title')}
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{t('inventory.types.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('inventory.types.pageDescription')}</p>
        </div>
        {editing === null ? (
          <Button onClick={() => setEditing('new')}>
            <Plus aria-hidden="true" className="size-4" />
            {t('inventory.types.newTitle')}
          </Button>
        ) : null}
      </div>

      {editing !== null ? (
        <TypeEditor
          key={editing === 'new' ? 'new' : editing.id}
          type={editing === 'new' ? null : editing}
          onDone={() => setEditing(null)}
        />
      ) : null}

      <FormError message={removal.isError ? inventoryErrorMessage(removal.error, t) : null} />

      {types.isPending ? (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : types.isError ? (
        <FormError message={t('auth.errors.generic')} />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-left">
              <tr>
                <th className="px-4 py-2 font-medium">{t('inventory.types.name')}</th>
                <th className="px-4 py-2 font-medium">{t('inventory.types.fields')}</th>
                <th className="px-4 py-2 font-medium">{t('inventory.types.assets')}</th>
                <th className="px-4 py-2">
                  <span className="sr-only">{t('areas.members.actions')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {types.data.map((type) => (
                <tr key={type.id} className="border-t">
                  <td className="px-4 py-2">
                    <p className="font-medium">{type.name}</p>
                    {type.description ? (
                      <p className="text-xs text-muted-foreground">{type.description}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {type.fields.map((field) => field.label).join(', ') || '—'}
                  </td>
                  <td className="px-4 py-2">{type.assetCount}</td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={t('inventory.types.edit', { name: type.name })}
                      onClick={() => setEditing(type)}
                    >
                      <Pencil aria-hidden="true" className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={type.assetCount > 0 || removal.isPending}
                      title={type.assetCount > 0 ? t('inventory.types.inUse') : undefined}
                      aria-label={t('inventory.types.delete', { name: type.name })}
                      onClick={() => {
                        if (
                          window.confirm(t('inventory.confirm.deleteType', { name: type.name }))
                        ) {
                          removal.mutate(type.id);
                        }
                      }}
                    >
                      <Trash2 aria-hidden="true" className="size-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
