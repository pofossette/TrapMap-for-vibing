/**
 * Shared classification utilities for graph-extraction evals.
 *
 * Used by the extraction runner (run.ts), conflict eval and dedup eval so the
 * Jaccard overlap and precision/recall/F1 computation stays in one place.
 *
 * `tokenize` / `overlapScore` are the canonical governance-review conflict
 * rules hosted in `@trapmap/backend-core` (governance-review domain); they are
 * re-exported here instead of duplicated so the eval baseline never drifts
 * from production classification.
 */

export { overlapScore, tokenize } from '@trapmap/backend-core';

export interface ClassificationMetrics {
  tp: number;
  fp: number;
  fn: number;
  precision: number;
  recall: number;
  f1: number;
}

export function computeMetrics(tp: number, fp: number, fn: number): ClassificationMetrics {
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  return { tp, fp, fn, precision, recall, f1 };
}
