# Roadmap: Skill Shareer

## Milestones

- ✅ **v1.0 MVP** — Phases 1-5 (shipped 2026-04-14)
- ✅ **v1.1 RAG Structure Enhancement** — Phases 6-11 (shipped 2026-04-16)

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

TBD — Use `/gsd-new-milestone` to start v1.2

```
Phase 6 (架构重构)
    ↓
Phase 7 (混合检索)
    ↓
Phase 8 (索引生命周期) ─────┐
    ↓                        │
Phase 9 (图辅助检索)         │
    ↓                        │
Phase 10 (回答与引用) ◄──────┘
    ↓
Phase 11 (索引生命周期集成) ← gap closure for Phase 08
```

**说明:**
- Phase 6 必须首先完成，为后续阶段提供架构基础
- Phase 7 依赖 Phase 6 的 orchestrator
- Phase 8 可与 Phase 9 并行，但 Phase 10 依赖两者完成
- 所有阶段都必须遵守业务边界保护需求

---
*Roadmap updated: 2026-04-16 after v1.1 milestone completion*
