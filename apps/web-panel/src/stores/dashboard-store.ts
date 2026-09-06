import type { DashboardSnapshot } from '@trapmap/web-panel/features/dashboard/service';
import {
  createErrorRequestState,
  createIdleRequestState,
  createLoadingRequestState,
  createSuccessRequestState,
  type RequestState,
} from '@trapmap/web-panel/shared/lib/request-state';
import { create } from 'zustand';

type DashboardStore = {
  request: RequestState<DashboardSnapshot>;
  setError: (message: string) => void;
  setLoading: () => void;
  setOverview: (overview: DashboardSnapshot, at?: string) => void;
};

export const useDashboardStore = create<DashboardStore>((set) => ({
  request: createIdleRequestState<DashboardSnapshot>(null),
  setLoading: () =>
    set((state) => ({
      request: createLoadingRequestState(state.request),
    })),
  setOverview: (overview, at = new Date().toISOString()) =>
    set({
      request: createSuccessRequestState(overview, at),
    }),
  setError: (message) =>
    set((state) => ({
      request: createErrorRequestState(state.request, message),
    })),
}));
