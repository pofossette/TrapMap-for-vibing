# Project Research Summary

**Project:** Skill Shareer
**Domain:** Team knowledge sharing CLI + reviewable RAG service
**Researched:** 2026-04-13
**Confidence:** MEDIUM

## Executive Summary

Skill Shareer should be built as a TypeScript-first monorepo with a contract-first CLI and a LangChain JS-powered API server. The product is not a generic wiki and not a pure skill repository; it is a curated operational memory system for development teams, so retrieval quality, review lifecycle, and team-aware permissions matter more than flashy UI.

The strongest architecture is a single server that owns auth, team context, knowledge lifecycle, retrieval, and admin operations, backed by PostgreSQL plus PGVector. `pnpm` workspaces, shared Zod contracts, Fastify, and Drizzle keep the TS monorepo coherent without fighting vector storage requirements. The highest-risk areas are tenancy leakage, shallow review state, and a CLI surface that looks usable for humans but is brittle for agents. Those risks directly shape the roadmap order.

## Key Findings

### Recommended Stack

Use Node.js LTS plus TypeScript across server and CLI, `pnpm` workspaces for monorepo management, Fastify for the API, shared Zod contracts, LangChain JS for retrieval/review orchestration, and PostgreSQL plus PGVector for persistent storage and vector search.

**Core technologies:**
- TypeScript: shared implementation language for CLI, server, and contracts
- Fastify: command-friendly HTTP API surface with strong schema support
- Zod: runtime validation and type inference across the monorepo
- LangChain JS: embedding, LLM review, and retrieval orchestration
- Drizzle ORM: TS-native access to PostgreSQL and pgvector-backed tables
- PostgreSQL + PGVector: one durable store for tenancy, audit, and search
- Claude-compatible skills: skill assets that agents can load without custom adapters

### Expected Features

The must-haves are team-aware access, structured submission plus review, text-seed retrieval, admin management, and batch import/export. The strongest differentiators are agent pre-review and Claude-compatible skill packaging. GUI-heavy workflows and multimodal retrieval should stay out of v1.

**Must have (table stakes):**
- Structured knowledge lifecycle with admin review
- Team-scoped CLI retrieval and management
- Bulk operational controls

**Should have (competitive):**
- Agent pre-review with explicit intermediate states
- Global constraints surfaced distinctly from project knowledge
- Shell/agent-friendly JSON output

**Defer (v2+):**
- Web admin UI
- Multimodal indexing
- Cross-team sharing policies

### Architecture Approach

The system should be layered as CLI interface → API routes → domain services → relational/vector persistence. Shared Zod contracts sit in the middle and define every CLI/server exchange. Review must be a state machine, and retrieval must apply team/scope filters before ranking or LLM refinement.

**Major components:**
1. CLI client — imperative user and agent entry point
2. API server — auth, knowledge, review, retrieval, and admin routes
3. Shared contracts — canonical schema layer
4. Review service — agent pre-review plus admin decision workflow
5. Retrieval service — metadata-aware search and optional response refinement

### Critical Pitfalls

1. **Team scope leakage** — solve with mandatory team/scope filters in auth and retrieval
2. **Shallow review states** — solve with explicit lifecycle state and revision linkage
3. **Agent-hostile CLI output** — solve with JSON mode and deterministic exit behavior
4. **Vector migration traps** — solve by treating embeddings as rebuildable artifacts
5. **Skill packaging drift** — solve with Claude-compatible `SKILL.md` conventions from Phase 1

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Monorepo Skeleton and Contracts
**Rationale:** Every later workflow depends on a stable workspace, contracts, and skill conventions.
**Delivers:** repo structure, shared schemas, documented API surface, skill packaging baseline
**Addresses:** CLI/API drift, skill packaging drift
**Avoids:** brittle agent integration

### Phase 2: Identity, Teams, and RBAC
**Rationale:** Every command and query needs safe user/team context before knowledge becomes useful.
**Delivers:** login, team selection, permission model, member onboarding
**Uses:** shared contracts and API foundation
**Implements:** access-control domain layer

### Phase 3: Knowledge Intake and Review
**Rationale:** Retrieval should not ship before there is a trustworthy approved corpus.
**Delivers:** submission schema, pre-review states, admin approval/rejection, resubmission chain
**Uses:** LangChain review services and relational lifecycle state

### Phase 4: Retrieval and CLI Workflow
**Rationale:** Once approved knowledge exists, retrieval quality becomes the core user value.
**Delivers:** text-seed search, global/project scope handling, CLI search flows, JSON output
**Uses:** PGVector-backed search and optional LLM refinement

### Phase 5: Admin Operations and Hardening
**Rationale:** Teams need lifecycle operations once core workflows already work.
**Delivers:** entry management, bulk import/export, audit trail, operational guardrails
**Uses:** stable schemas, review history, and retrieval-ready corpus

### Phase Ordering Rationale

- Foundation before identity keeps contracts and skill layout from drifting.
- Identity before retrieval prevents team leakage and permission rework.
- Review before retrieval ensures the searchable corpus is curated, not raw.
- Operations last keeps v1 centered on useful workflows before admin polish expands.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 3:** Prompt and policy design for agent pre-review
- **Phase 4:** Retrieval tuning, ranking heuristics, and evaluation strategy

Phases with standard patterns (skip research-phase if needed):
- **Phase 1:** Monorepo skeleton and shared-contract setup
- **Phase 2:** Team/member CRUD and RBAC patterns

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM | Official docs confirm the building blocks, but exact package versions should be pinned during implementation |
| Features | HIGH | Largely driven by explicit user requirements |
| Architecture | MEDIUM | Strong fit for the stated product, with some implementation choices deferred |
| Pitfalls | MEDIUM | Based on standard failure modes for CLI + retrieval + review systems |

**Overall confidence:** MEDIUM

### Gaps to Address

- Pre-review prompts and evaluation thresholds need concrete design during Phase 3 planning
- Embedding provider and chat model provider selection should stay configurable until implementation
- Decide whether admin flows remain CLI-only after the first milestone

## Sources

### Primary (HIGH confidence)
- https://code.claude.com/docs/en/skills — Claude-compatible skill conventions
- https://pnpm.io/ — workspace model for TS monorepos
- https://fastify.dev/docs/latest/Reference/TypeScript/ — Fastify typing model
- https://docs.langchain.com/oss/javascript/langchain/overview — LangChain JS/TS stack
- https://zod.dev/ — TS-first validation layer
- https://orm.drizzle.team/docs/extensions/pg — Drizzle PGVector support

### Secondary (MEDIUM confidence)
- User-provided problem statement and scope notes

---
*Research completed: 2026-04-13*
*Ready for roadmap: yes*
