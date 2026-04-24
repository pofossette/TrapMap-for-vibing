import {
  candidateSubmissionRequestSchema,
  candidateSubmissionResponseSchema,
  candidateStatusResponseSchema,
  candidateListResponseSchema,
  duplicateCaseListResponseSchema,
  duplicateCaseResponseSchema,
} from '@trapmap/contracts';
import type { FastifyPluginAsync } from 'fastify';
import { createHash } from 'node:crypto';

import { AppError } from '../lib/errors.js';
import { resolveAuthContext } from '../lib/session.js';
import { requirePermission } from '../lib/rbac.js';
import { nowIso } from '../lib/store.js';
import {
  createCandidateSubmission,
  getCandidateById,
  getCandidatesByStatus,
  getAllDuplicateCases,
  getDuplicateCaseByCandidateId,
} from '../lib/candidates/store.js';
import { scheduleCandidateProcessing, type CandidateProcessorServices } from '../lib/candidates/processor.js';
import { logUserOperation } from '../lib/user-ops-log.js';

function requireRealUser(userId: string | undefined): string {
  if (!userId) {
    throw new AppError(
      403,
      'user_required',
      'This workflow requires a real member account',
    );
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
    const originalPayload = body.sourceType === 'trap'
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
};
