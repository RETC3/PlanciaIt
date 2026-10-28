import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import { HomePage } from './routes/home-page';
import { RootLayout } from './routes/root-layout';

const rootRoute = createRootRoute({ component: RootLayout });

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: HomePage,
});

export const router = createRouter({ routeTree: rootRoute.addChildren([homeRoute]) });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
