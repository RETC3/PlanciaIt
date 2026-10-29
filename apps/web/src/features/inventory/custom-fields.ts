import type { AssetFieldDefinition, CustomFieldInput, CustomFieldValues } from '@planciait/shared';

/** What the form inputs hold: text for every kind except checkboxes. */
export type CustomFieldDraft = Record<string, string | boolean>;

export function draftFromValues(
  fields: readonly AssetFieldDefinition[],
  values: CustomFieldValues,
): CustomFieldDraft {
  const draft: CustomFieldDraft = {};
  for (const field of fields) {
    const value = values[field.key];
    draft[field.key] =
      field.kind === 'boolean' ? value === true : value === undefined ? '' : String(value);
  }
  return draft;
}

/**
 * Converts the inputs into the API shape. A number that does not parse is
 * sent as text, so validation reports it instead of silently dropping it.
 */
export function inputFromDraft(
  fields: readonly AssetFieldDefinition[],
  draft: CustomFieldDraft,
): CustomFieldInput {
  const input: CustomFieldInput = {};
  for (const field of fields) {
    const value = draft[field.key];
    if (field.kind === 'boolean') {
      input[field.key] = value === true;
    } else if (typeof value !== 'string' || value.trim() === '') {
      input[field.key] = null;
    } else if (field.kind === 'number') {
      const number = Number(value.trim().replace(',', '.'));
      input[field.key] = Number.isFinite(number) ? number : value;
    } else {
      input[field.key] = value;
    }
  }
  return input;
}

/** Suggests a field key from its label: "Data di acquisto" → "data_di_acquisto". */
export function fieldKeyFromLabel(label: string): string {
  const slug = label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
    .replace(/_+$/, '');
  return /^[a-z]/.test(slug) ? slug : `f_${slug}`.slice(0, 40).replace(/_+$/, '');
}
