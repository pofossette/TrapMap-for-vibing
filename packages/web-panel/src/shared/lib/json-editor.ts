import type { ReviewArtifactFile } from '../types/admin-panel';

export type JsonDraftState = {
  canSave: boolean;
  dirty: boolean;
  error: string | null;
  parsed: unknown | null;
  rationaleMissing: boolean;
};

function isStructuredFile(language?: ReviewArtifactFile['language'] | null): boolean {
  return language === 'json';
}

export function parseJsonDraft(text: string): { error: string | null; parsed: unknown | null } {
  try {
    return {
      parsed: JSON.parse(text),
      error: null,
    };
  } catch (error) {
    return {
      parsed: null,
      error: error instanceof Error ? error.message : 'Invalid JSON payload.',
    };
  }
}

export function prettyPrintJson(text: string): { error: string | null; value: string } {
  const parsed = parseJsonDraft(text);

  if (parsed.error) {
    return {
      value: text,
      error: parsed.error,
    };
  }

  return {
    value: JSON.stringify(parsed.parsed, null, 2),
    error: null,
  };
}

export function isDirtyJsonDraft(originalText: string, draftText: string): boolean {
  return normalizeJsonText(originalText) !== normalizeJsonText(draftText);
}

export function normalizeJsonText(text: string): string {
  return text.trim().replace(/\r\n/g, '\n');
}

export function buildJsonDraftState(
  originalText: string,
  draftText: string,
  rationale: string,
  language: ReviewArtifactFile['language'] = 'json',
): JsonDraftState {
  const dirty = isDirtyJsonDraft(originalText, draftText);
  const rationaleMissing = dirty && rationale.trim().length === 0;

  if (!isStructuredFile(language)) {
    return {
      parsed: draftText,
      error: null,
      dirty,
      rationaleMissing,
      canSave: dirty && !rationaleMissing,
    };
  }

  const parsed = parseJsonDraft(draftText);

  return {
    parsed: parsed.parsed,
    error: parsed.error,
    dirty,
    rationaleMissing,
    canSave: dirty && !parsed.error && !rationaleMissing,
  };
}
