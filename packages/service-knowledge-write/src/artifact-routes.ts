import {
  InvocationError,
  type RouteContext,
  type RouteDef,
  registerFastifyRoutes,
  routeResponse,
} from '@trapmap/backend-core';
import {
  type ArtifactReadProjection,
  artifactImportRequestSchema,
  artifactImportResponseSchema,
} from '@trapmap/contracts';
import type { FastifyInstance } from 'fastify';
import { type ZodType, z } from 'zod';
import type { ArtifactBundleImportPort, ArtifactWritePort } from './artifact-ports.js';
import { trustedActor } from './route-helpers.js';

export interface ArtifactRouteDeps {
  artifacts: ArtifactWritePort;
  readProjection: ArtifactReadProjection;
  importer: ArtifactBundleImportPort;
}

const emptyRecord = z.record(z.string(), z.unknown());
const headersSchema = z.record(z.string(), z.unknown());

const importSchema = z.object({
  params: emptyRecord,
  query: emptyRecord,
  headers: headersSchema,
  body: artifactImportRequestSchema.passthrough(),
});

const exportSchema = z.object({
  params: emptyRecord,
  query: emptyRecord,
  body: z.record(z.string(), z.unknown()).optional().default({}),
});

const reviewQueueSchema = z.object({
  params: emptyRecord,
  query: emptyRecord,
  body: z.unknown(),
});

const artifactParamsSchema = z.object({
  params: z.object({ artifactId: z.string() }),
  query: emptyRecord,
  body: z.unknown(),
});

const lifecycleSchema = z.object({
  params: z.object({ artifactId: z.string() }),
  query: emptyRecord,
  headers: headersSchema,
  body: z.object({
    state: z.unknown(),
    actorId: z.string().optional(),
    note: z.string().optional(),
  }),
});

const editSchema = z.object({
  params: z.object({ artifactId: z.string() }),
  query: emptyRecord,
  headers: headersSchema,
  body: z.record(z.string(), z.unknown()),
});

const reviewSchema = z.object({
  params: z.object({ artifactId: z.string() }),
  query: emptyRecord,
  headers: headersSchema,
  body: z.object({
    decision: z.enum(['approve', 'reject']).optional(),
    actorId: z.string().optional(),
    note: z.string().optional(),
  }),
});

const activateSchema = z.object({
  params: emptyRecord,
  query: emptyRecord,
  headers: headersSchema,
  body: z.record(z.string(), z.unknown()),
});

const deactivateSchema = z.object({
  params: z.object({ artifactId: z.string() }),
  query: emptyRecord,
  headers: headersSchema,
  body: z.object({
    actorId: z.string().optional(),
    note: z.string().optional(),
  }),
});

function artifactRouteDef<Ctx extends RouteContext>(def: {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  schema: ZodType<Ctx>;
  handler(ctx: Ctx, deps: ArtifactRouteDeps): Promise<unknown>;
}): RouteDef<Ctx, ArtifactRouteDeps> {
  return def;
}

export function createArtifactRouteDefs(_deps: ArtifactRouteDeps): RouteDef[] {
  return [
    artifactRouteDef({
      method: 'POST',
      path: '/internal/artifacts/import',
      schema: importSchema,
      handler: async (ctx, module) => {
        const body = trustedActor(ctx.headers ?? {}, ctx.body as Record<string, unknown>);
        const input = artifactImportRequestSchema.parse(ctx.body);
        const actor = {
          actorId: body.actorId,
          teamId:
            typeof ctx.headers?.['x-trapmap-team-id'] === 'string'
              ? ctx.headers['x-trapmap-team-id']
              : null,
          handle:
            typeof ctx.headers?.['x-trapmap-actor-handle'] === 'string'
              ? ctx.headers['x-trapmap-actor-handle']
              : body.actorId,
          securityLevel: Number(ctx.headers?.['x-trapmap-security-level'] ?? 0),
        };
        const results = await Promise.all(
          input.bundles.map(async (bundle) => {
            if (
              !Number.isInteger(actor.securityLevel) ||
              actor.securityLevel < bundle.requiredLevel
            ) {
              return {
                success: false,
                artifactId: null,
                title: bundle.title,
                error: `requiredLevel ${bundle.requiredLevel} exceeds actor level ${actor.securityLevel}`,
                sourceKind: bundle.sourceKind,
              };
            }
            try {
              const artifact = await module.importer.importBundle(bundle, actor);
              return {
                success: true,
                artifactId: artifact.id,
                title: artifact.title,
                error: null,
                sourceKind: bundle.sourceKind,
              };
            } catch (error) {
              if (error instanceof InvocationError) throw error;
              return {
                success: false,
                artifactId: null,
                title: bundle.title,
                error: error instanceof Error ? error.message : 'Unknown error',
                sourceKind: bundle.sourceKind,
              };
            }
          }),
        );
        return artifactImportResponseSchema.parse({
          results,
          importedCount: results.filter((result) => result.success).length,
          failedCount: results.filter((result) => !result.success).length,
        });
      },
    }),

    artifactRouteDef({
      method: 'POST',
      path: '/internal/artifacts/export',
      schema: exportSchema,
      handler: async (ctx, module) => {
        return module.readProjection.exportArtifacts(ctx.body);
      },
    }),

    artifactRouteDef({
      method: 'GET',
      path: '/internal/artifacts/review-queue',
      schema: reviewQueueSchema,
      handler: async (_ctx, module) => {
        return module.readProjection.reviewQueue();
      },
    }),

    artifactRouteDef({
      method: 'GET',
      path: '/internal/artifacts/:artifactId',
      schema: artifactParamsSchema,
      handler: async (ctx, module) => {
        const artifact = await module.readProjection.getById(ctx.params.artifactId);
        if (!artifact) {
          return routeResponse(404, { error: 'Artifact not found', kind: 'not-found' });
        }
        return artifact;
      },
    }),

    artifactRouteDef({
      method: 'POST',
      path: '/internal/artifacts/:artifactId/lifecycle',
      schema: lifecycleSchema,
      handler: async (ctx, module) => {
        const body = trustedActor(ctx.headers ?? {}, ctx.body);
        const artifact = await module.artifacts.updateLifecycle(
          ctx.params.artifactId,
          body.state as Parameters<ArtifactWritePort['updateLifecycle']>[1],
          {
            actorId: body.actorId,
            ...(body.note ? { note: body.note } : {}),
          },
        );
        return artifact;
      },
    }),

    artifactRouteDef({
      method: 'POST',
      path: '/internal/artifacts/:artifactId/edit',
      schema: editSchema,
      handler: async (ctx, module) => {
        const body = trustedActor(ctx.headers ?? {}, ctx.body);
        return module.artifacts.editArtifact(ctx.params.artifactId, body);
      },
    }),

    artifactRouteDef({
      method: 'GET',
      path: '/internal/artifacts/:artifactId/history',
      schema: artifactParamsSchema,
      handler: async (ctx, module) => {
        return module.readProjection.history(ctx.params.artifactId);
      },
    }),

    artifactRouteDef({
      method: 'POST',
      path: '/internal/artifacts/:artifactId/review',
      schema: reviewSchema,
      handler: async (ctx, module) => {
        const body = trustedActor(ctx.headers ?? {}, ctx.body);
        return module.artifacts.review(
          ctx.params.artifactId,
          body.decision ?? 'reject',
          body.actorId ?? 'system',
          body.note,
        );
      },
    }),

    artifactRouteDef({
      method: 'POST',
      path: '/internal/artifacts/activate',
      schema: activateSchema,
      handler: async (ctx, module) => {
        const body = trustedActor(ctx.headers ?? {}, ctx.body);
        return module.artifacts.activate(body);
      },
    }),

    artifactRouteDef({
      method: 'POST',
      path: '/internal/artifacts/:artifactId/deactivate',
      schema: deactivateSchema,
      handler: async (ctx, module) => {
        const body = trustedActor(ctx.headers ?? {}, ctx.body);
        return module.artifacts.updateLifecycle(ctx.params.artifactId, 'deactivated', {
          actorId: body.actorId,
          ...(body.note ? { note: body.note } : {}),
        });
      },
    }),
  ];
}

/**
 * Fastify-plugin compatibility shim: registers the artifact RouteDefs onto an
 * existing Fastify instance.
 */
export function registerArtifactRoutes(
  app: FastifyInstance,
  artifacts: ArtifactWritePort,
  readProjection: ArtifactReadProjection,
  importer: ArtifactBundleImportPort,
): void {
  const deps: ArtifactRouteDeps = { artifacts, readProjection, importer };
  registerFastifyRoutes(app, createArtifactRouteDefs(deps), deps);
}
