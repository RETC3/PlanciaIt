import type { AreaPermission } from '@planciait/shared';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';

export function AreaPermissionBadge({ permission }: { permission: AreaPermission }) {
  const { t } = useTranslation();
  return (
    <Badge variant={permission === 'write' ? 'default' : 'secondary'}>
      {t(`areas.permissions.${permission}`)}
    </Badge>
  );
}
