# Roadmap: Skill Shareer

## Milestones

- ✅ **v1.0 MVP** — Phases 1-5 (shipped 2026-04-14)
- ✅ **v1.1 Multi-path Retrieval** — Phases 6-11 (shipped 2026-04-16)
- ✅ **v1.2 Skill-Native Retrieval** — Phases 12-16 (shipped 2026-04-17)
- ✅ **v1.3** — Phases 17-24 (shipped 2026-04-20)
- ✅ **v1.4 评测系统构建** — Phases 25-47 (shipped 2026-04-29)
- ✅ **v1.5 功能增强** — Phases 48-67 (shipped 2026-05-04)
- ✅ **v1.6 Test Coverage & Optimization** — Phases 68-76 (shipped 2026-05-04)
- ✅ **v1.7 Eval Structural Coverage & Architecture Health** — Phases 78-86 (shipped 2026-05-05)

## Phases

<details>
<summary>✅ v1.7 Eval Structural Coverage & Architecture Health (Phases 78-86) — SHIPPED 2026-05-05</summary>

### Graph-Plan Evaluation
- [x] Phase 78: Graph-Plan Evaluation (2/2 plans) — completed 2026-05-04

### God File Refactoring
- [x] Phase 80: Operations Route Refactoring (3/3 plans) — completed 2026-05-04
- [x] Phase 81: Orchestrator Decomposition (3/3 plans) — completed 2026-05-05
- [x] Phase 85: CLI Operations Refactoring (3/3 plans) — completed 2026-05-05

### Infrastructure
- [x] Phase 83: Store Decoupling (4/4 plans) — completed 2026-05-05

### Cleanup
- [x] Phase 84: Tech Debt Cleanup (3/3 plans) — completed 2026-05-05
- [x] Phase 86: Gitignore Cleanup (1/1 plan) — completed 2026-05-05

</details>

<details>
<summary>✅ v1.6 Test Coverage & Optimization (Phases 68-76) — SHIPPED 2026-05-04</summary>

### Test Coverage
- [x] Phase 68: Fix failing unit tests (1/1 plan)
- [x] Phase 69: Governance and auth route tests (3/3 plans)
- [x] Phase 70: Retrieval and indexing core tests (3/3 plans)
- [x] Phase 71: CLI and contracts tests + coverage tooling (3/3 plans)

### Performance Optimization
- [x] Phase 72: Query speed optimization (6/6 plans)
- [x] Phase 73: Memory usage optimization (1/1 plan)

### Code Quality
- [x] Phase 74: Dead code removal (1/1 plan)
- [x] Phase 75: TypeScript strict mode compliance (1/1 plan)

### Documentation
- [x] Phase 76: Documentation completion (1/1 plan)

</details>

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

## Progress

| Milestone | Phases | Plans | Status | Shipped |
|-----------|--------|-------|--------|---------|
| v1.0-v1.4 | 1-47 | 93 | Complete | 2026-04-29 |
| v1.5 | 48-67 | 58 | Complete | 2026-05-04 |
| v1.6 | 68-76 | 20 | Complete | 2026-05-04 |
| v1.7 | 78-86 | 19 | Complete | 2026-05-05 |
| v1.8 | 87-99 | — | Planned | — |

### Documentation Governance

- [x] Phase 88: Documentation Restructuring & Synchronization (0/? plans) (completed 2026-05-06)

### Usage Analytics

- [ ] Phase 89: Usage Analytics & Statistics (0/? plans)

### Agent-Native CLI Integration

- [ ] Phase 96: Agent-Native CLI — trapmap load (0/? plans)
- [ ] Phase 97: Agent-Native CLI — trapmap init (0/? plans)
- [x] Phase 99: Agent-Native Verification (3/3 plans) — completed 2026-05-06

Plans:
- [x] 099-01-PLAN.md — Extend markdown-formatter tests for assets/scripts edge cases and capsule fallback
- [x] 099-02-PLAN.md — Full verification gates (typecheck, tests, build) and SKILL.md consistency check
- [x] 099-03-PLAN.md — Synchronize references/retrieval.md (SKILL.md consistency gap closure)

### Phase 88: Documentation Restructuring & Synchronization ✅

**Goal:** 重构项目文档体系——消除重复、同步代码、建立目录结构与可视化标准
**Depends on:** Phase 86
**Completed:** 2026-05-06

**Requirements:**
1. 消除重复的 architecture 文件
2. 归档过时文档到 docs/archived/
3. 重建 docs/ 目录结构（guides/, reference/, operations/, architecture/）
4. 同步 API.md 与实际路由
5. 同步 CLI.md 与实际命令
6. 添加 Mermaid 流程图

**Success Criteria:**
- [x] 无重复的 architecture 文件
- [x] 过时文档已归档
- [x] docs/ 按主题分组
- [x] API.md 和 CLI.md 同步完成
- [x] Mermaid 流程图已添加

---

### Type Hygiene

- [x] Phase 87: Type & State Machine Centralization (3/3 plans) — completed 2026-05-06

Plans:
- [x] 087-01-PLAN.md — Decompose store.ts into domain-separated store/ directory
- [x] 087-02-PLAN.md — Create state-machines/index.ts barrel export
- [x] 087-03-PLAN.md — Create lib/types.ts unified entry + compile verification test

### Phase 87: Type & State Machine Centralization ✅

**Goal:** 集中导出 server 包的散落类型、枚举和状态机，建立统一的 barrel re-export 体系
**Depends on:** Phase 86
**Completed:** 2026-05-06

**Requirements:**
1. 将 `store.ts` 中 35+ 个 record 接口拆分到 `store/types/` 目录（按领域：knowledge-records.ts, skill-records.ts, system-records.ts 等）
2. 创建 `server/src/lib/types.ts` 统一 re-export 所有子模块类型（indexing, retrieval, ai, candidates, governance, store 等）
3. 为 decay 和 lifecycle 状态机创建统一导出点（`state-machines/index.ts`）
4. 所有现有 import 路径保持 backward-compatible（旧路径 re-export 自新位置）
5. 添加类型导出的编译验证测试

**Success Criteria:**
- [x] store.ts 中的接口按领域拆分到独立文件
- [x] 存在 `lib/types.ts` 作为所有 server 类型的统一入口
- [x] 状态机有统一的 barrel 导出
- [x] 所有现有 import 路径不受影响（typecheck 通过）
- [x] 现有测试全部通过

### Phase 89: Usage Analytics & Statistics ✅

**Goal:** 实现面向组织管理员和系统管理员的使用统计功能，包括请求次数（按组织/账户）、skill/trap 检索命中计数、热门条目排行、以及统计查询 API
**Depends on:** Phase 86
**Completed:** 2026-05-06

**Requirements:**
1. Add `stats:read` permission to contracts
2. Create `usageEvents` table schema for recording retrieval hits
3. Implement `UsageAnalyticsRepository` with PostgreSQL backend
4. Create stats API routes with permission and team scoping
5. Wire repository in app.ts onReady hook
6. Record usage events in retrieval routes (fire-and-forget)

**Success Criteria:**
- [x] `stats:read` permission exists in contracts
- [x] `usageEvents` table schema with correct columns and indexes
- [x] Stats query/response Zod schemas in contracts
- [x] `UsageAnalyticsRepository` interface with 6 methods
- [x] `PgUsageAnalyticsRepository` implementation with date_trunc aggregation
- [x] Stats routes registered with auth and team scoping
- [x] Repository wired in app.ts onReady hook
- [x] Fire-and-forget event recording in retrieval routes
- [x] TypeScript compiles, all tests pass

### Phase 96: Agent-Native CLI — trapmap load

**Goal:** 实现 `trapmap load` 命令，封装 检索→筛选→激活→格式化 为单条命令，输出 agent 可直接消费的 markdown context block，并重写 SKILL.md 使用精简 workflow
**Depends on:** Phase 86

### Phase 97: Agent-Native CLI — trapmap init

**Goal:** 实现 `trapmap init` 命令，通过 `npx skills add` 将精简版 skill 安装到目标 agent 环境
**Depends on:** — (独立于 Phase 96)

### Phase 99: Agent-Native Verification

**Goal:** 验证 Phase 96-97 所有实现的端到端正确性
**Depends on:** Phase 96, Phase 97

### Phase 100: Store Repository Pattern — Domain-specific repository interfaces to replace raw StoreData access

**Goal:** 将 SkillShareerStore 的 snapshot/transact 裸操作替换为领域级 Repository 接口，使路由层不再直接依赖 StoreData 结构，同时让 Json/PG 双实现路径对称
**Depends on:** Phase 99

### Phase 101: Lifecycle State Machine with Event Bus — Explicit state machine for knowledge lifecycle with domain event system ✅

**Goal:** 将知识条目的 LifecycleState 转换规则从散落在路由/if-else 中提升为显式状态机定义，并引入领域事件机制使索引同步、审计记录、通知等解耦为事件订阅者
**Depends on:** Phase 100
**Completed:** 2026-05-07
**Plans:** 4/4 complete

Plans:
- [x] 101-01-PLAN.md — Foundation: types, event bus, transition table *(Wave 1)*
- [x] 101-02-PLAN.md — Orchestrator and event subscribers *(Wave 2 — blocked on 101-01)*
- [x] 101-03-PLAN.md — Service wiring (context.ts + app.ts) *(Wave 3 — blocked on 101-01, 101-02)*
- [x] 101-04-PLAN.md — Route migration to event emission *(Wave 4 — blocked on 101-03)*

### Phase 102: IndexAdapter Generalization and Retrieval Plugin — Dynamic adapter registry with pluggable recall channels

**Goal:** 将 IndexAdapter 的 kind 字段从固定联合类型泛化为字符串注册表，并将检索管道的召回通道抽象为可插拔接口，使新增索引/召回通道无需修改核心 pipeline 和 orchestrator
**Depends on:** Phase 101
**Plans:** 3 plans

Plans:
**Wave 1**
- [x] 102-01-PLAN.md — Indexing registry and type generalization *(Wave 1)* — 2026-05-07
- [x] 102-02-PLAN.md — Retrieval registry and channel abstraction *(Wave 1)* — 2026-05-07

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 102-03-PLAN.md — Service wiring and orchestrator integration *(Wave 2 — blocked on 102-01, 102-02)* — 2026-05-07

### Phase 103: CLI Dynamic Registration and Transport Abstraction — Plugin-based command discovery with pluggable transport layer

**Goal:** 将 CLI 命令注册从手动逐一 import 改为目录扫描自动发现，并将 HTTP 调用抽象为 Transport 接口，使 CLI 可支持多种传输方式（HTTP、gRPC、进程内直连）
**Depends on:** Phase 102

---

*Roadmap updated: 2026-05-07 — Phase 102 planned (3 plans, 2 waves)*
