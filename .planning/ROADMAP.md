# Roadmap: Skill Shareer

## Milestones

- ✅ **v1.0 MVP** — Phases 1-5 (shipped 2026-04-14)
- ✅ **v1.1 RAG Structure Enhancement** — Phases 6-11 (shipped 2026-04-16)
- ✅ **v1.2 Skill-Native Retrieval** — Phases 12-16 (shipped 2026-04-17)
- ✅ **v1.3 工程化调整&功能扩展及优化** — Phases 17-24 (shipped 2026-04-20)
- 🚧 **v1.4 评测系统构建** — Phases 25-29 (planned)

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

### 🚧 v1.4 评测系统构建 (Planned)

**Milestone Goal:** Build a practical, TypeScript-native evaluation system for retrieval and summary quality so maintainers can measure relevance, enforce governance safety, and catch regressions in CI.

#### Phase 25: Evaluation Contracts and Golden Dataset Foundation

**Goal:** Establish the evaluation data model, directory layout, and initial smoke/core golden datasets for current retrieval contracts
**Depends on:** Phase 24
**Requirements:** REVAL-01, REVAL-02
**Success Criteria** (what must be TRUE):
  1. The repo contains a dedicated `evals/` structure with documented datasets and runner entrypoints
  2. Retrieval evaluation cases exist for both legacy v1 and capsule-first v2 endpoints
  3. Golden cases cover at least smoke and core tiers, including positive, empty-result, and forbidden-result scenarios
  4. Dataset schema is strict enough to support repeatable scoring and future extension
**Plans:** 2/2 plans complete

Plans:
- [x] 25-01: Define evaluation case schemas, fixture conventions, and `evals/` workspace layout
- [x] 25-02: Author the first milestone-owned smoke/core retrieval datasets with representative cases

#### Phase 26: Retrieval Metrics Runner and Governance Checks

**Goal:** Build a retrieval evaluation runner that scores ranking quality and governance correctness across endpoint and retrieval mode combinations
**Depends on:** Phase 25
**Requirements:** REVAL-01, REVAL-03, REVAL-04
**Success Criteria** (what must be TRUE):
  1. Maintainers can run retrieval evaluation from pnpm scripts without ad-hoc manual setup
  2. Reports include Hit@K, MRR, nDCG, and Recall@K for each evaluated slice
  3. Governance failures such as forbidden hits, scope mismatches, or unexpected empty/non-empty results fail clearly
  4. Output is available in both machine-readable and human-readable forms
**Plans:** 2 plans expected

Plans:
- [ ] 26-01: Implement shared metric calculators, case execution pipeline, and endpoint adapters
- [ ] 26-02: Add governance assertions, per-slice reporting, and regression-friendly output serialization

#### Phase 27: Summary Evaluation and Judge Integration

**Goal:** Add summary/refinement evaluation that checks groundedness, coverage, and citation adherence against retrieved context
**Depends on:** Phase 26
**Requirements:** SEVAL-01, SEVAL-02
**Success Criteria** (what must be TRUE):
  1. A summary evaluation command can score retrieval summaries against milestone-owned cases
  2. Cases define required facts and forbidden claims for judge-driven checks
  3. Summary scoring can distinguish unsupported claims from grounded summaries tied to returned context
  4. Evaluation config fits the existing Node/TypeScript workflow
**Plans:** 2 plans expected

Plans:
- [ ] 27-01: Define summary evaluation fixtures, judge prompts/config, and execution contract
- [ ] 27-02: Implement summary evaluation command and reports with groundedness-oriented scoring

#### Phase 28: CI Integration and Evaluation Reporting

**Goal:** Make the evaluation system operational in normal development and CI flows
**Depends on:** Phase 27
**Requirements:** EOPS-01, EOPS-02
**Success Criteria** (what must be TRUE):
  1. Repo scripts provide a fast smoke path for PRs and a broader core path for scheduled regression runs
  2. Evaluation reports clearly compare retrieval modes and endpoint slices
  3. Documentation explains how to add cases and interpret failures
  4. CI integration does not require a separate Python-first environment
**Plans:** 2 plans expected

Plans:
- [ ] 28-01: Wire pnpm scripts, docs, and report summaries for maintainer workflows
- [ ] 28-02: Integrate smoke/core evaluation paths into CI-ready automation

#### Phase 29: Baseline Calibration and Milestone Verification

**Goal:** Establish baseline expectations and verify that v1.4 requirements are complete and actionable for future regressions
**Depends on:** Phase 28
**Requirements:** REVAL-04, EOPS-03
**Success Criteria** (what must be TRUE):
  1. The project records initial baseline results for the first supported eval slices
  2. Failure policy distinguishes hard governance failures from softer regression thresholds
  3. Requirements traceability is updated with verified milestone outcomes
  4. Milestone verification confirms the evaluation system is usable for future retrieval changes
**Plans:** 2 plans expected

Plans:
- [ ] 29-01: Capture and document baseline outputs plus threshold/failure policy
- [ ] 29-02: Verify v1.4 requirements, close gaps, and archive milestone evidence

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
| 25. Evaluation Contracts and Golden Dataset Foundation | v1.4 | 2/2 | Complete   | 2026-04-21 |
| 26. Retrieval Metrics Runner and Governance Checks | v1.4 | 0/2 | Planned | — |
| 27. Summary Evaluation and Judge Integration | v1.4 | 0/2 | Planned | — |
| 28. CI Integration and Evaluation Reporting | v1.4 | 0/2 | Planned | — |
| 29. Baseline Calibration and Milestone Verification | v1.4 | 0/2 | Planned | — |

## Dependencies

**Completed:** All v1.0, v1.1, v1.2, and v1.3 milestone dependencies satisfied

**v1.4:**
```text
Phase 24 (v1.3 complete) ✅
    │
    ↓
Phase 25 (Eval contracts + golden datasets)
    │
    ↓
Phase 26 (Retrieval metrics + governance checks)
    │
    ↓
Phase 27 (Summary evaluation + judge integration)
    │
    ↓
Phase 28 (CI integration + reporting)
    │
    ↓
Phase 29 (Baseline calibration + milestone verification)
```

**Notes:**
- Phase 25 must land before metric execution because the dataset contract defines what the runner can score
- Phase 26 must precede Phase 27 because summary evaluation depends on a stable retrieval-eval substrate and fixtures
- Phase 28 should not start before evaluation commands and reports are stable enough to wire into CI
- Phase 29 closes the milestone by converting raw eval output into baseline policy and verified traceability

---
*Roadmap updated: 2026-04-21 for v1.4 milestone start*
