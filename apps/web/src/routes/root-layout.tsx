import { Outlet } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

export function RootLayout() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b px-6 py-4">
        <h1 className="text-lg font-semibold">{t('app.name')}</h1>
        <p className="text-sm text-muted-foreground">{t('app.tagline')}</p>
      </header>
      <main className="p-6">
        <Outlet />
      </main>
    </div>
  );
}
