# @trapmap/infra

Shared infrastructure helpers for TrapMap. This package consolidates generic, host-agnostic infrastructure that is consumed by multiple service packages and both host assemblies — pgvector SQL builders, vector literal formatting, governance filter helpers, deterministic fallback embedding, and gene search document building. It is the dedicated home for the generic infra extracted during the Experience Gene foundation phase (see `docs/todos/experience-gene-infrastructure-foundation.md`).

## Installation

```bash
pnpm add @trapmap/infra
```

## Dependencies

| Package | Purpose |
|---------|---------|
| `@trapmap/lib` | Shared pure helpers (`createDeterministicFallbackVector`, `sha256`, etc.) |
| `@trapmap/contracts` | Shared types (`ExperienceGene`, `ExperienceGeneMode`) |

## Modules

All helpers are re-exported from the package entry point (`src/index.ts`). Sub-path exports are also available as `@trapmap/infra/vector` and `@trapmap/infra/embedding`.

| Module | Exports | Description |
|--------|---------|-------------|
| `vector/pgvector` | `formatVectorLiteral`, `clampSimilarity`, `vectorDistanceExpression`, `vectorSimilarityExpression`, `appendTeamFilter`, `appendScopeFilter`, `appendExperienceGeneGovernanceFilters`, `buildGeneSearchDocument` | Pure pgvector SQL builders and governance filter helpers previously duplicated across `service-knowledge-read` and `service-knowledge-write` |
| `embedding` | `createFallbackEmbedding`, `embedWithFallback`, `FALLBACK_EMBEDDING_DIMENSION`, `EXPERIENCE_GENE_FALLBACK_MODEL_VERSION` | Deterministic fallback embedding wrapper around `@trapmap/lib::createDeterministicFallbackVector` (384-dim, model `experience-gene-fallback-v1`) |

## Usage

```typescript
import { formatVectorLiteral, clampSimilarity, appendTeamFilter, buildGeneSearchDocument } from '@trapmap/infra';
import { createFallbackEmbedding, embedWithFallback } from '@trapmap/infra';

const literal = formatVectorLiteral([0.1, 0.2, 0.3]); // "[0.1,0.2,0.3]"
const doc = buildGeneSearchDocument({ title, summary, strategy, avoid, validation });
const vector = createFallbackEmbedding(doc);
const clamped = clampSimilarity(similarity);

const conditions: string[] = ["status = 'solidified'"];
const params: unknown[] = [];
appendTeamFilter(conditions, params, teamId, 'ke.team_id');
```

App-layer composition (thin assembly) now owns the wiring:

```typescript
// apps/light/src/composition/experience-gene.ts
import { embedWithFallback } from '@trapmap/infra';
import { createPgExperienceGeneSearchPort } from '@trapmap/service-knowledge-read';

const port = createPgExperienceGeneSearchPort({ pool, embed: embedWithFallback, mode });
```

## Scripts

| Script | Description |
|--------|-------------|
| `pnpm build` | Compile TypeScript to `dist/` |
| `pnpm test` | Run the package unit tests (Vitest `infra` project) |
| `pnpm typecheck` | Type-check without emitting |

## Constraints

- **No framework / domain imports**: infra must not depend on Nest, Fastify, pg concrete pools, or service-specific domain rules — only `lib`/`contracts` and stdlib.
- **Single source for vector helpers**: `service-knowledge-read` and `service-knowledge-write` must import pgvector helpers from `@trapmap/infra` instead of re-implementing `formatVectorLiteral`, `appendTeamFilter`, etc. locally.
- **Fallback embedding is deterministic**: `createFallbackEmbedding('hello', 384)` must be byte-equivalent to `createDeterministicFallbackVector('hello', 384)` from `@trapmap/lib` (see `src/embedding/index.ts`).
- Host packages (`host-local`, `host-distributed`) remain library implementations; thin assembly decisions (which embed function, which mode) are owned by `apps/light` and `apps/distributed` composition seams.
