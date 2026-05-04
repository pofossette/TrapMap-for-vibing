# Milestones

## v1.6 Test Coverage & Optimization (Shipped: 2026-05-04)

**Phases completed:** 9 phases, 20 plans, 16 tasks

**Key accomplishments:**

- Restored CI baseline: all 1725 tests pass with 0 failures after fixing lifecycle state machine mismatches and missing KnowledgeRecord fields
- 58 pure unit tests covering all 9 governance exported functions: RBAC permission checks (allow/deny/throw), security level enforcement, decay state filtering, team boundary, system-admin bypass, and AND-semantics filter composition
- 18 unit tests for detectDuplicates covering trap/skill match detection, exact fingerprint, lifecycle filtering, sorting, top-10 limiting, and boundary thresholds via public API
- Fastify integration tests for auth routes (12 cases) and access-keys route (5 cases) using buildServer() + app.inject() with Bearer token auth
- Added 127 new tests for retrieval orchestrator, merge strategy, semantic recall, artifact pipeline, and postgres store.
- Added 154 new tests for CLI HTTP client, knowledge commands, team commands, and contracts schemas. Integrated Vitest coverage tooling with CI reporting.
- Auto-fixed Issues:
- Added 82 Zod schema validation tests for knowledge and retrieval contracts, plus Vitest coverage tooling with CI integration
- Added retrieval performance optimizations including benchmarking, batch embedding lookup, reranking optimization, and database-level vector/keyword search with HNSW and GIN indexes.
- Added batch embedding retrieval with cache hit rate tracking to reduce per-query overhead from O(n) async calls to O(n) sync checks + O(miss_count) computations
- Optimized rerankCandidates() with hoisted Date creation, freshness multiplier caching, early termination threshold, and zero-delta skip for boundary explanations.
- Added database-level vector similarity search using pgvector's cosine distance operator with HNSW index for O(log n) search performance.
- Added GIN index for O(log n) JSONB token containment queries and comprehensive test suite for database-level keyword search
- Implemented batch processing and memory logging in the indexing pipeline to reduce memory footprint.
- Removed 6 unused files totaling ~450 lines of dead code.
- Fixed 5 type errors to achieve clean typecheck with strict mode.
- Updated version numbers and marked v1.6 complete in documentation.

---

## v1.5 功能增强 (Shipped: 2026-05-03)

**Phases completed:** 24 phases, 58 plans, 180 tasks

**Key accomplishments:**

- Decay domain contracts with Zod schemas, pure state machine for age-based transitions, environment config loader, and store record extensions
- Manual supersede feature enabling admins to explicitly supersede knowledge/trap entries with replacements
- Hard decay (exclusion) in governance eligibility, soft decay (ranking penalty) in retrieval rerank
- Add freshness type schema and decay curve configuration to contracts layer for three knowledge types (evergreen, versioned, volatile).
- Pure functions for computing freshness decay multipliers with exponential, linear, and step decay curves
- Freshness decay multiplier integrated into retrieval rerank pipeline using multiplicative factor applied after stale penalty
- Expose decay multiplier in retrieval citations for freshness transparency, enabling clients to see the exact penalty applied to each result.
- Comprehensive unit and integration tests for freshness decay functions and rerank integration
- Batch mutation contracts and pure functions for lifecycle management with dry-run support
- Server routes for decay management with batch operations and decay-state filtering
- CLI commands for decay management with human-readable output and JSON mode
- Unified boundary schema module with 6 layers, enums, and TypeScript type exports following the decay.ts pattern
- Integrated boundary schema into KnowledgeEntry and SkillArtifact with full backward compatibility
- Boundary constraints integrated into submission-to-review pipeline with CLI input, LLM extraction, and reviewer confirmation
- Boundary fields indexed as graph nodes with typed edges and facet index for retrieval filtering
- BoundaryContext, BoundaryExplanation, boundaryMetaSchema schemas defined and exported; boundary field added to KnowledgeRecord
- Back-reference query functions using pre-indexed boundary facets and graph nodes to find entries matching boundary constraints
- Conflict detection and display system with token-based similarity, governance filtering, and CLI visualization
- Zod schemas for feedback submission, problem type classification, and feedback record storage with status tracking
- Added comprehensive test coverage for feedbackPrompts frontmatter parsing with graceful degradation for malformed input
- 1. [Rule 3 - Blocking] Created feedback contracts inline (Plan 56-01 dependency)
- CLI feedback command with interactive prompts via @inquirer/prompts and non-interactive flag mode for CI/script usage
- CLI commands for admin feedback queue listing and batch processing, following decay.ts command patterns
- Zod schemas for evidence source types, evidence levels, full metadata, and compact hints -- all exported from @trapmap/contracts
- Extended 5 domain schemas to incorporate evidence metadata fields created in 58-01
- Extended server record types with evidenceMeta field and created validation helpers with full test coverage for provenance tracking.
- Extended review flow to persist evidence metadata during approval with default fallback and full test coverage.
- Exposed evidence metadata in retrieval responses as compact hints and added evidence-based filtering to the operations admin endpoint.
- Extended CLI review commands to accept evidence metadata flags and created admin evidence management commands with colored output.
- Maintenance metadata contracts with ownership tracking, review-due scheduling, and batch operation schemas across knowledge entries and skill artifacts
- Server-side maintenance module with validation helpers, batch operation logic, and HTTP route handlers for listing and mutating maintenance metadata on knowledge entries
- CLI maintenance commands (list, assign, verify) with comprehensive test coverage for model helpers, batch operations, and route handlers
- Fixed assign-owner data integrity bug where operator handle was stored instead of assigned maintainer handle, and added MAINT-01/MAINT-02 requirements traceability
- Canonicalized AdapterSyncState and KnowledgeIndexStateRecord in indexing/types.ts, removed duplicate definitions from store.ts
- Centralized lifecycle state machine for knowledge/artifact governance with transition validation and type guards
- Removed dead embedding provider code and unnecessary LangChain wrapping from pre-review.ts
- Migrated all direct lifecycleState assignments to centralized state machine validation across 4 files with 7 mutation sites.
- Established candidates table schema with Drizzle ORM and PgCandidateRepository with row-level SELECT FOR UPDATE locking for concurrent-safe candidate processing
- Wired DualWriteCandidateRepository into candidate processing pipeline, replacing transact() amplification with direct repository calls while maintaining JSONB shadow writes for transition compatibility
- Created migrateCandidates() function for one-time backfill of candidate data from JSONB snapshot to relational candidates table with idempotency, dry-run mode, and error-tolerant processing
- PostgreSQL table schemas for knowledge entries with KnowledgeRepository interface implementing dual-write pattern for JSONB/PostgreSQL transition
- PgKnowledgeRepository with row-level locking for concurrent-safe operations, comprehensive test coverage for all CRUD methods, and index table compatibility verification
- Integrated KnowledgeRepository into routes and processors following Phase 61's conditional repository pattern.
- PostgreSQL schema definitions for skill artifact row-level tables enabling concurrent access without global lock contention
- Repository pattern for skill artifacts with PostgreSQL row-level locking and dual-write transition support
- Migration script for JSONB to PostgreSQL backfill with PostgreSQL-only artifact repository
- 1. [Rule 1 - Bug] decayMultiplier set unconditionally when freshnessConfig present
- LifecycleTriggerRule zod schema with DEFAULT_LIFECYCLE_TRIGGER_RULES constant, broken FeedbackQueueItemRecord renamed to FeedbackQueueRecord, dead executeFeedbackBatch removed
- checkLifecycleTriggers wired into feedback batch execution, 6 undocumented routes registered, E2E tests proving both behaviors
- Added boundary context input and explanation output fields to retrieval schemas, wiring boundary schemas into public API contracts
- Wired boundary explanation through retrieval pipeline from rerank to API response.
- POST /admin/boundary-search endpoint for finding knowledge entries by boundary constraints
- Contract tests and E2E integration tests verify boundary-aware retrieval flow works end-to-end
- Dead code removal and API surface documentation completion for v1.5 milestone

---

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
