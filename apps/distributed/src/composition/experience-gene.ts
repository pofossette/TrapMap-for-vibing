/**
 * @trapmap/app-distributed — experience-gene composition seam (thin assembly).
 *
 * Distributed assembly counterpart of `apps/light` gene composition.
 * Owns the construction of the gene search port for the knowledge-read
 * service process, binding the shared infra fallback embedding and OTel
 * metrics to the pg port.
 */

/**
 * Distributed assembly for Experience Gene search.
 *
 * Thin assembly in `apps/distributed` that wires the shared infra
 * fallback embedding into the pg gene search port. The knowledge-read
 * service process now delegates its gene-search construction to this
 * app-owned seam instead of embedding the decision in `packages/host-distributed`.
 */

import { embedWithFallback } from '@trapmap/infra';
import type { ExperienceGeneMode } from '@trapmap/contracts';
import { createPgExperienceGeneSearchPort } from '@trapmap/service-knowledge-read';

type PoolLike = { query: (...args: unknown[]) => Promise<unknown> };
type MetricsPort = Parameters<typeof createPgExperienceGeneSearchPort>[0]['metrics'];

export interface DistributedExperienceGeneAssembly {
  searchPort: ReturnType<typeof createPgExperienceGeneSearchPort>;
  mode: ExperienceGeneMode;
}

export function createDistributedExperienceGeneAssembly(params: {
  pool: PoolLike;
  mode: ExperienceGeneMode;
  metrics?: MetricsPort;
}): DistributedExperienceGeneAssembly {
  return {
    mode: params.mode,
    searchPort: createPgExperienceGeneSearchPort({
      pool: params.pool as never,
      embed: embedWithFallback,
      ...(params.metrics ? { metrics: params.metrics } : {}),
      ...(params.mode ? { mode: params.mode } : {}),
    } as Parameters<typeof createPgExperienceGeneSearchPort>[0]),
  };
}
