import { Outlet } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

/** Centered layout for setup, login and MFA pages. */
export function AuthLayout() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary px-4 py-10 text-foreground">
      <div className="grid w-full max-w-md gap-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold">{t('app.name')}</h1>
          <p className="text-sm text-muted-foreground">{t('app.tagline')}</p>
        </div>
        <Outlet />
      </div>
    </div>
  );
}
