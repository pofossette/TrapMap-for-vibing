# Live Retrieval Evaluation

Runs retrieval eval cases against a **real TrapMap backend instance** with named snapshot versions restored into a controlled test database. Answers the question: "How does the real service perform with this exact corpus?"

## When to Use

| Goal | Use |
|---|---|
| Verify offline eval fixture correctness | `evals/retrieval/` (offline) |
| Test retrieval quality with real derived state (embeddings, graph, indexes) | **`evals/retrieval-live/`** (this) |
| Compare corpus/config changes over time | **`evals/retrieval-live/compare.ts`** |
| Catch regressions in CI (no external dependencies) | `evals/retrieval/` (offline) |

## Quick Start

### Prerequisites

1. A running TrapMap service instance (local or test environment)
2. PostgreSQL database accessible via `TRAPMAP_LIVE_EVAL_DATABASE_URL` (or `TRAPMAP_DATABASE_URL`)
3. Auth token via `TRAPMAP_LIVE_EVAL_TOKEN`
4. A named snapshot version in `evals/retrieval-live/snapshots/<version>/`

### Export a Snapshot

```bash
# From a live database (requires TRAPMAP_DATABASE_URL)
pnpm exec tsx --tsconfig tsconfig.base.json scripts/archived/export-retrieval-db-snapshot.ts --version 2026-07-baseline --teamId team_alpha

# With rebuild mode (source data only, pipeline re-derives)
pnpm exec tsx --tsconfig tsconfig.base.json scripts/archived/export-retrieval-db-snapshot.ts --version 2026-07-baseline-source --teamId team_alpha --derived-mode rebuild
```

### Run Live Eval

```bash
# Full smoke tier
pnpm eval:retrieval:live:smoke --snapshot-version 2026-07-baseline --base-url http://localhost:3000

# Filter by endpoint
pnpm eval:retrieval:live --snapshot-version 2026-07-baseline --base-url http://localhost:3000 --endpoint /v2/retrieval/search

# JSON report output
pnpm eval:retrieval:live:smoke --snapshot-version 2026-07-baseline --base-url http://localhost:3000 --json --json-path ./reports/live-smoke.json

# Dry run (validate snapshot + load cases, skip execution)
pnpm eval:retrieval:live --snapshot-version 2026-07-baseline --base-url http://localhost:3000 --dry-run
```

### Compare Versions

```bash
# Run both versions, then compare
pnpm eval:retrieval:live:compare --baseline ./reports/live-baseline.json --current ./reports/live-current.json
```

## Snapshot Version Format

Each snapshot version is a directory under `evals/retrieval-live/snapshots/<version>/`:

```
snapshots/2026-07-baseline/
  meta.json     # Version metadata, service profile, derivation context
  corpus.json   # Database row data (scope depends on derivation mode)
```

### meta.json

| Field | Purpose |
|---|---|
| `version` | Human-readable version name |
| `serviceProfile` | Env vars that were active during export (embedding model, PG flags, graph config) |
| `derivationContext.mode` | `frozen` (full derived state) or `rebuild` (source only) |
| `derivationContext.embeddingModelUsed` | Which embedding model produced the vectors |
| `fingerprint` | SHA-256 of corpus.json for integrity verification |
| `corpusSummary` | Row counts for each table |
| `compatibleEndpoints` | Which endpoints this snapshot supports |

### Derivation Modes

| Mode | What's in corpus.json | Restore behavior | Use case |
|---|---|---|---|
| `frozen` | All tables including `skill_artifact_capsule_embeddings`, `skill_artifact_capsule_keywords`, `embedding_cache` | Import only, no re-derivation | Regression detection: same data should produce same results |
| `rebuild` | Source tables only (`knowledge_entries` without embeddings, `skill_artifacts` with capsules) | Import source, trigger full indexing pipeline | Pipeline validation: verify derivation chain works end-to-end |

## Assertion Stability

Live cases have a `stability` tag:

- **`stable`**: Governance, outcome, and structural assertions that **must pass** on any compatible snapshot version. Failure = regression.
- **`version-sensitive`**: Ranking, Hit@K, and ordering assertions that **may vary** across snapshot versions. Used for cross-version comparison, not hard failure.

## Architecture

```
                    ┌──────────────────┐
                    │  Snapshot Store   │
                    │  (named versions) │
                    └────────┬─────────┘
                             │
                    ┌────────▼─────────┐
                    │    Orchestrator   │
                    │ TRUNCATE → Import │
                    │ → Health Check    │
                    └────────┬─────────┘
                             │
              ┌──────────────┼───────────────┐
              │              │               │
     ┌────────▼──────┐ ┌────▼────┐  ┌───────▼───────┐
     │ Test Database  │ │ Backend │  │   Backend     │
     │ (PostgreSQL)   │ │  Client │  │   Service     │
     └───────────────┘ └────┬────┘  └───────────────┘
                             │
                    ┌────────▼─────────┐
                    │    Live Runner    │
                    │ Cases → Request → │
                    │ Normalize → Assert│
                    └────────┬─────────┘
                             │
                    ┌────────▼─────────┐
                    │     Report       │
                    │ (JSON + terminal) │
                    └──────────────────┘
```

## Environment Variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `TRAPMAP_LIVE_EVAL_DATABASE_URL` | Yes* | - | PostgreSQL URL for snapshot restore |
| `TRAPMAP_DATABASE_URL` | Fallback | - | Used if `TRAPMAP_LIVE_EVAL_DATABASE_URL` not set |
| `TRAPMAP_LIVE_EVAL_TOKEN` | Yes* | - | Auth token for backend requests |

*Can be overridden via CLI flags `--database-url` and `--auth-token`.

## Files

| File | Purpose |
|---|---|
| `run.ts` | CLI entry point for live eval |
| `compare.ts` | CLI for comparing two live eval reports |
| `lib/snapshot-orchestrator.ts` | Snapshot restore, truncation, health checks |
| `lib/backend-client.ts` | HTTP client for real backend requests |
| `lib/types.ts` | Shared types for live eval |
| `datasets/smoke/` | Smoke-tier live cases |
| `snapshots/` | Named snapshot versions |
