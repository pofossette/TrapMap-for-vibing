# Skill Shareer

## What This Is

Skill Shareer is a CLI-first internal knowledge sharing system for software teams. Teams can capture "pitfall" knowledge during development, retrieve relevant experience via text search, and maintain trustworthiness through admin review workflows. Built as a TypeScript monorepo with LangChain JS-powered RAG. v1.3 adds skill editing with review workflow, two-layer toggleable logging system, and Docker deployment support.

## Core Value

Teams can retrieve concise, trustworthy, team-relevant engineering knowledge from the terminal before they repeat a solved mistake.

## Requirements

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

### Active

(Ready for next milestone planning via `/gsd-new-milestone`)

### Out of Scope

- End-user web UI for normal usage — CLI is the primary interface so agent integration stays simple and LLM-friendly
- Multimodal retrieval or non-text indexing — v1.x explicitly supports text-only search and text-only knowledge
- Fully automatic knowledge publication without admin approval — trust and curation matter more than throughput
- Cross-company public marketplace for knowledge sharing — current focus is team-internal, not public distribution
- Server-side script execution — security boundary keeps script execution on client with metadata-only governance
- Real-time log streaming — file-based logging with rotation is sufficient for v1.x; streaming adds complexity

## Context

**Current State (v1.3 shipped 2026-04-20):**

- **Tech stack:** TypeScript, pnpm monorepo, Fastify server, LangChain JS, CLI with Commander.js, Docker
- **Lines of code:** ~192,000 TypeScript across CLI, server, and shared contracts
- **Data model:** Skill artifacts with SKILL.md, references/, assets/, scripts/; derived profile, capsules, and client manifest; legacy knowledge entries for compatibility
- **Access control:** Role templates (user/admin) + explicit permissions, security level enforcement on all operations
- **Search quality:** Multi-path retrieval (semantic/hybrid/graph-assisted) with capsule-first v2 responses and metadata-only activation hints
- **Indexing:** Lifecycle-driven pipeline with post-commit sync for approve/update/deactivate events
- **Operational features:** Artifact directory import/export, legacy knowledge migration, audit trail for all mutating operations
- **Logging:** Two-layer toggleable logging (user ops + RAG) with JSON Lines output, size/time-based rotation, independent .env switches
- **Deployment:** Docker configuration with production templates, volume mounts for logs

**v1.3 delivered:**
- Docker configuration and deployment scripts
- CLI skill lookup commands (search-by-content, get-by-id)
- Skill edit flow with revision history and review-based approval
- Two-layer toggleable logging (user ops + RAG) with independent .env switches
- File rotation for both log layers (size-based + time-based)
- Goal-backward verification of all v1.3 requirements
- Docker integration for file-based logging with volume mounts

**User feedback themes:**
- None yet — early development phase

**Known issues:**
- None blocking

## Constraints

- **Architecture**: Monorepo with clear separation between CLI client, server, and shared contracts — shared schemas must stay consistent across components
- **Interface**: Imperative CLI commands with predictable stdout and optional JSON mode — this keeps the system bash-friendly and agent-friendly
- **Skill Standard**: Project skills must follow Claude Code / Anthropic skill conventions (`SKILL.md`, frontmatter, directory-scoped assets) — agents must be able to load and reason over them without custom parsing
- **Search Modality**: Text-only retrieval in v1.x — no images, attachments, or multimodal embeddings in current scope
- **Delivery**: Fast prototype bias using LangChain JS on the server — optimize for end-to-end usability before deep platform polish
- **Security**: Access control must combine role templates with explicit permissions — admin/user defaults alone are not precise enough for team operations

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
*Last updated: 2026-04-20 after v1.3 milestone completion*
