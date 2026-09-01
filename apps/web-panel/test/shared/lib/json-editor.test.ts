import { describe, expect, it } from 'vitest';

import {
  buildJsonDraftState,
  isDirtyJsonDraft,
  parseJsonDraft,
  prettyPrintJson,
} from '../../../src/shared/lib/json-editor';

describe('json-editor helpers', () => {
  it('parses valid json', () => {
    expect(parseJsonDraft('{"ok":true}')).toEqual({
      parsed: { ok: true },
      error: null,
    });
  });

  it('pretty prints valid json', () => {
    const result = prettyPrintJson('{"b":1,"a":2}');

    expect(result.error).toBeNull();
    expect(result.value).toBe('{\n  "b": 1,\n  "a": 2\n}');
  });

  it('detects dirty draft and invalid save gating', () => {
    expect(isDirtyJsonDraft('{"a":1}', '{"a":2}')).toBe(true);

    expect(buildJsonDraftState('{"a":1}', '{"a":', '')).toMatchObject({
      dirty: true,
      canSave: false,
      rationaleMissing: true,
    });
  });

  it('requires rationale before saving edited json', () => {
    expect(buildJsonDraftState('{"a":1}', '{"a":2}', '')).toMatchObject({
      dirty: true,
      error: null,
      rationaleMissing: true,
      canSave: false,
    });

    expect(buildJsonDraftState('{"a":1}', '{"a":2}', 'fix schema')).toMatchObject({
      dirty: true,
      error: null,
      rationaleMissing: false,
      canSave: true,
    });
  });

  it('allows non-json file edits without json parsing', () => {
    expect(buildJsonDraftState('# old', '# new', 'update note', 'markdown')).toMatchObject({
      dirty: true,
      error: null,
      rationaleMissing: false,
      canSave: true,
    });
  });
});
