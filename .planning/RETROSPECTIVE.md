# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.4 — 评测系统构建

**Shipped:** 2026-04-29
**Phases:** 23 | **Plans:** 59

### What Was Built
- Complete retrieval evaluation system with ranking metrics (Hit@K, MRR, nDCG, Recall@K) and governance failure detection
- Summary evaluation with LLM-as-judge groundedness/coverage scoring over retrieval context
- GraphRAG-lite indexing pipeline, trap-first plan compilation, and /v3 retrieval endpoints with confidence-aware routing
- Async candidate ingestion with fingerprint-based duplicate detection and manual resolution CLI workflow
- Database-backed persistence (PostgreSQL/Drizzle) replacing file-backed store with shared SkillShareerStore contract
- CI regression detection with baseline comparison, cohort reports, and GitHub Actions smoke/core evaluation workflows

### What Worked
- Shared governance module (Phase 32) eliminated duplicated eligibility logic and made trap/split clean
- SkillShareerStore shared contract (Phase 43) made the JsonStore-to-PostgresStore migration incremental and safe
- Verification backfill phases (44-47) caught real gaps and produced an honest audit trail
- YOLO mode with parallel agent execution kept 23 phases moving without blocking on interactive gates

### What Was Inefficient
- Phases 33 (async candidate ingestion) had 7 plans with only 6 summaries — one plan likely merged or split during execution
- Core tier summary evaluation cases remain empty placeholder — infrastructure built but not populated with real cases
- Graph-plan evaluation coverage minimal (only 2 core cases for v3) — too thin for confident regression gating
- Phase numbering from 25 onward inherited from earlier milestone context, making it harder to reason about scope

### Patterns Established
- Shared interface contracts (SkillShareerStore) for incremental infrastructure migration without route-by-route rewrites
- Async processing boundary with startup recovery for stateful operations (candidate ingestion)
- Verification backfill as explicit milestone-closing phases when audit surfaces documentation gaps
- GraphRAG-lite as a pragmatic middle ground: graph structure for trap-skill relationships without full knowledge graph infrastructure

### Key Lessons
1. Build the evaluation system early — measuring quality is a prerequisite for improving it, and late evaluation means late surprises
2. Shared store contracts with runtime selection (env-based) enable clean infrastructure migrations without rewriting callers
3. Verification backfill phases are worth the investment: they surface real gaps that would otherwise be hidden
4. Governance scoring must be separate from relevance scoring — high recall cannot hide permission leakage
5. CI integration (baseline comparison, smoke/core tiers) makes evaluation actionable rather than aspirational

### Cost Observations
- Model mix: primarily balanced profile (sonnet + opus for planning, sonnet for execution)
- Timeline: 4 days for 23 phases, ~59 plans — roughly 15 plans/day with parallel agents
- Notable: verification backfill phases (44-47) were faster than feature phases because they focused on documentation and gap-filling rather than new code

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Key Change |
|-----------|--------|-------|------------|
| v1.4 | 23 | 59 | Evaluation system, GraphRAG-lite, DB persistence, CI regression |

### Top Lessons (Verified Across Milestones)

1. Shared contracts with runtime selection enable clean incremental migration
2. Governance and security must be measured independently from functionality
3. Verification artifacts are not optional — backfill phases consistently find real gaps
