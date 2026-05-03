# Roadmap: Skill Shareer

## Milestones

- ✅ **v1.0 MVP** — Phases 1-5 (shipped 2026-04-14)
- ✅ **v1.1 Multi-path Retrieval** — Phases 6-11 (shipped 2026-04-16)
- ✅ **v1.2 Skill-Native Retrieval** — Phases 12-16 (shipped 2026-04-17)
- ✅ **v1.3** — Phases 17-24 (shipped 2026-04-20)
- ✅ **v1.4 评测系统构建** — Phases 25-47 (shipped 2026-04-29)
- ✅ **v1.5 功能增强** — Phases 48-67 (shipped 2026-05-04)
- 🚧 **v1.6 Test Coverage** — Phases 68-71 (planned)

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

### 🚧 v1.6 Test Coverage (Phases 68-71) — Planned

- [ ] Phase 68: Fix failing unit tests (1 plan)
- [ ] Phase 69: Governance and auth route tests (0 plans)
- [ ] Phase 70: Retrieval and indexing core tests (0 plans)
- [ ] Phase 71: CLI and contracts tests + coverage tooling (0 plans)

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1-47 | v1.0-v1.4 | 93/93 | Complete | 2026-04-29 |
| 48-67 | v1.5 | 58/58 | Complete | 2026-05-04 |
| 68-71 | v1.6 | 0/1 | Not started | - |

---

## Phase Details

### Phase 68: Fix failing unit tests - restore CI baseline

**Goal:** Fix all failing unit tests (6 test files, 38 failing cases) to restore CI baseline before adding new test coverage
**Requirements:** TEST-01
**Depends on:** Phase 67
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 68 to break down)

**Success Criteria:**
1. All 6 failing test files pass: `derive.test.ts`, `assembly.test.ts` and others
2. `pnpm test` exits with 0 (no failures)
3. CI pipeline green on test step

---

### Phase 69: Add governance and auth route tests - security critical coverage

**Goal:** Add tests for governance module (permissions, eligibility) and auth-related routes to ensure security-critical code paths are covered
**Requirements:** TEST-02
**Depends on:** Phase 68
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 69 to break down)

**Success Criteria:**
1. `governance/permissions.test.ts` covers RBAC permission checks
2. `governance/eligibility.test.ts` covers security level filtering
3. `routes/auth.test.ts` covers authentication flow
4. `routes/access-keys.test.ts` covers API key management
5. All new tests pass

---

### Phase 70: Add retrieval and indexing core tests - business logic coverage

**Goal:** Add tests for uncovered retrieval and indexing modules (orchestrator, semantic, merge, artifact-pipeline) to protect core business logic
**Requirements:** TEST-03
**Depends on:** Phase 68
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 70 to break down)

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
**Plans:** 0 plans

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

## Requirement Coverage Matrix (v1.6)

| Requirement | Phase | Description |
|-------------|-------|-------------|
| TEST-01 | Phase 68 | Fix failing unit tests, restore CI baseline |
| TEST-02 | Phase 69 | Governance and auth route tests |
| TEST-03 | Phase 70 | Retrieval and indexing core tests |
| TEST-04 | Phase 71 | CLI and contracts tests |
| TEST-05 | Phase 71 | Coverage tooling integration |

---

## Dependency Graph

```
Phase 68 (Fix Failing Tests)
    ├── Phase 69 (Governance & Auth Tests)
    └── Phase 70 (Retrieval & Indexing Tests)
            └── Phase 71 (CLI/Contracts Tests + Coverage)
```

---

*Roadmap updated: 2026-05-04 — v1.5 功能增强 shipped, v1.6 Test Coverage planned*
