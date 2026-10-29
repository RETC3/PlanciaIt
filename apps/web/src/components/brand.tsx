import { Gauge } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

/** Logo mark and product name. */
export function Brand({ className, inverted }: { className?: string; inverted?: boolean }) {
  const { t } = useTranslation();
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Gauge aria-hidden="true" className="size-5" />
      </span>
      <span className="grid leading-tight">
        <span
          className={cn(
            'text-sm font-semibold',
            inverted ? 'text-sidebar-accent-foreground' : 'text-foreground',
          )}
        >
          {t('app.name')}
        </span>
        <span
          className={cn(
            'text-[0.65rem] font-medium tracking-wider uppercase',
            inverted ? 'text-sidebar-muted' : 'text-muted-foreground',
          )}
        >
          {t('app.label')}
        </span>
      </span>
    </div>
  );
}
