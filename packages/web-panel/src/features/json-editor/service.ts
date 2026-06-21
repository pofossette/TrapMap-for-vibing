import type { ManualJsonEditInput } from '@trapmap/web-panel/shared/enum-types';
import { buildJsonDraftState, prettyPrintJson } from '@trapmap/web-panel/shared/lib/json-editor';

export { buildJsonDraftState };

export function formatJsonDraft(text: string): { error: string | null; value: string } {
  return prettyPrintJson(text);
}

export function buildManualJsonEditInput(args: {
  draftText: string;
  filePath: string;
  isStructured: boolean;
  rationale: string;
  reviewId: string;
}): ManualJsonEditInput {
  return {
    filePath: args.filePath,
    reviewId: args.reviewId,
    rationale: args.rationale.trim(),
    payload: args.isStructured ? JSON.parse(args.draftText) : args.draftText,
  };
}
