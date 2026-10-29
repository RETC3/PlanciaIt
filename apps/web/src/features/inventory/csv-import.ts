import {
  assetStatusSchema,
  importAssetRowSchema,
  validateCustomFields,
  type AssetFieldDefinition,
  type AssetStatus,
  type CustomFieldInput,
  type ImportAssetRow,
} from '@planciait/shared';
import type { CsvTable } from '@/lib/csv';

export const commonTargets = [
  'name',
  'status',
  'hostname',
  'ipAddress',
  'serialNumber',
  'manufacturer',
  'model',
  'location',
  'notes',
] as const;
export type CommonTarget = (typeof commonTargets)[number];

/** Where a CSV column goes: a common field or `custom:<key>` of the asset type. */
export type ImportTarget = CommonTarget | `custom:${string}`;
/** One entry per CSV column; null ignores the column. */
export type ColumnMapping = (ImportTarget | null)[];

export function customTarget(key: string): ImportTarget {
  return `custom:${key}`;
}

/** Lowercase, no accents, letters and digits only: "N° di serie" → "ndiserie". */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** Common header spellings besides the field key and the Italian label. */
const aliases: Partial<Record<CommonTarget, string[]>> = {
  name: ['nome', 'asset', 'nomeasset'],
  hostname: ['host', 'fqdn', 'nomehost'],
  ipAddress: ['ip', 'indirizzo', 'ipv4', 'indirizzoip'],
  serialNumber: ['serial', 'seriale', 'sn', 'serie', 'matricola', 'numerodiserie'],
  manufacturer: ['marca', 'vendor', 'produttore'],
  model: ['modello'],
  location: ['posizione', 'sede', 'ubicazione'],
  notes: ['note', 'descrizione', 'commenti'],
  status: ['stato'],
};

/** Matches headers to fields by key, label or alias; each field is used at most once. */
export function suggestMapping(
  headers: readonly string[],
  fields: readonly AssetFieldDefinition[],
  labels: Readonly<Record<CommonTarget, string>>,
): ColumnMapping {
  const candidates = new Map<string, ImportTarget>();
  for (const target of commonTargets) {
    for (const name of [target, labels[target], ...(aliases[target] ?? [])]) {
      candidates.set(normalize(name), target);
    }
  }
  for (const field of fields) {
    candidates.set(normalize(field.key), customTarget(field.key));
    candidates.set(normalize(field.label), customTarget(field.key));
  }
  const used = new Set<ImportTarget>();
  return headers.map((header) => {
    const target = candidates.get(normalize(header));
    if (!target || used.has(target)) return null;
    used.add(target);
    return target;
  });
}

const trueWords = new Set(['si', 'yes', 'true', 'vero', '1', 'x']);
const falseWords = new Set(['no', 'false', 'falso', '0']);

/** Turns CSV text into the value the API expects for a custom field kind. */
function customValue(field: AssetFieldDefinition, raw: string): string | number | boolean | null {
  const text = raw.trim();
  if (text === '') return null;
  switch (field.kind) {
    case 'number': {
      const number = Number(text.replace(/\s/g, '').replace(',', '.'));
      return Number.isFinite(number) ? number : text;
    }
    case 'boolean': {
      const word = normalize(text);
      return trueWords.has(word) ? true : falseWords.has(word) ? false : text;
    }
    case 'date': {
      const italian = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text);
      if (!italian) return text;
      const [, day = '', month = '', year = ''] = italian;
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
    case 'select':
      return field.options.find((option) => normalize(option) === normalize(text)) ?? text;
    case 'text':
      return text;
  }
}

function statusValue(
  raw: string,
  labels: Readonly<Record<AssetStatus, string>>,
): string | undefined {
  // An unrecognized value is passed through so validation reports it.
  const text = normalize(raw);
  if (text === '') return undefined;
  return (
    assetStatusSchema.options.find(
      (status) => normalize(status) === text || normalize(labels[status]) === text,
    ) ?? raw
  );
}

export interface ImportPreview {
  /** Rows ready to send, with their line number in the file (the header is line 1). */
  valid: { line: number; asset: ImportAssetRow }[];
  /** Rows that would be rejected, with the fields at fault. */
  invalid: { line: number; targets: ImportTarget[] }[];
}

/** Applies the mapping and checks every row with the same rules as the API. */
export function previewImport(
  table: CsvTable,
  mapping: ColumnMapping,
  fields: readonly AssetFieldDefinition[],
  statusLabels: Readonly<Record<AssetStatus, string>>,
): ImportPreview {
  const fieldByKey = new Map(fields.map((field) => [field.key, field]));
  const preview: ImportPreview = { valid: [], invalid: [] };

  table.rows.forEach((row, index) => {
    const line = index + 2;
    const asset: Record<string, unknown> = {};
    const customFields: CustomFieldInput = {};
    mapping.forEach((target, column) => {
      const raw = row[column] ?? '';
      if (target === null) return;
      if (target.startsWith('custom:')) {
        const field = fieldByKey.get(target.slice('custom:'.length));
        if (field) customFields[field.key] = customValue(field, raw);
      } else if (target === 'status') {
        asset.status = statusValue(raw, statusLabels);
      } else {
        asset[target] = raw;
      }
    });

    const targets = new Set<ImportTarget>();
    const parsed = importAssetRowSchema.safeParse({ ...asset, customFields });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const [first, second] = issue.path;
        if (first === 'customFields' && typeof second === 'string') {
          targets.add(customTarget(second));
        } else if (typeof first === 'string') {
          targets.add(first as CommonTarget);
        }
      }
    }
    const custom = validateCustomFields(fields, customFields);
    if (!custom.success) {
      for (const issue of custom.issues) targets.add(customTarget(issue.key));
    }

    if (parsed.success && custom.success) {
      preview.valid.push({ line, asset: { ...parsed.data, customFields: custom.values } });
    } else {
      preview.invalid.push({ line, targets: [...targets] });
    }
  });
  return preview;
}
