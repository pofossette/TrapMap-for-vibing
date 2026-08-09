/**
 * Shared classification utilities for graph-extraction evals.
 *
 * Used by the extraction runner (run.ts), conflict eval and dedup eval so the
 * Jaccard overlap and precision/recall/F1 computation stays in one place.
 */

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

export function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((part) => part.length >= 3),
  );
}

export function overlapScore(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const token of a) {
    if (b.has(token)) shared++;
  }
  return shared / new Set([...a, ...b]).size;
}
