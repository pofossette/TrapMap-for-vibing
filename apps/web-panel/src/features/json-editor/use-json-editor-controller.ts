import { useMemo } from 'react';

import { getAdminPanelApi } from '@trapmap/web-panel/services/admin-panel-service-context';
import { useJsonEditorStore } from '@trapmap/web-panel/stores/json-editor-store';
import { buildManualJsonEditInput, formatJsonDraft } from './service';

export function useJsonEditorController(reviewId: string) {
  const api = getAdminPanelApi();
  const draftText = useJsonEditorStore((state) => state.draftText);
  const draftState = useJsonEditorStore((state) => state.draftState);
  const files = useJsonEditorStore((state) => state.files);
  const activeFilePath = useJsonEditorStore((state) => state.activeFilePath);
  const rationale = useJsonEditorStore((state) => state.rationale);
  const request = useJsonEditorStore((state) => state.request);
  const selectFile = useJsonEditorStore((state) => state.selectFile);
  const setDraftText = useJsonEditorStore((state) => state.setDraftText);
  const setRationale = useJsonEditorStore((state) => state.setRationale);
  const prettyPrint = useJsonEditorStore((state) => state.prettyPrint);
  const reset = useJsonEditorStore((state) => state.reset);
  const setLoading = useJsonEditorStore((state) => state.setLoading);
  const setSaved = useJsonEditorStore((state) => state.setSaved);
  const setError = useJsonEditorStore((state) => state.setError);

  return useMemo(
    () => ({
      draftText,
      files,
      activeFilePath,
      error: draftState.error,
      invalid: Boolean(draftState.error),
      dirty: draftState.dirty,
      rationale,
      canSave: draftState.canSave,
      rationaleMissing: draftState.rationaleMissing,
      request,
      selectFile,
      setDraftText,
      setRationale,
      format() {
        const activeFile = files.find((file) => file.path === activeFilePath) ?? null;
        if (activeFile?.language !== 'json') {
          return;
        }

        const result = formatJsonDraft(draftText);
        if (!result.error) {
          prettyPrint();
        }
      },
      reset,
      async save() {
        if (!draftState.canSave) {
          return false;
        }

        setLoading();

        try {
          const input = buildManualJsonEditInput({
            draftText,
            filePath: activeFilePath ?? 'entry/review-payload.json',
            isStructured:
              (files.find((file) => file.path === activeFilePath)?.language ?? 'json') === 'json',
            rationale,
            reviewId,
          });
          const response = await api.saveManualJsonEdit(input);
          setSaved(response.savedAt);
          return true;
        } catch (error) {
          setError(error instanceof Error ? error.message : 'Failed to save JSON edit.');
          return false;
        }
      },
    }),
    [
      api,
      activeFilePath,
      draftState.canSave,
      draftState.dirty,
      draftState.error,
      draftState.rationaleMissing,
      draftText,
      files,
      prettyPrint,
      rationale,
      request,
      reset,
      reviewId,
      selectFile,
      setDraftText,
      setError,
      setLoading,
      setRationale,
      setSaved,
    ],
  );
}
