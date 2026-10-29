import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { fetchHealth, healthQueryKey } from './api';

const components = ['api', 'database'] as const;

export function HealthStatus() {
  const { t } = useTranslation();
  const { data, isPending, isError } = useQuery({
    queryKey: healthQueryKey,
    queryFn: fetchHealth,
    refetchInterval: 30_000,
  });

  return (
    <section className="rounded-xl border bg-card p-5 text-card-foreground shadow-xs">
      <h2 className="mb-3 text-sm font-semibold">{t('health.title')}</h2>
      {isPending ? (
        <p className="text-sm text-muted-foreground">{t('health.loading')}</p>
      ) : isError ? (
        <Badge variant="destructive">{t('health.unreachable')}</Badge>
      ) : (
        <div className="space-y-2">
          <Badge variant={data.status === 'ok' ? 'default' : 'destructive'}>
            {t(`health.status.${data.status}`)}
          </Badge>
          <ul className="space-y-1 text-sm">
            {components.map((component) => (
              <li key={component} className="flex justify-between gap-4">
                <span>{t(`health.components.${component}`)}</span>
                <span>{t(`health.componentStatus.${data.checks[component]}`)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
