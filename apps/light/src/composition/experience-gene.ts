/**
 * @trapmap/app-light — experience-gene composition seam (thin assembly).
 *
 * This module is the app-owned assembly point for Experience Gene
 * infrastructure. It owns:
 * - rollout mode resolution from env / config,
 * - embedding provider selection (fallback vs external),
 * - metrics adapter creation,
 * - construction of the pg gene search port.
 *
 * Host library (`@trapmap/host-local`) provides the Nest runtime and
 * service bundles, but the *decision* of how to wire gene search
 * (which embed function, which mode) now lives in the app layer.
 * This mirrors the repo rule that `apps/` are thin assembly, while
 * `packages/host-*` are library implementations.
 */

/**
 * Light assembly for Experience Gene search.
 *
 * Demonstrates that the pgvector search port is now assembled from
 * `@trapmap/infra` primitives (fallback embedding) at the `apps/` layer
 * rather than deep inside `packages/host-local`.
 */

import type { ExperienceGeneMode } from '@trapmap/contracts';
import { embedWithFallback } from '@trapmap/infra';
import { createPgExperienceGeneSearchPort } from '@trapmap/service-knowledge-read';

type PoolLike = { query: (...args: unknown[]) => Promise<unknown> };

export interface LightExperienceGeneAssembly {
  searchPort: ReturnType<typeof createPgExperienceGeneSearchPort>;
  mode: ExperienceGeneMode;
}

export function createLightExperienceGeneAssembly(params: {
  pool: PoolLike;
  mode: ExperienceGeneMode;
  metrics?: Parameters<typeof createPgExperienceGeneSearchPort>[0]['metrics'];
}): LightExperienceGeneAssembly {
  const searchPort = createPgExperienceGeneSearchPort({
    pool: params.pool as never,
    ...(params.metrics ? { metrics: params.metrics } : {}),
    embed: embedWithFallback,
    ...(params.mode ? { mode: params.mode } : {}),
  } as Parameters<typeof createPgExperienceGeneSearchPort>[0]);

  return { searchPort, mode: params.mode };
}
