# Skill Shareer

## What This Is

Skill Shareer is a CLI-first internal knowledge sharing system for software teams. Teams can capture "pitfall" knowledge during development, retrieve relevant experience via text search, and maintain trustworthiness through admin review workflows. The system includes a TypeScript-native evaluation stack for measuring retrieval quality, detecting regressions, and gating changes with repeatable benchmarks. v1.6 adds comprehensive test coverage (2151+ tests), query performance optimization, TypeScript strict mode, and complete documentation.

## Core Value

Teams can retrieve concise, trustworthy, team-relevant engineering knowledge from the terminal before they repeat a solved mistake.

## Current Milestone: Planning Next

**Goal:** v1.7 shipped — ready for next milestone planning

**v1.7 shipped 2026-05-05:** 7 phases, 19 plans, 2593 tests passing, Nyquist-compliant validation

## Requirements

### Active

(None — await next milestone planning)

### Validated

- ✓ CLI-first retrieval and submission flows that are shell-friendly for both humans and agents — v1.0
- ✓ Team-aware knowledge lifecycle with admin review, rejected-item feedback, and resubmission — v1.0
- ✓ Text-only RAG with global constraints, project-scoped knowledge, and batch import/export — v1.0
- ✓ Multi-path retrieval with orchestrator, hybrid recall (vector + keyword), and reranking — v1.1
- ✓ Lifecycle-driven indexing pipeline tied to approval/update/deactivate events — v1.1
- ✓ Enhanced citations with source tracking, snippets, tags, and recall channel attribution — v1.1
- ✓ Query mode support (semantic / hybrid / graph-assisted) for extensible retrieval strategies — v1.1
- ✓ Skill-native artifact storage as canonical representation for imported knowledge bundles — v1.2
- ✓ Single-seed retrieval API with internal intent resolution and distilled capsule-oriented results — v1.2
- ✓ Metadata-only activation flow for references, assets, and scripts with policy-aware execution — v1.2
- ✓ Legacy knowledge migration path preserving all approval, RBAC, audit, and scope boundaries — v1.2
- ✓ Skill editing with CLI lookup commands (search-by-content, get-by-id, edit) and review-based approval flow — v1.3
- ✓ Two-layer toggleable logging system (user operations + RAG) with independent .env switches and file rotation — v1.3
- ✓ Docker deployment configuration with volume mounts for persistent logging — v1.3
- ✓ Retrieval evaluation system with golden datasets and deterministic ranking metrics (REVAL-01 through REVAL-04) — v1.4
- ✓ Governance-safe evaluation measuring permission filters and leakage checks alongside relevance — v1.4
- ✓ Summary/refinement evaluation with groundedness-style judge checks over retrieved context (SEVAL-01, SEVAL-02) — v1.4
- ✓ CI-friendly evaluation with baseline comparison and regression detection (EOPS-01, EOPS-02, EOPS-03) — v1.4
- ✓ Knowledge lifecycle states with automatic transitions and decay application logic (DECAY-01, DECAY-04) — v1.5
- ✓ Time-based decay multiplier in retrieval ranking with configurable curves (DECAY-02) — v1.5
- ✓ Batch management interface for outdated/erroneous knowledge (DECAY-03) — v1.5
- ✓ Unified boundary schema with 6-layer structure (BOUND-01) — v1.5
- ✓ Boundary capture in submission flow with agent extraction (BOUND-02) — v1.5
- ✓ Boundary indexing as facets and graph nodes (BOUND-03) — v1.5
- ✓ Boundary-aware retrieval with filtering, boosting, and explanations (BOUND-04, BOUND-05) — v1.5
- ✓ Conflict detection and display for entries with different solutions (CONFLICT-01, CONFLICT-02) — v1.5
- ✓ CLI feedback entry points and skill-mounted feedback (FEEDBACK-01) — v1.5
- ✓ Admin feedback batch management with lifecycle triggers (FEEDBACK-02, FEEDBACK-03) — v1.5
- ✓ Evidence metadata with provenance and verification surface (EVIDENCE-01, EVIDENCE-02) — v1.5
- ✓ Ownership and review-due metadata for maintenance (MAINT-01, MAINT-02) — v1.5
- ✓ Type consolidation and centralized lifecycle state machine (TECH-DEBT-01, TECH-DEBT-02) — v1.5
- ✓ Row-level PostgreSQL tables replacing JSONB snapshot (WRITE-01, WRITE-02, WRITE-03) — v1.5
- ✓ All 6 failing test files fixed, 1725+ tests passing with CI baseline restored (TEST-01) — v1.6
- ✓ Governance and auth route tests covering RBAC, eligibility, and security-critical paths (TEST-02) — v1.6
- ✓ Retrieval orchestrator, semantic, merge, and indexing pipeline tests (TEST-03) — v1.6
- ✓ CLI commands and contracts schema validation tests (TEST-04) — v1.6
- ✓ Vitest coverage tooling integrated with CI thresholds (TEST-05) — v1.6
- ✓ Retrieval query speed optimization with batch embedding and reranking improvements (PERF-01) — v1.6
- ✓ Database query optimization with HNSW vector index and GIN keyword index (PERF-02) — v1.6
- ✓ Memory usage optimization with batch processing during indexing (PERF-03) — v1.6
- ✓ Dead code removal across codebase (QUAL-01) — v1.6
- ✓ TypeScript strict mode compliance with no 'any' types (QUAL-02) — v1.6
- ✓ API endpoint documentation with request/response schemas (DOC-01) — v1.6
- ✓ User-facing README and getting started guide (DOC-02) — v1.6
- ✓ Architecture documentation with module relationships (DOC-03) — v1.6
- ✓ Graph-plan structural evaluation with node/edge/focus assertions (GPEVAL-01, GPEVAL-02, GPEVAL-03) — v1.7
- ✓ Operations route decomposition (1680→27 lines, 9 focused modules) — v1.7
- ✓ Orchestrator decomposition (1196→461+128+386+69 lines) — v1.7
- ✓ Store decoupling with 5 repository interfaces — v1.7
- ✓ CLI operations refactoring (1060→39 lines, 8 command modules) — v1.7
- ✓ Tech debt cleanup (574 MB freed, 18 unused types unexported) — v1.7

### Out of Scope

- End-user web UI for normal usage — CLI is the primary interface so agent integration stays simple and LLM-friendly
- Multimodal retrieval or non-text indexing — v1.x explicitly supports text-only search and text-only knowledge
- Fully automatic knowledge publication without admin approval — trust and curation matter more than throughput
- Cross-company public marketplace for knowledge sharing — current focus is team-internal, not public distribution
- Server-side script execution — security boundary keeps script execution on client with metadata-only governance
- Real-time log streaming — file-based logging with rotation is sufficient for v1.x; streaming adds complexity
- Full conversational QA-answer benchmarking for arbitrary generation endpoints — v1.4 prioritizes retrieval and summary evaluation on the existing API surface first
- Python-first evaluation infrastructure as the primary path — the current milestone stays TypeScript-native to fit the existing monorepo and CI flow
- Implicit feedback collection (clicks/views) — Privacy considerations, prefer explicit signals first
- Learning-to-rank optimization — Requires significant feedback volume; defer until feedback loop is mature
- Automatic knowledge generation — Out of scope for lifecycle management focus
- Multi-language knowledge support — Not a priority for current user base

## Context

**Current State (v1.7 shipped 2026-05-05):**

v1.7 Eval Structural Coverage & Architecture Health shipped with 7 phases, 19 plans, and 2593 tests passing. All phases Nyquist-compliant with test coverage verified. Major accomplishments include graph-plan structural evaluation, operations route decomposition (1680→27 lines), orchestrator decomposition (1196→461+lines), store decoupling with 5 repository interfaces, CLI operations refactoring (1060→39 lines), and tech debt cleanup (574 MB freed).

- **Tech stack:** TypeScript, pnpm monorepo, Fastify server, LangChain JS, CLI with Commander.js, Docker, Drizzle/PostgreSQL, Graphology
- **Data model:** Skill artifacts with SKILL.md, references/, assets/, scripts/; derived profile, capsules, and client manifest; legacy knowledge entries for compatibility; graph documents for GraphRAG-lite
- **Access control:** Role templates (user/admin) + explicit permissions, security level enforcement on all operations, shared governance module
- **Search quality surface:** Multi-path retrieval (semantic/hybrid/graph-assisted/graph-plan) with capsule-first v2 responses, trap-first plan compilation (/v3), metadata-only activation hints, boundary-aware filtering, and decay scoring
- **Evaluation stack:** Retrieval eval with Hit@K, MRR, nDCG, Recall@K + governance assertions; summary eval with groundedness/coverage judge checks; CI smoke/core regression with baseline comparison
- **Persistence:** Row-level PostgreSQL tables (candidates, knowledge_entries, skill_artifacts) with concurrent write support; JSONB shadow writes removed
- **Lifecycle management:** Decay state machine with 5 states, time-based decay curves, batch management CLI, supersede feature
- **Applicability:** 6-layer boundary schema (context, versions, prerequisites, signals, exclusions, evidence) integrated across submission, indexing, and retrieval
- **Feedback loop:** CLI feedback entry points, admin batch management, automatic lifecycle triggers from feedback patterns
- **Operational features:** Artifact directory import/export, legacy knowledge migration, audit trail for all mutating operations, async candidate ingestion with duplicate detection
- **Logging:** Two-layer toggleable logging (user ops + RAG) with JSON Lines output, size/time-based rotation, independent .env switches
- **Deployment:** Docker configuration with production templates and persistent log volumes

**Known issues / Tech debt:**

- PERF-01/PERF-02: Batch embedding and HNSW index optimizations created but not fully wired into production pipeline
- PostgreSQL repository implementations deferred (InMemory-only for now)
- Dual-write pattern between repository and store not fully migrated
- orchestrator.ts at 461 lines exceeds 300-line target (accepted deviation)

## Constraints

- **Architecture**: Monorepo with clear separation between CLI client, server, and shared contracts — shared schemas must stay consistent across components
- **Interface**: Imperative CLI commands with predictable stdout and optional JSON mode — this keeps the system bash-friendly and agent-friendly
- **Skill Standard**: Project skills must follow Claude Code / Anthropic skill conventions (`SKILL.md`, frontmatter, directory-scoped assets) — agents must be able to load and reason over them without custom parsing
- **Search Modality**: Text-only retrieval in v1.x — no images, attachments, or multimodal embeddings in current scope
- **Delivery**: Fast prototype bias using LangChain JS on the server — optimize for end-to-end usability before deep platform polish
- **Security**: Access control must combine role templates with explicit permissions — admin/user defaults alone are not precise enough for team operations
- **Evaluation Stack**: Primary evaluation flow should stay in TypeScript/Node — this matches the existing monorepo, toolchain, and CI ergonomics
- **Metrics**: Retrieval metrics must separate ranking quality from governance correctness — a high recall score cannot hide permission leakage

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| TypeScript-first monorepo with shared contracts | LangChain JS, CLI ergonomics, and shared runtime validation all fit a single TS stack well | ✓ Good — 100+ contract imports wired across packages |
| CLI is the default user surface | The product is meant to work from bash and agent runtimes, not only from a GUI | ✓ Good — all workflows work from terminal with JSON mode |
| Skill-native artifacts with file-kind discrimination | v1.2 needed richer structure than flat knowledge entries; Claude skill compatibility is a constraint | ✓ Good — artifact contracts support SKILL.md, references/, assets/, scripts/ |
| Review is mandatory before publication | Team knowledge is only valuable if it stays trustworthy and deduplicated | ✓ Good — agent pre-review + human approval gating working |
| Retrieval stays text-only in v1.x | Limits complexity and keeps the initial releases focused on useful search quality | ✓ Good — embeddings pipeline with deterministic fallback operational |
| Skills must remain Claude-compatible | Anthropic skill compatibility is a stated product constraint, not a future nice-to-have | ✓ Good — skill scaffolding follows SKILL.md conventions |
| Security level (0-10) on users and knowledge entries | Role templates alone too coarse-grained; level comparison simple to reason about | ✓ Good — RBAC enforcement across all API routes verified |
| Audit trail for all mutating operations | Teams need traceability for knowledge changes, especially for compliance debugging | ✓ Good — review/import/export/deactivate all logged, queryable via CLI |
| Client sends one seed, server parses intent internally | Keeps CLI ergonomics simple while preserving richer retrieval semantics | ✓ Good — v2 retrieval uses seed-only contract with server-side intent parsing |
| Assets and scripts stay client-side at execution time | Server should govern metadata and policy, not execute untrusted skill payloads | ✓ Good — four-state policy model with stricter-only client resolution |
| Skill edits reuse existing RBAC and review patterns | Avoids new permission model complexity; consistent with knowledge review flow | ✓ Good — edit review workflow mirrors knowledge review patterns |
| User ops logger defaults disabled, fire-and-forget | Production-friendly defaults; no performance impact unless explicitly enabled | ✓ Good — JSON Lines with daily rotation when enabled |
| RAG logger follows user ops pattern | Consistent design between both log layers; independent toggles | ✓ Good — size-based rotation integrated for both layers |
| v1.4 evaluation stays TypeScript-native | The repository already has a strong TS/Node spine, so the primary path should integrate there before adding Python-side evaluators | ✓ Good — eval runner, metrics, governance all in TS; Python evaluators deferred to v2 |
| Retrieval evaluation must score governance separately from relevance | Search quality numbers are misleading if forbidden or cross-scope results can still pass | ✓ Good — governance assertions run independently from ranking metrics |
| Shared governance module across skill and trap (Phase 32) | Avoids duplicated eligibility logic when trap CLI/server routes were split from skill | ✓ Good — single governance module used across both skill and trap boundaries |
| Async candidate ingestion with post-upload duplicate detection (Phase 33) | Keeps submission latency low; duplicate analysis is too expensive for inline request path | ✓ Good — async processor with retry and startup recovery working |
| Trap-first plan compilation for GraphRAG-lite (Phase 37) | Flat match lists don't capture trap-skill mitigation relationships; plans encode priorities | ✓ Good — /v3/retrieval/plan produces governed trap-first plans |
| Database-backed persistence via shared SkillShareerStore (Phase 43) | File-backed store doesn't scale for production; shared contract avoids route-by-route rewrite | ✓ Good — PostgresStore + JsonStore both satisfy shared interface, runtime selection via env |
| Pure state machine for decay transitions (Phase 48) | Deterministic testing with injected timestamp; no hidden state dependencies | ✓ Good — computeDecayState pure function with 44 tests |
| Row-level PostgreSQL tables for write scalability (Phases 61-63) | JSONB snapshot created 3-4x transact amplification; row-level enables concurrent writes | ✓ Good — candidates, knowledge_entries, skill_artifacts tables operational |
| Unified boundary schema shared across trap and skill (Phase 51) | Avoids type divergence; single Boundary type for both artifact types | ✓ Good — 6-layer schema with Zod validation and 43 tests |
| Boundary as nullable field for backward compatibility (Phase 51) | Existing fixtures work without migration; gradual adoption path | ✓ Good — null-safe defaults throughout codebase |
| Freshness decay as multiplicative penalty after stale penalty (Phase 49) | Separates lifecycle state from age-based relevance; composable scoring | ✓ Good — decay curves (exponential, linear, step) configurable |
| Feedback-driven lifecycle triggers (Phase 65) | Recurring feedback patterns can automatically transition state | ✓ Good — checkLifecycleTriggers wired into feedback batch execution |
| Feature flag for DB-level search rollout (Phase 72) | Gradual rollout of HNSW/GIN search with in-memory fallback | ⚠ Revisit — flag exists but ensureVectorIndex() not wired at startup |
| Batch embedding optimization (Phase 72) | Reduce per-query embedding overhead from O(n) async to O(miss) sync | ⚠ Revisit — functions created but orphaned, not used by orchestrator |
| Repository pattern with store fallback (Phase 83) | Backward compatibility during transition to PostgreSQL repositories | ✓ Good — 5 interfaces, InMemory implementations, routes use fallback |
| Type guards over duck-typing (Phase 83 fix) | Robust runtime discrimination between repository and store | ✓ Good — isSessionStore(), isStoreData() guards |
| Thin router for route decomposition (Phases 80, 85) | Minimal indirection, clear delegation to sub-modules | ✓ Good — 27-line and 39-line thin routers |
| Orchestrator decomposition with facade (Phase 81) | Preserve backward compatibility while splitting god file | ✓ Good — retrieval.ts facade unchanged, 61% reduction |
| Knip for dead code detection (Phase 74) | Static analysis for unused exports/types | ✓ Good — identified 6 unused files for removal |
| TypeScript strict mode with noUncheckedIndexedAccess (Phase 75) | Maximum type safety across codebase | ✓ Good — builds clean, all type errors resolved |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-05 after v1.7 Eval Structural Coverage & Architecture Health milestone*
