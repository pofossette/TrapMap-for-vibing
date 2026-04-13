# Phase 4: Retrieval and CLI Workflow - Research

**Researched:** 2026-04-13
**Domain:** Retrieval pipeline, result shaping, and CLI workflow design for Skill Shareer
**Confidence:** MEDIUM

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
No phase-specific `*-CONTEXT.md` exists for Phase 4, so there are no additional locked decisions beyond `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, and project instructions. [VERIFIED: codebase grep]

### Claude's Discretion
Provider choice for embeddings and optional refinement remains open. `.planning/STATE.md` explicitly says embedding and chat model providers remain configurable. [VERIFIED: codebase grep]

### Deferred Ideas (OUT OF SCOPE)
No deferred ideas were recorded in a Phase 4 `*-CONTEXT.md` because no such file exists. [VERIFIED: codebase grep]
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RAG-01 | User can send a text seed from the CLI and receive relevant knowledge matches | Search route, CLI `search` command, result formatting, and end-to-end tests below support this. [VERIFIED: codebase grep] |
| RAG-02 | Retrieval accepts text-only query input and indexes text-only knowledge in v1 | Existing product constraints already lock v1 to text-only retrieval. [VERIFIED: codebase grep] |
| RAG-03 | Retrieval respects active team, scope, security level, and metadata filters | Auth context, team access checks, and retrieval filters in shared contracts already exist and should be enforced server-side before ranking. [VERIFIED: codebase grep] |
| RAG-04 | Retrieval surfaces concise global constraints separately from project knowledge when relevant | `retrievalResponseSchema` already has `globalConstraints` and `projectKnowledge` buckets. [VERIFIED: codebase grep] |
| RAG-05 | Server uses embeddings, metadata-aware ranking, and optional LLM refinement before returning context | Shared contract already models `includeRefinement`; provider selection remains configurable. [VERIFIED: codebase grep] |
| CLI-01 | CLI exposes imperative commands for server setup, login, team select, search, submit, resubmit, and review status | Existing CLI already provides login, team select, submit, resubmit, and review-status patterns to extend. [VERIFIED: codebase grep] |
| CLI-02 | CLI returns human-readable output by default and structured JSON output on demand | Existing CLI uses a shared `printResult()` helper with `--json` switching. [VERIFIED: codebase grep] |
| CLI-03 | CLI lets agents register solved problems using shell-friendly flags and stdin | Existing submit/resubmit commands already support flags, files, and stdin for `detail`. [VERIFIED: codebase grep] |
| CLI-04 | CLI can inspect the current user's submission and review history, including rejected details | Existing `review-status` command and `/v1/knowledge/mine` route already cover most of this workflow. [VERIFIED: codebase grep] |
</phase_requirements>

## Summary

Phase 4 should be planned as a retrieval-and-workflow phase, not as a storage migration phase. The current server persists everything in a JSON-file store, and no Postgres or `pgvector` code exists in the repository today. The retrieval contracts, API surface entry, and CLI output primitives already exist, so the shortest defensible path is to add a retrieval service, retrieval route, search command, and end-to-end workflow tests on top of the current architecture. [VERIFIED: codebase grep]

The highest-risk planning mistake is to treat retrieval ranking as a pure similarity problem. The product promise is gated by active team, approved lifecycle state, scope, labels, and `requiredLevel`, and those are already modeled in the contracts and enforced elsewhere in the server. The plan should therefore filter first on authorization and entry state, then rank eligible entries, then optionally refine the shaped result. [VERIFIED: codebase grep]

The second planning risk is provider coupling. The contracts already make refinement optional, the project state says model providers remain configurable, and no provider env vars are present in the repo or current shell. The plan should therefore introduce a provider-agnostic embeddings/refinement adapter with a deterministic fallback path when no provider is configured. [VERIFIED: codebase grep]

**Primary recommendation:** Build Phase 4 on the existing JSON-store architecture with a provider-agnostic embeddings service, server-side eligibility filtering before ranking, explicit global-vs-project result shaping, and a Commander `search` command that reuses the existing `--json` and stdin-friendly CLI conventions. [VERIFIED: codebase grep]

## Project Constraints (from AGENTS.md)

- The repo must remain a monorepo with clear CLI, server, and shared-contract separation. Shared schemas must stay consistent across components. [VERIFIED: codebase grep]
- CLI commands must stay imperative, bash-friendly, and support predictable stdout with optional JSON mode. [VERIFIED: codebase grep]
- Project skills must remain Claude-compatible `SKILL.md` directories with local assets. [VERIFIED: codebase grep]
- Retrieval in v1 is text-only. No images, attachments, or multimodal embeddings belong in this phase. [VERIFIED: codebase grep]
- Access control must combine role templates with explicit permissions. CLI visibility alone is insufficient. [VERIFIED: codebase grep]
- LangChain JS remains the intended server-side orchestration layer. [VERIFIED: codebase grep]

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@langchain/core` | `1.1.39` published `2026-04-03T23:11:53.150Z` [VERIFIED: npm registry] | Embeddings interface, `Document` model, and retrieval orchestration boundary | The repo already uses `@langchain/core` in pre-review, so retrieval should reuse the same LangChain boundary instead of adding a second abstraction. [VERIFIED: codebase grep] |
| `@langchain/openai` | `1.4.4` published `2026-04-10T15:11:01.633Z` [VERIFIED: npm registry] | Default embeddings/refinement adapter when an OpenAI-compatible provider is selected | LangChain’s JS docs show `OpenAIEmbeddings` as a first-class embeddings integration and a standard fit for `similaritySearch` workflows. [CITED: https://docs.langchain.com/oss/javascript/integrations/vectorstores] |
| `fastify` | `5.8.4` published `2026-03-23T10:31:05.362Z` [VERIFIED: npm registry] | Retrieval HTTP route and server-side validation/error handling | The server already uses Fastify and central error handling, so retrieval should register as one more route plugin. [VERIFIED: codebase grep] |
| `commander` | `14.0.3` published `2026-01-31T01:47:17.592Z` [VERIFIED: npm registry] | Imperative CLI commands and flag parsing | The CLI already uses Commander for auth, team, review, and knowledge commands; Phase 4 should extend that surface rather than adding another CLI parser. [VERIFIED: codebase grep] |
| `zod` | `4.3.6` published `2026-01-22T19:14:35.382Z` [VERIFIED: npm registry] | Shared request/response validation | Retrieval query and response schemas already exist in `@skill-shareer/contracts`. [VERIFIED: codebase grep] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `drizzle-orm` | `0.45.2` published `2026-03-27T17:06:27.140Z` [VERIFIED: npm registry] | Future relational/vector persistence layer | Use only if the phase is explicitly expanded into a Postgres migration; Drizzle documents `pg_vector` column types, indexes, and helper functions, but the current repo does not use Drizzle yet. [CITED: https://orm.drizzle.team/docs/extensions/pg] [VERIFIED: codebase grep] |
| `pg` | `8.20.0` published `2026-03-04T23:48:49.439Z` [VERIFIED: npm registry] | Future Postgres transport | Use only with an explicit datastore migration plan. No Postgres client code exists in the current repo. [VERIFIED: codebase grep] |
| `vitest` | `4.1.4` published `2026-04-09T07:36:52.741Z` [VERIFIED: npm registry] | Contract, service, CLI, and workflow tests | The workspace already runs tests through Vitest and includes `packages/**/*.test.ts`. [VERIFIED: codebase grep] |
| `pino` | `10.3.1` published `2026-02-09T15:50:56.728Z` [VERIFIED: npm registry] | Retrieval/refinement logging | Use for provider failures, refinement skips, and ranking diagnostics if Phase 4 adds server-side retrieval logs. [VERIFIED: codebase grep] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| JSON-store-backed retrieval in Phase 4 [VERIFIED: codebase grep] | Immediate Postgres + `pgvector` migration [CITED: https://orm.drizzle.team/docs/extensions/pg] | `pgvector` is the stronger long-term search backend, but adding it here expands scope from retrieval behavior into persistence/migration work that is not required by the Phase 4 requirements. [VERIFIED: codebase grep] |
| Deterministic ranking + optional refinement [VERIFIED: codebase grep] | Mandatory LLM post-processing | Mandatory refinement would hard-fail queries when no model credentials are configured; no provider env vars are currently present. [VERIFIED: codebase grep] |
| Commander `search` command beside existing commands [VERIFIED: codebase grep] | A separate “agent mode” CLI or custom parser | The project constraint is a single imperative CLI with optional JSON mode, and existing command patterns already satisfy that. [VERIFIED: codebase grep] |

**Installation:**

```bash
pnpm --filter @skill-shareer/server add @langchain/openai
```

If Phase 4 is expanded into relational vector storage, add `drizzle-orm` and `pg` only under an explicit migration plan. [VERIFIED: codebase grep] [CITED: https://orm.drizzle.team/docs/extensions/pg]

## Architecture Patterns

### Recommended Project Structure

```text
packages/
  server/
    src/
      lib/
        retrieval.ts        # eligibility filtering, embedding lookup, scoring, shaping
        embeddings.ts       # provider-agnostic adapter + no-provider fallback
      routes/
        retrieval.ts        # POST /v1/retrieval/search
  cli/
    src/
      commands/
        retrieval.ts        # search command
  contracts/
    src/
      domain/
        retrieval.ts        # extend only if the current schema proves insufficient
```

This keeps Phase 4 aligned with the current route-per-domain and command-per-domain layout already used by auth, knowledge, review, and members. [VERIFIED: codebase grep]

### Pattern 1: Eligibility Filter Before Ranking

**What:** Build the candidate set from entries that are `approved`, team-accessible, within requested scopes/labels, and visible to the caller’s security level before any embedding similarity or refinement runs. [VERIFIED: codebase grep]

**When to use:** On every retrieval query, including JSON mode and future automation callers. [VERIFIED: codebase grep]

**Why:** Filtering after ranking risks leaking the existence or relative proximity of unauthorized entries. The current server already enforces team and level checks in review and knowledge routes, and Phase 4 should preserve that posture. [VERIFIED: codebase grep]

**Example:**

```typescript
// Source synthesis: repo auth/rbac patterns + retrieval contracts
const eligible = data.knowledgeEntries.filter((entry) => {
  if (entry.lifecycleState !== "approved") return false;
  if (entry.requiredLevel > auth.securityLevel) return false;
  if (entry.teamId && auth.subjectType !== "system-admin" && entry.teamId !== auth.activeTeamId) {
    return false;
  }
  if (filters.scopes.length > 0 && !filters.scopes.includes(entry.scope)) return false;
  if (filters.labels.length > 0 && !filters.labels.every((label) => entry.labels.includes(label))) {
    return false;
  }
  return true;
});
```

### Pattern 2: Persist Embeddings Alongside Knowledge Metadata

**What:** Store an embedding payload keyed by entry ID and latest revision so retrieval can skip recomputation for unchanged approved entries. [ASSUMED]

**When to use:** During search and after approve/update/resubmit transitions that change searchable text. [VERIFIED: codebase grep]

**Why:** Re-embedding on every query is unnecessary latency and cost, while the current JSON store can hold structured metadata without introducing a second persistence system. [ASSUMED]

### Pattern 3: Shape Results Into Two Buckets, Then Refine

**What:** Rank once, then split the final matches into `globalConstraints` and `projectKnowledge` using the existing `scope` or `metadata.scopeLabel` fields, preserving raw reasons/scores for both buckets. [VERIFIED: codebase grep]

**When to use:** Every successful `/v1/retrieval/search` response. [VERIFIED: codebase grep]

**Why:** The response contract already requires separate buckets, and project skill guidance says reusable constraints belong in global scope while team-specific knowledge belongs in project scope. [VERIFIED: codebase grep]

### Pattern 4: Optional Refinement Must Be Best-Effort

**What:** Treat `includeRefinement` as “attempt refinement if a provider is configured,” not as “fail the query if refinement is unavailable.” [VERIFIED: codebase grep]

**When to use:** After deterministic ranking and shaping. [VERIFIED: codebase grep]

**Why:** `retrievalQuerySchema` defaults `includeRefinement` to `true`, but the repo currently defines no LLM provider config or credentials. Best-effort refinement keeps search usable in local and CI environments. [VERIFIED: codebase grep]

### Anti-Patterns to Avoid

- **Post-filtering unauthorized hits:** Do not compute top-k across all approved entries and then drop forbidden rows. That can change scores and leak corpus shape across security boundaries. [VERIFIED: codebase grep]
- **Indexing non-approved content:** Retrieval should not search `submitted`, `agent-pass`, `agent-rejected`, or `rejected` entries because Phase 3 makes approval the gate to searchability. [VERIFIED: codebase grep]
- **Mandatory provider dependency in CLI tests:** End-to-end tests should pass without live model credentials; otherwise Phase 4 becomes non-repeatable in CI and local planning loops. [VERIFIED: codebase grep]
- **A separate JSON output implementation per command:** Reuse the existing `printResult()` helper and keep formatting functions pure. [VERIFIED: codebase grep]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Embeddings provider SDK abstraction | A custom provider interface unrelated to LangChain [ASSUMED] | LangChain embeddings adapters through `@langchain/core` and provider packages like `@langchain/openai` [CITED: https://docs.langchain.com/oss/javascript/integrations/vectorstores] | The repo already uses LangChain, and LangChain’s vector-store interface expects an embedding model object. [VERIFIED: codebase grep] [CITED: https://docs.langchain.com/oss/javascript/integrations/vectorstores] |
| Approximate nearest-neighbor index | A bespoke HNSW/IVF implementation in TypeScript [CITED: https://github.com/pgvector/pgvector] | Exact search in Phase 4, then `pgvector` HNSW/IVFFlat if the project later moves to Postgres [CITED: https://github.com/pgvector/pgvector] | `pgvector` already provides exact search plus HNSW and IVFFlat, and exact search has perfect recall by default. [CITED: https://github.com/pgvector/pgvector] |
| CLI JSON/human output branching | Separate command handlers for JSON and text [VERIFIED: codebase grep] | Existing `printResult()` helper [VERIFIED: codebase grep] | The helper already centralizes the mode switch, keeping each command focused on request/response logic. [VERIFIED: codebase grep] |
| stdin/file ingestion | Ad-hoc stream handling in each command [VERIFIED: codebase grep] | Existing `resolveTextInput()` helper [VERIFIED: codebase grep] | Submit/resubmit already prove the pattern for shell-friendly flags and stdin. [VERIFIED: codebase grep] |

**Key insight:** The only custom logic worth writing in Phase 4 is the project-specific eligibility, scoring, and shaping policy. Provider wiring, CLI mode switching, and future ANN indexing already have standard layers. [VERIFIED: codebase grep] [CITED: https://docs.langchain.com/oss/javascript/integrations/vectorstores]

## Common Pitfalls

### Pitfall 1: Treating Searchability as “anything not rejected”

**What goes wrong:** Unreviewed or merely `agent-pass` entries appear in search results. [VERIFIED: codebase grep]

**Why it happens:** Phase 3 introduced multiple lifecycle states, and only one of them actually means “searchable for end users.” [VERIFIED: codebase grep]

**How to avoid:** Gate retrieval on `entry.lifecycleState === 'approved'` and test negative cases for every other lifecycle state. [VERIFIED: codebase grep]

**Warning signs:** A freshly submitted entry appears in search before reviewer approval. [VERIFIED: codebase grep]

### Pitfall 2: Mixing Team Filtering Into Presentation Instead of Retrieval

**What goes wrong:** The CLI hides project entries from another team, but the server still ranked them, so JSON clients or logs can still reveal them. [VERIFIED: codebase grep]

**Why it happens:** Existing CLI command visibility can create a false sense that client-side filtering is enough. [VERIFIED: codebase grep]

**How to avoid:** Reuse server-side auth context and team checks inside the retrieval service, not just the CLI formatter. [VERIFIED: codebase grep]

**Warning signs:** Two users with different active teams get identical raw result counts. [ASSUMED]

### Pitfall 3: Making Refinement Mandatory

**What goes wrong:** Queries fail in local development or CI because no refinement provider is configured. [VERIFIED: codebase grep]

**Why it happens:** `includeRefinement` defaults to `true`, which is easy to misread as “always refine.” [VERIFIED: codebase grep]

**How to avoid:** Implement refinement as optional/best-effort and return `refinementSummary: null` when unavailable. [VERIFIED: codebase grep]

**Warning signs:** Search works only on machines with private API keys. [ASSUMED]

### Pitfall 4: Letting Search Scores Dictate Global vs Project Buckets

**What goes wrong:** A global constraint relevant to the query ends up buried in a single mixed result list. [VERIFIED: codebase grep]

**Why it happens:** Semantic search naturally returns one ranked list unless the application explicitly reshapes the response. [CITED: https://docs.langchain.com/oss/javascript/integrations/vectorstores]

**How to avoid:** Split the ranked hits into `globalConstraints` and `projectKnowledge` before formatting. [VERIFIED: codebase grep]

**Warning signs:** The API returns only one flat array or the CLI cannot render constraints distinctly. [VERIFIED: codebase grep]

## Code Examples

Verified patterns from official sources and current repo conventions:

### LangChain Embeddings + Similarity Search

```typescript
// Source: https://docs.langchain.com/oss/javascript/integrations/vectorstores
import { OpenAIEmbeddings } from "@langchain/openai";
import { MemoryVectorStore } from "@langchain/classic/vectorstores/memory";

const embeddings = new OpenAIEmbeddings({
  model: "text-embedding-3-small",
});

const vectorStore = new MemoryVectorStore(embeddings);
const results = await vectorStore.similaritySearch("why does drizzle fail on pgvector", 10);
```

LangChain’s docs also show metadata filtering support through the vector-store interface. [CITED: https://docs.langchain.com/oss/javascript/integrations/vectorstores]

### OpenAI Embeddings Instantiation Details

```typescript
// Source: https://docs.langchain.com/oss/javascript/integrations/embeddings/openai
import { OpenAIEmbeddings } from "@langchain/openai";

const embeddings = new OpenAIEmbeddings({
  apiKey: process.env.OPENAI_API_KEY,
  batchSize: 512,
  model: "text-embedding-3-large",
});
```

LangChain’s OpenAI embeddings docs state `batchSize` defaults to `512` and the max is `2048`. [CITED: https://docs.langchain.com/oss/javascript/integrations/embeddings/openai]

### Drizzle `pg_vector` Query Shape for a Later Migration

```typescript
// Source: https://orm.drizzle.team/docs/extensions/pg
import { l2Distance } from "drizzle-orm";

db.select()
  .from(items)
  .orderBy(l2Distance(items.embedding, [3, 1, 2]))
  .limit(5);
```

This is a migration example, not the recommended Phase 4 implementation path. The current repo has no Drizzle or Postgres runtime yet. [VERIFIED: codebase grep]

### Existing CLI Output Pattern to Reuse

```typescript
// Source: packages/cli/src/lib/output.ts
printResult(parsed, flags, (value) => formatSearchResult(value));
```

That same helper already prints JSON when `--json` is set and formatter output otherwise. [VERIFIED: codebase grep]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Lexical-only lookup [ASSUMED] | Embeddings plus metadata filters and optional refinement [CITED: https://docs.langchain.com/oss/javascript/integrations/vectorstores] | Current LangChain JS RAG guidance [CITED: https://docs.langchain.com/oss/javascript/integrations/vectorstores] | Better semantic matching, but application-level authorization and shaping still remain mandatory. [VERIFIED: codebase grep] |
| Always-exact vector search [CITED: https://github.com/pgvector/pgvector] | Exact by default, approximate indexes only when scale demands them [CITED: https://github.com/pgvector/pgvector] | `pgvector` current docs [CITED: https://github.com/pgvector/pgvector] | For a prototype corpus, exact search is simpler and avoids ANN complexity; `pgvector` adds HNSW/IVFFlat later if needed. [CITED: https://github.com/pgvector/pgvector] |

**Deprecated/outdated:**

- Building a separate client-only authorization layer for search is outdated for this repo because server-side auth context and permission checks are already the authoritative path. [VERIFIED: codebase grep]
- Planning a custom vector index for this phase is outdated relative to current standard tooling because `pgvector` already provides exact and approximate search modes if the project later adopts Postgres. [CITED: https://github.com/pgvector/pgvector]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Persisting embeddings inside the existing JSON store is preferable to a sidecar file or another local persistence shape for Phase 4. | Architecture Patterns | The planner may overconstrain implementation details that could otherwise stay flexible. |
| A2 | Search-warning signs like identical raw result counts across teams are a reliable signal of broken team filtering. | Common Pitfalls | The planner may include a weak verification heuristic. |
| A3 | The repo previously had only lexical-style duplicate heuristics before Phase 4 retrieval. | State of the Art | Low impact; this does not affect the concrete Phase 4 plan. |

## Open Questions (RESOLVED)

1. **Should Phase 4 remain on the JSON store or also migrate to Postgres?**
   Decision: Keep Phase 4 on the existing `JsonStore` architecture and do not pull the PostgreSQL/`pgvector` migration forward into this phase. [RESOLVED]
   Why: The repo currently persists everything through `JsonStore`, no Postgres or Drizzle code exists yet, and Phase 4 requirements focus on retrieval behavior rather than persistence migration. [VERIFIED: codebase grep]
   Planning impact: Plans must deliver embeddings-backed retrieval and optional refinement on top of the JSON store, with migration-ready seams but no database migration work in this phase. [RESOLVED]

2. **Which provider should back embeddings and optional refinement?**
   Decision: Use a provider-agnostic adapter with `@langchain/openai` as the default first integration, while requiring a deterministic no-credentials fallback so local and CI execution remain green without provider secrets. [RESOLVED]
   Why: Providers are intentionally configurable, `includeRefinement` is optional in practice, and no provider env vars are present right now. [VERIFIED: codebase grep] [CITED: https://docs.langchain.com/oss/javascript/integrations/vectorstores]
   Planning impact: Plans must include concrete embedding generation/indexing/search tasks plus tests for both configured-provider and no-provider paths. [RESOLVED]

3. **Should retrieval index only `shortcut + detail`, or also labels and review metadata?**
   Decision: Build embedding text from `shortcut`, `detail`, and `labels`, while continuing to enforce labels and scope as metadata filters; exclude review-state metadata from embedded text. [RESOLVED]
   Why: Labels are meaningful retrieval signals for terminal knowledge lookup, but review metadata is operational history rather than user-facing searchable content. [VERIFIED: codebase grep] [ASSUMED]
   Planning impact: Retrieval plans must preserve metadata-aware filtering and include tests proving labels affect both filter behavior and embedding input construction. [RESOLVED]

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | CLI and server execution | ✓ [VERIFIED: local command] | `v22.20.0` [VERIFIED: local command] | — |
| `pnpm` | Workspace installs and filtered scripts | ✓ [VERIFIED: local command] | `10.33.0` [VERIFIED: local command] | `npm` for package inspection only; not recommended for workspace execution. [VERIFIED: local command] |
| `npm` | Version verification against registry | ✓ [VERIFIED: local command] | `11.6.2` [VERIFIED: local command] | — |
| PostgreSQL CLI | Future migration or local DB experiments | ✓ [VERIFIED: local command] | `psql (PostgreSQL) 18.3` [VERIFIED: local command] | — |
| Docker | Optional local infra for Postgres/pgvector later | ✓ [VERIFIED: local command] | `29.4.0` [VERIFIED: local command] | — |
| Embedding/refinement provider credentials | Live embeddings or live refinement | ✗ [VERIFIED: local command] | — | Deterministic retrieval path with refinement skipped and `refinementSummary: null`. [VERIFIED: codebase grep] |

**Missing dependencies with no fallback:**

- None for planning or implementing the deterministic retrieval path. [VERIFIED: local command]

**Missing dependencies with fallback:**

- Model-provider credentials are absent, but the phase can still ship with a no-provider retrieval path plus optional refinement adapter. [VERIFIED: local command] [VERIFIED: codebase grep]

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `vitest` `4.1.4` [VERIFIED: npm registry] |
| Config file | `vitest.workspace.ts` [VERIFIED: codebase grep] |
| Quick run command | `pnpm --filter @skill-shareer/server test` or `pnpm --filter @skill-shareer/cli test` [VERIFIED: codebase grep] |
| Full suite command | `pnpm test` [VERIFIED: codebase grep] |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| RAG-01 | Search from seed returns relevant matches | service + route | `pnpm --filter @skill-shareer/server test` | ❌ Wave 0 [VERIFIED: codebase grep] |
| RAG-02 | Text-only indexing/query path | contract + service | `pnpm --filter @skill-shareer/contracts test` | ⚠️ Partial; contract exists, service test missing. [VERIFIED: codebase grep] |
| RAG-03 | Team/scope/level/label filters enforced | service + route | `pnpm --filter @skill-shareer/server test` | ❌ Wave 0 [VERIFIED: codebase grep] |
| RAG-04 | Global constraints returned separately | service + CLI | `pnpm --filter @skill-shareer/server test && pnpm --filter @skill-shareer/cli test` | ❌ Wave 0 [VERIFIED: codebase grep] |
| RAG-05 | Embeddings + ranking + optional refinement path | service | `pnpm --filter @skill-shareer/server test` | ❌ Wave 0 [VERIFIED: codebase grep] |
| CLI-01 | Imperative `search` command works with existing auth/team flow | CLI integration | `pnpm --filter @skill-shareer/cli test` | ❌ Wave 0 [VERIFIED: codebase grep] |
| CLI-02 | Default text output and `--json` output | CLI integration | `pnpm --filter @skill-shareer/cli test` | ❌ Wave 0 [VERIFIED: codebase grep] |
| CLI-03 | Stdin/file-friendly submission path remains intact | CLI integration | `pnpm --filter @skill-shareer/cli test` | ⚠️ Existing helpers exist; workflow test missing. [VERIFIED: codebase grep] |
| CLI-04 | Review/submission history still inspectable after retrieval additions | CLI integration | `pnpm --filter @skill-shareer/cli test` | ⚠️ Existing command exists; regression test missing. [VERIFIED: codebase grep] |

### Sampling Rate

- **Per task commit:** `pnpm --filter @skill-shareer/contracts test && pnpm --filter @skill-shareer/server test && pnpm --filter @skill-shareer/cli test` [VERIFIED: codebase grep]
- **Per wave merge:** `pnpm test && pnpm typecheck` [VERIFIED: codebase grep]
- **Phase gate:** Full suite green before `/gsd-verify-work`. [VERIFIED: AGENTS.md]

### Wave 0 Gaps

- [ ] `packages/server/src/lib/retrieval.test.ts` — filter/ranking/shaping coverage for RAG-01 through RAG-05. [VERIFIED: codebase grep]
- [ ] `packages/server/src/routes/retrieval.test.ts` — route auth, validation, and response-shape coverage. [VERIFIED: codebase grep]
- [ ] `packages/cli/src/commands/retrieval.test.ts` — `search` command text vs JSON output coverage. [VERIFIED: codebase grep]
- [ ] `packages/cli/src/commands/workflow.test.ts` or equivalent — login → team select → submit/review → search → review-status path. [ASSUMED]

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes [VERIFIED: codebase grep] | Reuse existing session token and resolved auth context. [VERIFIED: codebase grep] |
| V3 Session Management | yes [VERIFIED: codebase grep] | Reuse existing bearer-token session flow and stored CLI session state. [VERIFIED: codebase grep] |
| V4 Access Control | yes [VERIFIED: codebase grep] | Enforce `knowledge:search`, team scoping, and `requiredLevel` checks on the server before ranking. [VERIFIED: codebase grep] |
| V5 Input Validation | yes [VERIFIED: codebase grep] | Keep `retrievalQuerySchema` and `retrievalResponseSchema` as the contract boundary. [VERIFIED: codebase grep] |
| V6 Cryptography | no direct Phase 4 change [VERIFIED: codebase grep] | No new crypto should be added; continue using existing token hashing utilities as-is. [VERIFIED: codebase grep] |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Unauthorized knowledge disclosure through search results | Information Disclosure | Filter on lifecycle, team, permission, and security level before ranking or refinement. [VERIFIED: codebase grep] |
| Cross-team result leakage through shared embeddings/index state | Information Disclosure | Partition candidate selection by `teamId` and keep global entries explicitly separate. [VERIFIED: codebase grep] |
| Prompt/provider leakage in refinement summaries | Information Disclosure | Do not include hidden entry text in refinement input unless the entry already passed eligibility checks. [VERIFIED: codebase grep] [ASSUMED] |
| Query abuse through oversized seeds | Denial of Service | Keep `seed` bounded by the existing max length of 2000 characters in `retrievalQuerySchema`. [VERIFIED: codebase grep] |

## Sources

### Primary (HIGH confidence)

- Codebase files:
  `packages/contracts/src/domain/retrieval.ts`,
  `packages/contracts/src/domain/knowledge.ts`,
  `packages/contracts/src/domain/common.ts`,
  `packages/server/src/app.ts`,
  `packages/server/src/lib/store.ts`,
  `packages/server/src/lib/pre-review.ts`,
  `packages/server/src/lib/rbac.ts`,
  `packages/server/src/routes/knowledge.ts`,
  `packages/server/src/routes/review.ts`,
  `packages/cli/src/index.ts`,
  `packages/cli/src/lib/output.ts`,
  `packages/cli/src/lib/input.ts`,
  `packages/cli/src/commands/knowledge.ts`,
  `docs/api-surface.md`,
  `.planning/REQUIREMENTS.md`,
  `.planning/STATE.md`,
  `.planning/ROADMAP.md`,
  `AGENTS.md`. [VERIFIED: codebase grep]
- npm registry package metadata for `@langchain/core`, `@langchain/openai`, `fastify`, `commander`, `zod`, `drizzle-orm`, `pg`, `vitest`, `pino`, `typescript`, and `tsx`. [VERIFIED: npm registry]
- LangChain JS vector-store docs: https://docs.langchain.com/oss/javascript/integrations/vectorstores [CITED: https://docs.langchain.com/oss/javascript/integrations/vectorstores]
- LangChain JS OpenAI embeddings docs: https://docs.langchain.com/oss/javascript/integrations/embeddings/openai [CITED: https://docs.langchain.com/oss/javascript/integrations/embeddings/openai]
- Drizzle PostgreSQL extensions docs: https://orm.drizzle.team/docs/extensions/pg [CITED: https://orm.drizzle.team/docs/extensions/pg]
- pgvector official README: https://github.com/pgvector/pgvector [CITED: https://github.com/pgvector/pgvector]

### Secondary (MEDIUM confidence)

- Fastify TypeScript reference: https://fastify.dev/docs/latest/Reference/TypeScript/ [CITED: https://fastify.dev/docs/latest/Reference/TypeScript/]

### Tertiary (LOW confidence)

- None. All externally sourced factual claims used above were verified against official documentation or the npm registry. [VERIFIED: npm registry]

## Metadata

**Confidence breakdown:**

- Standard stack: MEDIUM - package versions and official docs are current, but the exact provider choice and storage shape for embeddings are still discretionary. [VERIFIED: npm registry] [VERIFIED: codebase grep]
- Architecture: MEDIUM - route/CLI patterns are clear in the repo, but persistence details for embeddings remain an implementation choice. [VERIFIED: codebase grep]
- Pitfalls: HIGH - the main failure modes follow directly from current requirements, lifecycle state handling, and server-side authorization patterns. [VERIFIED: codebase grep]

**Research date:** 2026-04-13
**Valid until:** 2026-05-13 for repo-specific planning, or sooner if provider/storage decisions change. [ASSUMED]
