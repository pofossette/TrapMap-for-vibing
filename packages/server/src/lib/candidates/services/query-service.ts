/**
 * Query service for candidate routes.
 *
 * Handles candidate and duplicate-case read operations. Separated from
 * route handlers to keep request parsing distinct from data aggregation.
 *
 * @module candidates/services/query
 */

import type { DuplicateJobBundleResponse, DuplicateJobMatchEntity } from '@trapmap/contracts';
import type { ArtifactReadProjection } from '@trapmap/backend-core';
import { AppError } from '@trapmap/server/lib/errors.js';
import type {
  CandidateRepository,
  DuplicateRepository,
  KnowledgeRepository,
} from '@trapmap/server/lib/repos/index.js';

/** Dependencies required by the query service. */
export interface QueryDeps {
  repos: {
    candidate: CandidateRepository;
    duplicate: DuplicateRepository;
    knowledge: KnowledgeRepository;
    artifact: ArtifactReadProjection;
  };
}

/**
 * Fetch a single candidate by ID with ownership / review access check.
 *
 * @param deps - Application dependencies
 * @param candidateId - Candidate identifier
 * @param userId - Authenticated user ID (if any)
 * @param isSystemAdmin - Whether the caller has system-admin subject type
 * @returns The candidate record
 */
export async function getCandidate(
  deps: QueryDeps,
  candidateId: string,
  userId: string | undefined,
  isSystemAdmin: boolean,
) {
  const { candidate: candidateRepo } = deps.repos;
  const candidate = await candidateRepo.getById(candidateId);

  if (!candidate) {
    throw new AppError(404, 'candidate_not_found', 'Candidate not found');
  }

  const isOwner = userId === candidate.submittedBy;
  if (!isOwner && !isSystemAdmin) {
    throw new AppError(403, 'forbidden', 'Access denied');
  }

  return candidate;
}

/**
 * List candidates, optionally filtered by status.
 * When no status is provided, aggregates across all known statuses.
 */
export async function listCandidates(deps: QueryDeps, statusFilter?: string) {
  const { candidate: candidateRepo } = deps.repos;

  let items: Awaited<ReturnType<typeof candidateRepo.listByStatus>>;
  if (statusFilter) {
    items = await candidateRepo.listByStatus(statusFilter as any);
  } else {
    const allStatuses = [
      'received',
      'queued',
      'analyzing',
      'ready_for_review',
      'duplicate_detected',
      'error',
      'resolved',
    ] as const;
    const results = await Promise.all(allStatuses.map((s) => candidateRepo.listByStatus(s as any)));
    items = results.flat();
  }

  return { items, total: items.length };
}

/** List all duplicate cases. */
export async function listDuplicateCases(deps: QueryDeps) {
  const { duplicate: duplicateRepo } = deps.repos;
  const items = await duplicateRepo.listAll();
  return { items, total: items.length };
}

/** Get the duplicate case for a specific candidate. */
export async function getDuplicateCase(deps: QueryDeps, candidateId: string) {
  const { duplicate: duplicateRepo } = deps.repos;
  const duplicates = await duplicateRepo.listByCandidate(candidateId);
  const duplicateCase = duplicates[0] ?? null;

  if (!duplicateCase) {
    throw new AppError(404, 'duplicate_case_not_found', 'Duplicate case not found');
  }

  return duplicateCase;
}

// ---------------------------------------------------------------------------
// Helpers for building bundle entity data
// ---------------------------------------------------------------------------

async function buildTrapEntity(
  repos: QueryDeps['repos'],
  entityId: string,
): Promise<DuplicateJobMatchEntity | null> {
  const trap = await repos.knowledge.getById(entityId);
  if (!trap) return null;

  return {
    entityType: 'trap',
    entityId: trap.id,
    title: trap.shortcut,
    shortcut: trap.shortcut,
    detail: trap.detail,
    labels: trap.labels,
    scope: trap.scope,
    requiredLevel: trap.requiredLevel,
  };
}

async function buildSkillEntity(
  repos: QueryDeps['repos'],
  entityId: string,
): Promise<DuplicateJobMatchEntity | null> {
  const skill = await repos.artifact.getById(entityId);
  if (!skill) return null;

  return {
    entityType: 'skill',
    entityId: skill.id,
    title: skill.title,
    slug: skill.slug,
    files: skill.latestRevision.files.map((f: any) => ({
      path: f.path,
      sha256: f.sha256,
      sizeBytes: f.sizeBytes,
      mediaType: f.mediaType,
    })),
  };
}

/**
 * Build a full duplicate-job bundle for offline review.
 *
 * @param deps - Application dependencies
 * @param candidateId - Candidate identifier
 * @returns The complete bundle response
 */
export async function buildDuplicateBundle(
  deps: QueryDeps,
  candidateId: string,
): Promise<DuplicateJobBundleResponse> {
  const { candidate: candidateRepo, duplicate: duplicateRepo } = deps.repos;

  const candidate = await candidateRepo.getById(candidateId);
  if (!candidate) {
    throw new AppError(404, 'candidate_not_found', 'Candidate not found');
  }

  const cases = await duplicateRepo.listByCandidate(candidateId);
  const duplicateCase = cases[0] ?? null;
  if (!duplicateCase) {
    throw new AppError(404, 'duplicate_case_not_found', 'No duplicate case for this candidate');
  }

  // Build match entries with entity data
  const matches: DuplicateJobBundleResponse['matches'] = [];

  for (const match of duplicateCase.matches) {
    const entity =
      match.entityType === 'trap'
        ? await buildTrapEntity(deps.repos, match.entityId)
        : await buildSkillEntity(deps.repos, match.entityId);

    if (entity) {
      matches.push({ match, entity });
    }
  }

  const expectedResultSchema = {
    description: 'Manual resolution decision for duplicate candidate',
    fields: [
      {
        name: 'decision',
        type: 'enum',
        required: true,
        description: "'independent' or 'merged'",
      },
      {
        name: 'notes',
        type: 'string',
        required: true,
        description: 'Explanation of the decision (1-1000 chars)',
      },
      {
        name: 'mergedWith',
        type: 'object',
        required: false,
        description: 'Required if decision is "merged": { entityType, entityId }',
      },
    ],
  };

  return {
    candidate: {
      id: candidate.id,
      sourceType: candidate.sourceType,
      status: candidate.status,
      receivedAt: candidate.receivedAt,
      submittedBy: candidate.submittedBy,
    },
    originalPayload: candidate.originalPayload,
    analysisSnapshot: candidate.analysisSnapshot,
    matches,
    expectedResultSchema,
  };
}
