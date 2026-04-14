# Skill Shareer

## What This Is

Skill Shareer is a CLI-first internal knowledge sharing system for software teams. Teams can capture "pitfall" knowledge during development, retrieve relevant experience via text search, and maintain trustworthiness through admin review workflows. Built as a TypeScript monorepo with LangChain JS-powered RAG.

## Core Value

Teams can retrieve concise, trustworthy, team-relevant engineering knowledge from the terminal before they repeat a solved mistake.

## Requirements

### Validated

- ✓ CLI-first retrieval and submission flows that are shell-friendly for both humans and agents — v1.0
- ✓ Team-aware knowledge lifecycle with admin review, rejected-item feedback, and resubmission — v1.0
- ✓ Text-only RAG with global constraints, project-scoped knowledge, and batch import/export — v1.0

### Active

(None — next milestone to be planned)

### Out of Scope

- End-user web UI for normal usage — CLI is the primary interface so agent integration stays simple and LLM-friendly
- Multimodal retrieval or non-text indexing — v1 explicitly supports text-only search and text-only knowledge
- Fully automatic knowledge publication without admin approval — trust and curation matter more than throughput in the first release
- Cross-company public marketplace for knowledge sharing — the first milestone is team-internal, not public distribution

## Context

**Current State (v1.0 shipped 2026-04-14):**

- **Tech stack:** TypeScript, pnpm monorepo, Fastify server, LangChain JS, CLI with Commander.js
- **Lines of code:** ~13,600 TypeScript across CLI, server, and shared contracts
- **Data model:** Knowledge entries with labels, shortcut, detail, scope (global/project), required security level (0-10)
- **Access control:** Role templates (user/admin) + explicit permissions, security level enforcement on all operations
- **Search quality:** Embeddings-based retrieval with eligibility filtering (team/level/approval state), deterministic fallback, optional LLM refinement
- **Operational features:** Import/export with validation, audit trail for review/import/export/deactivate actions

**User feedback themes:**
- None yet — v1.0 is initial release

**Known issues:**
- 3 minor TypeScript type issues (exactOptionalPropertyTypes incompatibilities, runtime-checked undefined handling) — non-blocking, can address in v1.1

## Constraints

- **Architecture**: Monorepo with clear separation between CLI client, server, and shared contracts — shared schemas must stay consistent across components
- **Interface**: Imperative CLI commands with predictable stdout and optional JSON mode — this keeps the system bash-friendly and agent-friendly
- **Skill Standard**: Project skills must follow Claude Code / Anthropic skill conventions (`SKILL.md`, frontmatter, directory-scoped assets) — agents must be able to load and reason over them without custom parsing
- **Search Modality**: Text-only retrieval in v1 — no images, attachments, or multimodal embeddings in initial scope
- **Delivery**: Fast prototype bias using LangChain JS on the server — optimize for end-to-end usability before deep platform polish
- **Security**: Access control must combine role templates with explicit permissions — admin/user defaults alone are not precise enough for team operations

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| TypeScript-first monorepo with shared contracts | LangChain JS, CLI ergonomics, and shared runtime validation all fit a single TS stack well | ✓ Good — 93 contract imports wired across packages |
| CLI is the default user surface | The product is meant to work from bash and agent runtimes, not only from a GUI | ✓ Good — all workflows work from terminal with JSON mode |
| Knowledge uses `labels + shortcut + detail + scope` as the canonical model | Small, opinionated structure keeps entries retrievable and cheap to review | ✓ Good — retrieval quality confirmed via E2E tests |
| Review is mandatory before publication | Team knowledge is only valuable if it stays trustworthy and deduplicated | ✓ Good — agent pre-review + human approval gating working |
| Retrieval stays text-only in v1 | Limits complexity and keeps the first milestone focused on useful search quality | ✓ Good — embeddings pipeline with deterministic fallback operational |
| Skills must remain Claude-compatible | Anthropic skill compatibility is a stated product constraint, not a future nice-to-have | ✓ Good — skill scaffolding follows SKILL.md conventions |
| Security level (0-10) on users and knowledge entries | Role templates alone too coarse-grained; level comparison simple to reason about | ✓ Good — RBAC enforcement across all 20 API routes verified |
| Audit trail for all mutating operations | Teams need traceability for knowledge changes, especially for compliance debugging | ✓ Good — review/import/export/deactivate all logged, queryable via CLI |

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
*Last updated: 2026-04-14 after v1.0 milestone*
