import type { SessionResponse, SessionStage } from '@planciait/shared';
import type { QueryClient } from '@tanstack/react-query';
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from '@tanstack/react-router';
import {
  fetchSession,
  fetchSetupRequired,
  sessionQueryKey,
  setupStatusQueryKey,
} from './features/auth/api';
import { AreaDetailPage } from './features/areas/area-detail-page';
import { AreasPage } from './features/areas/areas-page';
import { InvitePage } from './features/auth/invite-page';
import { AssetDetailPage } from './features/inventory/asset-detail-page';
import { AssetImportPage } from './features/inventory/asset-import-page';
import { AssetNewPage } from './features/inventory/asset-new-page';
import { AssetTypesPage } from './features/inventory/asset-types-page';
import { AssetsPage } from './features/inventory/assets-page';
import { LoginPage } from './features/auth/login-page';
import { MfaEnrollPage } from './features/auth/mfa-enroll-page';
import { MfaVerifyPage } from './features/auth/mfa-verify-page';
import { SearchPage } from './features/search/search-page';
import { SetupPage } from './features/auth/setup-page';
import { UserDetailPage } from './features/users/user-detail-page';
import { UsersPage } from './features/users/users-page';
import { queryClient } from './lib/query-client';
import { AppLayout } from './routes/app-layout';
import { AuthLayout } from './routes/auth-layout';
import { HomePage } from './routes/home-page';

interface RouterContext {
  queryClient: QueryClient;
}

/** Where a session at a given stage belongs. */
const stageHome = {
  mfa_enrollment: '/mfa/enroll',
  mfa_verification: '/mfa/verify',
  authenticated: '/',
} as const satisfies Record<SessionStage, string>;

// UX only: the API enforces every one of these rules on its own.
async function loadSession(context: RouterContext): Promise<SessionResponse | null> {
  return context.queryClient.fetchQuery({
    queryKey: sessionQueryKey,
    queryFn: fetchSession,
    staleTime: 0,
  });
}

async function loadSetupRequired(context: RouterContext): Promise<boolean> {
  return context.queryClient.fetchQuery({
    queryKey: setupStatusQueryKey,
    queryFn: fetchSetupRequired,
  });
}

async function signInPath(context: RouterContext): Promise<'/setup' | '/login'> {
  return (await loadSetupRequired(context)) ? '/setup' : '/login';
}

const rootRoute = createRootRouteWithContext<RouterContext>()({ component: Outlet });

const authLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'auth',
  component: AuthLayout,
});

const setupRoute = createRoute({
  getParentRoute: () => authLayoutRoute,
  path: '/setup',
  component: SetupPage,
  beforeLoad: async ({ context }) => {
    const session = await loadSession(context);
    if (session) throw redirect({ to: stageHome[session.stage] });
    if (!(await loadSetupRequired(context))) throw redirect({ to: '/login' });
  },
});

const loginRoute = createRoute({
  getParentRoute: () => authLayoutRoute,
  path: '/login',
  component: LoginPage,
  beforeLoad: async ({ context }) => {
    const session = await loadSession(context);
    if (session) throw redirect({ to: stageHome[session.stage] });
    if (await loadSetupRequired(context)) throw redirect({ to: '/setup' });
  },
});

/** Open to anyone holding a link; the token itself is checked by the API. */
const inviteRoute = createRoute({
  getParentRoute: () => authLayoutRoute,
  path: '/invite',
  component: InvitePage,
});

function requireStage(stage: SessionStage) {
  return async ({ context }: { context: RouterContext }) => {
    const session = await loadSession(context);
    if (!session) throw redirect({ to: await signInPath(context) });
    if (session.stage !== stage) throw redirect({ to: stageHome[session.stage] });
  };
}

const mfaEnrollRoute = createRoute({
  getParentRoute: () => authLayoutRoute,
  path: '/mfa/enroll',
  component: MfaEnrollPage,
  beforeLoad: requireStage('mfa_enrollment'),
});

const mfaVerifyRoute = createRoute({
  getParentRoute: () => authLayoutRoute,
  path: '/mfa/verify',
  component: MfaVerifyPage,
  beforeLoad: requireStage('mfa_verification'),
});

const appLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'app',
  component: AppLayout,
  beforeLoad: requireStage('authenticated'),
});

const homeRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/',
  component: HomePage,
});

/** Open to every role: the API returns only the areas the user may see. */
const areasRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/areas',
  component: AreasPage,
});

const areaDetailRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/areas/$areaId',
  component: function AreaDetailRoute() {
    const { areaId } = areaDetailRoute.useParams();
    return <AreaDetailPage areaId={areaId} />;
  },
});

const assetsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/assets',
  component: AssetsPage,
});

const assetNewRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/assets/new',
  component: AssetNewPage,
});

const assetImportRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/assets/import',
  component: AssetImportPage,
});

const assetDetailRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/assets/$assetId',
  component: function AssetDetailRoute() {
    const { assetId } = assetDetailRoute.useParams();
    return <AssetDetailPage assetId={assetId} />;
  },
});

/** Open to every role: the API returns only what is in the user's areas. */
const searchRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/search',
  validateSearch: (search: Record<string, unknown>): { q: string } => ({
    q: typeof search.q === 'string' ? search.q : '',
  }),
  component: function SearchRoute() {
    const { q } = searchRoute.useSearch();
    // Keyed by the text so that a new search starts from the first results.
    return <SearchPage key={q} q={q} />;
  },
});

const adminRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  id: 'admin',
  beforeLoad: async ({ context }) => {
    const session = await loadSession(context);
    if (session?.user.role !== 'admin') throw redirect({ to: '/' });
  },
});

const usersRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: '/users',
  component: UsersPage,
});

const userDetailRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: '/users/$userId',
  component: function UserDetailRoute() {
    const { userId } = userDetailRoute.useParams();
    return <UserDetailPage userId={userId} />;
  },
});

const assetTypesRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: '/asset-types',
  component: AssetTypesPage,
});

const routeTree = rootRoute.addChildren([
  authLayoutRoute.addChildren([
    setupRoute,
    loginRoute,
    inviteRoute,
    mfaEnrollRoute,
    mfaVerifyRoute,
  ]),
  appLayoutRoute.addChildren([
    homeRoute,
    areasRoute,
    areaDetailRoute,
    assetsRoute,
    assetNewRoute,
    assetImportRoute,
    assetDetailRoute,
    searchRoute,
    adminRoute.addChildren([usersRoute, userDetailRoute, assetTypesRoute]),
  ]),
]);

export const router = createRouter({ routeTree, context: { queryClient } });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
