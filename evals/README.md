# Skill Shareer Evaluation Workspace

This directory contains the evaluation datasets and thin runner entrypoints for TrapMap's retrieval evaluation system.

## Purpose

The `evals/` workspace provides a dedicated location for:

- **Golden datasets**: Labeled test cases for retrieval quality measurement
- **Evaluation entrypoints**: TypeScript-native runners that load datasets and execute evaluations
- **Tier organization**: Smoke (fast feedback) and core (broader coverage) dataset tiers

## Workspace Layout

```text
evals/
├── README.md                    # This file
└── retrieval/
    ├── README.md                # Retrieval eval conventions and endpoint specifics
    ├── run.ts                   # Tier/endpoint-aware eval loader entrypoint
    ├── smoke.ts                 # Smoke-tier dataset export
    └── core.ts                  # Core-tier dataset export
```

## Phase Boundaries

| Phase | Scope | Status |
|-------|-------|--------|
| Phase 25 | Contracts, workspace layout, thin entrypoints | **Current** |
| Phase 26 | Dataset authoring, metrics runner, report generation | Future |
| Phase 27 | Summary evaluation with judge-based checks | Future |
| Phase 28 | CI integration and regression gates | Future |

## Key Principles

1. **Contracts in `packages/contracts`**: All eval schemas live in the shared contracts package, not here. This workspace only contains datasets and entrypoints.

2. **Datasets are milestone-owned**: Dataset files are `.ts` modules exporting plain objects that validate against the shared contracts.

3. **Entrypoints are thin**: The `run.ts`, `smoke.ts`, and `core.ts` files only load, validate, and orchestrate datasets. No metrics calculators, report serialization, or CI wiring.

4. **Endpoint specificity**: Retrieval evaluation targets explicit endpoints (`/v1/retrieval/search`, `/v2/retrieval/search`). Each case declares its target endpoint explicitly.

## Running Evaluations

```bash
# Dry-run validation (no datasets required yet)
pnpm exec tsx evals/retrieval/run.ts --tier smoke --dry-run --allow-empty

# Future Phase 26: Run smoke evaluation
pnpm exec tsx evals/retrieval/run.ts --tier smoke

# Future Phase 26: Run core evaluation
pnpm exec tsx evals/retrieval/run.ts --tier core
```

## Governance vs Relevance

Per REVAL-02 and the v1.4 milestone, retrieval evaluation separates two concerns:

- **Relevance**: Ranking quality (Hit@K, MRR, nDCG)
- **Governance**: Permission/policy correctness (cross-team, security-level, lifecycle leakage)

A high relevance score cannot hide a governance leak. Every eval case carries separate `relevance` and `governance` assertion groups.

## Related Documentation

- [Retrieval Eval README](./retrieval/README.md) - Endpoint-specific conventions
- [PROJECT.md](../.planning/PROJECT.md) - Milestone requirements
- [ROADMAP.md](../.planning/ROADMAP.md) - Phase scope boundaries
