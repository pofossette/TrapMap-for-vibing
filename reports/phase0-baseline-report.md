# Phase 0: Baseline Report - v2 Multi-Recall

**Date**: 2026-05-23
**Trigger**: `rtk pnpm eval:retrieval:smoke` and `rtk pnpm eval:retrieval:core`

## Smoke Tier (15 cases, 100% pass)

### v2 Smoke Metrics
| Metric | Value |
|--------|-------|
| Hit@1 | 0.60 |
| Hit@5 | 0.60 |
| Hit@10 | 0.60 |
| MRR | 0.60 |
| nDCG | 0.60 |
| Recall@10 | 0.60 |
| Governance Failures | 0 |

Note: v2 smoke includes empty/forbidden cases that suppress Hit@1 (by design). Core tier gives better signal.

## Core Tier (21 cases, 90.5% pass)

### v2 Core Metrics
| Metric | Value |
|--------|-------|
| Hit@1 | 0.86 |
| Hit@5 | 0.86 |
| Hit@10 | 0.86 |
| MRR | 0.86 |
| nDCG | 0.86 |
| Recall@10 | 0.86 |
| Governance Failures | 1 |

### Existing Failures (pre-existing, not caused by Phase 0)
- `v1-low-maxresults-core`: shape-mismatch - missing entry ID
- `v2-label-filter-core`: shape-mismatch - expected 1 capsule but got 2

## Coverage Gap Analysis

### Current v2 Core Cases
1. v2-capsule-ranked-core - Docker deployment (general/how-to)
2. v2-profile-hints-core - TypeScript type-safe patterns (how-to)
3. v2-governance-core - API REST GraphQL security (governance-sensitive)
4. v2-scope-distribution-core - deployment CI/CD standards (global-constraints)
5. v2-multi-capsule-core - docker compose swarm networking (how-to)
6. v2-label-filter-core - react hooks state management (how-to)
7. v2-empty-with-summary-core - nonexistent topic (boundary)

### Gaps Identified
1. **keyword-dominant**: Missing cases for exact error text, file paths, technical labels
2. **semantic-paraphrase**: Missing cases for lexically different but semantically same queries
3. **graph-assisted-v2**: No graph channel testing for v2 (Phase 5 target)
4. **mixed-channel**: Missing cases for multi-channel hit/dedup testing

### New Cases Added (Phase 0-3)
- `v2-keyword-dominant-core` - pnpm lockfile, exact labels
- `v2-keyword-error-text-core` - ENOENT file path error
- `v2-semantic-paraphrase-core` - plain English for orchestration
- `v2-semantic-debug-core` - plain English for observability/debugging
- `v2-mixed-channel-core` - TypeScript build CI (keyword + semantic overlap)

### Weakness Documentation
- Current v2 has poor recall for error-text-heavy queries (terms like ENOENT, file paths)
- Current v2 has no mechanism to find capsules when user uses non-technical paraphrases
- No multi-channel dedup or trace information available
- No feature flag infrastructure for independent channel toggling
