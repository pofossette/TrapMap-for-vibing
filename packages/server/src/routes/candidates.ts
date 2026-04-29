import { createHash } from 'node:crypto';
import {
  DuplicateJobBundleResponseSchema,
  ManualResultSubmissionSchema,
  applyResolutionResponseSchema,
  candidateListResponseSchema,
  candidateStatusResponseSchema,
  candidateSubmissionRequestSchema,
  candidateSubmissionResponseSchema,
  duplicateCaseListResponseSchema,
  duplicateCaseResponseSchema,
  manualResultResponseSchema,
} from '@trapmap/contracts';
import type { DuplicateJobBundleResponse, DuplicateJobMatchEntity } from '@trapmap/contracts';
import type { FastifyPluginAsync } from 'fastify';

import { createAuditEvent } from '../lib/audit.js';
import {
  type CandidateProcessorServices,
  scheduleCandidateProcessing,
} from '../lib/candidates/processor.js';
import { applyManualResultResolution } from '../lib/candidates/reconcile.js';
import {
  attachManualResult,
  createCandidateSubmission,
  getAllDuplicateCases,
  getCandidateById,
  getCandidatesByStatus,
  getDuplicateCaseByCandidateId,
} from '../lib/candidates/store.js';
import { AppError } from '../lib/errors.js';
import { runKnowledgeIndexEvent } from '../lib/indexing/events.js';
import { requirePermission } from '../lib/rbac.js';
import { resolveAuthContext } from '../lib/session.js';
import { type StoreData, nowIso } from '../lib/store.js';
import { logUserOperation } from '../lib/user-ops-log.js';

function requireRealUser(userId: string | undefined): string {
  if (!userId) {
    throw new AppError(403, 'user_required', 'This workflow requires a real member account');
  }
  return userId;
}

/**
 * Compute SHA-256 hash from content (base64 or text).
 */
function computeSha256(content: string): string {
  // Try to decode as base64 first, otherwise use as text
  let buffer: Buffer;
  try {
    buffer = Buffer.from(content, 'base64');
    // Verify it was valid base64 by re-encoding
    if (buffer.toString('base64') !== content) {
      buffer = Buffer.from(content, 'utf-8');
    }
  } catch {
    buffer = Buffer.from(content, 'utf-8');
  }
  return createHash('sha256').update(buffer).digest('hex');
}

/**
 * Helper to build entity data for matched trap.
 */
function buildTrapEntity(data: StoreData, entityId: string): DuplicateJobMatchEntity | null {
  const trap = data.knowledgeEntries.find((e) => e.id === entityId);
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

/**
 * Helper to build entity data for matched skill.
 */
function buildSkillEntity(data: StoreData, entityId: string): DuplicateJobMatchEntity | null {
  const skill = data.skillArtifacts.find((a) => a.id === entityId);
  if (!skill) return null;

  return {
    entityType: 'skill',
    entityId: skill.id,
    title: skill.title,
    slug: skill.slug,
    files: skill.latestRevision.files.map((f) => ({
      path: f.path,
      sha256: f.sha256,
      sizeBytes: f.sizeBytes,
      mediaType: f.mediaType,
    })),
  };
}

export const candidateRoutes: FastifyPluginAsync = async (app) => {
  // POST /v1/candidates - Submit a new candidate
  app.post('/v1/candidates', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:submit');

    const body = candidateSubmissionRequestSchema.parse(request.body);
    const submittedBy = requireRealUser(auth.user?.id);

    // Validate team context for project scope
    const scope = body.sourceType === 'trap' ? body.payload.scope : body.payload.scope;
    if (scope === 'project' && !auth.activeTeamId) {
      throw new AppError(
        400,
        'active_team_required',
        'Project-scoped candidates require an active team',
      );
    }

    // Build the payload for storage
    const originalPayload =
      body.sourceType === 'trap'
        ? {
            trap: {
              scope: body.payload.scope,
              labels: body.payload.labels,
              shortcut: body.payload.shortcut,
              detail: body.payload.detail,
              requiredLevel: body.payload.requiredLevel ?? auth.securityLevel,
            },
            skill: undefined,
          }
        : {
            trap: undefined,
            skill: {
              files: body.payload.files.map((f) => ({
                path: f.path,
                sha256: computeSha256(f.content),
                sizeBytes: Buffer.byteLength(f.content, 'utf-8'),
                mediaType: f.mediaType,
              })),
              metadata: {
                title: '', // Will be computed during processing
                slug: '', // Will be computed during processing
                labels: body.payload.labels,
              },
            },
          };

    const candidate = await app.skillShareer.store.transact((data) => {
      return createCandidateSubmission({
        store: app.skillShareer.store,
        data,
        sourceType: body.sourceType,
        submittedBy,
        teamId: scope === 'project' ? auth.activeTeamId : null,
        originalPayload,
      });
    });

    // Fire-and-forget async processing
    const services: CandidateProcessorServices = {
      store: app.skillShareer.store,
      getSnapshot: () => app.skillShareer.store.snapshot(),
    };
    scheduleCandidateProcessing(candidate.id, services);

    // Log user operation
    void logUserOperation(app.skillShareer.config.userOpsLog, {
      timestamp: nowIso(),
      actorId: auth.actorId,
      actorHandle: auth.handle,
      action: 'submit',
      targetId: candidate.id,
      teamId: auth.activeTeamId,
      metadata: { sourceType: body.sourceType },
    });

    return candidateSubmissionResponseSchema.parse({
      candidateId: candidate.id,
      status: candidate.status,
      receivedAt: candidate.receivedAt,
    });
  });

  // GET /v1/candidates/:candidateId - Get candidate status
  app.get('/v1/candidates/:candidateId', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    const candidateId = (request.params as { candidateId: string }).candidateId;

    const data = await app.skillShareer.store.snapshot();
    const candidate = getCandidateById(data, candidateId);

    if (!candidate) {
      throw new AppError(404, 'candidate_not_found', 'Candidate not found');
    }

    // Check ownership or review permission
    const isOwner = auth.user?.id === candidate.submittedBy;
    const canReview = auth.subjectType === 'system-admin';

    if (!isOwner && !canReview) {
      throw new AppError(403, 'forbidden', 'Access denied');
    }

    return candidateStatusResponseSchema.parse({ candidate });
  });

  // GET /v1/candidates - List candidates with optional status filter
  app.get('/v1/candidates', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:review');

    const query = request.query as { status?: string };
    const data = await app.skillShareer.store.snapshot();

    let items = data.candidateSubmissions;

    // Filter by status if provided
    if (query.status) {
      items = getCandidatesByStatus(data, query.status as any);
    }

    return candidateListResponseSchema.parse({
      items,
      total: items.length,
    });
  });

  // GET /v1/duplicates - List all duplicate cases
  app.get('/v1/duplicates', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:review');

    const data = await app.skillShareer.store.snapshot();
    const items = getAllDuplicateCases(data);

    return duplicateCaseListResponseSchema.parse({
      items,
      total: items.length,
    });
  });

  // GET /v1/duplicates/:candidateId - Get duplicate case for a specific candidate
  app.get('/v1/duplicates/:candidateId', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    const candidateId = (request.params as { candidateId: string }).candidateId;

    const data = await app.skillShareer.store.snapshot();
    const duplicateCase = getDuplicateCaseByCandidateId(data, candidateId);

    if (!duplicateCase) {
      throw new AppError(404, 'duplicate_case_not_found', 'Duplicate case not found');
    }

    return duplicateCaseResponseSchema.parse({ duplicateCase });
  });

  // GET /v1/duplicates/:candidateId/bundle - Get full bundle for offline review
  app.get('/v1/duplicates/:candidateId/bundle', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:review');

    const candidateId = (request.params as { candidateId: string }).candidateId;
    const data = await app.skillShareer.store.snapshot();

    const candidate = getCandidateById(data, candidateId);
    if (!candidate) {
      throw new AppError(404, 'candidate_not_found', 'Candidate not found');
    }

    const duplicateCase = candidate.duplicateCase;
    if (!duplicateCase) {
      throw new AppError(404, 'duplicate_case_not_found', 'No duplicate case for this candidate');
    }

    // Build match entries with entity data
    const matches: DuplicateJobBundleResponse['matches'] = [];

    for (const match of duplicateCase.matches) {
      const entity =
        match.entityType === 'trap'
          ? buildTrapEntity(data, match.entityId)
          : buildSkillEntity(data, match.entityId);

      if (entity) {
        matches.push({ match, entity });
      }
    }

    // Expected result schema for manual submission
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

    const response: DuplicateJobBundleResponse = {
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

    return DuplicateJobBundleResponseSchema.parse(response);
  });

  // POST /v1/candidates/:candidateId/manual-result - Submit manual resolution
  app.post('/v1/candidates/:candidateId/manual-result', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:review');

    const candidateId = (request.params as { candidateId: string }).candidateId;
    const reviewedBy = auth.user?.id;

    if (!reviewedBy) {
      throw new AppError(403, 'user_required', 'Manual result requires a real user account');
    }

    const body = ManualResultSubmissionSchema.parse(request.body);

    // Validate mergedWith is present for merged decision
    if (body.decision === 'merged' && !body.mergedWith) {
      throw new AppError(
        400,
        'validation_error',
        'mergedWith is required when decision is "merged"',
      );
    }

    // Determine next state based on decision
    // Phase 35 will handle actual state transition and publishing
    // For now, keep status as duplicate_detected with manual result attached
    const nextState = body.decision === 'independent' ? 'ready_for_review' : 'rejected';

    await app.skillShareer.store.transact((data) => {
      attachManualResult({
        data,
        candidateId,
        result: body,
        reviewedBy,
      });
    });

    // Log user operation
    void logUserOperation(app.skillShareer.config.userOpsLog, {
      timestamp: nowIso(),
      actorId: auth.actorId,
      actorHandle: auth.handle,
      action: 'manual-result',
      targetId: candidateId,
      teamId: auth.activeTeamId,
      metadata: { decision: body.decision },
    });

    return manualResultResponseSchema.parse({
      candidateId,
      decision: body.decision,
      reviewedAt: nowIso(),
      reviewedBy,
      nextState,
    });
  });

  // POST /v1/candidates/:candidateId/apply-resolution - Apply manual resolution
  app.post('/v1/candidates/:candidateId/apply-resolution', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:review');

    const candidateId = (request.params as { candidateId: string }).candidateId;

    // Capture context for post-commit indexing
    let publishedEntityId: string | null = null;
    let publishedEntityType: 'trap' | 'skill' | null = null;

    const result = await app.skillShareer.store.transact((data) => {
      const resolution = applyManualResultResolution({
        store: app.skillShareer.store,
        data,
        candidateId,
        actor: auth,
      });

      if (!resolution.success) {
        throw new AppError(
          resolution.error?.code === 'candidate_not_found' ? 404 : 400,
          resolution.error?.code ?? 'resolution_failed',
          resolution.error?.message ?? 'Resolution failed',
        );
      }

      // Capture published entity info for indexing
      if (resolution.outcome?.decision === 'independent' && resolution.outcome.publishedEntityId) {
        publishedEntityId = resolution.outcome.publishedEntityId;
        publishedEntityType = resolution.outcome.entityType;
      }

      // Record audit event
      const auditEvent = createAuditEvent({
        store: app.skillShareer.store,
        data,
        teamId: resolution.candidate?.teamId ?? null,
        actor: auth,
        action:
          resolution.outcome?.decision === 'independent'
            ? 'duplicate-resolved-independent'
            : 'duplicate-resolved-merged',
        entityId: candidateId,
        payload: {
          decision: resolution.outcome?.decision,
          publishedEntityId: resolution.outcome?.publishedEntityId,
          mergedIntoEntityId: resolution.outcome?.mergedIntoEntityId,
          notes: resolution.outcome?.notes,
        },
      });
      data.auditEvents.push(auditEvent);

      return resolution;
    });

    // Post-commit indexing for newly published entities
    if (publishedEntityId && publishedEntityType === 'trap') {
      try {
        await runKnowledgeIndexEvent({
          services: {
            store: app.skillShareer.store,
            data: await app.skillShareer.store.snapshot(),
          },
          entryId: publishedEntityId,
          previousState: 'submitted',
          nextState: 'agent-pass',
          reason: 'duplicate-resolved-independent',
          adapters: app.skillShareer.indexAdapters,
        });
      } catch (indexingError) {
        app.log.error(
          { indexingError, entityId: publishedEntityId },
          'Post-commit indexing failed after resolution',
        );
      }
    }

    // Log user operation
    void logUserOperation(app.skillShareer.config.userOpsLog, {
      timestamp: nowIso(),
      actorId: auth.actorId,
      actorHandle: auth.handle,
      action: 'apply-resolution',
      targetId: candidateId,
      teamId: auth.activeTeamId,
      metadata: {
        decision: result.outcome?.decision,
        publishedEntityId: result.outcome?.publishedEntityId,
        mergedIntoEntityId: result.outcome?.mergedIntoEntityId,
      },
    });

    return applyResolutionResponseSchema.parse({
      candidateId,
      status: result.candidate!.status,
      outcome: result.outcome,
      lineage: result.lineage ?? null,
    });
  });
};
