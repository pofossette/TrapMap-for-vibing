import type { ReactElement } from 'react';
import { Navigate, RouterProvider, createBrowserRouter } from 'react-router-dom';

import { AppShell } from '@trapmap/web-panel/app/shell/app-shell';
import { ActivityPage } from '@trapmap/web-panel/pages/activity/activity-page';
import { ArtifactsPage } from '@trapmap/web-panel/pages/artifacts/artifacts-page';
import { DashboardPage } from '@trapmap/web-panel/pages/dashboard/dashboard-page';
import { ReviewDetailPage } from '@trapmap/web-panel/pages/review-detail/review-detail-page';
import { ReviewQueuePage } from '@trapmap/web-panel/pages/review-queue/review-queue-page';
import { SkillGraphPage } from '@trapmap/web-panel/pages/skill-graph/skill-graph-page';
import { TrapGraphPage } from '@trapmap/web-panel/pages/trap-graph/trap-graph-page';

const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
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
