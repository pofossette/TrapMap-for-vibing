# Roadmap: Skill Shareer

## Milestones

- ✅ **v1.0 MVP** — Phases 1-5 (shipped 2026-04-14)
- ✅ **v1.1 Multi-path Retrieval** — Phases 6-11 (shipped 2026-04-16)
- ✅ **v1.2 Skill-Native Retrieval** — Phases 12-16 (shipped 2026-04-17)
- ✅ **v1.3** — Phases 17-24 (shipped 2026-04-20)
- ✅ **v1.4 评测系统构建** — Phases 25-47 (shipped 2026-04-29)
- ✅ **v1.5 功能增强** — Phases 48-67 (shipped 2026-05-04)
- ✅ **v1.6 Test Coverage & Optimization** — Phases 68-76 (shipped 2026-05-04)
- 🔵 **v1.7 Eval Structural Coverage & Architecture Health** — Phases 78-86

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

<details>
<summary>✅ v1.6 Test Coverage & Optimization (Phases 68-76) — SHIPPED 2026-05-04</summary>

### Test Coverage
- [x] Phase 68: Fix failing unit tests (1/1 plan) (completed 2026-05-03)
- [x] Phase 69: Governance and auth route tests (3/3 plans) (completed 2026-05-03)
- [x] Phase 70: Retrieval and indexing core tests (3/3 plans) (completed 2026-05-04)
- [x] Phase 71: CLI and contracts tests + coverage tooling (3/3 plans) (completed 2026-05-04)

### Performance Optimization
- [x] Phase 72: Query speed optimization (6/6 plans) (completed 2026-05-04)
- [x] Phase 73: Memory usage optimization (1/1 plan) (completed 2026-05-04)

### Code Quality
- [x] Phase 74: Dead code removal (1/1 plan) (completed 2026-05-04)
- [x] Phase 75: TypeScript strict mode compliance (1/1 plan) (completed 2026-05-04)

### Documentation
- [x] Phase 76: Documentation completion (1/1 plan) (completed 2026-05-04)

</details>

<details>
<summary>v1.7 Eval Structural Coverage (Phase 78+) — IN PROGRESS</summary>

### Graph-Plan Evaluation
- [ ] Phase 78: Graph-Plan Evaluation (2 plans)
  - [ ] PLAN.md — Schema, normalization, assertions, scenarios, test cases, integration, normalization tests (Wave 1)
  - [x] 78-02-PLAN.md — Governance integration, verdict assertions, core case updates (Wave 2)

### Prompt Architecture & Caching
- [ ] Phase 79: Prompt Template Unification (0/? plans)

</details>

<details>
<summary>🔵 v1.7 Eval Structural Coverage & Architecture Health (Phases 78-86) — IN PROGRESS</summary>

### God File Refactoring
- [x] Phase 80: Operations Route Refactoring (3 plans) (completed 2026-05-04)
  - 拆分 `routes/operations.ts` (1680 行) 为 9 个职责单一的路由模块
  - [x] 80-01-PLAN.md — Extract 9 sub-modules, create thin router, update app.ts (Wave 1)
  - [x] 80-02-PLAN.md — Split test file to match module structure (Wave 2)
  - [x] 80-03-PLAN.md — Final verification, line count checks, full test run (Wave 3)
- [ ] Phase 81: Orchestrator Decomposition (3 plans)
  - 拆分 `lib/retrieval/orchestrator.ts` (1195 行) 为 routing.ts, recall-coordinator.ts, refinement.ts 模块
  - [ ] 81-01-PLAN.md — Extract routing, recall-coordinator, refinement modules, slim orchestrator (Wave 1)
  - [ ] 81-02-PLAN.md — Split test files to match module structure (Wave 2)
  - [ ] 81-03-PLAN.md — Final verification, line count checks, full test run (Wave 3)
- [ ] Phase 85: CLI Operations Refactoring (0/? plans)
  - 拆分 `cli/commands/operations.ts` (1060 行) 为 list, edit, import, export, activate 等独立命令

### Infrastructure
- [ ] Phase 82: Logging Unification (0/? plans)
  - 引入 Pino 结构化日志，统一 console.* 输出，添加请求 ID 追踪
- [ ] Phase 83: Store Decoupling (0/? plans)
  - 引入 Repository 接口层，解耦 store.ts (被 96 文件导入)

### Cleanup
- [ ] Phase 84: Tech Debt Cleanup (0/? plans)
  - 清理过期 worktree (574 MB)、knip 警告、依赖更新
- [ ] Phase 86: Gitignore Cleanup (0/? plans)
  - 排除 dist/ 版本控制，清理仓库体积，更新 CONTRIBUTING.md

</details>

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1-47 | v1.0-v1.4 | 93/93 | Complete | 2026-04-29 |
| 48-67 | v1.5 | 58/58 | Complete | 2026-05-04 |
| 68-76 | v1.6 | 20/20 | Complete | 2026-05-04 |
| 78-86 | v1.7 | 0/9 | In Progress | — |

---

*Roadmap updated: 2026-05-05 — Phase 81 planned (3 plans)*
