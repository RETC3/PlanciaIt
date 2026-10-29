import type { AssetStatus } from '@planciait/shared';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';

const statusVariant = {
  in_use: 'default',
  in_stock: 'secondary',
  maintenance: 'outline',
  retired: 'destructive',
} as const satisfies Record<AssetStatus, 'default' | 'secondary' | 'outline' | 'destructive'>;

export function AssetStatusBadge({ status }: { status: AssetStatus }) {
  const { t } = useTranslation();
  return <Badge variant={statusVariant[status]}>{t(`inventory.status.${status}`)}</Badge>;
}
