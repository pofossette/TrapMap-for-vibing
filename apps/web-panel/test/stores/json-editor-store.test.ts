import { beforeEach, describe, expect, it } from 'vitest';

import { useJsonEditorStore } from '../../src/stores/json-editor-store';

describe('json-editor-store', () => {
  beforeEach(() => {
    useJsonEditorStore.setState({
      activeFilePath: null,
      originalPayload: null,
      files: [],
      originalText: '',
      draftText: '',
      rationale: '',
      draftState: {
        parsed: null,
        error: null,
        dirty: false,
        rationaleMissing: false,
        canSave: false,
      },
      request: {
        status: 'idle',
        payload: null,
        error: null,
        lastUpdatedAt: null,
      },
    });
  });

  it('hydrates editor state from original payload', () => {
    useJsonEditorStore.getState().hydrate([], { ok: true });

    const state = useJsonEditorStore.getState();

    expect(state.originalText).toContain('"ok": true');
    expect(state.draftText).toBe(state.originalText);
    expect(state.draftState.dirty).toBe(false);
    expect(state.activeFilePath).toBe('entry/review-payload.json');
  });

  it('tracks dirty, invalid json, and reset', () => {
    const store = useJsonEditorStore.getState();
    store.hydrate([], { ok: true });
    store.setDraftText('{"ok":');

    expect(useJsonEditorStore.getState().draftState.error).toBeTruthy();
    expect(useJsonEditorStore.getState().draftState.canSave).toBe(false);

    store.reset();

    expect(useJsonEditorStore.getState().draftText).toBe(
      useJsonEditorStore.getState().originalText,
    );
    expect(useJsonEditorStore.getState().draftState.dirty).toBe(false);
  });

  it('blocks save without rationale and allows after rationale is set', () => {
    const store = useJsonEditorStore.getState();
    store.hydrate([], { ok: true });
    store.setDraftText('{"ok": false}');

    expect(useJsonEditorStore.getState().draftState.rationaleMissing).toBe(true);
    expect(useJsonEditorStore.getState().draftState.canSave).toBe(false);

    store.setRationale('manual recovery');

    expect(useJsonEditorStore.getState().draftState.rationaleMissing).toBe(false);
    expect(useJsonEditorStore.getState().draftState.canSave).toBe(true);
  });

  it('switches active file and resets the draft to selected content', () => {
    const store = useJsonEditorStore.getState();
    store.hydrate(
      [
        {
          path: 'entry/review-payload.json',
          name: 'review-payload.json',
          language: 'json',
          lastEditedAt: '2026-06-19T10:00:00.000Z',
          size: 16,
          content: '{"ok": true}',
        },
        {
          path: 'entry/notes.md',
          name: 'notes.md',
          language: 'markdown',
          lastEditedAt: '2026-06-19T10:01:00.000Z',
          size: 12,
          content: '# Notes',
        },
      ],
      { ok: true },
    );

    store.selectFile('entry/notes.md');

    expect(useJsonEditorStore.getState().activeFilePath).toBe('entry/notes.md');
    expect(useJsonEditorStore.getState().draftText).toBe('# Notes');
    expect(useJsonEditorStore.getState().draftState.dirty).toBe(false);
  });
});
