/**
 * Candidate-ingestion bounded context — dedup policy.
 *
 * Pure candidate normalization, fingerprinting and duplicate-detection
 * rules with zero framework / DB / I/O imports (contracts types and
 * node:crypto stdlib only). The service application layer feeds corpus
 * data through these rules; the PostgreSQL owner persists the results.
 */

import { createHash } from 'node:crypto';

import type {
  AnalysisSnapshot,
  CandidateCorpusReadPort,
  CandidateSubmission,
  DuplicateCase,
  DuplicateMatch,
} from '@trapmap/contracts';

export type { CandidateCorpusReadPort } from '@trapmap/contracts';

/** Semantic-similarity cutoff below which a candidate is not a duplicate match. */
export const SEMANTIC_MATCH_CUTOFF = 0.38;

/** Similarity at or above which a semantic match is classified high-overlap. */
export const HIGH_OVERLAP_THRESHOLD = 0.72;

/** Detector version stamped into duplicate cases. */
export const DETECTION_VERSION = 'owner-v1' as const;

export interface NormalizedDuplicateInput {
  fingerprint: string;
  title: string;
  detail: string;
  keywords: string[];
  tokens: string[];
}

export function dedupTokens(text: string): string[] {
  return [
    ...new Set(
      text
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((part) => part.length >= 3),
    ),
  ];
}

function fingerprint(parts: string[]): string {
  return createHash('sha256').update(parts.join('\n'), 'utf8').digest('hex');
}

export function buildNormalizedDuplicateInput(
  candidate: CandidateSubmission,
): NormalizedDuplicateInput {
  if (candidate.sourceType === 'trap' && candidate.originalPayload.trap) {
    const trap = candidate.originalPayload.trap;
    return {
      fingerprint: fingerprint([
        trap.shortcut.trim(),
        trap.detail.trim(),
        ...[...trap.labels].sort(),
      ]),
      title: trap.shortcut,
      detail: trap.detail,
      keywords: [...new Set(trap.labels)],
      tokens: dedupTokens(`${trap.shortcut}\n${trap.detail}`),
    };
  }

  const skill = candidate.originalPayload.skill;
  if (!skill) throw new Error(`Candidate ${candidate.id} has no skill payload`);
  const files = [...skill.files].sort((left, right) => left.path.localeCompare(right.path));
  const title = files[0]?.path ?? candidate.id;
  return {
    fingerprint: fingerprint(files.map((file) => file.sha256)),
    title,
    detail: files.map((file) => file.path).join('\n'),
    keywords: [],
    tokens: dedupTokens(files.map((file) => file.path).join('\n')),
  };
}

function overlap(left: string[], right: string[]): string[] {
  const rightTerms = new Set(right.map((term) => term.toLowerCase()));
  return left.filter((term) => rightTerms.has(term.toLowerCase()));
}

export function dedupSimilarity(left: string[], right: string[]): number {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  if (leftSet.size === 0 || rightSet.size === 0) return 0;
  const shared = [...leftSet].filter((term) => rightSet.has(term)).length;
  return shared / new Set([...leftSet, ...rightSet]).size;
}

function buildMatch(
  entityType: 'trap' | 'skill',
  entityId: string,
  entityTitle: string,
  candidate: NormalizedDuplicateInput,
  corpusText: string,
  keywords: string[],
  exact: boolean,
): DuplicateMatch | null {
  const corpusTokens = dedupTokens(corpusText);
  const score = exact ? 1 : dedupSimilarity(candidate.tokens, corpusTokens);
  if (!exact && score < SEMANTIC_MATCH_CUTOFF) return null;
  return {
    entityType,
    entityId,
    entityTitle,
    similarityScore: exact ? 1 : Math.round(score * 1000) / 1000,
    matchType: exact
      ? 'exact'
      : score >= HIGH_OVERLAP_THRESHOLD
        ? 'high-overlap'
        : 'semantic-similar',
    overlapDetails: {
      sharedKeywords: overlap(candidate.keywords, keywords),
      sharedTokens: overlap(candidate.tokens, corpusTokens),
      textOverlapPercent: exact ? 100 : Math.round(score * 1000) / 10,
    },
  };
}

export function dedupBatchSimilarities(left: string[], rights: string[][]): number[] {
  return rights.map((right) => dedupSimilarity(left, right));
}

export function createCandidateDuplicateDetector(
  corpus: CandidateCorpusReadPort,
  deps: { now(): string; createId(): string },
) {
  return async (candidate: CandidateSubmission, normalized: NormalizedDuplicateInput) => {
    const [traps, skills] = await Promise.all([
      corpus.listApprovedTraps(candidate.teamId),
      corpus.listApprovedSkills(candidate.teamId),
    ]);
    const matches: DuplicateMatch[] = [
      ...traps.map((trap) =>
        buildMatch(
          'trap',
          trap.id,
          trap.shortcut,
          normalized,
          `${trap.shortcut}\n${trap.detail}`,
          trap.labels,
          fingerprint([trap.shortcut.trim(), trap.detail.trim(), ...[...trap.labels].sort()]) ===
            normalized.fingerprint,
        ),
      ),
      ...skills.map((skill) =>
        buildMatch(
          'skill',
          skill.id,
          skill.title,
          normalized,
          `${skill.title}\n${skill.summary}`,
          skill.keywords,
          skill.title.trim() === normalized.title.trim(),
        ),
      ),
    ].filter((match): match is DuplicateMatch => match !== null);
    matches.sort(
      (left, right) =>
        right.similarityScore - left.similarityScore ||
        left.entityType.localeCompare(right.entityType) ||
        left.entityId.localeCompare(right.entityId),
    );
    const hasExactMatch = matches.some((match) => match.matchType === 'exact');
    const duplicateCase =
      matches.length === 0
        ? null
        : {
            id: deps.createId(),
            candidateId: candidate.id,
            detectedAt: deps.now(),
            detectionVersion: DETECTION_VERSION,
            matches,
            highestSimilarity: matches[0]?.similarityScore ?? 0,
            hasExactDuplicate: matches.some((match) => match.matchType === 'exact'),
            duplicateType: hasExactMatch ? 'exact' : 'semantic',
          };
    return {
      analysisSnapshot: {
        normalizedAt: deps.now(),
        fingerprint: normalized.fingerprint,
        keywords: normalized.keywords,
        tokens: normalized.tokens,
        duplicateTrace: {
          detector: 'postgresql' as const,
          matchedLane: (hasExactMatch ? 'exact' : matches.length ? 'indexed-recall' : 'none') as
            | 'exact'
            | 'indexed-recall'
            | 'none'
            | 'fallback',
        },
      } as AnalysisSnapshot,
      duplicateCase: duplicateCase as DuplicateCase | null,
    };
  };
}
