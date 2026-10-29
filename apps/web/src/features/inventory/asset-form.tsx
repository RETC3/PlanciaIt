import {
  assetStatusSchema,
  validateCustomFields,
  type AreaSummary,
  type AssetDetail,
  type AssetFieldDefinition,
  type AssetStatus,
  type AssetType,
  type CreateAssetRequest,
} from '@planciait/shared';
import { useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { Field, FormError } from '@/features/auth/form';
import { draftFromValues, inputFromDraft, type CustomFieldDraft } from './custom-fields';
import { inventoryErrorMessage } from './errors';

const textFields = [
  'hostname',
  'ipAddress',
  'serialNumber',
  'manufacturer',
  'model',
  'location',
] as const;
type TextField = (typeof textFields)[number];

const maxLength = {
  hostname: 255,
  ipAddress: 45,
  serialNumber: 100,
  manufacturer: 100,
  model: 100,
  location: 200,
} as const satisfies Record<TextField, number>;

function CustomFieldInputControl({
  field,
  value,
  invalid,
  onChange,
}: {
  field: AssetFieldDefinition;
  value: string | boolean | undefined;
  invalid: boolean;
  onChange: (value: string | boolean) => void;
}) {
  const { t } = useTranslation();
  const id = `custom-${field.key}`;
  if (field.kind === 'boolean') {
    return (
      <label className="flex items-center gap-2 text-sm">
        <input
          id={id}
          type="checkbox"
          className="size-4"
          checked={value === true}
          onChange={(event) => onChange(event.target.checked)}
        />
        {field.label}
      </label>
    );
  }
  const text = typeof value === 'string' ? value : '';
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>
        {field.label}
        {field.required ? ' *' : ''}
      </Label>
      {field.kind === 'select' ? (
        <NativeSelect
          id={id}
          value={text}
          aria-invalid={invalid}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">{t('inventory.form.none')}</option>
          {field.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </NativeSelect>
      ) : (
        <Input
          id={id}
          type={field.kind === 'date' ? 'date' : 'text'}
          inputMode={field.kind === 'number' ? 'decimal' : undefined}
          maxLength={1000}
          value={text}
          aria-invalid={invalid}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </div>
  );
}

/**
 * Create and edit form. Custom fields follow the selected type and are
 * checked in the browser with the same rules the API applies.
 */
export function AssetForm({
  asset,
  areas,
  types,
  error,
  disabled,
  onSubmit,
  children,
}: {
  /** Absent when creating. */
  asset?: AssetDetail;
  /** Areas the user may write to: the asset can be placed or moved there. */
  areas: AreaSummary[];
  types: AssetType[];
  error: unknown;
  disabled?: boolean;
  onSubmit: (request: CreateAssetRequest) => void;
  /** The submit and cancel buttons. */
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const [areaId, setAreaId] = useState(asset?.area.id ?? areas[0]?.id ?? '');
  const [typeId, setTypeId] = useState(asset?.type.id ?? types[0]?.id ?? '');
  const [name, setName] = useState(asset?.name ?? '');
  const [status, setStatus] = useState<AssetStatus>(asset?.status ?? 'in_use');
  const [text, setText] = useState<Record<TextField, string>>(() => ({
    hostname: asset?.hostname ?? '',
    ipAddress: asset?.ipAddress ?? '',
    serialNumber: asset?.serialNumber ?? '',
    manufacturer: asset?.manufacturer ?? '',
    model: asset?.model ?? '',
    location: asset?.location ?? '',
  }));
  const [notes, setNotes] = useState(asset?.notes ?? '');
  const type = types.find((candidate) => candidate.id === typeId);
  const fields = type?.fields ?? [];
  const [draft, setDraft] = useState<CustomFieldDraft>(() =>
    draftFromValues(fields, asset?.customFields ?? {}),
  );
  const [invalidKeys, setInvalidKeys] = useState<string[]>([]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const customFields = inputFromDraft(fields, draft);
    const check = validateCustomFields(fields, customFields);
    if (!check.success) {
      setInvalidKeys(check.issues.map((issue) => issue.key));
      return;
    }
    setInvalidKeys([]);
    onSubmit({ areaId, typeId, name, status, ...text, notes, customFields });
  }

  // The area of an asset the user can only read is shown but cannot change.
  const areaOptions =
    asset && !areas.some((area) => area.id === asset.area.id)
      ? [{ id: asset.area.id, name: asset.area.name }, ...areas]
      : areas;

  return (
    <form className="grid gap-6" onSubmit={handleSubmit}>
      <fieldset disabled={disabled} className="grid gap-4 sm:grid-cols-2">
        <Field
          id="assetName"
          label={`${t('inventory.fields.name')} *`}
          autoComplete="off"
          required
          maxLength={200}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <div className="grid gap-2">
          <Label htmlFor="assetStatus">{t('inventory.fields.status')}</Label>
          <NativeSelect
            id="assetStatus"
            value={status}
            onChange={(event) => setStatus(event.target.value as AssetStatus)}
          >
            {assetStatusSchema.options.map((value) => (
              <option key={value} value={value}>
                {t(`inventory.status.${value}`)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="assetArea">{t('inventory.fields.area')}</Label>
          <NativeSelect
            id="assetArea"
            value={areaId}
            required
            onChange={(event) => setAreaId(event.target.value)}
          >
            {areaOptions.map((area) => (
              <option key={area.id} value={area.id}>
                {area.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="assetType">{t('inventory.fields.type')}</Label>
          <NativeSelect
            id="assetType"
            value={typeId}
            required
            onChange={(event) => {
              const next = types.find((candidate) => candidate.id === event.target.value);
              setTypeId(event.target.value);
              // Keep what was typed for fields with the same key in the new type.
              if (next) {
                setDraft((current) => ({
                  ...draftFromValues(next.fields, {}),
                  ...Object.fromEntries(
                    next.fields
                      .filter((field) => field.key in current)
                      .map((field) => [field.key, current[field.key] ?? '']),
                  ),
                }));
              }
            }}
          >
            {types.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        {textFields.map((key) => (
          <Field
            key={key}
            id={`asset-${key}`}
            label={t(`inventory.fields.${key}`)}
            autoComplete="off"
            maxLength={maxLength[key]}
            value={text[key]}
            onChange={(event) => setText((current) => ({ ...current, [key]: event.target.value }))}
          />
        ))}
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="assetNotes">{t('inventory.fields.notes')}</Label>
          <Textarea
            id="assetNotes"
            maxLength={5000}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </div>
      </fieldset>

      {fields.length > 0 ? (
        <fieldset disabled={disabled} className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-2 text-sm font-medium">
            {t('inventory.form.customFields', { type: type?.name })}
          </legend>
          {fields.map((field) => (
            <CustomFieldInputControl
              key={field.key}
              field={field}
              value={draft[field.key]}
              invalid={invalidKeys.includes(field.key)}
              onChange={(value) => setDraft((current) => ({ ...current, [field.key]: value }))}
            />
          ))}
        </fieldset>
      ) : null}

      <FormError
        message={
          invalidKeys.length > 0
            ? t('inventory.form.invalidCustomFields', {
                fields: fields
                  .filter((field) => invalidKeys.includes(field.key))
                  .map((field) => field.label)
                  .join(', '),
              })
            : error
              ? inventoryErrorMessage(error, t)
              : null
        }
      />
      {children}
    </form>
  );
}
