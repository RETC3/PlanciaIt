import { useTranslation } from 'react-i18next';
import { HealthStatus } from '@/features/health/health-status';

export function HomePage() {
  const { t } = useTranslation();
  return (
    <div className="grid max-w-6xl gap-6">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t('home.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('home.description')}</p>
      </div>
      <div className="max-w-sm">
        <HealthStatus />
      </div>
    </div>
  );
}
