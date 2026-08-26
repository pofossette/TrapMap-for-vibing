/**
 * Knowledge-read bounded context — routing / ranking / scoring rules.
 *
 * Pure retrieval ranking rules (mode routing, candidate merge weights,
 * rerank boosts, graph merge, lexical score computation) with zero
 * framework, DB or I/O imports. The retrieval infrastructure and recall
 * coordinator render these rules over recall candidates.
 */

import type {
  BoundaryContext,
  BoundaryExplanation,
  FreshnessDecayConfig,
  GraphQueryRuntimeState,
  RetrievalQuery,
} from '@trapmap/contracts';
import { cosineSimilarity as sharedCosineSimilarity } from '@trapmap/lib';

import { type BoundaryEntryView, computeBoundaryScoreDelta } from './boundary.js';
import { type TokenMatchDetailLike, normalizeQuery } from './tokenization.js';

export const cosineSimilarity = sharedCosineSimilarity;

// ---------------------------------------------------------------------------
// Channel vocabulary
// ---------------------------------------------------------------------------

export const RECALL_CHANNEL_SEMANTIC = 'semantic' as const;
export const RECALL_CHANNEL_KEYWORD = 'keyword' as const;
export const RECALL_CHANNEL_GRAPH = 'graph' as const;

// ---------------------------------------------------------------------------
// Candidate shapes
// ---------------------------------------------------------------------------

export interface RecallCandidateLike<E> {
  entry: E;
  channel: string;
  score: number;
  tokenMatches: TokenMatchDetailLike[];
}

export interface MergedCandidateLike<E> {
  entry: E;
  semanticScore: number;
  keywordScore: number;
  graphScore?: number;
  channelScores: Record<string, number>;
  combinedScore: number;
  tokenMatches: TokenMatchDetailLike[];
  channels: string[];
  preRerankScore: number;
  finalScore: number;
  boundaryScoreDelta?: number;
  decayMultiplier?: number;
  boundaryExplanation?: BoundaryExplanation;
}

export function createSemanticCandidate<E>(entry: E, score: number): RecallCandidateLike<E> {
  return { entry, channel: RECALL_CHANNEL_SEMANTIC, score, tokenMatches: [] };
}

// ---------------------------------------------------------------------------
// Version-match decay
// ---------------------------------------------------------------------------

export interface VersionMatchMultiplierInput {
  /** Semver version declared by the artifact (absent for unversioned artifacts) */
  artifactVersion: string | null | undefined;
  /** Runtime versions from the query boundary context ({package, version} pairs) */
  queryVersions: ReadonlyArray<{ package: string; version: string }> | null | undefined;
  /** Decay freshness type from the entry decay metadata */
  freshnessType: string | null | undefined;
  /** Freshness decay configuration (consumed read-only) */
  decayConfig: FreshnessDecayConfig;
}

/**
 * Step multiplier for versioned decay: an artifact whose declared version
 * equals any query version keeps full weight; a versioned artifact that
 * declares a version not present in the query versions is down-weighted by
 * `mismatchMultiplier`. An artifact WITHOUT a declared version is treated as
 * neutral (1): "unknown" is not "mismatch", so it must not be silently
 * penalized while runtime version wiring is pending. Non-versioned freshness
 * types, queries without version constraints, and disabled or absent
 * versioned config all yield 1 (no decay).
 *
 * Matching is exact string equality between the artifact version and the
 * version field of the query's {package, version} entries (package names do
 * not participate in the comparison).
 */
export function versionMatchMultiplier(input: VersionMatchMultiplierInput): number {
  const { artifactVersion, queryVersions, freshnessType, decayConfig } = input;
  if (freshnessType !== 'versioned') return 1;
  if (!queryVersions || queryVersions.length === 0) return 1;
  const versioned = decayConfig.versioned;
  if (!versioned || versioned.enabled === false) return 1;
  if (artifactVersion === undefined || artifactVersion === null) return 1;
  const matched = queryVersions.some((entry) => entry.version === artifactVersion);
  return matched ? versioned.matchMultiplier : versioned.mismatchMultiplier;
}

// ---------------------------------------------------------------------------
// Mode routing
// ---------------------------------------------------------------------------

export interface RoutingDecisionLike {
  selectedMode: string;
  routeFamily: string;
  routingReason: string;
  fallbackApplied: boolean;
  fallbackTarget: string | null;
  confidenceScore: number | null;
  confidenceBucket: 'low' | 'medium' | 'high' | null;
  channelsPlanned: string[];
  channelsUsed: string[];
}

export function routingDecision(mode: string): RoutingDecisionLike {
  const channels =
    mode === 'graph-assisted'
      ? [RECALL_CHANNEL_SEMANTIC, RECALL_CHANNEL_KEYWORD, RECALL_CHANNEL_GRAPH]
      : mode === 'hybrid'
        ? [RECALL_CHANNEL_SEMANTIC, RECALL_CHANNEL_KEYWORD]
        : [RECALL_CHANNEL_SEMANTIC];
  return {
    selectedMode:
      mode === 'semantic'
        ? 'local'
        : mode === 'hybrid'
          ? 'hybrid'
          : mode === 'graph-assisted'
            ? 'mix'
            : 'local',
    routeFamily: 'entry',
    routingReason: 'explicit-mode',
    fallbackApplied: !['semantic', 'hybrid', 'graph-assisted'].includes(mode),
    fallbackTarget: null,
    confidenceScore: null,
    confidenceBucket: null,
    channelsPlanned: channels,
    channelsUsed: [],
  };
}

/** Validation message for an unknown query mode (mode whitelist rendering). */
export function buildUnknownModeMessage(mode: string, knownModes: readonly string[]): string {
  return `Invalid query mode: ${mode}. Must be one of: ${knownModes.join(', ')}`;
}

// ---------------------------------------------------------------------------
// Candidate merge / rerank
// ---------------------------------------------------------------------------

/** Weights applied when merging semantic and keyword candidates. */
export const MERGE_SEMANTIC_WEIGHT = 0.6;
export const MERGE_KEYWORD_WEIGHT = 0.4;

/** Rerank boosts and penalties. */
export const DUAL_CHANNEL_RERANK_BOOST = 0.15;
export const TOKEN_COVERAGE_BONUS = 0.1;
export const TOKEN_COVERAGE_RATIO = 0.5;
export const STALE_DECAY_PENALTY = 0.1;

export const DEFAULT_FRESHNESS_DECAY_CONFIG: FreshnessDecayConfig = {
  evergreen: { enabled: false },
  versioned: {
    enabled: true,
    mode: 'step',
    matchMultiplier: 1,
    mismatchMultiplier: 0.5,
  },
  volatile: {
    enabled: true,
    mode: 'exponential',
    halfLifeDays: 30,
    zeroDays: 90,
    floor: 0.3,
  },
};

export function mergeCandidates<E extends { id: string }>(
  semantic: RecallCandidateLike<E>[],
  keyword: RecallCandidateLike<E>[],
): MergedCandidateLike<E>[] {
  const candidates = new Map<string, MergedCandidateLike<E>>();
  for (const candidate of semantic)
    candidates.set(candidate.entry.id, {
      entry: candidate.entry,
      semanticScore: candidate.score,
      keywordScore: 0,
      graphScore: 0,
      channelScores: { [RECALL_CHANNEL_SEMANTIC]: candidate.score },
      combinedScore: candidate.score * MERGE_SEMANTIC_WEIGHT,
      tokenMatches: [],
      channels: [RECALL_CHANNEL_SEMANTIC],
      preRerankScore: candidate.score * MERGE_SEMANTIC_WEIGHT,
      finalScore: candidate.score * MERGE_SEMANTIC_WEIGHT,
    });
  for (const candidate of keyword) {
    const existing = candidates.get(candidate.entry.id);
    if (existing) {
      existing.keywordScore = candidate.score;
      existing.channelScores[RECALL_CHANNEL_KEYWORD] = candidate.score;
      existing.tokenMatches = candidate.tokenMatches;
      existing.channels = [RECALL_CHANNEL_SEMANTIC, RECALL_CHANNEL_KEYWORD];
      existing.combinedScore =
        existing.semanticScore * MERGE_SEMANTIC_WEIGHT + candidate.score * MERGE_KEYWORD_WEIGHT;
      existing.preRerankScore = existing.combinedScore;
      existing.finalScore = existing.combinedScore;
    } else
      candidates.set(candidate.entry.id, {
        entry: candidate.entry,
        semanticScore: 0,
        keywordScore: candidate.score,
        graphScore: 0,
        channelScores: { [RECALL_CHANNEL_KEYWORD]: candidate.score },
        combinedScore: candidate.score * MERGE_KEYWORD_WEIGHT,
        tokenMatches: candidate.tokenMatches,
        channels: [RECALL_CHANNEL_KEYWORD],
        preRerankScore: candidate.score * MERGE_KEYWORD_WEIGHT,
        finalScore: candidate.score * MERGE_KEYWORD_WEIGHT,
      });
  }
  return [...candidates.values()].sort(
    (left, right) =>
      right.combinedScore - left.combinedScore || left.entry.id.localeCompare(right.entry.id),
  );
}

export interface RerankableEntryView {
  decayMeta?: { decayState?: string } | null;
  boundary?: BoundaryEntryView | null;
}

export function rerankCandidates<E extends { id: string } & RerankableEntryView>(
  candidates: MergedCandidateLike<E>[],
  tokens: string[],
  options: {
    maxCandidates: number;
    boundaryContext?: BoundaryContext;
    freshnessConfig: FreshnessDecayConfig;
    earlyTerminationThreshold?: number;
  },
): MergedCandidateLike<E>[] {
  const topScore = Math.max(...candidates.map((candidate) => candidate.combinedScore));
  const threshold = options.earlyTerminationThreshold;
  const retained =
    threshold === undefined
      ? candidates
      : candidates.filter((candidate) => candidate.combinedScore >= topScore * threshold);
  return retained
    .map((candidate) => {
      const preRerankScore = candidate.combinedScore;
      let finalScore = preRerankScore;
      if (
        candidate.channels.includes(RECALL_CHANNEL_SEMANTIC) &&
        candidate.channels.includes(RECALL_CHANNEL_KEYWORD)
      )
        finalScore += DUAL_CHANNEL_RERANK_BOOST;
      if (
        tokens.length > 0 &&
        new Set(candidate.tokenMatches.map((match) => match.token)).size / tokens.length >=
          TOKEN_COVERAGE_RATIO
      )
        finalScore += TOKEN_COVERAGE_BONUS;
      if (candidate.entry.decayMeta?.decayState === 'stale') finalScore -= STALE_DECAY_PENALTY;
      finalScore += computeBoundaryScoreDelta(candidate.entry, options.boundaryContext);
      finalScore = Math.min(1, Math.max(0, finalScore));
      return {
        ...candidate,
        combinedScore: finalScore,
        preRerankScore,
        finalScore,
      };
    })
    .sort(
      (left, right) =>
        right.combinedScore - left.combinedScore || left.entry.id.localeCompare(right.entry.id),
    )
    .slice(0, options.maxCandidates);
}

// ---------------------------------------------------------------------------
// Graph merge
// ---------------------------------------------------------------------------

export const GRAPH_SCORE_BOOST_FACTOR = 0.2;

export function mergeCandidatesWithGraph<E extends { id: string }>(
  hybridMerged: MergedCandidateLike<E>[],
  graphCandidates: RecallCandidateLike<E>[],
): MergedCandidateLike<E>[] {
  const result = [...hybridMerged];

  for (const graphCandidate of graphCandidates) {
    const existing = result.find((c) => c.entry.id === graphCandidate.entry.id);

    if (existing) {
      existing.channels.push(RECALL_CHANNEL_GRAPH);
      existing.graphScore = graphCandidate.score;
      const preRerankScore = existing.combinedScore;
      const finalScore = Math.min(
        1,
        preRerankScore + graphCandidate.score * GRAPH_SCORE_BOOST_FACTOR,
      );
      existing.combinedScore = finalScore;
      existing.preRerankScore = preRerankScore;
      existing.finalScore = finalScore;
    } else {
      const score = graphCandidate.score;
      result.push({
        entry: graphCandidate.entry,
        semanticScore: 0,
        keywordScore: 0,
        graphScore: graphCandidate.score,
        channelScores: { [RECALL_CHANNEL_GRAPH]: graphCandidate.score },
        combinedScore: score,
        tokenMatches: [],
        channels: [RECALL_CHANNEL_GRAPH],
        preRerankScore: score,
        finalScore: score,
      });
    }
  }

  result.sort((a, b) => b.combinedScore - a.combinedScore);
  return result;
}

/** Routing channels actually used by a recall execution (semantic when empty). */
export function inferChannelsFromMerged(
  mergedCandidates?: Array<{ channels: string[] }> | null,
): string[] {
  if (!mergedCandidates || mergedCandidates.length === 0) {
    return [RECALL_CHANNEL_SEMANTIC];
  }
  const channelSet = new Set<string>();
  for (const candidate of mergedCandidates) {
    for (const ch of candidate.channels) {
      channelSet.add(ch);
    }
  }
  return Array.from(channelSet);
}

export interface GraphRecallTraceLike {
  mergeMode: 'mixed';
  graphExpansion: 'local-neighborhood';
  backendKind: GraphQueryRuntimeState['backendKind'];
  backendMode: GraphQueryRuntimeState['mode'];
  graphCandidateCount: number;
}

export function createGraphRecallTrace(
  runtimeState: GraphQueryRuntimeState | undefined,
  graphCandidateCount: number,
): GraphRecallTraceLike {
  return {
    mergeMode: 'mixed',
    graphExpansion: 'local-neighborhood',
    backendKind: runtimeState?.backendKind ?? 'memory',
    backendMode: runtimeState?.mode ?? 'disabled',
    graphCandidateCount,
  };
}

// ---------------------------------------------------------------------------
// Semantic scoring
// ---------------------------------------------------------------------------

export interface ScorableEntryView {
  labels: readonly string[];
  scope: string;
  shortcut: string;
  detail: string;
}

export function buildEmbeddingText(entry: ScorableEntryView): string {
  const labelsText = entry.labels.join(' ');
  return `${entry.shortcut}\n${entry.detail}\n${labelsText}`.trim();
}

export const LEXICAL_BOOST_FULL_MATCH = 0.55;
export const LEXICAL_BOOST_PER_TOKEN = 0.3;
export const LABEL_SCORE_BOOST = 0.05;
export const SCOPE_SCORE_BOOST = 0.03;

export function computeLexicalIntentBoost(seed: string, entry: ScorableEntryView): number {
  const queryTokens = normalizeQuery(seed);
  if (queryTokens.length === 0) return 0;

  const entryTokens = normalizeQuery(buildEmbeddingText(entry));
  if (entryTokens.length === 0) return 0;

  const overlapCount = queryTokens.filter((token) => entryTokens.includes(token)).length;
  if (overlapCount === 0) return 0;

  const ratio = overlapCount / queryTokens.length;
  const baseBoost = ratio >= 1 ? LEXICAL_BOOST_FULL_MATCH : ratio * LEXICAL_BOOST_PER_TOKEN;
  return Math.min(LEXICAL_BOOST_FULL_MATCH, baseBoost);
}

export function computeScore(
  similarity: number,
  entry: ScorableEntryView,
  filters: RetrievalQuery['filters'],
  seed?: string,
): number {
  let score = Math.max(0, Math.min(1, similarity));

  if (filters.labels.length > 0) {
    const matchingLabels = filters.labels.filter((label) => entry.labels.includes(label));
    const labelBoost = matchingLabels.length * LABEL_SCORE_BOOST;
    score = Math.min(1, score + labelBoost);
  }

  if (filters.scopes.length === 1 && filters.scopes[0] === entry.scope) {
    score = Math.min(1, score + SCOPE_SCORE_BOOST);
  }

  if (seed) {
    const lexicalBoost = computeLexicalIntentBoost(seed, entry);
    score = Math.min(1, score + lexicalBoost);
  }

  return score;
}
