import type { ReactElement } from 'react';
import { Navigate, RouterProvider, createBrowserRouter } from 'react-router-dom';

import { AppShell } from '@trapmap/web-panel/app/shell/app-shell';
import { ActivityPage } from '@trapmap/web-panel/pages/activity/activity-page';
import { DashboardPage } from '@trapmap/web-panel/pages/dashboard/dashboard-page';
import { ReviewDetailPage } from '@trapmap/web-panel/pages/review-detail/review-detail-page';
import { ReviewQueuePage } from '@trapmap/web-panel/pages/review-queue/review-queue-page';

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

export const appRoutes = ['/', '/reviews', '/reviews/:id', '/activity'] as const;
