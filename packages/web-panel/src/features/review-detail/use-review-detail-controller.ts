import { useEffect, useMemo } from 'react';

import { getAdminPanelApi } from '../../services/admin-panel-service-context';
import { useJsonEditorStore } from '../../stores/json-editor-store';
import { useReviewDetailStore } from '../../stores/review-detail-store';
import { useJsonEditorController } from '../json-editor/use-json-editor-controller';
import { loadReviewDetail, submitReviewDecision } from './service';

type ContextCard = {
  label: string;
  value: string;
};

export function useReviewDetailController(reviewId: string) {
  const api = getAdminPanelApi();
  const request = useReviewDetailStore((state) => state.request);
  const decisionRationale = useReviewDetailStore((state) => state.decisionRationale);
  const setLoading = useReviewDetailStore((state) => state.setLoading);
  const setDetail = useReviewDetailStore((state) => state.setDetail);
  const setError = useReviewDetailStore((state) => state.setError);
  const setDecisionRationale = useReviewDetailStore((state) => state.setDecisionRationale);
  const hydrateJsonEditor = useJsonEditorStore((state) => state.hydrate);
  const jsonEditor = useJsonEditorController(reviewId);

  async function refresh() {
    setLoading(reviewId);

    try {
      const detail = await loadReviewDetail(api, reviewId);
      setDetail(detail);
      hydrateJsonEditor(detail.files, detail.rawEntry);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to load review detail.');
    }
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: refresh ref is stable and details reload when ID changes
  useEffect(() => {
    if (request.status === 'idle' || request.payload?.id !== reviewId) {
      void refresh();
    }
  }, [reviewId, request.payload?.id, request.status]);

  const detail = request.payload;

  const contextCards = useMemo<ContextCard[]>(
    () =>
      detail
        ? [
            { label: 'Source', value: detail.source },
            { label: 'Status', value: detail.status },
            { label: 'Assigned Reviewer', value: detail.assignedReviewer ?? 'Unassigned' },
            { label: 'Created At', value: detail.createdAt },
          ]
        : [],
    [detail],
  );

  return {
    loading: request.status === 'loading' || request.status === 'idle',
    error: request.error,
    item: detail,
    contextCards,
    jsonEditor,
    decisionRationale,
    setDecisionRationale,
    async submitDecision(decision: 'approve' | 'reject' | 'return-for-correction') {
      const current = request.payload;

      if (!current) {
        return false;
      }

      if (decision !== 'approve' && decisionRationale.trim().length === 0) {
        return false;
      }

      const notes =
        decision === 'return-for-correction'
          ? `[return-for-correction] ${decisionRationale.trim()}`
          : decisionRationale.trim() || 'Approved in web panel.';
      const mappedDecision = decision === 'return-for-correction' ? 'reject' : decision;

      try {
        const updated = await submitReviewDecision(api, {
          entryId: current.id,
          decision: mappedDecision,
          notes,
        });
        setDetail({
          ...updated,
          activity: current.activity,
        });
        return true;
      } catch (error) {
        setError(error instanceof Error ? error.message : 'Failed to submit review decision.');
        return false;
      }
    },
    refresh,
  };
}
