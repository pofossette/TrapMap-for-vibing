// @ts-nocheck
import { InvocationError, type RouteContext, type RouteDef } from '@trapmap/backend-core';
import { trustedActor } from '../route-helpers.js';
import { knowledgeWriteRouteDef, toConflictCandidate } from './helpers.js';
import type { KnowledgeWriteRouteDeps } from './helpers.js';
import {
  conflictCandidatesSchema,
  createTrapSchema,
  entryMutationSchema,
  getTrapSchema,
  listTrapsSchema,
  submitSchema,
  supersedeSchema,
} from './helpers.js';

export function createKnowledgeKnowledgeRouteDefs(): RouteDef<
  RouteContext,
  KnowledgeWriteRouteDeps
>[] {
  return [
    knowledgeWriteRouteDef({
      method: 'POST',
      path: '/internal/knowledge',
      schema: submitSchema,
      successStatus: 201,
      handler: async (ctx, module) => {
        const trusted = trustedActor(ctx.headers ?? {}, ctx.body);
        return module.submit({
          content: ctx.body.content,
          ...(ctx.body.title !== undefined ? { title: ctx.body.title } : {}),
          ...(ctx.body.labels !== undefined ? { labels: ctx.body.labels } : {}),
          ...(ctx.body.teamId !== undefined ? { teamId: ctx.body.teamId } : {}),
          actorId: trusted.actorId,
        });
      },
    }),

    knowledgeWriteRouteDef({
      method: 'GET',
      path: '/internal/knowledge/:entryId/conflict-candidates',
      schema: conflictCandidatesSchema,
      handler: async (ctx, module) => {
        if (!module.conflictCandidateRead) {
          throw InvocationError.unavailable(
            'knowledge-write conflict candidate read projection unavailable',
          );
        }
        const entry = await module.conflictCandidateRead.getById(ctx.params.entryId);
        if (!entry || entry.lifecycleState !== 'approved') return null;
        const { items: candidates } = await module.conflictCandidateRead.listByFilter({
          lifecycleState: 'approved',
        });
        return {
          entry: toConflictCandidate(entry),
          candidates: candidates
            .filter((candidate) => candidate.lifecycleState === 'approved')
            .map(toConflictCandidate),
        };
      },
    }),

    knowledgeWriteRouteDef({
      method: 'PUT',
      path: '/internal/knowledge/:entryId',
      schema: entryMutationSchema,
      handler: async (ctx, module) => {
        const body = trustedActor(ctx.headers ?? {}, ctx.body);
        await module.updateEntry(ctx.params.entryId, body.updates, body.actorId);
        return { ok: true };
      },
    }),

    knowledgeWriteRouteDef({
      method: 'POST',
      path: '/internal/knowledge/:entryId/resubmit',
      schema: entryMutationSchema,
      handler: async (ctx, module) => {
        const body = trustedActor(ctx.headers ?? {}, ctx.body);
        await module.resubmit(ctx.params.entryId, body.updates, body.actorId);
        return { ok: true };
      },
    }),

    knowledgeWriteRouteDef({
      method: 'POST',
      path: '/internal/knowledge/:entryId/supersede',
      schema: supersedeSchema,
      handler: async (ctx, module) => {
        const body = trustedActor(ctx.headers ?? {}, ctx.body);
        await module.supersede(ctx.params.entryId, body.replacementId, body.actorId);
        return { ok: true };
      },
    }),

    knowledgeWriteRouteDef({
      method: 'POST',
      path: '/internal/traps',
      schema: createTrapSchema,
      successStatus: 201,
      handler: async (ctx, module) => {
        const trusted = trustedActor(ctx.headers ?? {}, ctx.body);
        return module.createTrap({
          content: ctx.body.content,
          teamId: ctx.body.teamId,
          ...(ctx.body.title !== undefined ? { title: ctx.body.title } : {}),
          actorId: trusted.actorId,
        });
      },
    }),

    knowledgeWriteRouteDef({
      method: 'GET',
      path: '/internal/traps',
      schema: listTrapsSchema,
      handler: async (ctx, module) => {
        return module.listTraps(ctx.query.teamId ?? '');
      },
    }),

    knowledgeWriteRouteDef({
      method: 'GET',
      path: '/internal/traps/:trapId',
      schema: getTrapSchema,
      handler: async (ctx, module) => {
        const result = await module.getTrap(ctx.params.trapId);
        if (!result) {
          throw InvocationError.notFound('Trap not found');
        }
        return result;
      },
    }),
  ];
}
