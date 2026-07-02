# Server Module Barrel Export Structure

> Created: 2026-07-02
> Context: Phase 0.4 hexagonal architecture cleanup — module splits and barrel exports

## Overview

The server package (`packages/server/src/lib/`) underwent module splitting in Phase 0.4 to reduce file complexity and enforce single-responsibility. Each split module directory received a barrel `index.ts` to provide a stable import surface. This documents the 11 barrel exports created.

## Barrel Exports

### 1. `lib/runtime/index.ts`

Deployment and runtime infrastructure modules.

**Re-exports**:
- `deployment-profile` — deployment profile configuration and resolution
- `metrics` — runtime metrics collection
- `resilience` — retry, circuit-breaker, and fallback utilities
- `request-context` — per-request requestId / trace header context
- `http-surface` — HTTP surface configuration
- `route-surface` — route surface gating and capability
- `runtime-contract` — runtime capability and topology contracts
- `service-unit` — service unit abstraction
- `runtime-metadata` — `/health` and `/ready` runtime snapshot
- `runtime-ownership` — runtime ownership declarations
- `service-topology` — service instance topology model

### 2. `lib/lifecycle/index.ts`

Domain event lifecycle and outbox infrastructure.

**Re-exports**:
- `event-bus` — in-process event bus
- `state-machine` — lifecycle state machine definitions
- `transitions` — valid lifecycle state transitions
- `publisher` — event publisher interface
- `emit-transition` — transition emission helpers
- `outbox` — outbox worker for durable event delivery
- `types` — shared lifecycle types
- `subscribers/audit` — audit log subscriber
- `subscribers/conflict` — conflict detection subscriber
- `subscribers/indexing` — indexing trigger subscriber

### 3. `lib/graph-query/index.ts`

Graph query backend abstraction and projection.

**Re-exports**:
- `backend` — graph query backend interface
- `config` — graph query configuration
- `memory-backend` — in-memory graph backend (fallback)
- `neo4j-backend` — Neo4j graph backend
- `projector` — graph projection utilities
- `health` — graph query health check

### 4. `lib/decay/index.ts`

Knowledge freshness decay engine.

**Re-exports**:
- `config` — decay configuration and thresholds
- `state-machine` — decay state transitions
- `freshness` — freshness score calculation

### 5. `lib/conflict/index.ts`

Conflict detection and resolution.

**Re-exports**:
- `detect` — conflict detection logic
- `llm-conflict` — LLM-assisted conflict analysis
- `enrich` — conflict enrichment with context
- `repository` — conflict persistence

### 6. `lib/indexing/graph-lite/index.ts`

Lightweight graph indexing pipeline (GraphRAG Lite).

**Re-exports**:
- `documents` — document processing for graph extraction
- `graphology` — Graphology-based graph store
- `store` — graph-lite persistence
- `llm-cache` — LLM extraction result cache
- `llm-extract` — LLM-based entity/relationship extraction (split into sub-modules):
  - `ids` — entity ID generation
  - `merge` — entity merge logic
  - `parsing` — LLM response parsing
  - `planning` — extraction planning

### 7. `lib/retrieval/recall/index.ts`

Retrieval recall strategies.

**Re-exports**:
- `keyword` — keyword/BM25 recall
- `semantic` — embedding-based semantic recall
- `db-search` — database-backed search
- `graph-assisted` — graph traversal-assisted recall
- `pg-keyword` — PostgreSQL full-text keyword recall
- `query-graph-labels` — graph label query utilities

### 8. `lib/retrieval/scoring/index.ts`

Retrieval scoring and reranking.

**Re-exports**:
- `boundary-match` — boundary-aware match scoring
- `boundary-query` — boundary query construction
- `merge` — multi-source result merging
- `rerank` — result reranking

### 9. `lib/retrieval/orchestration/index.ts`

Retrieval pipeline orchestration.

**Re-exports**:
- `channel-registry` — recall channel registration
- `strategy-registry` — retrieval strategy registration
- `recall-coordinator` — multi-channel recall coordination
- `orchestrator` — top-level retrieval orchestrator
- `filters` — result filtering
- `routing` — query routing logic
- `search-v1` — v1 search pipeline
- `search-v2` — v2 search pipeline
- `embedding-update` — embedding update coordination
- `pipeline-timing` — pipeline timing instrumentation
- `routing-trace` — routing decision tracing

### 10. `lib/retrieval/response/index.ts`

Retrieval response assembly.

**Re-exports**:
- `assembly` — response assembly from scored results
- `citations` — citation extraction and formatting
- `refinement` — response refinement and filtering
- `summary` — response summary generation

### 11. `lib/retrieval/graph-plan/index.ts`

Trap-first graph plan compilation (v3 retrieval).

**Re-exports**:
- `graph-plan-search` — graph plan search entry point
- `plan-compiler` — plan compilation from graph data
- `execution-plan` — execution plan construction
- `plan-citations` — plan citation generation
- `plan-edges` — plan edge construction
- `plan-graph` — plan graph data structures
- `skill-selection` — skill selection for plan nodes
- `trap-identification` — trap identification in graph
- `trap-ranking` — trap ranking and prioritization

## Import Convention

After Phase 0.4, consumers should import from the barrel rather than reaching into sub-modules directly:

```typescript
// Before (deep import)
import { detectConflict } from '../lib/conflict/detect.js';

// After (barrel import)
import { detectConflict } from '../lib/conflict/index.js';
// or equivalently
import { detectConflict } from '../lib/conflict.js';
```

This convention ensures that module internals can be reorganized without affecting downstream import sites.
