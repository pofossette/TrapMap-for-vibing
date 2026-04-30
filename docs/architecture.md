# Skill Shareer（已重命名为 TrapMap）

> **注意**："Skill Shareer" 是项目曾用名，现已统一更名为 **TrapMap**。原架构文档保留供参考。

## Monorepo Layout

```text
packages/
  cli/        Commander-based terminal client
  server/     Fastify API and orchestration boundary
  contracts/  Shared Zod schemas and exported TypeScript types
docs/
  api-surface.md
.agents/
  skills/
```

## Package Responsibilities

### `@skill-shareer/contracts`

- Owns runtime validation with Zod
- Defines stable payload contracts for auth, teams, knowledge, review, retrieval, and operations
- Is imported by both the CLI and server so request and response shapes stay aligned

### `@skill-shareer/server`

- Owns HTTP routing, authorization, persistence, review orchestration, retrieval, and audit recording
- Will host LangChain-based embeddings and review services in later phases
- Exposes health and route metadata immediately so tooling can confirm the process boots

### `@skill-shareer/cli`

- Owns imperative commands, shell-friendly output, and optional JSON mode
- Will map terminal workflows onto the server routes from `docs/api-surface.md`
- Serves as the default human and agent interface

## Skill Compatibility

Project-specific skills that should be auto-discovered by Claude-compatible agents live
under `.claude/skills/` using Claude-compatible `SKILL.md` frontmatter and local assets.
Product/importable skill bundles live under `packages/skills/`. Keep both shapes aligned
when a skill is both a runtime playbook and a TrapMap artifact sample.
