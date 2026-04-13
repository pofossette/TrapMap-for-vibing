# Stack Research

**Domain:** Team knowledge sharing CLI + reviewable RAG service
**Researched:** 2026-04-13
**Confidence:** MEDIUM

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Node.js | LTS (`v20+`) | Runtime for server and CLI | Keeps the whole product on one runtime while matching current TypeScript CLI tooling expectations |
| TypeScript | 5.5+ | Shared implementation language for server, CLI, and contracts | Zod 4 and modern TS tooling assume recent TypeScript, and a single language keeps contracts and validation aligned |
| `pnpm` workspaces | Current stable | Monorepo dependency and task management | Officially optimized for monorepos and a clean fit for a TS-first workspace |
| Fastify | Current stable | HTTP API layer for auth, knowledge, review, and retrieval endpoints | Lightweight, fast, and well-suited to typed route contracts in TypeScript |
| PostgreSQL + `pgvector` | Current stable | Source-of-truth storage plus vector search | Keeps team data, review history, and vector lookup in one durable system |
| LangChain JS | Current stable | Embedding, LLM, review, and retrieval orchestration | Preserves the LangChain requirement while staying inside the TS stack |
| Zod | 4.x | Shared runtime validation and schema inference | TypeScript-first schema validation with static type inference makes contracts reusable across CLI and server |
| Drizzle ORM | Current stable | SQL-first relational access and migrations | TS-native and pgvector-friendly without forcing unsupported vector abstractions |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Commander | Current stable | Imperative CLI with subcommands and flags | Use for shell-friendly commands, help output, and strict command parsing |
| `tsx` | Current stable | TS execution in development | Use for fast local iteration without a separate build step |
| Vitest | Current stable | Test runner | Use for contract tests, CLI tests, and service-level tests |
| `pino` | Current stable | Structured logging | Use for server logs, audit traces, and CLI debug output |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Biome | Linting and formatting | Fast enough to keep the CLI and server feedback loop tight in a TS monorepo |
| Vitest | Test runner | Use contract and workflow tests, not only unit tests |
| `tsc --noEmit` | Type checking | Especially useful for permission matrices and response schemas |

## Installation

```bash
# Bootstrap the workspace
pnpm install

# Run the API server
pnpm --filter @skill-shareer/server dev

# Run the CLI
pnpm --filter @skill-shareer/cli dev -- --help
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `pnpm` workspaces | Nx or Turborepo on top of `pnpm` | Use only if task orchestration complexity grows beyond simple package filters |
| Fastify | NestJS | Use if the team later wants a more opinionated framework and accepts extra structure overhead |
| Drizzle ORM | Prisma | Use Prisma only if Prisma Client ergonomics outweigh pgvector limitations for your workload |
| Commander CLI | Pure bash scripts | Use bash only for thin wrappers around the real CLI; do not let bash become the core application layer |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Ad-hoc bash scripts as the primary client implementation | Hard to validate, hard to version, and brittle for permissions or JSON contracts | A real TypeScript CLI with shell-friendly ergonomics |
| Prisma as the primary vector access layer for v1 | Prisma docs still require raw SQL or unsupported types for `pgvector` workflows | Drizzle or direct SQL for vector-aware tables |
| Non-standard skill packaging | Agents cannot discover or reason over project skills consistently | Claude-compatible `SKILL.md` directories with frontmatter and local assets |

## Stack Patterns by Variant

**If the product stays CLI-only for multiple milestones:**
- Keep admin operations in the same CLI namespace
- Because it avoids building a second control plane too early

**If admin workflows become too dense for terminal use:**
- Add a web admin UI later without replacing the CLI
- Because agent automation and human operations both still benefit from stable server APIs

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| TypeScript 5.5+ | Zod 4 | Zod 4 documents TypeScript 5.5+ as the supported baseline |
| LangChain JS | Provider-specific chat and embedding integrations | Keep provider adapters isolated so switching models does not change domain logic |
| Drizzle ORM | PostgreSQL + `pgvector` | Drizzle documents `pg_vector` support directly, which reduces friction for vector-aware schema work |
| Fastify | Zod-backed route validation patterns | Keep shared contracts the canonical schema layer for both server and CLI |

## Sources

- https://code.claude.com/docs/en/skills — Claude Code skill layout and compatibility expectations
- https://docs.anthropic.com/en/docs/claude-code/sub-agents — Markdown frontmatter and subagent conventions that inform skill packaging discipline
- https://pnpm.io/ — workspace-oriented monorepo package management
- https://fastify.dev/docs/latest/Reference/TypeScript/ — Fastify TypeScript support
- https://docs.langchain.com/oss/javascript/langchain/overview — LangChain JavaScript/TypeScript architecture
- https://zod.dev/ — TypeScript-first schema validation and supported TS baseline
- https://orm.drizzle.team/docs/extensions/pg — Drizzle pgvector support
- https://www.prisma.io/docs/postgres/database/postgres-extensions — Prisma pgvector limitations and raw-SQL workflow details

---
*Stack research for: Team knowledge sharing CLI + reviewable RAG service*
*Researched: 2026-04-13*
