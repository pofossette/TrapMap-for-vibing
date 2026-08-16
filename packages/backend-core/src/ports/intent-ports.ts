/**
 * Intent-recognition judgment node contract (design D8).
 *
 * Recognizes the retrieval intent of a query and routes it to a strategy
 * mode. The rule implementation mirrors the pre-contract routing rules
 * (`routingDecision` / `dispatchByMode`); LLM/hybrid implementations
 * plug in behind the same port without touching consumers.
 */

import type { RetrievalQueryMode } from '@trapmap/contracts';

/** Input to intent recognition: query text plus routing context. */
export interface IntentRecognitionInput {
  /** Free-text query or seed. */
  query: string;
  /** Mode explicitly requested by the caller (absent = auto). */
  requestedMode?: RetrievalQueryMode;
  /** Strategy modes the retrieval engine can actually execute. */
  knownModes: readonly string[];
  /** Normalized seed used by LLM variants for classification. */
  seed?: string;
}

/** Trace metadata recorded by the recognition step. */
export interface IntentRecognitionTrace {
  /** Route family the selected mode belongs to (e.g. "graph", "hybrid"). */
  routeFamily: string;
}

/** Result of intent recognition. */
export interface IntentRecognitionResult {
  /** Selected strategy mode (must be present in `knownModes`). */
  mode: string;
  /** Confidence in the selection, 0..1. */
  confidence: number;
  /** Human-readable reason for the selection. */
  reason: string;
  /** Optional trace for RAG logging. */
  trace?: IntentRecognitionTrace;
}

/**
 * Judgment-node contract for retrieval intent recognition / mode routing.
 */
export interface IntentRecognitionPort {
  recognize(input: IntentRecognitionInput): Promise<IntentRecognitionResult>;
}
