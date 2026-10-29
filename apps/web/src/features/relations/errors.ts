import type { TFunction } from 'i18next';
import { ApiError } from '@/lib/api';

/** User-facing message for a failed relation request. */
export function relationErrorMessage(error: unknown, t: TFunction) {
  if (error instanceof ApiError && error.status === 400) return t('relations.errors.invalidInput');
  if (error instanceof ApiError && error.status === 403) return t('relations.errors.forbidden');
  if (error instanceof ApiError && error.status === 404) return t('relations.errors.notFound');
  if (error instanceof ApiError && error.status === 409) return t('relations.errors.duplicate');
  return t('auth.errors.generic');
}
