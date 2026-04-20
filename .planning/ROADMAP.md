# Roadmap: Skill Shareer

## Milestones

- ✅ **v1.0 MVP** — Phases 1-5 (shipped 2026-04-14)
- ✅ **v1.1 RAG Structure Enhancement** — Phases 6-11 (shipped 2026-04-16)
- ✅ **v1.2 Skill-Native Retrieval** — Phases 12-16 (shipped 2026-04-17)
- ✅ **v1.3 工程化调整&功能扩展及优化** — Phases 17-24 (shipped 2026-04-20)

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

<details>
<summary>✅ v1.2 Skill-Native Retrieval (Phases 12-16) — SHIPPED 2026-04-17</summary>

**Full archive:** [milestones/v1.2-ROADMAP.md](./milestones/v1.2-ROADMAP.md)

- [x] Phase 12: Skill Artifact Canonical Model (3/3 plans) — completed 2026-04-16
- [x] Phase 13: Skill Import/Export Pipeline (3/3 plans) — completed 2026-04-16
- [x] Phase 14: Seed Intent Retrieval and Capsule Ranking (4/4 plans) — completed 2026-04-16
- [x] Phase 15: Client Activation for References, Assets, and Scripts (3/3 plans) — completed 2026-04-17
- [x] Phase 16: Compatibility Migration and Boundary Hardening (3/3 plans) — completed 2026-04-17

**Delivered:**
- Skill-native artifact contracts with file-kind discrimination and derived outputs
- Directory import/export with canonical bundle-json transport
- Seed-only v2 retrieval with server-internal parsed-intent parsing
- Metadata-only activation hints for references, assets, and scripts
- Four-state script activation policy with client-side stricter-only resolution
- Legacy knowledge migration with preserved governance boundaries

</details>

<details>
<summary>✅ v1.3 工程化调整&功能扩展及优化 (Phases 17-24) — SHIPPED 2026-04-20</summary>

**Full archive:** [milestones/v1.3-ROADMAP.md](./milestones/v1.3-ROADMAP.md)

- [x] Phase 17: Deployment Scripts (1/1 plans) — completed 2026-04-19
- [x] Phase 18: CLI Skill Lookup Commands (2/2 plans) — completed 2026-04-19
- [x] Phase 19: Skill Edit Flow with History (3/3 plans) — completed 2026-04-19
- [x] Phase 20: Skill Edit Review Workflow (2/2 plans) — completed 2026-04-19
- [x] Phase 21: User Operations Logger (2/2 plans) — completed 2026-04-19
- [x] Phase 22: RAG Logger with File Rotation (2/2 plans) — completed 2026-04-19
- [x] Phase 23: v1.3 Milestone Verification (3/3 plans) — completed 2026-04-20
- [x] Phase 24: Docker Logging Configuration (1/1 plans) — completed 2026-04-20

**Delivered:**
- Docker deployment configuration with production templates
- CLI skill lookup commands (search-by-content, get-by-id)
- Skill edit flow with revision history and review-based approval
- Two-layer toggleable logging (user ops + RAG) with independent .env switches
- File rotation for both log layers (size-based + time-based)
- Goal-backward verification of all v1.3 requirements
- Docker integration for file-based logging with volume mounts

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
| 12. Skill Artifact Canonical Model | v1.2 | 3/3 | Complete | 2026-04-16 |
| 13. Skill Import/Export Pipeline | v1.2 | 3/3 | Complete | 2026-04-16 |
| 14. Seed Intent Retrieval and Capsule Ranking | v1.2 | 4/4 | Complete | 2026-04-16 |
| 15. Client Activation for References, Assets, and Scripts | v1.2 | 3/3 | Complete | 2026-04-17 |
| 16. Compatibility Migration and Boundary Hardening | v1.2 | 3/3 | Complete | 2026-04-17 |
| 17. Deployment Scripts | v1.3 | 1/1 | Complete | 2026-04-19 |
| 18. CLI Skill Lookup Commands | v1.3 | 2/2 | Complete | 2026-04-19 |
| 19. Skill Edit Flow with History | v1.3 | 3/3 | Complete | 2026-04-19 |
| 20. Skill Edit Review Workflow | v1.3 | 2/2 | Complete | 2026-04-19 |
| 21. User Operations Logger | v1.3 | 2/2 | Complete | 2026-04-19 |
| 22. RAG Logger with File Rotation | v1.3 | 2/2 | Complete | 2026-04-19 |
| 23. v1.3 Milestone Verification | v1.3 | 3/3 | Complete | 2026-04-20 |
| 24. Docker Logging Configuration | v1.3 | 1/1 | Complete | 2026-04-20 |

---
*Roadmap updated: 2026-04-20 after v1.3 milestone completion*
