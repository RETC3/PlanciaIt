import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Outlet, useNavigate, useRouterState } from '@tanstack/react-router';
import {
  Boxes,
  FolderTree,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Settings2,
  Sun,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Brand } from '@/components/brand';
import { Button } from '@/components/ui/button';
import { fetchSession, logout, sessionQueryKey } from '@/features/auth/api';
import { UserRoleLabel } from '@/features/users/user-badges';
import { SearchBox } from '@/features/search/search-box';
import { useTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';

const navLinkClass =
  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground [&>svg]:size-4 [&>svg]:shrink-0';
const activeNavLinkClass =
  'bg-sidebar-accent font-medium text-sidebar-accent-foreground [&>svg]:text-sidebar-primary';

function NavItem({
  to,
  icon: Icon,
  exact,
  children,
}: {
  to: '/' | '/assets' | '/areas' | '/users' | '/asset-types';
  icon: LucideIcon;
  exact?: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      to={to}
      className={navLinkClass}
      activeProps={{ className: activeNavLinkClass }}
      activeOptions={{ exact: exact ?? false }}
    >
      <Icon aria-hidden="true" />
      {children}
    </Link>
  );
}

function NavSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="grid gap-1">
      <p className="px-3 pb-1 text-[0.65rem] font-semibold tracking-wider text-sidebar-muted uppercase">
        {title}
      </p>
      {children}
    </div>
  );
}

/** First letters of the first two words of a name, for the avatar. */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('');
}

/** Layout for signed-in pages; the route guard guarantees an authenticated session. */
export function AppLayout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const session = useQuery({ queryKey: sessionQueryKey, queryFn: fetchSession });
  const user = session.data?.user;
  const isAdmin = user?.role === 'admin';
  const [theme, toggleTheme] = useTheme();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  // On small screens the menu covers the page: it is open only on the page where it was
  // opened, so picking a page closes it.
  const [menuOpenOn, setMenuOpenOn] = useState<string | null>(null);
  const menuOpen = menuOpenOn === pathname;
  const setMenuOpen = (open: boolean) => setMenuOpenOn(open ? pathname : null);

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSettled: async () => {
      queryClient.clear();
      await navigate({ to: '/login' });
    },
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      {menuOpen ? (
        <div
          aria-hidden="true"
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setMenuOpen(false)}
        />
      ) : null}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-sidebar transition-transform lg:translate-x-0',
          menuOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center justify-between px-5 py-5">
          <Brand inverted />
          <button
            type="button"
            className="rounded-md p-1 text-sidebar-foreground hover:bg-sidebar-accent lg:hidden"
            aria-label={t('nav.closeMenu')}
            onClick={() => setMenuOpen(false)}
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </div>
        <nav
          aria-label={t('nav.label')}
          className="grid flex-1 content-start gap-6 overflow-y-auto px-3 py-2"
        >
          <NavSection title={t('nav.sections.general')}>
            <NavItem to="/" icon={LayoutDashboard} exact>
              {t('nav.home')}
            </NavItem>
            <NavItem to="/assets" icon={Boxes}>
              {t('nav.inventory')}
            </NavItem>
            <NavItem to="/areas" icon={FolderTree}>
              {t('nav.areas')}
            </NavItem>
          </NavSection>
          {isAdmin ? (
            <NavSection title={t('nav.sections.admin')}>
              <NavItem to="/users" icon={Users}>
                {t('nav.users')}
              </NavItem>
              <NavItem to="/asset-types" icon={Settings2}>
                {t('nav.assetTypes')}
              </NavItem>
            </NavSection>
          ) : null}
        </nav>
        <div className="flex items-center gap-3 border-t border-sidebar-border px-4 py-4">
          <span
            aria-hidden="true"
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sidebar-primary/20 text-xs font-semibold text-sidebar-primary"
          >
            {initials(user?.displayName ?? '')}
          </span>
          <div className="grid min-w-0 flex-1 leading-tight">
            <span className="truncate text-sm font-medium text-sidebar-accent-foreground">
              {user?.displayName}
            </span>
            <span className="truncate text-xs text-sidebar-muted">
              {user ? <UserRoleLabel role={user.role} /> : null}
            </span>
          </div>
          <button
            type="button"
            className="rounded-md p-2 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground disabled:opacity-50"
            aria-label={t('auth.logout')}
            title={t('auth.logout')}
            disabled={logoutMutation.isPending}
            onClick={() => logoutMutation.mutate()}
          >
            <LogOut aria-hidden="true" className="size-4" />
          </button>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b bg-card/90 px-4 py-3 backdrop-blur sm:px-6">
          <Button
            variant="ghost"
            size="sm"
            className="lg:hidden"
            aria-label={t('nav.openMenu')}
            onClick={() => setMenuOpen(true)}
          >
            <Menu aria-hidden="true" className="size-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <SearchBox />
          </div>
          <Button
            variant="ghost"
            size="sm"
            aria-label={theme === 'dark' ? t('theme.light') : t('theme.dark')}
            title={theme === 'dark' ? t('theme.light') : t('theme.dark')}
            onClick={toggleTheme}
          >
            {theme === 'dark' ? (
              <Sun aria-hidden="true" className="size-4" />
            ) : (
              <Moon aria-hidden="true" className="size-4" />
            )}
          </Button>
        </header>
        <main className="p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
