import type { ReactElement } from 'react';
import { Navigate, RouterProvider, createBrowserRouter } from 'react-router-dom';

import { ActivityPage } from '../../pages/activity/activity-page';
import { DashboardPage } from '../../pages/dashboard/dashboard-page';
import { ReviewDetailPage } from '../../pages/review-detail/review-detail-page';
import { ReviewQueuePage } from '../../pages/review-queue/review-queue-page';
import { AppShell } from '../shell/app-shell';

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
