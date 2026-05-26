/**
 * Candidate submission route.
 *
 * Endpoints:
 * - POST /v1/candidates - Submit a new candidate
 */

import { createHash } from 'node:crypto';
import { candidateSubmissionRequestSchema, candidateSubmissionResponseSchema } from '@trapmap/contracts';
import type { FastifyPluginAsync } from 'fastify';

import { AppError } from '@trapmap/server/lib/errors.js';
import { requirePermission } from '@trapmap/server/lib/rbac.js';
import { resolveAuthContext } from '@trapmap/server/lib/session.js';
import { createAndEnqueueCandidate } from '@trapmap/server/lib/candidates/services/submission-service.js';

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
  let buffer: Buffer;
  try {
    buffer = Buffer.from(content, 'base64');
    if (buffer.toString('base64') !== content) {
      buffer = Buffer.from(content, 'utf-8');
    }
  } catch {
    buffer = Buffer.from(content, 'utf-8');
  }
  return createHash('sha256').update(buffer).digest('hex');
}

export const candidateSubmissionRoutes: FastifyPluginAsync = async (app) => {
  // POST /v1/candidates - Submit a new candidate
  app.post('/v1/candidates', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:submit');

    const body = candidateSubmissionRequestSchema.parse(request.body);
    requireRealUser(auth.user?.id);

    // Validate team context for project scope
    const scope = body.payload.scope;
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

    const result = await createAndEnqueueCandidate(
      {
        store: app.skillShareer.store,
        repos: app.skillShareer.repos,
        config: app.skillShareer.config,
      },
      auth,
      {
        sourceType: body.sourceType,
        scope,
        teamId: scope === 'project' ? auth.activeTeamId : null,
        securityLevel: auth.securityLevel,
        originalPayload,
      },
    );

    return candidateSubmissionResponseSchema.parse(result.response);
  });
};
