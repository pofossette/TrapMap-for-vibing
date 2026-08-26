import {
  experienceGeneDerivationTaskPayloadSchema,
  experienceGeneModeSchema,
} from '@trapmap/contracts';
import type { ServiceConfig } from '@trapmap/host-distributed/config/index.js';
import { createInternalServiceClients } from '@trapmap/host-distributed/gateway/internal-client.js';
import type { ServiceDatabase } from '@trapmap/host-distributed/shared/database.js';
import { attachRuntimeMetricsRoute } from '@trapmap/host-distributed/shared/observability.js';
import { createIdentityAccessPgDeps } from '@trapmap/service-identity-access';
import {
  type JobRuntimeServer,
  createJobRuntimeAsyncTransport,
  createJobRuntimeDeps,
  createJobRuntimeServer,
} from '@trapmap/service-job-runtime';
import { z } from 'zod';
import { attachRuntimeTelemetry } from '../shared/telemetry.js';
import { createExperienceGeneOutboxHandlers, createJobRuntimeTaskHandlers } from './handlers.js';

export async function createServer(
  config: ServiceConfig,
  db: ServiceDatabase,
): Promise<JobRuntimeServer> {
  const identity = createIdentityAccessPgDeps(db.pool, { systemAdminKey: config.systemAdminKey });
  const queuePorts = createJobRuntimeAsyncTransport({
    config: {
      asyncTaskTransport: {
        provider: process.env.TRAPMAP_TASK_TRANSPORT === 'amqp' ? 'rabbitmq' : 'postgres',
        rabbitmq: null,
      },
    },
    pool: db.pool,
  });
  const internalClients = createInternalServiceClients(config.internalUrls);
  const experienceGeneMode = experienceGeneModeSchema
    .catch('off')
    .parse(process.env.TRAPMAP_EXPERIENCE_GENE_MODE);
  const derivationPlanResponseSchema = z.object({
    tasks: z.array(experienceGeneDerivationTaskPayloadSchema),
  });
  const deps = createJobRuntimeDeps({
    queuePorts,
    auditLog: identity.auditLog,
    taskHandlers: createJobRuntimeTaskHandlers(internalClients, {
      experienceGeneMode,
    }),
    outboxHandlers: [
      {
        eventName: 'knowledge.approved',
        async handle(payload) {
          const event = payload as {
            entryId?: unknown;
            metadata?: { sourceEventId?: unknown };
          };
          if (typeof event.entryId !== 'string') {
            throw new Error('knowledge.approved outbox event is missing entryId');
          }
          const sourceEventId =
            typeof event.metadata?.sourceEventId === 'string'
              ? event.metadata.sourceEventId
              : undefined;
          await queuePorts.task.enqueue(
            'governance.conflict-detection',
            { entryId: event.entryId, ...(sourceEventId ? { sourceEventId } : {}) },
            {
              dedupeKey: `governance.conflict-detection:${event.entryId}:${sourceEventId ?? 'outbox'}`,
            },
          );
        },
      },
      ...createExperienceGeneOutboxHandlers(queuePorts, {
        mode: experienceGeneMode,
        markStale: async (event) => {
          const response = await internalClients.knowledgeWrite.markExperienceGenesStale(event);
          if (response.status < 200 || response.status >= 300) {
            throw new Error('experience gene staleness handling unavailable');
          }
          return response.body;
        },
        plan: async (event) => {
          const response =
            await internalClients.knowledgeWrite.planExperienceGeneDerivations(event);
          if (response.status < 200 || response.status >= 300) {
            throw new Error('experience gene planning unavailable');
          }
          return derivationPlanResponseSchema.parse(response.body).tasks;
        },
      }),
    ],
    ownsWork: true,
  });
  const server = await createJobRuntimeServer(config, deps);
  attachRuntimeMetricsRoute(server.app);
  await attachRuntimeTelemetry(server.app, 'job-runtime');
  return server;
}
