import { create } from 'zustand';

import {
  type RequestState,
  createErrorRequestState,
  createIdleRequestState,
  createLoadingRequestState,
  createSuccessRequestState,
} from '../shared/lib/request-state';
import type {
  ReviewItemViewModel,
  ReviewQueueFilters,
  ReviewQueuePage,
} from '../shared/types/admin-panel';

type ReviewQueueStore = {
  filters: ReviewQueueFilters;
  request: RequestState<ReviewQueuePage>;
  setError: (message: string) => void;
  setItems: (page: ReviewQueuePage, at?: string) => void;
  setLoading: () => void;
  updateFilters: (patch: Partial<ReviewQueueFilters>) => void;
};

const initialFilters: ReviewQueueFilters = {
  status: 'all',
  sort: 'highest-risk',
  source: 'all',
  search: '',
  riskLevel: 'all',
};

export const useReviewQueueStore = create<ReviewQueueStore>((set) => ({
  filters: {
    ...initialFilters,
  },
  request: createIdleRequestState<ReviewQueuePage>({
    items: [] as ReviewItemViewModel[],
    total: 0,
  }),
  updateFilters: (patch) =>
    set((state) => ({
      filters: {
        ...state.filters,
        ...patch,
      },
    })),
  setLoading: () =>
    set((state) => ({
      request: createLoadingRequestState(state.request),
    })),
  setItems: (page, at = new Date().toISOString()) =>
    set({
      request: createSuccessRequestState(page, at),
    }),
  setError: (message) =>
    set((state) => ({
      request: createErrorRequestState(state.request, message),
    })),
}));
