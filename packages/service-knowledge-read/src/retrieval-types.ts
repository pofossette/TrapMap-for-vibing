import type { BoundaryExplanation } from '@trapmap/contracts';

import type { KnowledgeRecord } from './store.js';

export type RecallChannel = string;
export type RoutingChannel = string;

export interface TokenMatchDetail {
  token: string;
  fields: Array<'shortcut' | 'detail' | 'labels'>;
}

/**
 * Read the semver version declared on the entry's latest revision.
 *
 * Knowledge entries do not carry versions, so the accessor is structural:
 * skill artifacts surfaced as retrieval entries keep their
 * `latestRevision.version` (see the artifact revision schema) and flow
 * through unchanged when present.
 */
export function artifactVersionOf(entry: { latestRevision?: unknown }): string | undefined {
  const latest = entry.latestRevision as { version?: unknown } | undefined;
  return typeof latest?.version === 'string' ? latest.version : undefined;
}

export interface RecallCandidate {
  entry: KnowledgeRecord;
  channel: RecallChannel;
  score: number;
  tokenMatches: TokenMatchDetail[];
  version?: string;
  revision?: number;
}

export interface ScoredEntry {
  entry: KnowledgeRecord;
  score: number;
  version?: string;
  revision?: number;
  boundaryExplanation?: BoundaryExplanation;
}

export interface MergedCandidate {
  entry: KnowledgeRecord;
  semanticScore: number;
  keywordScore: number;
  graphScore?: number;
  channelScores: Record<string, number>;
  combinedScore: number;
  tokenMatches: TokenMatchDetail[];
  channels: RecallChannel[];
  preRerankScore: number;
  finalScore: number;
  version?: string;
  revision?: number;
  boundaryScoreDelta?: number;
  decayMultiplier?: number;
  boundaryExplanation?: BoundaryExplanation;
}
