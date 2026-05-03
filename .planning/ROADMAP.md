# Roadmap: Skill Shareer

## Milestones

- ✅ **v1.0 MVP** — Phases 1-5 (shipped 2026-04-14)
- ✅ **v1.1 Multi-path Retrieval** — Phases 6-11 (shipped 2026-04-16)
- ✅ **v1.2 Skill-Native Retrieval** — Phases 12-16 (shipped 2026-04-17)
- ✅ **v1.3** — Phases 17-24 (shipped 2026-04-20)
- ✅ **v1.4 评测系统构建** — Phases 25-47 (shipped 2026-04-29)
- ✅ **v1.5 功能增强** — Phases 48-67 (shipped 2026-05-04)
- 🚧 **v1.6 Test Coverage & Optimization** — Phases 68-76 (planned)

## Phases

<details>
<summary>✅ v1.5 功能增强 (Phases 48-67) — SHIPPED 2026-05-04</summary>

### Decay & Retirement
- [x] Phase 48: Lifecycle State Machine (3/3 plans)
- [x] Phase 49: Time-based Decay in Retrieval (5/5 plans)
- [x] Phase 50: Batch Management Interface (3/3 plans)

### Applicability Boundary Model
- [x] Phase 51: Boundary Schema Definition (2/2 plans)
- [x] Phase 52: Boundary Capture in Submission Flow (1/1 plan)
- [x] Phase 53: Boundary Indexing & Graph Integration (3/3 plans)
- [x] Phase 54: Boundary-aware Retrieval (completed via Phase 66)

### Conflict Detection
- [x] Phase 55: Conflict Detection & Display (1/1 plan)

### Feedback Loop
- [x] Phase 56: CLI Feedback Entry Points (4/4 plans)
- [x] Phase 57: Admin Feedback Management (3/3 plans)

### Evidence & Maintenance
- [x] Phase 58: Evidence Metadata & Verification Surface (6/6 plans)
- [x] Phase 59: Ownership & Verification SLA Management (4/4 plans)

### Write Path Optimization
- [x] Phase 60: Type Consolidation & Lifecycle State Machine (4/4 plans)
- [x] Phase 61: Candidate Pipeline Independent Table (3/3 plans)
- [x] Phase 62: Knowledge Entry Row-Level Table (4/4 plans)
- [x] Phase 63: Skill Artifact Row-Level Table & JSONB Cleanup (4/4 plans)

### Gap Closure
- [x] Phase 64: Retrieval Pipeline Integration (1/1 plan)
- [x] Phase 65: Feedback Lifecycle & Decay Route Wiring (2/2 plans)
- [x] Phase 66: Boundary-aware Retrieval Completion (4/4 plans)
- [x] Phase 67: Audit Cleanup & Documentation (1/1 plan)

</details>

### 🚧 v1.6 Test Coverage & Optimization (Phases 68-76) — Planned

#### Test Coverage

- [x] Phase 68: Fix failing unit tests (1 plan) (completed 2026-05-03)
- [x] Phase 69: Governance and auth route tests (3/3 plans) (completed 2026-05-03)
- [x] Phase 70: Retrieval and indexing core tests (3/3 plans)
- [ ] Phase 71: CLI and contracts tests + coverage tooling (0 plans)

#### Performance Optimization

- [ ] Phase 72: Query speed optimization (0 plans)
- [ ] Phase 73: Memory usage optimization (0 plans)

#### Code Quality

- [ ] Phase 74: Dead code removal (0 plans)
- [ ] Phase 75: TypeScript strict mode compliance (0 plans)

#### Documentation

- [ ] Phase 76: Documentation completion (0 plans)

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1-47 | v1.0-v1.4 | 93/93 | Complete | 2026-04-29 |
| 48-67 | v1.5 | 58/58 | Complete | 2026-05-04 |
| 68-76 | v1.6 | 2/2 | In progress | 2026-05-03 |

---

## Phase Details

### Phase 68: Fix failing unit tests - restore CI baseline

**Goal:** Fix all failing unit tests to restore CI baseline before adding new test coverage
**Requirements:** TEST-01
**Depends on:** Phase 67
**Plans:** 1/1 plans complete

Plans:
- [x] 68-01-PLAN.md — Verify CI baseline restored (all tests passing after fix commit 3fb096a)

**Success Criteria:**
1. `pnpm test` exits with 0 (no failures)
2. `pnpm typecheck` exits with 0 (no type errors)
3. CI pipeline green on test step

---

### Phase 69: Add governance and auth route tests - security critical coverage

**Goal:** Add tests for governance module (permissions, eligibility), auth-related routes, and candidate detection system to ensure security-critical code paths are covered
**Requirements:** TEST-02
**Depends on:** Phase 68
**Plans:** 3/3 plans complete

Plans:
- [x] 69-01-PLAN.md -- Governance permissions and eligibility unit tests
- [x] 69-02-PLAN.md -- Candidate detector unit tests (18 tests)
- [x] 69-03-PLAN.md -- Auth and access-keys route integration tests (17 tests)

**Success Criteria:**
1. `governance/permissions.test.ts` covers RBAC permission checks
2. `governance/eligibility.test.ts` covers security level filtering
3. `routes/auth.test.ts` covers authentication flow
4. `routes/access-keys.test.ts` covers API key management
5. `candidates/detector.test.ts` covers duplicate detection logic
6. All new tests pass

---

### Phase 70: Add retrieval and indexing core tests - business logic coverage

**Goal:** Add tests for uncovered retrieval and indexing modules (orchestrator, semantic, merge, artifact-pipeline) to protect core business logic
**Requirements:** TEST-03
**Depends on:** Phase 68
**Plans:** 3 plans

Plans:
- [ ] 70-01-PLAN.md -- Retrieval merge and semantic unit tests
- [ ] 70-02-PLAN.md -- Retrieval orchestrator tests
- [ ] 70-03-PLAN.md -- Artifact pipeline and postgres store tests

**Success Criteria:**
1. `retrieval/orchestrator.test.ts` covers retrieval orchestration flow
2. `retrieval/semantic.test.ts` covers semantic recall
3. `retrieval/merge.test.ts` covers multi-path merge strategy
4. `indexing/artifact-pipeline.test.ts` covers artifact indexing flow
5. `persistence/postgres-store.test.ts` covers database store operations
6. All new tests pass

---

### Phase 71: Add CLI and contracts tests plus coverage tooling integration

**Goal:** Add tests for CLI commands and contracts schemas, integrate Vitest coverage tooling, and establish coverage thresholds in CI
**Requirements:** TEST-04, TEST-05
**Depends on:** Phase 69, Phase 70
**Plans:** 3 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 71 to break down)

**Success Criteria:**
1. CLI commands have tests: `knowledge.test.ts`, `team.test.ts`, `http.test.ts`
2. Contracts schemas have validation tests: `knowledge.test.ts`, `retrieval.test.ts`
3. `@vitest/coverage-v8` installed and configured
4. `pnpm test:coverage` generates HTML and text reports
5. Coverage threshold configured (target: 70% lines)
6. CI workflow includes coverage step

---

### Phase 72: Query speed optimization

**Goal:** Optimize retrieval query speed by reducing vector search latency and reranking overhead
**Requirements:** PERF-01, PERF-02
**Depends on:** Phase 71
**Plans:** 3 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 72 to break down)

**Success Criteria:**
1. Vector search latency reduced (measured baseline vs optimized)
2. Database queries optimized with proper indexing
3. Reranking overhead reduced
4. No regression in search quality metrics

---

### Phase 73: Memory usage optimization

**Goal:** Reduce memory footprint during indexing operations and optimize resource usage
**Requirements:** PERF-03
**Depends on:** Phase 72
**Plans:** 3 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 73 to break down)

**Success Criteria:**
1. Memory usage during indexing reduced (measured baseline vs optimized)
2. No memory leaks in long-running operations
3. Resource cleanup verified

---

### Phase 74: Dead code removal

**Goal:** Remove unused functions, imports, and files across the codebase
**Requirements:** QUAL-01
**Depends on:** Phase 73
**Plans:** 3 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 74 to break down)

**Success Criteria:**
1. Unused functions removed (ts-prune or similar tool run)
2. Unused imports cleaned
3. Dead files removed
4. All tests still pass after cleanup

---

### Phase 75: TypeScript strict mode compliance

**Goal:** Enable TypeScript strict mode and fix all resulting type errors, eliminate 'any' types
**Requirements:** QUAL-02
**Depends on:** Phase 74
**Plans:** 3 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 75 to break down)

**Success Criteria:**
1. `strict: true` enabled in tsconfig.json
2. No 'any' types in production code
3. All type errors resolved
4. Build succeeds with strict mode

---

### Phase 76: Documentation completion

**Goal:** Complete API documentation, update README, and add architecture documentation
**Requirements:** DOC-01, DOC-02, DOC-03
**Depends on:** Phase 75
**Plans:** 3 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 76 to break down)

**Success Criteria:**
1. All API endpoints documented with request/response schemas
2. README updated with getting started guide
3. Architecture diagram created with module relationships
4. Documentation verified against current codebase

---

## Requirement Coverage Matrix (v1.6)

| Requirement | Phase | Description |
|-------------|-------|-------------|
| TEST-01 | Phase 68 | Fix failing unit tests, restore CI baseline |
| TEST-02 | Phase 69 | Governance and auth route tests |
| TEST-03 | Phase 70 | Retrieval and indexing core tests |
| TEST-04 | Phase 71 | CLI and contracts tests |
| TEST-05 | Phase 71 | Coverage tooling integration |
| PERF-01 | Phase 72 | Retrieval query speed optimization |
| PERF-02 | Phase 72 | Database query optimization |
| PERF-03 | Phase 73 | Memory usage optimization |
| QUAL-01 | Phase 74 | Dead code removal |
| QUAL-02 | Phase 75 | TypeScript strict mode compliance |
| DOC-01 | Phase 76 | API endpoint documentation |
| DOC-02 | Phase 76 | User-facing README updates |
| DOC-03 | Phase 76 | Architecture documentation |

---

## Dependency Graph

```
Phase 68 (Fix Failing Tests)
    ├── Phase 69 (Governance & Auth Tests)
    └── Phase 70 (Retrieval & Indexing Tests)
            └── Phase 71 (CLI/Contracts Tests + Coverage)
                    └── Phase 72 (Query Speed Optimization)
                            └── Phase 73 (Memory Optimization)
                                    └── Phase 74 (Dead Code Removal)
                                            └── Phase 75 (TypeScript Strict Mode)
                                                    └── Phase 76 (Documentation)
```

---

*Roadmap updated: 2026-05-04 — Phase 68 planned (1 plan)*
