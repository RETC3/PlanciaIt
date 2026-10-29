import { Outlet } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Brand } from '@/components/brand';

/** Centered layout for setup, login and MFA pages. */
export function AuthLayout() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10 text-foreground">
      <div className="grid w-full max-w-md gap-6">
        <div className="grid justify-items-center gap-3 text-center">
          <Brand />
          <p className="text-sm text-muted-foreground">{t('app.tagline')}</p>
        </div>
        <Outlet />
      </div>
    </div>
  );
}
