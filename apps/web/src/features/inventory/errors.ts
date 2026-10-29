import type { TFunction } from 'i18next';
import { ApiError } from '@/lib/api';

/** User-facing message for a failed inventory request. */
export function inventoryErrorMessage(error: unknown, t: TFunction) {
  if (error instanceof ApiError && error.status === 400) return t('inventory.errors.invalidInput');
  if (error instanceof ApiError && error.status === 403) return t('inventory.errors.forbidden');
  if (error instanceof ApiError && error.status === 404) return t('inventory.errors.notFound');
  if (error instanceof ApiError && error.status === 409) return t('inventory.errors.conflict');
  return t('auth.errors.generic');
}
