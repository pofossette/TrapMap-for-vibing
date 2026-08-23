import { create } from 'zustand';

import type {
  ReviewItemViewModel,
  ReviewQueueFilters,
  ReviewQueuePage,
} from '@trapmap/web-panel/shared/enum-types';
import {
  type RequestState,
  createErrorRequestState,
  createIdleRequestState,
  createLoadingRequestState,
  createSuccessRequestState,
} from '@trapmap/web-panel/shared/lib/request-state';

type ReviewQueueStore = {
  filters: ReviewQueueFilters;
  paging: { cursor: string | null; limit: number };
  request: RequestState<ReviewQueuePage>;
  setError: (message: string) => void;
  setItems: (page: ReviewQueuePage, at?: string) => void;
  setLoading: () => void;
  setPaging: (paging: { cursor: string | null; limit: number }) => void;
  updateFilters: (patch: Partial<ReviewQueueFilters>) => void;
  updatePaging: (patch: Partial<{ cursor: string | null; limit: number }>) => void;
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
    filteredTotal: 0,
    nextCursor: null,
    total: 0,
  }),
  paging: { cursor: null, limit: 25 },
  updateFilters: (patch) =>
    set((state) => ({
      filters: {
        ...state.filters,
        ...patch,
      },
      paging: {
        ...state.paging,
        cursor: null,
      },
    })),
  setPaging: (paging) => set({ paging }),
  updatePaging: (patch) =>
    set((state) => ({
      paging: { ...state.paging, ...patch },
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
