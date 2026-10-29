import type { TFunction } from 'i18next';
import { ApiError } from '@/lib/api';

/** User-facing message for a failed area request. */
export function areaErrorMessage(error: unknown, t: TFunction) {
  if (error instanceof ApiError && error.status === 409) return t('areas.errors.nameTaken');
  if (error instanceof ApiError && error.status === 400) return t('areas.errors.invalidInput');
  if (error instanceof ApiError && error.status === 404) return t('areas.errors.notFound');
  return t('auth.errors.generic');
}
