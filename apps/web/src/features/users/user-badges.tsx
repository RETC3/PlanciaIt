import type { UserRole, UserStatus } from '@planciait/shared';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';

const statusVariant = {
  active: 'default',
  invited: 'secondary',
  mfa_pending: 'secondary',
  invitation_expired: 'outline',
  disabled: 'destructive',
} as const satisfies Record<UserStatus, 'default' | 'secondary' | 'outline' | 'destructive'>;

export function UserStatusBadge({ status }: { status: UserStatus }) {
  const { t } = useTranslation();
  return <Badge variant={statusVariant[status]}>{t(`users.status.${status}`)}</Badge>;
}

export function UserRoleLabel({ role }: { role: UserRole }) {
  const { t } = useTranslation();
  return <>{t(`users.roles.${role}`)}</>;
}
