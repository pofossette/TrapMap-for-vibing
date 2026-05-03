---
phase: 49-time-based-decay-in-retrieval
created: 2026-05-02
validation_framework: Nyquist
---

# Phase 49: Validation Strategy

## Validation Architecture

This phase implements freshness-based decay curves for retrieval ranking. Validation focuses on mathematical correctness of decay functions and integration with existing rerank pipeline.

## Dimension 1: Contracts Validation

| Check | Method | Pass Criteria |
|-------|--------|---------------|
| FreshnessType schema valid | `pnpm typecheck` | No type errors |
| FreshnessDecayConfig schema valid | Unit test | Zod parses valid configs, rejects invalid |
| DecayMeta extension backward compatible | Unit test | Old records without freshnessType default to evergreen |

## Dimension 2: Pure Function Correctness

| Check | Method | Pass Criteria |
|-------|--------|---------------|
| Exponential decay formula correct | Unit test | `exponentialDecay(0, 30, 0.3) === 1.0` |
| Exponential decay respects half-life | Unit test | `exponentialDecay(30, 30, 0.3) ≈ 0.65` |
| Exponential decay respects floor | Unit test | `exponentialDecay(1000, 30, 0.3) >= 0.3` |
| Linear decay correct | Unit test | `linearDecay(0, 90, 0.3) === 1.0` |
| Linear decay reaches floor | Unit test | `linearDecay(90, 90, 0.3) === 0.3` |
| Step decay correct | Unit test | `stepDecay(true) === 1.0, stepDecay(false) === 0.5` |

## Dimension 3: Integration Validation

| Check | Method | Pass Criteria |
|-------|--------|---------------|
| Freshness multiplier applied in rerank | Integration test | Volatile entry score < evergreen entry score |
| Multiplier applied after stale penalty | Integration test | Both penalties compound correctly |
| Decay multiplier in citation scores | Integration test | Response includes decayMultiplier field |
| Config disabled = no decay | Integration test | All entries scored equally when disabled |

## Dimension 4: Edge Cases

| Check | Method | Pass Criteria |
|-------|--------|---------------|
| Null decayMeta defaults to evergreen | Unit test | `computeFreshnessMultiplier(null) === 1.0` |
| Age = 0 returns 1.0 | Unit test | Fresh entries not penalized |
| Negative age handled gracefully | Unit test | Clamped to 0 or throws |
| Floor = 0 allows full decay | Unit test | Multiplier can reach 0 |

## Test Commands

```bash
# Unit tests
pnpm --filter @trapmap/server test -- lib/decay/freshness.test.ts --reporter=verbose

# Integration tests
pnpm --filter @trapmap/server test -- lib/retrieval/rerank.test.ts --reporter=verbose

# Full validation
pnpm typecheck && pnpm --filter @trapmap/server test -- lib/decay/ lib/retrieval/
```

## Acceptance Criteria

1. All decay curve functions produce mathematically correct results
2. Freshness multiplier integrates correctly with existing rerank pipeline
3. Backward compatibility: existing records without freshnessType work correctly
4. Configuration can enable/disable freshness decay per type
5. Decay multiplier visible in retrieval response metadata

---

*Validation strategy created: 2026-05-02*
