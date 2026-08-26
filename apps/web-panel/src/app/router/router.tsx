import { type ReactElement, lazy } from 'react';
import { Navigate, RouterProvider, createBrowserRouter } from 'react-router-dom';

import { AppShell } from '@trapmap/web-panel/app/shell/app-shell';
import { useSessionStore } from '@trapmap/web-panel/stores/session-store';

const ActivityPage = lazy(() =>
  import('@trapmap/web-panel/pages/activity/activity-page').then(({ ActivityPage }) => ({
    default: ActivityPage,
  })),
);
const ArtifactsPage = lazy(() =>
  import('@trapmap/web-panel/pages/artifacts/artifacts-page').then(({ ArtifactsPage }) => ({
    default: ArtifactsPage,
  })),
);
const DashboardPage = lazy(() =>
  import('@trapmap/web-panel/pages/dashboard/dashboard-page').then(({ DashboardPage }) => ({
    default: DashboardPage,
  })),
);
const ReviewDetailPage = lazy(() =>
  import('@trapmap/web-panel/pages/review-detail/review-detail-page').then(
    ({ ReviewDetailPage }) => ({ default: ReviewDetailPage }),
  ),
);
const ReviewQueuePage = lazy(() =>
  import('@trapmap/web-panel/pages/review-queue/review-queue-page').then(({ ReviewQueuePage }) => ({
    default: ReviewQueuePage,
  })),
);
const SkillGraphPage = lazy(() =>
  import('@trapmap/web-panel/pages/skill-graph/skill-graph-page').then(({ SkillGraphPage }) => ({
    default: SkillGraphPage,
  })),
);
const TrapGraphPage = lazy(() =>
  import('@trapmap/web-panel/pages/trap-graph/trap-graph-page').then(({ TrapGraphPage }) => ({
    default: TrapGraphPage,
  })),
);
const LoginPage = lazy(() =>
  import('@trapmap/web-panel/pages/login/login-page').then(({ LoginPage }) => ({
    default: LoginPage,
  })),
);

function RequireAuth({ children }: { children: ReactElement }): ReactElement {
  const request = useSessionStore((state) => state.request);
  // While session is still resolving, render the shell's loading state via children
  // The AppShell itself initiates loadSession; we only guard after success.
  if (request.status === 'success' && !request.payload?.authenticated) {
    return <Navigate replace to="/login" />;
  }
  return children;
}

const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/',
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [
      {
        index: true,
        element: <DashboardPage />,
      },
      {
        path: 'reviews',
        element: <ReviewQueuePage />,
      },
      {
        path: 'reviews/:id',
        element: <ReviewDetailPage />,
      },
      {
        path: 'artifacts',
        element: <ArtifactsPage />,
      },
      {
        path: 'trap-graph',
        element: <TrapGraphPage />,
      },
      {
        path: 'skill-graph',
        element: <SkillGraphPage />,
      },
      {
        path: 'activity',
        element: <ActivityPage />,
      },
      {
        path: '*',
        element: <Navigate replace to="/" />,
      },
    ],
  },
]);

export function AppRouter(): ReactElement {
  return <RouterProvider router={router} />;
}

export const appRoutes = [
  '/',
  '/reviews',
  '/reviews/:id',
  '/artifacts',
  '/trap-graph',
  '/skill-graph',
  '/activity',
] as const;
