import { create } from 'zustand';

import {
  type RequestState,
  createErrorRequestState,
  createIdleRequestState,
  createLoadingRequestState,
  createSuccessRequestState,
} from '../shared/lib/request-state';
import type { RuntimeOverview } from '../shared/types/admin-panel';

type DashboardStore = {
  request: RequestState<RuntimeOverview>;
  setError: (message: string) => void;
  setLoading: () => void;
  setOverview: (overview: RuntimeOverview, at?: string) => void;
};

export const useDashboardStore = create<DashboardStore>((set) => ({
  request: createIdleRequestState<RuntimeOverview>(null),
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
