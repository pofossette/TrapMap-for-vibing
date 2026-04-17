# Roadmap: Skill Shareer

## Milestones

- ✅ **v1.0 MVP** — Phases 1-5 (shipped 2026-04-14)
- ✅ **v1.1 RAG Structure Enhancement** — Phases 6-11 (shipped 2026-04-16)
- 🚧 **v1.2 Skill-Native Retrieval** — Phases 12-16 (planned)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-5) — SHIPPED 2026-04-14</summary>

**Full archive:** [milestones/v1.0-ROADMAP.md](./milestones/v1.0-ROADMAP.md)

- [x] Phase 1: Monorepo Skeleton and Contracts (3/3 plans) — completed 2026-04-13
- [x] Phase 2: Identity, Teams, and RBAC (3/3 plans) — completed 2026-04-13
- [x] Phase 3: Knowledge Intake and Review (4/4 plans) — completed 2026-04-13
- [x] Phase 4: Retrieval and CLI Workflow (4/4 plans) — completed 2026-04-13
- [x] Phase 5: Admin Operations and Hardening (3/3 plans) — completed 2026-04-13

**Delivered:**
- TypeScript monorepo with CLI, server, and shared contracts
- Team-aware RBAC with security levels (0-10) and permission checks
- Knowledge lifecycle with agent pre-review and human approval
- Embeddings-backed retrieval with CLI search commands
- Admin operations: import/export, knowledge management, audit trail

</details>

<details>
<summary>✅ v1.1 RAG Structure Enhancement (Phases 6-11) — SHIPPED 2026-04-16</summary>

**Full archive:** [milestones/v1.1-ROADMAP.md](./milestones/v1.1-ROADMAP.md)

- [x] Phase 6: 检索架构重构 (3/3 plans) — completed 2026-04-14
- [x] Phase 7: 混合检索 (3/3 plans) — completed 2026-04-14
- [x] Phase 8: 索引生命周期 (4/4 plans) — completed 2026-04-14
- [x] Phase 9: 图辅助检索 (4/4 plans) — completed 2026-04-14
- [x] Phase 10: 回答与引用 (4/4 plans) — completed 2026-04-15
- [x] Phase 11: 索引生命周期集成 (2/2 plans) — completed 2026-04-15

**Delivered:**
- Multi-path retrieval with orchestrator, hybrid recall (vector + keyword), and reranking
- Lifecycle-driven indexing pipeline (approve → index, update → refresh, deactivate → remove)
- Enhanced citations with source tracking, snippets, tags, and recall channel attribution
- Graph-assisted recall with lightweight entity extraction
- Optional summary builder for LLM-generated answers

</details>

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Monorepo Skeleton and Contracts | v1.0 | 3/3 | Complete | 2026-04-13 |
| 2. Identity, Teams, and RBAC | v1.0 | 3/3 | Complete | 2026-04-13 |
| 3. Knowledge Intake and Review | v1.0 | 4/4 | Complete | 2026-04-13 |
| 4. Retrieval and CLI Workflow | v1.0 | 4/4 | Complete | 2026-04-13 |
| 5. Admin Operations and Hardening | v1.0 | 3/3 | Complete | 2026-04-13 |
| 6. 检索架构重构 | v1.1 | 3/3 | Complete | 2026-04-14 |
| 7. 混合检索 | v1.1 | 3/3 | Complete | 2026-04-14 |
| 8. 索引生命周期 | v1.1 | 4/4 | Complete | 2026-04-14 |
| 9. 图辅助检索 | v1.1 | 4/4 | Complete | 2026-04-14 |
| 10. 回答与引用 | v1.1 | 4/4 | Complete | 2026-04-15 |
| 11. 索引生命周期集成 | v1.1 | 2/2 | Complete | 2026-04-15 |
| 12. Skill Artifact Canonical Model | v1.2 | 3/3 | Complete    | 2026-04-16 |
| 13. Skill Import/Export Pipeline | v1.2 | 3/3 | Complete    | 2026-04-16 |
| 14. Seed Intent Retrieval and Capsule Ranking | v1.2 | 4/4 | Complete    | 2026-04-16 |
| 15. Client Activation for References, Assets, and Scripts | v1.2 | 3/3 | Complete    | 2026-04-17 |
| 16. Compatibility Migration and Boundary Hardening | v1.2 | 3/3 | Complete   | 2026-04-17 |

## Dependencies

**Completed:** All v1.1 dependencies satisfied

```
Phase 6 (架构重构) ✅
    ↓
Phase 7 (混合检索) ✅
    ↓
Phase 8 (索引生命周期) ✅ ─────┐
    ↓                        │
Phase 9 (图辅助检索) ✅        │
    ↓                        │
Phase 10 (回答与引用) ✅ ◄──────┘
    ↓
Phase 11 (索引生命周期集成) ✅ ← gap closure for Phase 08
```

## Next Milestone

### v1.2 Skill-Native Retrieval

**Goal:** 把知识系统从扁平 knowledge entry 进一步演进为 skill-native artifact + capsule 模型，同时保持 CLI 单种子输入与现有审批/RBAC/审计边界。

### Phase 12: Skill Artifact Canonical Model

**Goal:** 定义 v1.2 skill-native artifact、revision、profile、capsule 与 client manifest 的契约和存储基础
**Depends on:** Phase 11
**Plans:** 3/3 plans complete

- [x] 12-01: Contracts for skill artifact, revision, file manifest, and activation metadata (ARTF-01, ARTF-02, CAPS-01)
- [x] 12-02: Server storage model for artifact lifecycle, governance, and derived outputs (ARTF-03, CAPS-02, CAPS-03)
- [x] 12-03: Derivation pipeline for profile/capsule/client manifest generation (CAPS-01, COMP-01, COMP-02)

### Phase 13: Skill Import/Export Pipeline

**Goal:** 让导入导出以 skill 目录为主，而不是压平 `SKILL.md`
**Depends on:** Phase 12
**Plans:** 3/3 plans complete

- [x] 13-01: Directory import path for canonical skill artifacts (IMEX-01, IMEX-04)
- [x] 13-02: Compatibility import for single `SKILL.md` with auto-wrap (IMEX-03)
- [x] 13-03: Export endpoints and CLI flows for skill-dir / distilled-json / bundle-json (IMEX-02, COMP-01)

### Phase 14: Seed Intent Retrieval and Capsule Ranking

**Goal:** 保留客户端单 seed 输入，但在服务端完成意图拆解与 capsule 级检索
**Depends on:** Phase 13
**Plans:** 4/4 plans complete

- [x] 14-01: Single-seed retrieval contract and internal parsed-intent model (RETR-01, RETR-02)
- [x] 14-02: Profile recall and capsule ranking pipeline (RETR-03, CAPS-04)
- [x] 14-03: Distilled response shaping with capsule-first output (RETR-04)
- [x] 14-04: Route and CLI integration for seed-based retrieval v2 (COMP-01, COMP-03)

### Phase 15: Client Activation for References, Assets, and Scripts

**Goal:** 把 references/assets/scripts 的按需加载和执行控制正式下沉到客户端
**Depends on:** Phase 14
**Plans:** 3/3 plans complete

- [x] 15-01: Activation response with read-next hints, asset metadata, and script profiles (RETR-05, ACTV-01)
- [x] 15-02: Policy model for scripts and client-side override rules (ACTV-02, ACTV-03, ACTV-04)
- [x] 15-03: CLI activation/download workflows for references, assets, and scripts (ACTV-01, COMP-01)

### Phase 16: Compatibility Migration and Boundary Hardening

**Goal:** 完成旧模型兼容迁移并收紧服务端边界
**Depends on:** Phase 15
**Plans:** 3/3 plans complete

- [x] 16-01: Migrate legacy knowledge entries into minimal skill artifacts (ARTF-04, COMP-03)
- [x] 16-02: Preserve approval, audit, scope, and security behavior across v1/v2 coexistence (COMP-02, COMP-04)
- [x] 16-03: Sunset criteria, verification, and rollout safety for the v1 compatibility window (COMP-03, COMP-04)

**Dependencies:**

```
Phase 12 (Artifact model)
    ↓
Phase 13 (Import/export)
    ↓
Phase 14 (Seed intent retrieval)
    ↓
Phase 15 (Client activation)
    ↓
Phase 16 (Compatibility + hardening)
```

**说明:**
- Phase 12 必须先完成，否则后续导入、检索、激活都没有稳定真源
- Phase 14 明确保留单 seed 输入，不把结构化输入复杂度转嫁给 CLI 用户
- Phase 15 把执行权交给客户端，但不能放松现有治理与审计边界
- Phase 16 负责旧模型迁移和兼容期安全收尾

---
*Roadmap updated: 2026-04-16 after starting v1.2 milestone*
