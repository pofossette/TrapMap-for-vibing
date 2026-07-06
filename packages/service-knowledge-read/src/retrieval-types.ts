import type { BoundaryExplanation } from '@trapmap/contracts';

import type { KnowledgeRecord } from './store.js';

export type RecallChannel = string;
export type RoutingChannel = string;

export interface TokenMatchDetail {
  token: string;
  fields: Array<'shortcut' | 'detail' | 'labels'>;
}

export interface RecallCandidate {
  entry: KnowledgeRecord;
  channel: RecallChannel;
  score: number;
  tokenMatches: TokenMatchDetail[];
}

export interface ScoredEntry {
  entry: KnowledgeRecord;
  score: number;
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
  boundaryScoreDelta?: number;
  decayMultiplier?: number;
  boundaryExplanation?: BoundaryExplanation;
}

export interface CapsuleCandidate {
  capsuleId: string;
  artifactId: string;
  revision: number;
  situationScore: number;
  problemScore: number;
  goalScore: number;
  errorScore: number | null;
  contextScore: number;
  stackPathBoost: number;
  finalScore: number;
  reason: string;
}
