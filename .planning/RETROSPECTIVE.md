# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.6 — Test Coverage & Optimization

**Shipped:** 2026-05-04
**Phases:** 9 | **Plans:** 20

### What Was Built
- CI baseline restored: 1725+ tests passing, 0 failures after fixing lifecycle state machine mismatches
- 58 governance tests covering RBAC permissions, eligibility, security level enforcement, team boundaries
- 93 security-critical tests for governance, auth routes, candidate detection, and access key management
- 127 tests for retrieval orchestrator, merge strategy, semantic recall, artifact pipeline, and postgres store
- 154 tests for CLI HTTP client, knowledge/team commands, contracts schemas, and Vitest coverage tooling
- Query speed optimizations: batch embedding, reranking improvements, HNSW vector index, GIN keyword index
- Memory optimization with batch processing and GC hints during indexing
- Dead code removal (6 unused files, ~450 lines) and TypeScript strict mode compliance
- Complete documentation updates including API surface, README, and architecture docs

### What Worked
- Test-first approach starting from Phase 68 (fix failing tests first) ensured clean baseline before adding coverage
- Pure function testing pattern for governance/eligibility modules enabled 58 deterministic tests without mocking
- Fastify buildServer() + app.inject() pattern for route integration tests avoided server startup overhead
- Feature flag (USE_DB_SEARCH) for gradual rollout of DB-level search with in-memory fallback
- YOLO mode with skip_discuss=true kept 9 phases moving efficiently without interactive gates

### What Was Inefficient
- 7 of 9 phases lack VERIFICATION.md files — only SUMMARY frontmatter claims completion
- Performance optimizations (batch embedding, ensureVectorIndex) created but not wired into production pipeline
- earlyTerminationThreshold defined in config but never passed by orchestrator — optimization exists but is dormant
- REQUIREMENTS.md checkboxes never updated despite phases completing (11 of 13 still marked unchecked)

### Patterns Established
- Test coverage phases should verify CI baseline first (Phase 68 pattern) before adding new tests
- Feature flags for performance optimizations enable safe rollout without committing to new code paths
- Benchmark utilities as standalone exports for measuring before/after without coupling to production code

### Key Lessons
1. Fix failing tests before adding new coverage — a broken baseline makes all new test results unreliable
2. Performance optimization phases must include integration verification — orphaned optimization code is tech debt
3. VERIFICATION.md generation should be enforced, not optional — without it, only SUMMARY frontmatter validates work
4. TypeScript strict mode is cheaper to enable incrementally during type consolidation phases than as a separate effort
5. Test coverage tooling (Vitest coverage-v8) should be integrated early so coverage % is visible during all subsequent phases

### Cost Observations
- Model mix: primarily balanced profile (sonnet for execution, opus for complex planning)
- Timeline: 1 day for 9 phases, ~20 plans — fastest milestone yet due to focused scope and established patterns
- Notable: v1.6 was the fastest milestone (1 day vs 3 days for v1.5) despite adding 400+ new tests

---

## Milestone: v1.5 — 功能增强

**Shipped:** 2026-05-04
**Phases:** 20 | **Plans:** 58

### What Was Built
- Knowledge lifecycle state machine with 5 states (active, review-due, stale, expired, superseded) and automatic transitions
- Time-based decay scoring in retrieval with configurable curves (exponential, linear, step) for three freshness types
- Unified 6-layer boundary schema (context, versions, prerequisites, signals, exclusions, evidence) across trap and skill artifacts
- Boundary-aware retrieval with required/preferred/excluded constraint handling and API explanations
- Conflict detection for entries addressing the same problem with different solutions
- CLI feedback entry points and admin batch management with automatic lifecycle triggers
- Evidence metadata (sourceType, evidenceLevel, verifiedAt) with provenance tracking
- Ownership and review-due metadata with maintenance CLI commands
- Row-level PostgreSQL tables (candidates, knowledge_entries, skill_artifacts) replacing JSONB snapshot for concurrent write support

### What Worked
- Pure state machine pattern for decay transitions (Phase 48) enabled deterministic testing with 44 tests
- Row-level table migration (Phases 61-63) eliminated 3-4x transact amplification and enabled concurrent writes
- Unified boundary schema shared across both artifact types prevented type divergence
- Gap closure phases (64-67) successfully wired disconnected features into production pipeline
- Nullable boundary field pattern allowed backward compatibility with existing fixtures

### What Was Inefficient
- Phase 54 was left incomplete and required Phase 66 to complete boundary-aware retrieval
- Some phases had duplicate directories in .planning/phases/ due to naming variations
- Decay routes were implemented but not registered in documentedRoutes until Phase 65
- Type duplication (AdapterSyncState, KnowledgeIndexStateRecord) required Phase 60 to consolidate

### Patterns Established
- Pure state machine functions with injected timestamp for deterministic testing
- Row-level repository pattern with PostgreSQL SELECT FOR UPDATE for concurrent-safe operations
- Dual-write period during migration (write to both old and new stores) before cutover
- Optional schema fields for gradual adoption without breaking existing clients
- Lifecycle trigger rules connecting feedback patterns to state transitions

### Key Lessons
1. Lifecycle management requires both soft decay (ranking penalty) and hard decay (exclusion) to balance relevance with freshness
2. Boundary constraints need three-tier handling: required (exclusion), preferred (boost), excluded (penalty)
3. Row-level tables with proper locking are essential for concurrent write scalability — JSONB snapshots create lock contention
4. Feedback loops only matter if they connect to lifecycle transitions — otherwise feedback accumulates without action
5. Gap closure phases should be planned upfront, not discovered during milestone verification

### Cost Observations
- Model mix: primarily balanced profile (sonnet for execution, opus for complex planning)
- Timeline: 3 days for 20 phases, ~58 plans — roughly 19 plans/day with parallel agents
- Notable: v1.5 was faster than v1.4 (3 days vs 4 days) despite similar plan count, likely due to established patterns from prior milestones

---

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
| v1.5 | 20 | 58 | Lifecycle management, boundaries, feedback loops, row-level tables |
| v1.6 | 9 | 20 | Test coverage (2151+ tests), performance optimization, strict mode, documentation |

### Top Lessons (Verified Across Milestones)

1. Shared contracts with runtime selection enable clean incremental migration
2. Governance and security must be measured independently from functionality
3. Verification artifacts are not optional — backfill phases consistently find real gaps
4. Pure functions with injected dependencies enable deterministic testing
5. Row-level database design is essential for concurrent write scalability
