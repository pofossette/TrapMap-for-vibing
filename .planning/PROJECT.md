# Skill Shareer

## What This Is

Skill Shareer is a monorepo-based internal knowledge sharing system for software teams that need a lower-friction way to capture and reuse "pitfall" knowledge during development. It centers on a command-oriented CLI client and a LangChain JS-powered server so agents and humans can both retrieve relevant experience, submit solved problems, and keep curated knowledge trustworthy through admin review.

## Core Value

Teams can retrieve concise, trustworthy, team-relevant engineering knowledge from the terminal before they repeat a solved mistake.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] CLI-first retrieval and submission flows that are shell-friendly for both humans and agents
- [ ] Team-aware knowledge lifecycle with admin review, rejected-item feedback, and resubmission
- [ ] Text-only RAG with global constraints, project-scoped knowledge, and batch import/export

### Out of Scope

- End-user web UI for normal usage — CLI is the primary interface so agent integration stays simple and LLM-friendly
- Multimodal retrieval or non-text indexing — v1 explicitly supports text-only search and text-only knowledge
- Fully automatic knowledge publication without admin approval — trust and curation matter more than throughput in the first release
- Cross-company public marketplace for knowledge sharing — the first milestone is team-internal, not public distribution

## Context

Software teams repeatedly lose time to the same "踩坑" problems, but existing skill-only approaches do not scale well because context gets heavy and useful experience becomes hard to surface at the right time. The product should let a CLI client register server context, authenticate users, switch teams, submit solved problems, and retrieve relevant knowledge from a text seed while staying imperative and easy for bash-driven agents to consume.

Knowledge is intentionally small and structured:

- Labels: global labels plus custom labels
- Shortcut: concise summary or reusable constraint
- Detail: the fuller explanation, fix, or operating guidance
- Scope: global constraints vs project-internal knowledge

The server owns text-only RAG, access control, agent pre-review, admin review, and data import/export. Users should be able to inspect rejected submissions and re-submit improved versions instead of losing work. The access model starts with `user` and `admin` templates, then extends them with a detailed permission list on the user object so teams can tighten or widen capabilities without inventing many extra roles.

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
| TypeScript-first monorepo with shared contracts | LangChain JS, CLI ergonomics, and shared runtime validation all fit a single TS stack well | — Pending |
| CLI is the default user surface | The product is meant to work from bash and agent runtimes, not only from a GUI | — Pending |
| Knowledge uses `labels + shortcut + detail + scope` as the canonical model | Small, opinionated structure keeps entries retrievable and cheap to review | — Pending |
| Review is mandatory before publication | Team knowledge is only valuable if it stays trustworthy and deduplicated | — Pending |
| Retrieval stays text-only in v1 | Limits complexity and keeps the first milestone focused on useful search quality | — Pending |
| Skills must remain Claude-compatible | Anthropic skill compatibility is a stated product constraint, not a future nice-to-have | — Pending |

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
*Last updated: 2026-04-13 after initialization*
