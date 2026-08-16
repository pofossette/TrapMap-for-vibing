/**
 * Shared judgment-node contract fixtures (design D8).
 *
 * Fixed input samples and output validators for the six judgment capability
 * nodes. Every implementation (rule / llm / hybrid) runs the same assertion
 * set over these fixtures, so contract stability is enforced across
 * implementations (design D8.6: "rule/llm/hybrid 多实现同一断言集").
 *
 * These fixtures are framework-free: they only import contracts types and
 * zod, so both backend-core-owned and service-package implementations can
 * share them.
 */

import { z } from 'zod';

import type {
  AnalysisSnapshot,
  CandidateCorpusReadPort,
  CandidateSubmission,
  DuplicateCase,
  LabelAlignmentInput,
} from '@trapmap/contracts';
import type {
  GovernanceConflictCandidateSet,
  GovernanceConflictReadPort,
} from '../ports/internal-ports.js';
import { labelAlignmentDecisionSchema } from '@trapmap/contracts';
import { buildNormalizedDuplicateInput } from '../candidate-ingestion/domain/dedup.js';
import type {
  ArtifactDerivationContext,
  ArtifactDerivationInput,
} from '../ports/artifact-derivation-ports.js';
import type { ChannelMergeInput } from '../ports/channel-merge-ports.js';
import type { ConflictTriggerInput, ConflictTriggerResult } from '../ports/conflict-ports.js';
import type { DedupStrategyResult } from '../ports/dedup-ports.js';
import type { IntentRecognitionInput, IntentRecognitionResult } from '../ports/intent-ports.js';
import type { LabelAlignmentResult } from '../ports/label-alignment-ports.js';
import type { MergedCandidateLike, RecallCandidateLike } from '../knowledge-read/domain/ranking.js';

/** Approved trap record shape returned by the corpus port. */
export interface FixtureTrapRecord {
  id: string;
  teamId: string | null;
  shortcut: string;
  detail: string;
  labels: string[];
}

/** Approved skill record shape returned by the corpus port. */
export interface FixtureSkillRecord {
  id: string;
  teamId: string | null;
  title: string;
  summary: string;
  keywords: string[];
}

// ---------------------------------------------------------------------------
// intent-recognition
// ---------------------------------------------------------------------------

export const intentSampleInput: IntentRecognitionInput = {
  query: 'how do I reset an admin password?',
  requestedMode: 'hybrid',
  knownModes: ['semantic', 'hybrid', 'graph-assisted'],
  seed: 'reset admin password',
};

export const intentResultSchema = z.object({
  mode: z.string().min(1),
  confidence: z.number().min(0).max(1),
  reason: z.string().min(1),
  trace: z
    .object({
      routeFamily: z.string().min(1),
    })
    .optional(),
});

export function assertIntentResultShape(result: IntentRecognitionResult): void {
  intentResultSchema.parse(result);
}

// ---------------------------------------------------------------------------
// dedup-strategy
// ---------------------------------------------------------------------------

/** Build the fixed sample candidate (trap source) + its normalized input. */
export function buildSampleDedupCandidate(): CandidateSubmission {
  return {
    id: 'cand-dedup-1',
    sourceType: 'trap',
    submittedBy: 'user-1',
    teamId: null,
    status: 'received',
    originalPayload: {
      trap: {
        scope: 'global',
        labels: ['git'],
        shortcut: 'Reset admin password',
        detail:
          'When the admin password is lost, reset it through the recovery flow: stop the service, rotate the secret, restart.',
        requiredLevel: 0,
      },
    },
    analysisSnapshot: null,
    duplicateCase: null,
    receivedAt: '2026-08-16T00:00:00.000Z',
    queuedAt: null,
    analyzingAt: null,
    completedAt: null,
    lastError: null,
    retryCount: 0,
    manualResult: null,
  };
}

/** Build the fixed sample dedup input (independent candidate + empty corpus). */
export function buildSampleDedupInput(): {
  candidate: CandidateSubmission;
  normalized: ReturnType<typeof buildNormalizedDuplicateInput>;
  corpus: CandidateCorpusReadPort;
} {
  const candidate = buildSampleDedupCandidate();
  return {
    candidate,
    normalized: buildNormalizedDuplicateInput(candidate),
    corpus: createStubCandidateCorpus(),
  };
}

/** Stub corpus with an explicit approved set (empty by default). */
export function createStubCandidateCorpus(
  traps: FixtureTrapRecord[] = [],
  skills: FixtureSkillRecord[] = [],
): CandidateCorpusReadPort {
  return {
    async listApprovedTraps() {
      return traps;
    },
    async listApprovedSkills() {
      return skills;
    },
  };
}

export const dedupResultSchema = z.object({
  duplicateCase: z.custom<DuplicateCase>().nullable(),
  analysisSnapshot: z.custom<AnalysisSnapshot>(),
  strategy: z.enum(['rule', 'llm', 'hybrid']),
});

export function assertDedupResultShape(result: DedupStrategyResult): void {
  dedupResultSchema.parse(result);
  // Contract invariant: an independent candidate must not produce a duplicate case.
  if (result.duplicateCase !== null) {
    throw new Error('dedup contract: independent sample must yield duplicateCase=null');
  }
}

// ---------------------------------------------------------------------------
// conflict-trigger
// ---------------------------------------------------------------------------

export const conflictSampleInput: ConflictTriggerInput = { entryId: 'entry-conflict-1' };

export function createStubConflictRead(
  candidateSet: GovernanceConflictCandidateSet | null,
): GovernanceConflictReadPort {
  return {
    async getApprovedConflictCandidates() {
      return candidateSet;
    },
  };
}

export const conflictResultSchema = z.object({
  detectedCount: z.number().int().min(0),
  triggered: z.boolean(),
  reason: z.string().optional(),
});

export function assertConflictResultShape(result: ConflictTriggerResult): void {
  conflictResultSchema.parse(result);
  if (result.triggered !== result.detectedCount > 0) {
    throw new Error('conflict contract: triggered must equal detectedCount > 0');
  }
}

// ---------------------------------------------------------------------------
// artifact-derivation
// ---------------------------------------------------------------------------

export const sampleArtifactPayloads = [
  {
    artifactId: 'art-derive-1',
    revision: 1,
    path: 'SKILL.md',
    sha256: 'a'.repeat(64),
    sizeBytes: 320,
    mediaType: 'text/markdown',
    storedAt: '2026-08-16T00:00:00.000Z',
    content: `---
title: Git Workflow
labels: [git, workflow]
---

# Situation
When a team collaborates on a shared repository, coordination breaks down.

# Problem
Merge conflicts and lost work accumulate without a shared workflow.

# Goal
Establish a review-based git workflow that keeps main stable.

## Guide
Use feature branches, open pull requests, and require review before merge.
`,
  },
  {
    artifactId: 'art-derive-1',
    revision: 1,
    path: 'references/faq.md',
    sha256: 'b'.repeat(64),
    sizeBytes: 90,
    mediaType: 'text/markdown',
    storedAt: '2026-08-16T00:00:00.000Z',
    content: '## FAQ\nRebase or merge? Prefer merge commits for auditability.\n',
  },
];

export const sampleArtifactContext: ArtifactDerivationContext = {
  artifactId: 'art-derive-1',
  labels: ['git'],
  title: 'Git Workflow',
  scope: 'global',
  requiredLevel: 0,
};

export function buildSampleArtifactInput(): ArtifactDerivationInput {
  return { payloads: sampleArtifactPayloads, context: sampleArtifactContext };
}

export const artifactOutputSchema = z.object({
  profile: z.unknown().nullable(),
  capsules: z.array(z.unknown()).min(1),
  clientManifest: z.unknown().nullable(),
  sourceHash: z.string().min(1),
  derivedAt: z.string().min(1),
});

export function assertArtifactOutputShape(output: {
  profile: unknown;
  capsules: unknown[];
  clientManifest: unknown;
  sourceHash: string;
  derivedAt: string;
}): void {
  artifactOutputSchema.parse(output);
  if (output.profile === null) {
    throw new Error('artifact contract: eligible SKILL.md sample must yield a profile');
  }
  if (output.capsules.length === 0) {
    throw new Error('artifact contract: structured sample must yield at least one capsule');
  }
}

// ---------------------------------------------------------------------------
// label-alignment
// ---------------------------------------------------------------------------

export const sampleLabelInput: LabelAlignmentInput = {
  rawLabel: 'git',
  rawEvidence: 'SKILL.md documents a git-based collaboration workflow.',
  candidates: [
    {
      id: 'label-git',
      canonicalName: 'Git',
      definition: 'Version control workflows',
      aliases: ['git', 'version control'],
      recallReason: 'exact-alias',
    },
  ],
};

export const labelResultSchema = z.object({
  decision: z.unknown(),
  candidates: z.array(z.unknown()).min(1),
  llmSuccess: z.boolean(),
});

export function assertLabelResultShape(result: LabelAlignmentResult): void {
  labelResultSchema.parse(result);
  // decision must satisfy the shared contracts decision schema
  labelAlignmentDecisionSchema.parse(result.decision);
}

// ---------------------------------------------------------------------------
// channel-merge
// ---------------------------------------------------------------------------

interface FixtureEntry {
  id: string;
}

function hybridCandidate(entryId: string, score: number): MergedCandidateLike<FixtureEntry> {
  return {
    entry: { id: entryId },
    semanticScore: score,
    keywordScore: 0,
    channelScores: { semantic: score },
    combinedScore: score,
    tokenMatches: [],
    channels: ['semantic'],
    preRerankScore: score,
    finalScore: score,
  };
}

function graphCandidate(entryId: string, score: number): RecallCandidateLike<FixtureEntry> {
  return { entry: { id: entryId }, channel: 'graph', score, tokenMatches: [] };
}

export function buildSampleChannelInput(): ChannelMergeInput<FixtureEntry> {
  return {
    hybridCandidates: [hybridCandidate('entry-a', 0.7), hybridCandidate('entry-b', 0.4)],
    graphCandidates: [graphCandidate('entry-b', 0.5), graphCandidate('entry-c', 0.8)],
  };
}

export function assertChannelMergeShape(merged: MergedCandidateLike<FixtureEntry>[]): void {
  if (!Array.isArray(merged) || merged.length === 0) {
    throw new Error('channel-merge contract: merged list must be non-empty');
  }
  for (const item of merged) {
    if (typeof item.combinedScore !== 'number' || typeof item.entry?.id !== 'string') {
      throw new Error('channel-merge contract: malformed merged candidate');
    }
  }
  // Contract invariant: merged list must stay sorted by combinedScore desc
  for (let i = 1; i < merged.length; i += 1) {
    const prev = merged[i - 1]!;
    const curr = merged[i]!;
    if (prev.combinedScore < curr.combinedScore) {
      throw new Error('channel-merge contract: merged list must be sorted by combinedScore desc');
    }
  }
}
