import { createHash } from 'node:crypto';

import type {
  AnalysisSnapshot,
  CandidateSubmission,
  DuplicateCase,
  DuplicateMatch,
} from '@trapmap/contracts';

export interface CandidateCorpusReadPort {
  listApprovedTraps(teamId: string | null): Promise<
    ReadonlyArray<{
      id: string;
      teamId: string | null;
      shortcut: string;
      detail: string;
      labels: string[];
    }>
  >;
  listApprovedSkills(teamId: string | null): Promise<
    ReadonlyArray<{
      id: string;
      teamId: string | null;
      title: string;
      summary: string;
      keywords: string[];
    }>
  >;
}

export interface NormalizedDuplicateInput {
  fingerprint: string;
  title: string;
  detail: string;
  keywords: string[];
  tokens: string[];
}

function tokens(text: string): string[] {
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
      tokens: tokens(`${trap.shortcut}\n${trap.detail}`),
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
    tokens: tokens(files.map((file) => file.path).join('\n')),
  };
}

function overlap(left: string[], right: string[]): string[] {
  const rightTerms = new Set(right.map((term) => term.toLowerCase()));
  return left.filter((term) => rightTerms.has(term.toLowerCase()));
}

export function createCandidateDuplicateDetector(
  corpus: CandidateCorpusReadPort,
  deps: { now(): string; createId(): string },
): (
  candidate: CandidateSubmission,
  normalized: NormalizedDuplicateInput,
) => Promise<{
  analysisSnapshot: AnalysisSnapshot;
  duplicateCase: DuplicateCase | null;
}> {
  return async (candidate, normalized) => {
    const [traps, skills] = await Promise.all([
      corpus.listApprovedTraps(candidate.teamId),
      corpus.listApprovedSkills(candidate.teamId),
    ]);
    const exactTrap = traps.find(
      (trap) =>
        trap.shortcut.trim() === normalized.title.trim() &&
        trap.detail.trim() === normalized.detail.trim(),
    );
    const matches: DuplicateMatch[] = exactTrap
      ? [
          {
            entityType: 'trap',
            entityId: exactTrap.id,
            entityTitle: exactTrap.shortcut,
            similarityScore: 1,
            matchType: 'exact',
            overlapDetails: {
              sharedKeywords: overlap(normalized.keywords, exactTrap.labels),
              sharedTokens: overlap(
                normalized.tokens,
                tokens(`${exactTrap.shortcut}\n${exactTrap.detail}`),
              ),
              textOverlapPercent: 100,
            },
          },
        ]
      : skills
          .filter((skill) => skill.title.trim() === normalized.title.trim())
          .map((skill) => ({
            entityType: 'skill' as const,
            entityId: skill.id,
            entityTitle: skill.title,
            similarityScore: 1,
            matchType: 'exact' as const,
            overlapDetails: {
              sharedKeywords: overlap(normalized.keywords, skill.keywords),
              sharedTokens: overlap(normalized.tokens, tokens(`${skill.title}\n${skill.summary}`)),
              textOverlapPercent: 100,
            },
          }));
    const duplicateCase =
      matches.length === 0
        ? null
        : {
            id: deps.createId(),
            candidateId: candidate.id,
            detectedAt: deps.now(),
            detectionVersion: 'owner-v1',
            matches,
            highestSimilarity: 1,
            hasExactDuplicate: true,
            duplicateType: 'exact' as const,
          };
    return {
      analysisSnapshot: {
        normalizedAt: deps.now(),
        fingerprint: normalized.fingerprint,
        keywords: normalized.keywords,
        tokens: normalized.tokens,
        duplicateTrace: { detector: 'postgresql', matchedLane: matches.length ? 'exact' : 'none' },
      },
      duplicateCase,
    };
  };
}
