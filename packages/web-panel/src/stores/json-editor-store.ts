import { create } from 'zustand';

import type { ReviewArtifactFile } from '@trapmap/web-panel/shared/enum-types';
import { buildJsonDraftState } from '@trapmap/web-panel/shared/lib/json-editor';
import {
  type RequestState,
  createErrorRequestState,
  createIdleRequestState,
  createLoadingRequestState,
  createSuccessRequestState,
} from '@trapmap/web-panel/shared/lib/request-state';

type JsonEditorSnapshot = {
  activeFilePath: string | null;
  draftText: string;
  files: ReviewArtifactFile[];
  originalPayload: unknown | null;
  originalText: string;
  rationale: string;
};

type JsonEditorStore = JsonEditorSnapshot & {
  draftState: ReturnType<typeof buildJsonDraftState>;
  request: RequestState<{ savedAt: string }>;
  hydrate: (files: ReviewArtifactFile[], fallbackPayload: unknown) => void;
  prettyPrint: () => void;
  reset: () => void;
  selectFile: (path: string) => void;
  setDraftText: (value: string) => void;
  setError: (message: string) => void;
  setLoading: () => void;
  setRationale: (value: string) => void;
  setSaved: (savedAt: string, at?: string) => void;
};

function deriveDraftState(snapshot: JsonEditorSnapshot) {
  const activeFile = snapshot.files.find((file) => file.path === snapshot.activeFilePath) ?? null;
  return buildJsonDraftState(
    snapshot.originalText,
    snapshot.draftText,
    snapshot.rationale,
    activeFile?.language ?? 'json',
  );
}

function normalizeFiles(
  files: ReviewArtifactFile[],
  fallbackPayload: unknown,
): ReviewArtifactFile[] {
  if (files.length > 0) {
    return files;
  }

  return [
    {
      path: 'entry/review-payload.json',
      name: 'review-payload.json',
      language: 'json',
      lastEditedAt: new Date().toISOString(),
      size: JSON.stringify(fallbackPayload, null, 2).length,
      content: JSON.stringify(fallbackPayload, null, 2),
    },
  ];
}

function deriveSnapshot(
  files: ReviewArtifactFile[],
  fallbackPayload: unknown,
  activeFilePath?: string | null,
): JsonEditorSnapshot {
  const normalizedFiles = normalizeFiles(files, fallbackPayload);
  const selectedFile =
    normalizedFiles.find((file) => file.path === activeFilePath) ?? normalizedFiles[0] ?? null;
  const originalText = selectedFile?.content ?? '';

  return {
    files: normalizedFiles,
    activeFilePath: selectedFile?.path ?? null,
    originalPayload: fallbackPayload,
    originalText,
    draftText: originalText,
    rationale: '',
  };
}

const emptySnapshot: JsonEditorSnapshot = {
  activeFilePath: null,
  files: [],
  originalPayload: null,
  originalText: '',
  draftText: '',
  rationale: '',
};

export const useJsonEditorStore = create<JsonEditorStore>((set) => ({
  ...emptySnapshot,
  draftState: deriveDraftState(emptySnapshot),
  request: createIdleRequestState<{ savedAt: string }>(null),
  hydrate: (files, fallbackPayload) => {
    const snapshot = deriveSnapshot(files, fallbackPayload);
    set({
      ...snapshot,
      draftState: deriveDraftState(snapshot),
      request: createIdleRequestState<{ savedAt: string }>(null),
    });
  },
  selectFile: (path) =>
    set((state) => {
      const snapshot = deriveSnapshot(state.files, state.originalPayload, path);
      return {
        ...snapshot,
        draftState: deriveDraftState(snapshot),
      };
    }),
  setDraftText: (value) =>
    set((state) => {
      const snapshot = { ...state, draftText: value };
      return {
        draftText: value,
        draftState: deriveDraftState(snapshot),
      };
    }),
  setRationale: (value) =>
    set((state) => {
      const snapshot = { ...state, rationale: value };
      return {
        rationale: value,
        draftState: deriveDraftState(snapshot),
      };
    }),
  prettyPrint: () =>
    set((state) => {
      const nextDraftText = state.draftState.error
        ? state.draftText
        : JSON.stringify(state.draftState.parsed, null, 2);
      const snapshot = { ...state, draftText: nextDraftText };
      return {
        draftText: nextDraftText,
        draftState: deriveDraftState(snapshot),
      };
    }),
  reset: () =>
    set((state) => {
      const snapshot = {
        ...state,
        draftText: state.originalText,
        rationale: '',
      };
      return {
        draftText: state.originalText,
        rationale: '',
        draftState: deriveDraftState(snapshot),
      };
    }),
  setLoading: () =>
    set((state) => ({
      request: createLoadingRequestState(state.request),
    })),
  setSaved: (savedAt, at = new Date().toISOString()) =>
    set((state) => {
      const nextFiles = state.files.map((file) =>
        file.path === state.activeFilePath
          ? {
              ...file,
              content: state.draftText,
              size: state.draftText.length,
              lastEditedAt: savedAt,
            }
          : file,
      );
      const snapshot = deriveSnapshot(nextFiles, state.originalPayload, state.activeFilePath);

      return {
        ...snapshot,
        draftState: deriveDraftState(snapshot),
        request: createSuccessRequestState({ savedAt }, at),
      };
    }),
  setError: (message) =>
    set((state) => ({
      request: createErrorRequestState(state.request, message),
    })),
}));
