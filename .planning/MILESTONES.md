# Milestones

## v1.4 评测系统构建 (Shipped: 2026-04-29)

**Phases completed:** 19 phases, 59 plans, 122 tasks

**Key accomplishments:**

- Retrieval evaluation system with ranking metrics (Hit@K, MRR, nDCG, Recall@K) and governance failure detection against golden datasets
- Summary evaluation with LLM-as-judge groundedness and coverage scoring over retrieval context
- GraphRAG-lite indexing, trap-first plan compilation, and confidence-aware routing with /v3 retrieval endpoints
- Async candidate ingestion, duplicate detection queue, and manual resolution CLI workflow for skill/trap deduplication
- Database-backed persistence (PostgreSQL/Drizzle) replacing file-backed store with shared SkillShareerStore contract
- CI regression detection with baseline comparison, cohort reports, and GitHub Actions smoke/core evaluation workflows

---

## v1.3 工程化调整&功能扩展及优化 (Shipped: 2026-04-20)

**Phases completed:** 8 phases, 16 plans, 33 tasks

**Key accomplishments:**

- Docker configuration and deployment scripts for server setup
- Additive artifact-first skill lookup schemas in retrieval domain for CLI skill search-by-content command
- Implemented governed artifact lookup endpoint and CLI skill namespace for artifact-first search-by-content functionality
- User operations logger with JSON Lines file output, env-driven enable/disable toggle, and fire-and-forget design integrated into ServerConfig
- All 15 user-facing route handlers instrumented with fire-and-forget logUserOperation calls, logging search/submit/edit/review/import/export actions with actor metadata
- RAG-specific logging module following Phase 21 user-ops-log pattern, with env-driven enable/disable, JSON Lines output, and ServerConfig integration
- Implement size-based file rotation for both user ops and RAG loggers, and integrate RAG logging into the retrieval orchestrator for pipeline timing capture.
- Goal-backward verification of SKED-01 through SKED-04 across Phases 18-20, all requirements PASSED, CLI test gap fixed
- Goal-backward verification of LOG-01 through LOG-04 requirements confirmed across Phases 17/21/22; contracts build verified working with inherited declaration:true
- Created Nyquist-compliant VALIDATION.md for all 6 v1.3 phases, verified test suite results, and marked all 8 requirements complete in REQUIREMENTS.md

---

## v1.3 工程化调整&功能扩展及优化 (Shipped: 2026-04-20)

**Phases completed:** 8 phases, 16 plans, 33 tasks

**Key accomplishments:**

- Docker configuration and deployment scripts for server setup
- Additive artifact-first skill lookup schemas in retrieval domain for CLI skill search-by-content command
- Implemented governed artifact lookup endpoint and CLI skill namespace for artifact-first search-by-content functionality
- User operations logger with JSON Lines file output, env-driven enable/disable toggle, and fire-and-forget design integrated into ServerConfig
- All 15 user-facing route handlers instrumented with fire-and-forget logUserOperation calls, logging search/submit/edit/review/import/export actions with actor metadata
- RAG-specific logging module following Phase 21 user-ops-log pattern, with env-driven enable/disable, JSON Lines output, and ServerConfig integration
- Implement size-based file rotation for both user ops and RAG loggers, and integrate RAG logging into the retrieval orchestrator for pipeline timing capture.
- Goal-backward verification of SKED-01 through SKED-04 across Phases 18-20, all requirements PASSED, CLI test gap fixed
- Goal-backward verification of LOG-01 through LOG-04 requirements confirmed across Phases 17/21/22; contracts build verified working with inherited declaration:true
- Created Nyquist-compliant VALIDATION.md for all 6 v1.3 phases, verified test suite results, and marked all 8 requirements complete in REQUIREMENTS.md

---

## v1.0 milestone (Shipped: 2026-04-17)

**Phases completed:** 1 phases, 1 plans, 0 tasks

**Key accomplishments:**

- Verification Criteria:

---

## v1.2 Skill-Native Retrieval (Shipped: 2026-04-17)

**Phases completed:** 5 phases, 16 plans, 31 tasks

**Key accomplishments:**

- Defined additive shared contracts for skill-native artifacts with file-kind discrimination (skill-markdown, reference, asset, script)
- Implemented artifact-native directory import with canonical bundle-json transport and path validation security
- Created seed-only v2 retrieval schemas with server-internal parsed-intent parsing for capsule-native retrieval
- Implemented retrieval-grade derivation and capsule ranking with governance enforcement for artifact-native retrieval
- Extended v2 retrieval with metadata-only activation hints for read-next references, available assets, and executable scripts
- Defined four-state script activation policy model with server-side pure policy helpers and client-side stricter-only resolution
- Implemented deterministic legacy knowledge to minimal artifact migration while preserving all governance boundaries
- Verified v1/v2 governance equivalence and metadata-only boundaries during migration coexistence window

---

## v1.0 MVP (Shipped: 2026-04-14)

**Phases completed:** 5 phases, 17 plans, 50 tasks

**Key accomplishments:**

- Bootstrapped the TypeScript monorepo and root tooling layer for the CLI, server, and contracts packages.
- Defined the v1 shared schema surface for auth, teams, knowledge, review, retrieval, and operations.
- Documented the v1 API surface and added bootstrap implementations plus project skill scaffolding.
- Implemented the server-side authentication, session persistence, and active-team foundation.
- Implemented team creation, member onboarding and updates, access-key issuance, and reusable RBAC enforcement.
- Turned the CLI bootstrap into a working authenticated client with permission-aware command visibility.
- Lifecycle-aware knowledge storage now preserves submission history, reviewer decisions, and timeline events on each entry.
- Engineers can submit knowledge from the terminal and inspect their own entry history, status, and reviewer feedback through the same CLI.
- Every submission now passes through a LangChain-backed pre-review that records duplicate, correctness, and completeness risk before human review.
- Higher-level reviewers can reject or approve entries with notes, and submitters can correct and resubmit the same knowledge object with history intact.
- Embeddings-backed retrieval pipeline with eligibility filtering, deterministic fallback, and Fastify route integration.
- Bucket-shaped retrieval response with best-effort refinement, returning null without provider configuration to maintain local/CI compatibility.
- CLI search command with shell-friendly input options, permission-aware visibility, and formatted text/JSON output modes.
- End-to-end workflow tests proving submission-to-search approval gating, resubmit lifecycle linkage, and JSON mode consistency across CLI retrieval commands.
- Admin knowledge management with list, edit, and deactivate capabilities gated by permissions and security levels
- Implemented bulk import/export endpoints with validation, duplicate detection, and security level enforcement
- Comprehensive audit trail for review, import, export, and deactivation actions with CLI query capability

---
