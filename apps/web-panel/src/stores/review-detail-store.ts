import type { ReviewDetailViewModel } from '@trapmap/web-panel/shared/enum-types';
import {
  createErrorRequestState,
  createIdleRequestState,
  createLoadingRequestState,
  createSuccessRequestState,
  type RequestState,
} from '@trapmap/web-panel/shared/lib/request-state';
import { create } from 'zustand';

type ReviewDetailStore = {
  currentReviewId: string | null;
  decisionRationale: string;
  request: RequestState<ReviewDetailViewModel>;
  setDecisionRationale: (value: string) => void;
  setDetail: (detail: ReviewDetailViewModel, at?: string) => void;
  setError: (message: string) => void;
  setLoading: (reviewId: string) => void;
};

export const useReviewDetailStore = create<ReviewDetailStore>((set) => ({
  currentReviewId: null,
  decisionRationale: '',
  request: createIdleRequestState<ReviewDetailViewModel>(null),
  setDecisionRationale: (value) => set({ decisionRationale: value }),
  setLoading: (reviewId) =>
    set((state) => ({
      currentReviewId: reviewId,
      request: createLoadingRequestState(state.request),
    })),
  setDetail: (detail, at = new Date().toISOString()) =>
    set({
      currentReviewId: detail.id,
      request: createSuccessRequestState(detail, at),
    }),
  setError: (message) =>
    set((state) => ({
      request: createErrorRequestState(state.request, message),
    })),
}));
