import { useEffect, useMemo } from 'react';

import { useJsonEditorController } from '@trapmap/web-panel/features/json-editor/use-json-editor-controller';
import { getAdminPanelApi } from '@trapmap/web-panel/services/admin-panel-service-context';
import { useI18nStore } from '@trapmap/web-panel/stores/i18n-store';
import { useJsonEditorStore } from '@trapmap/web-panel/stores/json-editor-store';
import { useReviewDetailStore } from '@trapmap/web-panel/stores/review-detail-store';
import { loadReviewDetail, submitReviewDecision } from './service';

type ContextCard = {
  label: 'assignedReviewer' | 'createdAt' | 'sourceLabel' | 'statusLabel';
  value: string;
};

export function useReviewDetailController(reviewId: string) {
  const api = getAdminPanelApi();
  const { t } = useI18nStore();
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
            { label: 'sourceLabel', value: detail.source },
            { label: 'statusLabel', value: detail.status },
            { label: 'assignedReviewer', value: detail.assignedReviewer ?? 'Unassigned' },
            { label: 'createdAt', value: detail.createdAt },
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
          : decisionRationale.trim() || t('approvedInWebPanel');
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
