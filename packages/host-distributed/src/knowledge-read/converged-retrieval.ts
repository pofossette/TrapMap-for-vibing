/**
 * Distributed host convergence for knowledge-read retrieval (Phase 4 D5).
 *
 * The complete retrieval-engine pipeline (the same one the monolith wires
 * end-to-end in packages/host-local) is now the ONLY retrieval implementation
 * for the distributed knowledge-read service. This module assembles the
 * retrieval services the pipeline needs directly from the service's own
 * PostgreSQL pool (the shared bundle projections read the authoritative
 * knowledge/artifact/governance tables), and exposes a
 * RetrievalQueryPort via the service package's exported seam
 * (`createKnowledgeReadOwnerRetrievalServices` +
 * `createKnowledgeReadRetrievalQuery`).
 *
 * No retrieval SQL or ranking logic is duplicated here — the pipeline lives in
 * @trapmap/service-knowledge-read; this host only supplies concrete
 * infrastructure (pool-backed repos, registries, ai stub, graph seam).
 */
import type { KnowledgeReadPort, RetrievalQueryPort } from '@trapmap/backend-core';
import { permissionSchema } from '@trapmap/contracts';
import { createGovernanceReviewPgOwnerBundle } from '@trapmap/service-governance-review';
import {
  type KnowledgeReadOwnerRetrievalServicesOptions,
  createKnowledgeReadChannelRegistry,
  createKnowledgeReadGraphIndexRepository,
  createKnowledgeReadOwnerRetrievalServices,
  createKnowledgeReadRetrievalQuery,
  createKnowledgeReadSkillLookupQuery,
  createKnowledgeReadStrategyRegistry,
  createMemoryGraphQueryBackend,
  loadRagLogConfig,
} from '@trapmap/service-knowledge-read';
import { createKnowledgeWriteOwnerBundle } from '@trapmap/service-knowledge-write';
import type { Pool } from 'pg';

type RetrievalServices = ReturnType<typeof createKnowledgeReadOwnerRetrievalServices>;

/** Seam shape the retrieval services expect for governance feedback/conflicts. */
type GovernanceRetrievalSeam = KnowledgeReadOwnerRetrievalServicesOptions['governance'];

/** Stub chat provider: retrieval summary/refinement are disabled for the distributed surface. */
const DISABLED_CHAT = {
  isConfigured: false,
  async invoke(): Promise<string> {
    throw new Error('knowledge-read distributed retrieval does not use LLM chat');
  },
};

/**
 * Build the full retrieval services bundle from the service's PostgreSQL pool.
 *
 * The pipeline needs rich owner projections (knowledge entries, skill
 * artifacts, governance feedback/conflicts), registry/seam primitives, an AI
 * chat seam, a store owning the pg pool, and the graph query runtime. We reuse
 * the exact service-package bundles that the monolith wires, so distributed
 * retrieval semantics converge to the monolith pipeline.
 */
function createDistributedRetrievalServices(pool: Pool): RetrievalServices {
  const writeBundle = createKnowledgeWriteOwnerBundle(pool);
  const governanceBundle = createGovernanceReviewPgOwnerBundle(pool);
  const ragLog = loadRagLogConfig();
  const graphIndex = createKnowledgeReadGraphIndexRepository(pool);
  const strategyRegistry = createKnowledgeReadStrategyRegistry();
  const channelRegistry = createKnowledgeReadChannelRegistry();

  // lib type gap: the governance owner bundle returns the backend-core minimal
  // GovernanceRetrievalProjection shape while the retrieval seam expects
  // knowledge-read's richer RetentionGovernanceProjection — same feedback rows
  // at runtime (mirrors the monolith's host-runtime cast).
  const governance = governanceBundle.retrievalProjection as unknown as GovernanceRetrievalSeam; // lib type gap: backend-core shape maps to the seam's richer record at runtime

  return createKnowledgeReadOwnerRetrievalServices({
    config: { ragLog },
    knowledge: writeBundle.knowledgeOwner,
    artifact: writeBundle.artifactReadProjection,
    governance,
    strategyRegistry,
    channelRegistry,
    ai: { chat: DISABLED_CHAT },
    store: { getPool: () => pool },
    graphQuery: { backendKind: 'memory', failOpen: true, mode: 'disabled' },
    graphQueryBackend: createMemoryGraphQueryBackend(graphIndex),
  });
}

/**
 * Build the converged knowledge-read retrieval query for the distributed host.
 *
 * @param pool The service's PostgreSQL pool (same pool backing the read-model
 *   projection and all query traffic).
 * @param services Optional override used only by tests to inject an in-memory
 *   retrieval services bundle; production always builds from the pool.
 */
export function createConvergedKnowledgeReadQueries(
  pool: Pool,
  services?: RetrievalServices,
): { retrievalQuery: RetrievalQueryPort; skillLookup: KnowledgeReadPort['skillLookup'] } {
  const retrievalServices = services ?? createDistributedRetrievalServices(pool);
  const queryOptions = {
    services: retrievalServices,
    resolveAuthContext(params: { teamId?: string }) {
      return {
        subjectType: 'system-admin' as const,
        actorId: 'distributed-knowledge-read',
        handle: 'distributed-knowledge-read',
        activeTeamId: params.teamId ?? null,
        securityLevel: Number.MAX_SAFE_INTEGER,
        effectivePermissions: [...permissionSchema.options],
        user: null,
        membership: null,
        team: null,
      };
    },
    mode: 'hybrid' as const,
  };

  return {
    retrievalQuery: createKnowledgeReadRetrievalQuery(queryOptions),
    skillLookup: createKnowledgeReadSkillLookupQuery(queryOptions),
  };
}

export function createConvergedRetrievalQuery(
  pool: Pool,
  services?: RetrievalServices,
): RetrievalQueryPort {
  return createConvergedKnowledgeReadQueries(pool, services).retrievalQuery;
}
