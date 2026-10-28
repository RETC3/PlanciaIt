import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Outlet, useNavigate } from '@tanstack/react-router';
import { LogOut } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { fetchSession, logout, sessionQueryKey } from '@/features/auth/api';

const navLinkClass =
  'rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground';
const activeNavLinkClass = 'bg-secondary font-medium text-foreground';

/** Layout for signed-in pages; the route guard guarantees an authenticated session. */
export function AppLayout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const session = useQuery({ queryKey: sessionQueryKey, queryFn: fetchSession });
  const isAdmin = session.data?.user.role === 'admin';

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSettled: async () => {
      queryClient.clear();
      await navigate({ to: '/login' });
    },
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b px-6 py-3">
        <div className="flex flex-wrap items-center gap-6">
          <div>
            <p className="text-lg font-semibold">{t('app.name')}</p>
            <p className="text-xs text-muted-foreground">{t('app.tagline')}</p>
          </div>
          <nav className="flex gap-1">
            <Link
              to="/"
              className={navLinkClass}
              activeProps={{ className: activeNavLinkClass }}
              activeOptions={{ exact: true }}
            >
              {t('nav.home')}
            </Link>
            {isAdmin ? (
              <Link
                to="/users"
                className={navLinkClass}
                activeProps={{ className: activeNavLinkClass }}
              >
                {t('nav.users')}
              </Link>
            ) : null}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm">{session.data?.user.displayName}</span>
          <Button
            variant="outline"
            size="sm"
            disabled={logoutMutation.isPending}
            onClick={() => logoutMutation.mutate()}
          >
            <LogOut aria-hidden="true" className="size-4" />
            {t('auth.logout')}
          </Button>
        </div>
      </header>
      <main className="p-6">
        <Outlet />
      </main>
    </div>
  );
}
