import {
  type GovernanceAsyncCommandPort,
  type GovernanceConflictWorkflowPort,
  InvocationError,
  type QueuePorts,
  type TaskHandler,
} from '@trapmap/backend-core';
import {
  EXPERIENCE_GENE_DERIVE_TASK_EVENT,
  type ExperienceGeneDerivationTaskPayload,
  type ExperienceGeneMode,
  experienceGeneModeSchema,
  experienceGeneSourceLifecycleEventSchema,
} from '@trapmap/contracts';
import type { InternalServiceClients } from '@trapmap/host-distributed/gateway/internal-client.js';
import {
  createExperienceGeneDerivationTaskHandler,
  createGovernanceBadcaseExportDraftTaskHandler,
  createGovernanceConflictTaskHandler,
  createGovernanceRemediationTaskHandler,
} from '@trapmap/service-job-runtime';
import type { JobRuntimeOutboxHandler } from '@trapmap/service-job-runtime';
import { recordAsyncLifecycleEvent } from '../gateway/internal-observability.js';
import { toInvocationError } from '../shared/invocation-error.js';

function createRemoteGovernanceConflictWorkflowClient(
  clients: Pick<InternalServiceClients, 'governanceReview'>,
): GovernanceConflictWorkflowPort {
  return {
    async detectConflicts({ entryId }) {
      const response = await clients.governanceReview.detectConflicts({ entryId });
      if (response.status < 200 || response.status >= 300) {
        throw toInvocationError(response.body, 'governance conflict detection failed');
      }
      const detectedCount =
        response.body && typeof response.body === 'object'
          ? (response.body as Record<string, unknown>).detectedCount
          : undefined;
      if (typeof detectedCount !== 'number' || !Number.isInteger(detectedCount)) {
        throw InvocationError.internal(
          'governance-review returned an invalid conflict detection result',
          response.body,
        );
      }
      return { detectedCount };
    },
  };
}

function createRemoteGovernanceAsyncCommandClient(
  clients: Pick<InternalServiceClients, 'governanceReview'>,
): GovernanceAsyncCommandPort {
  return {
    async reactivateRemediation(payload) {
      const response = await clients.governanceReview.reactivateRemediation(payload);
      if (response.status < 200 || response.status >= 300) {
        throw toInvocationError(response.body, 'governance remediation reactivation failed');
      }
    },
    async exportBadcaseDraft(payload) {
      const response = await clients.governanceReview.exportBadcaseDraft(payload);
      if (response.status < 200 || response.status >= 300) {
        throw toInvocationError(response.body, 'governance badcase export draft failed');
      }
    },
  };
}

/**
 * Wraps a TaskHandler with async lifecycle event recording.
 *
 * Records 'execute' when the handler starts, and 'dead-letter' when the
 * task reaches terminal failure (onDead callback).
 */
function withLifecycleRecording(handler: TaskHandler<unknown>): TaskHandler<unknown> {
  return {
    type: handler.type,
    async handle(task, signal) {
      recordAsyncLifecycleEvent({
        eventName: 'execute',
        taskType: handler.type,
        ownerSurface: 'runtime-seam',
      });
      return handler.handle(task, signal);
    },
    onDead: handler.onDead
      ? async (task) => {
          recordAsyncLifecycleEvent({
            eventName: 'dead-letter',
            taskType: handler.type,
            ownerSurface: 'runtime-seam',
            failureClassification: 'permanent-failure',
          });
          await handler.onDead!(task);
        }
      : async (_task) => {
          recordAsyncLifecycleEvent({
            eventName: 'dead-letter',
            taskType: handler.type,
            ownerSurface: 'runtime-seam',
            failureClassification: 'permanent-failure',
          });
        },
  };
}

export function createJobRuntimeTaskHandlers(
  clients: Pick<InternalServiceClients, 'governanceReview'> & {
    knowledgeWrite?: Pick<InternalServiceClients['knowledgeWrite'], 'deriveExperienceGene'>;
  },
  options: { experienceGeneMode?: ExperienceGeneMode } = {},
): TaskHandler<unknown>[] {
  const governanceAsyncCommands = createRemoteGovernanceAsyncCommandClient(clients);
  const modeResult = experienceGeneModeSchema.safeParse(options.experienceGeneMode ?? 'off');
  if (!modeResult.success) throw new Error('Invalid experience gene rollout mode');

  const handlers: TaskHandler<unknown>[] = [
    createGovernanceConflictTaskHandler(createRemoteGovernanceConflictWorkflowClient(clients)),
    createGovernanceRemediationTaskHandler(governanceAsyncCommands),
    createGovernanceBadcaseExportDraftTaskHandler(governanceAsyncCommands),
  ];
  if (modeResult.data !== 'off') {
    const knowledgeWrite = clients.knowledgeWrite;
    if (!knowledgeWrite) {
      throw new Error('experience gene consumption requires knowledge-write owner client');
    }
    handlers.push(
      createExperienceGeneDerivationTaskHandler({
        derive: async (request) => {
          const response = await knowledgeWrite.deriveExperienceGene(request);
          if (response.status < 200 || response.status >= 300) {
            throw InvocationError.unavailable('experience gene derivation unavailable');
          }
          return response.body;
        },
      }),
    );
  }
  return handlers.map(withLifecycleRecording);
}

const EXPERIENCE_GENE_SOURCE_EVENT_NAMES = [
  'knowledge.approved',
  'knowledge.lifecycle-updated',
  'knowledge.rejected',
  'artifact.approved',
  'artifact.lifecycle-updated',
  'artifact.deactivated',
] as const;

export function createExperienceGeneOutboxHandlers(
  queuePorts: Pick<QueuePorts, 'task'>,
  params: {
    mode: ExperienceGeneMode;
    plan(event: unknown): Promise<ExperienceGeneDerivationTaskPayload[]>;
  },
): JobRuntimeOutboxHandler[] {
  if (params.mode === 'off') return [];

  return EXPERIENCE_GENE_SOURCE_EVENT_NAMES.map((eventName) => ({
    eventName,
    async handle(payload: unknown) {
      const event = experienceGeneSourceLifecycleEventSchema.parse(payload);
      const tasks = await params.plan(event);
      await Promise.all(
        tasks.map((task) =>
          queuePorts.task.enqueue(EXPERIENCE_GENE_DERIVE_TASK_EVENT, task, {
            dedupeKey: `${EXPERIENCE_GENE_DERIVE_TASK_EVENT}:${task.requestId}`,
          }),
        ),
      );
    },
  }));
}
