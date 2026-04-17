# Phase 14: Seed Intent Retrieval and Capsule Ranking - Research

**Researched:** 2026-04-16 [VERIFIED: system date]  
**Domain:** Seed-only CLI retrieval with server-side intent decomposition, artifact-profile recall, capsule ranking, and distilled capsule-first response shaping [VERIFIED: `.planning/ROADMAP.md`] [VERIFIED: `.planning/REQUIREMENTS.md`] [VERIFIED: `packages/contracts/src/domain/retrieval.ts`] [VERIFIED: `packages/server/src/lib/retrieval/orchestrator.ts`] [VERIFIED: `packages/contracts/src/domain/artifacts.ts`]  
**Confidence:** MEDIUM [VERIFIED: roadmap, requirements, prior phase artifacts, current contracts/server/cli code, and local tests were reviewed]

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
No `*-CONTEXT.md` exists for Phase 14, so there are no additional locked decisions to copy verbatim. [VERIFIED: `node ".codex/get-shit-done/bin/gsd-tools.cjs" init phase-op "14"`]

### Claude's Discretion
Recommendation latitude comes from the roadmap, requirements, AGENTS.md, and the direct phase prompt only. [VERIFIED: `.planning/ROADMAP.md`] [VERIFIED: `.planning/REQUIREMENTS.md`] [VERIFIED: user prompt]

### Deferred Ideas (OUT OF SCOPE)
No `*-CONTEXT.md` exists for Phase 14, so there are no additional deferred ideas to copy verbatim. [VERIFIED: `node ".codex/get-shit-done/bin/gsd-tools.cjs" init phase-op "14"`]
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RETR-01 | 客户端检索接口保持单一 `seed` 输入 [VERIFIED: `.planning/REQUIREMENTS.md`] | Keep CLI argument/stdin flow and external request body centered on `seed`; do not push `situation/problem/goal/errorText` onto the client contract. [VERIFIED: `packages/contracts/src/domain/retrieval.ts`] [VERIFIED: `packages/cli/src/commands/retrieval.ts`] |
| RETR-02 | 服务端能从单种子中解析 `situation`、`problem`、`goal`、`errorText` 等内部意图字段 [VERIFIED: `.planning/REQUIREMENTS.md`] | Add an internal parsed-intent model in `packages/server/src/lib/retrieval/types.ts` and populate it inside the orchestrator before recall/ranking. [VERIFIED: `packages/server/src/lib/retrieval/types.ts`] [VERIFIED: `packages/server/src/lib/retrieval/orchestrator.ts`] |
| RETR-03 | 检索主对象从扁平 knowledge entry 演进为 skill-derived capsule [VERIFIED: `.planning/REQUIREMENTS.md`] | Switch retrieval recall input from `knowledgeEntries[]` to approved/governed `skillArtifacts[].latestRevision.derived.{profile,capsules}`. [VERIFIED: `packages/server/src/lib/store.ts`] [VERIFIED: `packages/server/src/lib/retrieval/orchestrator.ts`] [VERIFIED: `packages/contracts/src/domain/artifacts.ts`] |
| RETR-04 | 检索结果默认返回 distilled response，而不是完整 skill bundle [VERIFIED: `.planning/REQUIREMENTS.md`] | Reuse the Phase 13 distilled-export precedent and return capsule-first distilled records plus optional profile/manifest hints, not file payloads. [VERIFIED: `packages/contracts/src/domain/operations.ts`] [VERIFIED: `packages/server/src/routes/operations.ts`] |
| CAPS-04 | 检索排序同时考虑问题匹配、情景匹配、stack/path boost 与治理边界 [VERIFIED: `.planning/REQUIREMENTS.md`] | Add ranking inputs from parsed intent + capsule fields + profile keywords/sourcePaths while preserving pre-filter governance gates. [VERIFIED: `packages/contracts/src/domain/artifacts.ts`] [VERIFIED: `packages/server/src/lib/retrieval/orchestrator.ts`] |
| COMP-01 | `contracts` 继续作为 CLI 与 server 的唯一共享契约真源 [VERIFIED: `.planning/REQUIREMENTS.md`] | Put every request/response contract change in `packages/contracts/src/domain/retrieval.ts` before route/CLI work. [VERIFIED: `packages/contracts/src/domain/retrieval.ts`] [VERIFIED: `packages/server/src/routes/retrieval.ts`] [VERIFIED: `packages/cli/src/commands/retrieval.ts`] |
| COMP-03 | 旧 `/v1` 检索与知识接口在迁移阶段保留兼容路径 [VERIFIED: `.planning/REQUIREMENTS.md`] | Keep the legacy flat-entry route/response available while introducing a new seed-based capsule-native path or explicit compatibility branch. [VERIFIED: `.planning/ROADMAP.md`] [VERIFIED: `packages/server/src/routes/retrieval.ts`] [ASSUMED] |
</phase_requirements>

## Summary

Phase 14 should be planned as a retrieval-surface migration on top of Phase 12/13’s additive artifact model, not as a rewrite of import/export or governance. The repo already has governed artifact storage, cached `derived.profile`, cached `derived.capsules`, cached `derived.clientManifest`, and additive coexistence with legacy `knowledgeEntries`; retrieval is the lagging subsystem that still reads only `data.knowledgeEntries` and shapes output around `shortcut/detail` matches. [VERIFIED: `packages/server/src/lib/store.ts`] [VERIFIED: `packages/server/src/lib/artifacts/model.ts`] [VERIFIED: `packages/server/src/routes/operations.ts`] [VERIFIED: `packages/server/src/lib/retrieval/orchestrator.ts`] [VERIFIED: `packages/server/src/lib/retrieval/assembly.ts`]

The clean Phase 14 boundary is: keep the CLI contract seed-only, parse intent on the server, recall/rank artifact-derived profiles and capsules inside the orchestrator, then return a distilled capsule-first response that still respects existing auth, team, level, and approval gates. The Phase 12 derivation seam was explicitly left with placeholder profile/capsule content for Phase 14 to replace, so retrieval quality depends on upgrading derivation and retrieval together rather than bolting capsule ranking onto the current placeholders. [VERIFIED: `.planning/phases/12-skill-artifact-canonical-model/12-03-SUMMARY.md`] [VERIFIED: `packages/server/src/lib/artifacts/derive.ts`] [VERIFIED: `packages/server/src/lib/retrieval/orchestrator.ts`] [VERIFIED: `.planning/ROADMAP.md`]

The strongest implementation seam is to preserve the existing route/CLI thinness and pure helper split. `retrieval.ts` in contracts remains the shared truth, `routes/retrieval.ts` remains a permission-checking adapter, `orchestrator.ts` becomes the capsule-native coordinator, `assembly.ts` becomes distilled response shaping, and `summary.ts` stays a pure post-filter formatter. Do not move parsing or ranking logic into the CLI or route layer. [VERIFIED: `packages/contracts/src/domain/retrieval.ts`] [VERIFIED: `packages/server/src/routes/retrieval.ts`] [VERIFIED: `packages/server/src/lib/retrieval/orchestrator.ts`] [VERIFIED: `packages/server/src/lib/retrieval/assembly.ts`] [VERIFIED: `packages/server/src/lib/retrieval/summary.ts`] [VERIFIED: `packages/cli/src/commands/retrieval.ts`]

**Primary recommendation:** Introduce a capsule-native retrieval v2 contract and server pipeline that consumes Phase 12/13 cached derived outputs, while preserving a legacy `/v1` compatibility path until Phase 16 finishes the coexistence window. [VERIFIED: `.planning/ROADMAP.md`] [VERIFIED: `.planning/REQUIREMENTS.md`] [VERIFIED: `packages/server/src/routes/retrieval.ts`] [ASSUMED]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Seed capture from terminal args/stdin | CLI client | — | The CLI already resolves text input and sends a single `seed` string. [VERIFIED: `packages/cli/src/commands/retrieval.ts`] |
| Auth, permission, team, and level gating | API / Backend | — | The retrieval route resolves auth and enforces `knowledge:search`; current filtering also enforces approval/team/level server-side. [VERIFIED: `packages/server/src/routes/retrieval.ts`] [VERIFIED: `packages/server/src/lib/retrieval/orchestrator.ts`] |
| Intent decomposition from seed into internal fields | API / Backend | — | RETR-02 explicitly assigns parsed intent to the server while preserving CLI seed-only input. [VERIFIED: `.planning/REQUIREMENTS.md`] |
| Profile recall and capsule ranking | API / Backend | Database / Storage | Ranking consumes cached derived outputs from `skillArtifacts.latestRevision.derived`, which are persisted in the store. [VERIFIED: `packages/server/src/lib/store.ts`] [VERIFIED: `packages/server/src/lib/artifacts/model.ts`] |
| Artifact/profile/capsule source of truth | Database / Storage | API / Backend | Phase 12/13 established stored artifact revisions and derived outputs as the canonical governed source. [VERIFIED: `.planning/phases/12-skill-artifact-canonical-model/12-03-SUMMARY.md`] [VERIFIED: `packages/server/src/routes/operations.ts`] |
| Distilled response shaping and optional summary | API / Backend | — | Response assembly and summary are already server-side pure helpers and should stay there. [VERIFIED: `packages/server/src/lib/retrieval/assembly.ts`] [VERIFIED: `packages/server/src/lib/retrieval/summary.ts`] |

## Project Constraints (from AGENTS.md)

- Keep the monorepo split between CLI, server, and shared contracts; Phase 14 should not create hidden cross-package schemas outside `packages/contracts`. [VERIFIED: `AGENTS.md`]  
- Keep the retrieval interface imperative and seed-based for terminal/agent use; Phase 14 should not require structured client payloads. [VERIFIED: `AGENTS.md`] [VERIFIED: `.planning/REQUIREMENTS.md`]  
- Preserve Claude-compatible skill artifact boundaries from Phases 12 and 13; retrieval should consume `SKILL.md`/`references/`-derived outputs and keep `assets/`/`scripts/` outside model context. [VERIFIED: `AGENTS.md`] [VERIFIED: `.planning/REQUIREMENTS.md`] [VERIFIED: `packages/contracts/src/domain/artifacts.ts`]  
- Preserve existing RBAC, team scope, security level, and audit boundaries on the server. [VERIFIED: `AGENTS.md`] [VERIFIED: `.planning/REQUIREMENTS.md`]  
- Do not introduce server-side script execution, browser UI dependencies, or multimodal retrieval. [VERIFIED: `AGENTS.md`] [VERIFIED: `.planning/REQUIREMENTS.md`]  

## Concrete Code Seams

| Module | Current Role | Phase 14 Change |
|--------|--------------|-----------------|
| `packages/contracts/src/domain/retrieval.ts` | Shared seed/query and flat-entry response schemas using `globalConstraints` + `projectKnowledge`. [VERIFIED: `packages/contracts/src/domain/retrieval.ts`] | Keep `seed` request semantics; add capsule-native distilled response schemas here first. [VERIFIED: `packages/contracts/src/domain/retrieval.ts`] [ASSUMED] |
| `packages/contracts/src/domain/artifacts.ts` | Defines governed `skillProfile`, `skillCapsule`, and `clientManifest` shapes already cached on revisions. [VERIFIED: `packages/contracts/src/domain/artifacts.ts`] | Reuse these shapes by reference; do not duplicate capsule/profile types in retrieval contracts. [VERIFIED: `packages/contracts/src/domain/artifacts.ts`] [ASSUMED] |
| `packages/server/src/lib/artifacts/derive.ts` | Generates placeholder profile/capsule content and deterministic IDs from revision metadata. [VERIFIED: `packages/server/src/lib/artifacts/derive.ts`] | Replace placeholder content generation with text-backed distillation using stored file payloads or a derivation input helper. [VERIFIED: `.planning/phases/12-skill-artifact-canonical-model/12-03-SUMMARY.md`] [VERIFIED: `packages/server/src/lib/artifacts/derive.ts`] [VERIFIED: `packages/server/src/lib/import-export.ts`] |
| `packages/server/src/lib/artifacts/model.ts` | Persists artifact revisions and cached derived outputs. [VERIFIED: `packages/server/src/lib/artifacts/model.ts`] | Keep persistence boundary unchanged; Phase 14 should update cached `derived.*` values, not invent a parallel retrieval cache first. [VERIFIED: `packages/server/src/lib/artifacts/model.ts`] [ASSUMED] |
| `packages/server/src/lib/retrieval/orchestrator.ts` | Filters `knowledgeEntries`, dispatches semantic/hybrid/graph modes, then shapes flat responses. [VERIFIED: `packages/server/src/lib/retrieval/orchestrator.ts`] | This becomes the main seed-intent -> profile recall -> capsule ranking coordinator. [VERIFIED: `packages/server/src/lib/retrieval/orchestrator.ts`] [ASSUMED] |
| `packages/server/src/lib/retrieval/types.ts` | Internal retrieval candidate types only for knowledge-entry recall. [VERIFIED: `packages/server/src/lib/retrieval/types.ts`] | Add `ParsedIntent`, `ProfileCandidate`, `CapsuleCandidate`, and capsule-level score breakdown types here. [VERIFIED: `packages/server/src/lib/retrieval/types.ts`] [ASSUMED] |
| `packages/server/src/lib/retrieval/assembly.ts` | Builds `RetrievalMatch` objects from `KnowledgeRecord`. [VERIFIED: `packages/server/src/lib/retrieval/assembly.ts`] | Split legacy entry assembly from new capsule-first assembly; keep this module pure. [VERIFIED: `packages/server/src/lib/retrieval/assembly.ts`] [ASSUMED] |
| `packages/server/src/lib/retrieval/summary.ts` | Pure extractive summary builder using filtered hits/citations only. [VERIFIED: `packages/server/src/lib/retrieval/summary.ts`] | Keep purity; if summary survives in v2, make it summarize distilled capsule hits, not raw bundles. [VERIFIED: `packages/server/src/lib/retrieval/summary.ts`] [ASSUMED] |
| `packages/server/src/routes/retrieval.ts` | Thin route: auth, permission, schema parse, delegate, parse response. [VERIFIED: `packages/server/src/routes/retrieval.ts`] | Preserve thinness; add v2 routing or compatibility branching without business logic. [VERIFIED: `packages/server/src/routes/retrieval.ts`] [ASSUMED] |
| `packages/cli/src/commands/retrieval.ts` | Keeps `search [seed]` UX and prints current flat response sections. [VERIFIED: `packages/cli/src/commands/retrieval.ts`] | Preserve command/seed UX; update formatter for capsule-first distilled sections and optional compatibility flags only if needed. [VERIFIED: `packages/cli/src/commands/retrieval.ts`] [ASSUMED] |

## Standard Stack

### Core
| Library / Module | Version | Purpose | Why Standard |
|------------------|---------|---------|--------------|
| Node.js | local `v22.20.0` [VERIFIED: local env] | Runtime for contracts, server, and CLI work | Already installed and used across the monorepo. [VERIFIED: `package.json`] |
| TypeScript | workspace `^5.9.3`; npm current `6.0.2` modified `2026-04-01` [VERIFIED: `package.json`] [VERIFIED: npm registry] | Shared typing for retrieval contracts and server/CLI code | Contracts-first changes require TS to stay the single cross-package language. [VERIFIED: `AGENTS.md`] |
| Zod | workspace `^4.1.12` / `^4.3.6`; npm current `4.3.6` modified `2026-01-25` [VERIFIED: `packages/contracts/package.json`] [VERIFIED: `packages/server/package.json`] [VERIFIED: npm registry] | Shared request/response validation | Existing retrieval and artifact contracts already use Zod schemas as the canonical surface. [VERIFIED: `packages/contracts/src/domain/retrieval.ts`] [VERIFIED: `packages/contracts/src/domain/artifacts.ts`] |
| Fastify | server `^5.6.1`; npm current `5.8.5` modified `2026-04-14` [VERIFIED: `packages/server/package.json`] [VERIFIED: npm registry] | Route layer for retrieval/search APIs | Existing retrieval routes are already Fastify plugins; Phase 14 should keep that seam. [VERIFIED: `packages/server/src/routes/retrieval.ts`] |
| `@langchain/openai` | server `^1.4.4`; npm current `1.4.4` modified `2026-04-10` [VERIFIED: `packages/server/package.json`] [VERIFIED: npm registry] | Optional live model-backed embeddings and possible intent parsing helper | Already installed; Phase 14 can use it server-side if it keeps a deterministic fallback. [VERIFIED: `packages/server/src/lib/embeddings.ts`] [ASSUMED] |

### Supporting
| Library / Module | Version | Purpose | When to Use |
|------------------|---------|---------|-------------|
| Commander | CLI `^14.0.1`; npm current `14.0.3` modified `2026-02-21` [VERIFIED: `packages/cli/package.json`] [VERIFIED: npm registry] | Preserve `search [seed]` command UX | Keep existing CLI flow; only update flags/formatting as contract changes demand. [VERIFIED: `packages/cli/src/commands/retrieval.ts`] |
| Vitest | workspace `^3.2.4`; npm current `4.1.4` modified `2026-04-09` [VERIFIED: `package.json`] [VERIFIED: npm registry] | Contract, server, and CLI regression tests | Existing retrieval and route coverage already uses Vitest. [VERIFIED: `packages/server/src/lib/retrieval.test.ts`] [VERIFIED: `packages/cli/src/commands/retrieval.test.ts`] |
| Internal artifact store + file payload storage | in-repo [VERIFIED: `packages/server/src/lib/store.ts`] | Persist approved artifacts, cached derived outputs, and round-trip file content | Phase 14 should consume this instead of adding a separate retrieval datastore first. [VERIFIED: `packages/server/src/lib/store.ts`] [VERIFIED: `packages/server/src/routes/operations.ts`] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Cached derived profile/capsule retrieval [VERIFIED: `packages/server/src/lib/store.ts`] | Reparsing `SKILL.md`/`references/` on every search [ASSUMED] | Reparsing duplicates Phase 12/13 derivation work, increases latency, and risks drifting from export behavior. [VERIFIED: `packages/server/src/routes/operations.ts`] [ASSUMED] |
| Server-side parsed intent model [VERIFIED: `.planning/REQUIREMENTS.md`] | Structured CLI payload with explicit `situation/problem/goal` fields [ASSUMED] | A structured client payload breaks RETR-01 and makes CLI/agent UX heavier. [VERIFIED: `.planning/REQUIREMENTS.md`] |
| Distilled capsule-first response [VERIFIED: `.planning/REQUIREMENTS.md`] | Returning full bundle-json by default [ASSUMED] | Full bundle output recreates the context bloat Phase 14 is meant to remove. [VERIFIED: `.planning/REQUIREMENTS.md`] |

**Installation:**
```bash
pnpm install
```

## Architecture Patterns

### System Architecture Diagram
```text
CLI seed/stdin
  -> retrieval contract parse
  -> Fastify retrieval route
  -> auth + permission gate
  -> orchestrator
      -> parse seed into internal intent fields
      -> load approved/governed skill artifacts
      -> profile recall (artifact-level shortlist)
      -> capsule ranking (capsule-level scoring)
      -> distilled response assembly
      -> optional summary over filtered capsule hits
  -> contract-shaped response
  -> CLI formatter / JSON output
```
[VERIFIED: `packages/cli/src/commands/retrieval.ts`] [VERIFIED: `packages/server/src/routes/retrieval.ts`] [VERIFIED: `packages/server/src/lib/retrieval/orchestrator.ts`] [VERIFIED: `packages/server/src/lib/retrieval/assembly.ts`] [ASSUMED]

### Recommended Project Structure
```text
packages/contracts/src/domain/
  retrieval.ts          # shared v1/v2 seed query + distilled response contracts

packages/server/src/lib/retrieval/
  orchestrator.ts       # seed -> intent -> recall -> ranking -> shaping
  types.ts              # ParsedIntent, ProfileCandidate, CapsuleCandidate
  assembly.ts           # pure response shaping helpers
  summary.ts            # pure optional summary helper
  intent.ts             # new internal intent parsing helpers
  capsule-recall.ts     # new profile shortlist + capsule scoring helpers

packages/server/src/lib/artifacts/
  derive.ts             # content-backed profile/capsule derivation

packages/server/src/routes/
  retrieval.ts          # thin route registration for legacy + v2 path(s)

packages/cli/src/commands/
  retrieval.ts          # same seed UX, updated formatter
```
[VERIFIED: existing folder layout in `packages/server/src/lib/retrieval/`] [VERIFIED: `packages/server/src/lib/artifacts/derive.ts`] [ASSUMED]

### Pattern 1: Keep `seed` Public, Make Parsed Intent Internal
**What:** External request shape stays centered on `seed`; the server creates a non-exported parsed-intent object with fields like `situation`, `problem`, `goal`, `errorText`, normalized tokens, and stack/path hints. [VERIFIED: `.planning/REQUIREMENTS.md`] [VERIFIED: `packages/contracts/src/domain/retrieval.ts`] [ASSUMED]  
**When to use:** Always for Phase 14 seed-based retrieval requests. [VERIFIED: `.planning/ROADMAP.md`]  
**Why:** The CLI already only resolves text input and POSTs `seed`, while RETR-02 explicitly assigns decomposition to the server. [VERIFIED: `packages/cli/src/commands/retrieval.ts`] [VERIFIED: `.planning/REQUIREMENTS.md`]

**Example:**
```typescript
// Source: recommended internal pattern based on packages/server/src/lib/retrieval/types.ts
interface ParsedIntent {
  seed: string;
  normalized: string;
  situation: string | null;
  problem: string | null;
  goal: string | null;
  errorText: string | null;
  stackHints: string[];
  pathHints: string[];
  tokens: string[];
}
```
[ASSUMED]

### Pattern 2: Recall Profiles First, Rank Capsules Second
**What:** Use artifact-level profiles as a cheap shortlist stage, then score capsules within shortlisted artifacts. [VERIFIED: `packages/contracts/src/domain/artifacts.ts`] [ASSUMED]  
**When to use:** For every capsule-native search path to keep ranking work bounded. [ASSUMED]  
**Why:** The store already caches both profile and capsule projections per revision, so Phase 14 can use them as separate ranking tiers without reparsing source files. [VERIFIED: `packages/server/src/lib/store.ts`] [VERIFIED: `packages/server/src/routes/operations.ts`]

**Example:**
```typescript
// Source: recommended orchestrator split based on current retrieval/orchestrator.ts
const artifacts = filterEligibleArtifacts(data.skillArtifacts, auth);
const parsedIntent = parseSeedIntent(query.seed);
const profileCandidates = shortlistProfiles(artifacts, parsedIntent, query.maxResults * 3);
const capsuleHits = rankCapsules(profileCandidates, parsedIntent, query.maxResults);
return buildCapsuleRetrievalResponse(capsuleHits, parsedIntent);
```
[ASSUMED]

### Pattern 3: Shape Distilled Output from Cached Derived Data
**What:** Response payloads should reference capsule/profile/client-manifest metadata already present on `latestRevision.derived`, not reconstruct bundle payloads or inline file contents. [VERIFIED: `packages/server/src/routes/operations.ts`] [VERIFIED: `packages/server/src/lib/store.ts`]  
**When to use:** All default retrieval responses and CLI text output. [VERIFIED: `.planning/REQUIREMENTS.md`]  
**Why:** Phase 13 already established `distilled-json` as the compact, governed projection. [VERIFIED: `packages/contracts/src/domain/operations.ts`] [VERIFIED: `packages/server/src/routes/operations.ts`]

### Anti-Patterns to Avoid

- **Ranking current placeholder capsules as if they were production content:** `derive.ts` still emits generic placeholder summary/situation/problem/goal text. [VERIFIED: `packages/server/src/lib/artifacts/derive.ts`]  
- **Making the CLI send structured intent fields:** This violates RETR-01 and duplicates server parsing logic. [VERIFIED: `.planning/REQUIREMENTS.md`]  
- **Returning bundle file payloads from search:** Phase 13 keeps those for export only, not for default retrieval. [VERIFIED: `packages/contracts/src/domain/operations.ts`] [VERIFIED: `packages/server/src/routes/operations.ts`]  
- **Bypassing existing pre-filter governance in favor of post-ranking filtering:** Current retrieval security depends on filtering before scoring. [VERIFIED: `packages/server/src/lib/retrieval/orchestrator.ts`]  
- **Inventing per-capsule approval/ACL state:** Capsules inherit governance from artifact roots and revisions. [VERIFIED: `packages/contracts/src/domain/artifacts.ts`] [VERIFIED: `packages/server/src/lib/store.ts`]  

## Data Shape Implications

| Area | Keep | Change |
|------|------|--------|
| Retrieval request | Keep `seed`, filters, and result-limit semantics contract-driven. [VERIFIED: `packages/contracts/src/domain/retrieval.ts`] | Additive query flags are acceptable; parsed intent fields should stay server-internal. [VERIFIED: `.planning/REQUIREMENTS.md`] [ASSUMED] |
| Retrieval response | Keep contracts as the single shared truth. [VERIFIED: `packages/contracts/src/domain/retrieval.ts`] | The flat `RetrievalMatch` shape tied to `KnowledgeRecord.shortcut/detail` is not sufficient for capsule-native output and must change for v2. [VERIFIED: `packages/contracts/src/domain/retrieval.ts`] [VERIFIED: `packages/contracts/src/domain/artifacts.ts`] |
| Artifact store | Keep `skillArtifacts`, `artifactFilePayloads`, and `latestRevision.derived` as the canonical persisted source. [VERIFIED: `packages/server/src/lib/store.ts`] | Phase 14 likely needs a way for derivation to read actual text payloads instead of only metadata hashes. [VERIFIED: `packages/server/src/lib/import-export.ts`] [VERIFIED: `packages/server/src/lib/artifacts/derive.ts`] [ASSUMED] |
| Compatibility | Keep legacy `knowledgeEntries` and their retrieval path during coexistence. [VERIFIED: `.planning/ROADMAP.md`] [VERIFIED: `packages/server/src/lib/store.ts`] | Add a v2 response path instead of breaking the current v1 shape in place. [VERIFIED: `.planning/ROADMAP.md`] [ASSUMED] |

## Recommended Plan Decomposition

### 14-01: Single-seed retrieval contract and internal parsed-intent model
- Update `packages/contracts/src/domain/retrieval.ts` with a capsule-native v2 response shape while preserving `seed` as the only required search input. [VERIFIED: `packages/contracts/src/domain/retrieval.ts`] [ASSUMED]
- Add internal parsed-intent types/helpers in `packages/server/src/lib/retrieval/types.ts` and a new helper module rather than exporting them through contracts. [VERIFIED: `packages/server/src/lib/retrieval/types.ts`] [ASSUMED]
- Decide compatibility strategy up front: either add `/v2/retrieval/search` or branch the route by explicit version/flag while keeping the existing `/v1/retrieval/search` contract intact. [VERIFIED: `packages/server/src/routes/retrieval.ts`] [VERIFIED: `.planning/ROADMAP.md`] [ASSUMED]

### 14-02: Profile recall and capsule ranking pipeline
- Replace knowledge-entry-only recall in `orchestrator.ts` with artifact-profile shortlist + capsule ranking stages. [VERIFIED: `packages/server/src/lib/retrieval/orchestrator.ts`] [ASSUMED]
- Upgrade `packages/server/src/lib/artifacts/derive.ts` so cached `profile` and `capsules` contain text-backed fields suitable for ranking, using stored file payloads from Phase 13 rather than placeholder strings. [VERIFIED: `packages/server/src/lib/artifacts/derive.ts`] [VERIFIED: `packages/server/src/lib/import-export.ts`] [VERIFIED: `.planning/phases/12-skill-artifact-canonical-model/12-03-SUMMARY.md`] [ASSUMED]
- Keep governance pre-filtering before profile recall and capsule ranking. [VERIFIED: `packages/server/src/lib/retrieval/orchestrator.ts`] [VERIFIED: `packages/contracts/src/domain/artifacts.ts`]

### 14-03: Distilled response shaping with capsule-first output
- Replace the current `globalConstraints`/`projectKnowledge` entry-bucket shaper with capsule-first distilled result groups and artifact metadata references. [VERIFIED: `packages/server/src/lib/retrieval/assembly.ts`] [VERIFIED: `packages/contracts/src/domain/retrieval.ts`] [ASSUMED]
- Reuse `summary.ts` only as an optional post-filter formatter; do not let it reconstruct hidden source content. [VERIFIED: `packages/server/src/lib/retrieval/summary.ts`]
- Keep default output compact and activation-light; Phase 15 will expand activation hints. [VERIFIED: `.planning/ROADMAP.md`] [VERIFIED: `.planning/REQUIREMENTS.md`] |

### 14-04: Route and CLI integration for seed-based retrieval v2
- Keep `routes/retrieval.ts` thin and contract-driven. [VERIFIED: `packages/server/src/routes/retrieval.ts`]  
- Keep `packages/cli/src/commands/retrieval.ts` seed-only at the UX level and update formatting/JSON parsing for the new response. [VERIFIED: `packages/cli/src/commands/retrieval.ts`]  
- Add compatibility coverage so legacy retrieval stays reachable while the new path is adopted. [VERIFIED: `.planning/REQUIREMENTS.md`] [ASSUMED]  

**Sequencing constraints:** 14-01 must land before 14-04 because the CLI and route can only be updated against a stable shared contract. 14-02 must land before 14-03 because response shaping needs real capsule/profile ranking inputs rather than placeholders. 14-04 should be last because route/CLI churn before ranking/assembly stabilizes will cause repeated test rewrites. [VERIFIED: `packages/contracts/src/domain/retrieval.ts`] [VERIFIED: `packages/server/src/lib/artifacts/derive.ts`] [VERIFIED: `packages/cli/src/commands/retrieval.ts`] [ASSUMED]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Search-time source parsing | Reparse `SKILL.md` and `references/` straight from bundle payloads on every request [ASSUMED] | Cached derived profile/capsule projections on revisions. [VERIFIED: `packages/server/src/lib/store.ts`] | Phase 12/13 already created the derivation seam and cache location. [VERIFIED: `.planning/phases/12-skill-artifact-canonical-model/12-03-SUMMARY.md`] |
| Compatibility bridge | Immediate replacement of current `/v1/retrieval/search` behavior [ASSUMED] | Side-by-side compatibility path until Phase 16. [VERIFIED: `.planning/ROADMAP.md`] [ASSUMED] | The roadmap explicitly reserves a coexistence window. [VERIFIED: `.planning/ROADMAP.md`] |
| Capsule governance | Per-capsule ACL or review state [ASSUMED] | Artifact-root governance inheritance already present in the capsule schema. [VERIFIED: `packages/contracts/src/domain/artifacts.ts`] | Duplicating governance would drift from existing approval/audit boundaries. [VERIFIED: `.planning/REQUIREMENTS.md`] [ASSUMED] |
| LLM dependency | Hard requirement on live model access for every retrieval request [ASSUMED] | Deterministic heuristic baseline with optional model enhancement. [VERIFIED: `packages/server/src/lib/embeddings.ts`] [ASSUMED] | The repo already uses a deterministic fallback for embeddings when `OPENAI_API_KEY` is absent. [VERIFIED: `packages/server/src/lib/embeddings.ts`] [VERIFIED: local env] |

**Key insight:** Phase 14 should consume and improve the existing derivation boundary, not bypass it. If retrieval reads bundle payloads or legacy `knowledgeEntries` directly after this phase, Phase 12/13’s canonical artifact work is effectively being sidestepped. [VERIFIED: `.planning/phases/12-skill-artifact-canonical-model/12-03-SUMMARY.md`] [VERIFIED: `packages/server/src/routes/operations.ts`] [VERIFIED: `packages/server/src/lib/retrieval/orchestrator.ts`]

## Common Pitfalls

### Pitfall 1: Treating Placeholder Capsules as Production Retrieval Units
**What goes wrong:** Ranking appears to work mechanically but retrieves generic capsule text like “When working with this skill” instead of actual problem/goal evidence. [VERIFIED: `packages/server/src/lib/artifacts/derive.ts`]  
**Why it happens:** Phase 12 intentionally left capsule/profile content as placeholders for later phases. [VERIFIED: `.planning/phases/12-skill-artifact-canonical-model/12-03-SUMMARY.md`]  
**How to avoid:** Upgrade derivation and retrieval together in Phase 14-02. [VERIFIED: `packages/server/src/lib/artifacts/derive.ts`] [ASSUMED]  
**Warning signs:** Top hits differ only by labels/title and not by concrete situation/problem/error text. [ASSUMED]

### Pitfall 2: Breaking the CLI Contract While Chasing Better Intent Parsing
**What goes wrong:** The CLI starts collecting structured fields or the route starts requiring extra body keys. [ASSUMED]  
**Why it happens:** Parsed-intent work can tempt planners to externalize those fields too early. [ASSUMED]  
**How to avoid:** Keep `seed` public, keep parsed intent private. [VERIFIED: `.planning/REQUIREMENTS.md`]  
**Warning signs:** Contract changes add required `problem`, `goal`, or `errorText` request fields. [ASSUMED]

### Pitfall 3: Reintroducing Unauthorized Data via Response Shaping
**What goes wrong:** Distilled output or summary exposes capsules from artifacts the caller should not see. [ASSUMED]  
**Why it happens:** Response shaping runs after ranking, so it is easy to forget pre-filter guarantees. [VERIFIED: `packages/server/src/lib/retrieval/orchestrator.ts`]  
**How to avoid:** Filter artifacts before profile recall and only summarize filtered hits. [VERIFIED: `packages/server/src/lib/retrieval/orchestrator.ts`] [VERIFIED: `packages/server/src/lib/retrieval/summary.ts`]  
**Warning signs:** Summary code or assembly code re-queries the store. [VERIFIED: `packages/server/src/lib/retrieval/summary.ts`] [ASSUMED]

### Pitfall 4: Returning Bundle Payloads from Search Because They Are Convenient
**What goes wrong:** Retrieval starts acting like export, bloating CLI output and breaking distilled-first behavior. [ASSUMED]  
**Why it happens:** Phase 13 already stores file payloads for round-trip export, so they are easy to reach. [VERIFIED: `packages/server/src/lib/import-export.ts`] [VERIFIED: `packages/server/src/routes/operations.ts`]  
**How to avoid:** Keep bundle payload access limited to export/activation workflows. [VERIFIED: `.planning/ROADMAP.md`] [VERIFIED: `.planning/REQUIREMENTS.md`]  
**Warning signs:** Retrieval response schemas or CLI text mode print file paths with inline file content. [ASSUMED]

## Code Examples

Verified current seams that Phase 14 should preserve:

### Current Thin Retrieval Route
```typescript
// Source: packages/server/src/routes/retrieval.ts
const auth = await resolveAuthContext(app.skillShareer, request);
requirePermission(auth, 'knowledge:search');
const query = retrievalQuerySchema.parse(request.body);
const result = await searchKnowledge(app.skillShareer, auth, query);
return retrievalResponseSchema.parse(result);
```
[VERIFIED: `packages/server/src/routes/retrieval.ts`]

### Current Artifact Import -> Derive -> Cache Flow
```typescript
// Source: packages/server/src/routes/operations.ts
data.artifactFilePayloads.push(...normalized.filePayloads);
const derived = deriveSkillArtifactOutputs(artifact, artifact.latestRevision);
applyDerivedArtifactOutputs(data, artifact, artifact.latestRevision, derived);
```
[VERIFIED: `packages/server/src/routes/operations.ts`]

### Current Placeholder Capsule Boundary
```typescript
// Source: packages/server/src/lib/artifacts/derive.ts
content: `Skill artifact: ${artifact.title}\n\nLabels: ${artifact.labels.join(', ')}`,
situation: 'When working with this skill',
problem: `The problem addressed by ${artifact.title}`,
goal: `Apply the solution pattern from ${artifact.title}`,
```
[VERIFIED: `packages/server/src/lib/artifacts/derive.ts`]

## State of the Art

| Old Approach | Current Repo State | When Changed | Impact |
|--------------|--------------------|--------------|--------|
| Flat `KnowledgeRecord` retrieval as the primary search object | Still current in the orchestrator today. [VERIFIED: `packages/server/src/lib/retrieval/orchestrator.ts`] | Current codebase | Phase 14 must move primary search to derived capsules. [VERIFIED: `.planning/REQUIREMENTS.md`] |
| Artifact-derived profiles/capsules only as cached exports | Already implemented and persisted per revision. [VERIFIED: `packages/server/src/routes/operations.ts`] [VERIFIED: `packages/server/src/lib/store.ts`] | Phase 12-13 | Retrieval can now consume them directly. [VERIFIED: `.planning/phases/12-skill-artifact-canonical-model/12-03-SUMMARY.md`] |
| Full bundle payloads as the only artifact-complete output | Not current default; Phase 13 already added `distilled-json` export. [VERIFIED: `packages/contracts/src/domain/operations.ts`] [VERIFIED: `packages/server/src/routes/operations.ts`] | Phase 13 | Retrieval should follow the distilled pattern instead of inventing a heavier payload. [VERIFIED: `.planning/REQUIREMENTS.md`] |

**Deprecated/outdated:**
- Ranking against `knowledgeEntries` alone is outdated for the v1.2 milestone because RETR-03 and CAPS-04 explicitly move search to skill-derived capsules. [VERIFIED: `.planning/REQUIREMENTS.md`] [VERIFIED: `packages/server/src/lib/retrieval/orchestrator.ts`]

## Open Questions (RESOLVED)

1. **Route/versioning strategy**
   - Decision: add an explicit capsule-native `POST /v2/retrieval/search` path and leave `POST /v1/retrieval/search` intact during the coexistence window. [VERIFIED: `packages/server/src/routes/retrieval.ts`] [VERIFIED: `.planning/ROADMAP.md`]
   - Why: the current `/v1` response is flat-entry shaped, while Phase 14 needs a capsule-first distilled response. A distinct `/v2` path preserves COMP-03 compatibility without schema ambiguity or route-layer branching on one path. [VERIFIED: `packages/contracts/src/domain/retrieval.ts`] [VERIFIED: `.planning/REQUIREMENTS.md`]
   - Planning consequence: 14-01 defines additive v2 request/response schemas, 14-04 wires `/v2/retrieval/search`, and legacy `/v1` remains reachable until Phase 16 migration hardening. [VERIFIED: `.planning/ROADMAP.md`] [ASSUMED]

2. **Intent parsing strategy**
   - Decision: ship a deterministic heuristic parser first and keep any model-assisted parsing optional behind the same internal `ParsedIntent` interface. [VERIFIED: `packages/server/src/lib/embeddings.ts`] [VERIFIED: local env]
   - Why: `OPENAI_API_KEY` is not available locally, and RETR-02 only requires server-side parsing, not live-model dependence. A deterministic parser keeps tests stable and the baseline path always available. [VERIFIED: `.planning/REQUIREMENTS.md`] [VERIFIED: local env]
   - Planning consequence: 14-01 builds a pure `parseSeedIntent()` helper with deterministic token/path/stack extraction, and later model assistance can be additive instead of becoming a hard requirement. [ASSUMED]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Phase 14 should add a distinct capsule-native v2 retrieval path instead of mutating the current `/v1/retrieval/search` response in place. | Summary, Recommended Plan Decomposition | Planner may over- or under-scope compatibility work. |
| A2 | Phase 14 should upgrade `derive.ts` to use stored file payload content so profile/capsule text becomes search-worthy. | Concrete Code Seams, 14-02 | If derivation is deferred, retrieval quality work must move elsewhere. |
| A3 | Parsed intent should remain internal to the server and not appear in shared request contracts. | Pattern 1, Data Shape Implications | If the user wants structured client payloads, the contract and CLI plan will change materially. |

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | contracts/server/cli work | ✓ | `v22.20.0` [VERIFIED: local env] | — |
| `pnpm` | workspace install/test commands | ✓ | `10.33.0` [VERIFIED: local env] | — |
| OpenAI API key | optional live model-backed parsing/embeddings | ✗ | `OPENAI_API_KEY` unset [VERIFIED: local env] | Use deterministic heuristic parsing and existing fallback embeddings. [VERIFIED: `packages/server/src/lib/embeddings.ts`] [ASSUMED] |

**Missing dependencies with no fallback:**
- None identified for an implementation that keeps live-model parsing optional. [VERIFIED: local env] [ASSUMED]

**Missing dependencies with fallback:**
- `OPENAI_API_KEY` is absent, so Phase 14 planning should not make live model access a hard gate. [VERIFIED: local env] [VERIFIED: `packages/server/src/lib/embeddings.ts`] [ASSUMED]

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest `3.2.4` in all workspace packages. [VERIFIED: `package.json`] [VERIFIED: `packages/server/package.json`] [VERIFIED: `packages/cli/package.json`] |
| Config file | none; package scripts call `vitest run`. [VERIFIED: `package.json`] [VERIFIED: `packages/server/package.json`] [VERIFIED: `packages/cli/package.json`] |
| Quick run command | `cd packages/server && pnpm exec vitest run src/lib/retrieval.test.ts src/lib/retrieval-workflow.test.ts src/routes/retrieval.test.ts` [VERIFIED: local run] |
| Full suite command | `pnpm test` [VERIFIED: `package.json`] |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| RETR-01 | CLI and request contract remain seed-only | cli + contract | `pnpm --filter @skill-shareer/contracts test && cd packages/cli && pnpm exec vitest run src/commands/retrieval.test.ts` [VERIFIED: local run] | ✅ |
| RETR-02 | Server parses seed into internal intent fields | unit | `cd packages/server && pnpm exec vitest run src/lib/retrieval.test.ts` [VERIFIED: local run] | ✅ |
| RETR-03 | Retrieval primary object is derived capsules | unit/integration | `cd packages/server && pnpm exec vitest run src/lib/retrieval.test.ts src/lib/retrieval-workflow.test.ts` [VERIFIED: local run] | ✅ |
| RETR-04 | Default response is distilled capsule-first output | contract + cli + route | `pnpm --filter @skill-shareer/contracts test && cd packages/server && pnpm exec vitest run src/routes/retrieval.test.ts && cd ../cli && pnpm exec vitest run src/commands/retrieval.test.ts` [VERIFIED: local run] | ✅ |
| CAPS-04 | Ranking uses problem/situation/stack/path signals while preserving governance | unit/integration | `cd packages/server && pnpm exec vitest run src/lib/retrieval.test.ts src/lib/retrieval-workflow.test.ts` [VERIFIED: local run] | ✅ |
| COMP-01 | Shared contracts remain the only source of truth | contract | `pnpm --filter @skill-shareer/contracts test` [VERIFIED: local run] | ✅ |
| COMP-03 | Legacy retrieval compatibility path remains available | route + cli | `cd packages/server && pnpm exec vitest run src/routes/retrieval.test.ts && cd ../cli && pnpm exec vitest run src/commands/retrieval.test.ts` [VERIFIED: local run] | ✅ |

### Sampling Rate
- **Per task commit:** targeted retrieval/contract/CLI Vitest command for touched package(s). [VERIFIED: local run]
- **Per wave merge:** `pnpm typecheck` plus targeted retrieval commands. [VERIFIED: `package.json`] [ASSUMED]
- **Phase gate:** targeted retrieval server tests, CLI retrieval tests, and contracts tests must be green; do not use `pnpm --filter @skill-shareer/server test` as the Phase 14 gate because unrelated server test failures currently exist. [VERIFIED: local run]

### Wave 0 Gaps
- [ ] Add contract tests for the new capsule-native retrieval response schema in `packages/contracts/src/index.test.ts`. [VERIFIED: `packages/contracts/src/index.test.ts`] [ASSUMED]
- [ ] Add server unit tests for parsed-intent extraction and profile-shortlist/capsule-rank score breakdowns in `packages/server/src/lib/retrieval.test.ts`. [VERIFIED: `packages/server/src/lib/retrieval.test.ts`] [ASSUMED]
- [ ] Add route tests that cover both v2 capsule-native success and legacy v1 compatibility behavior in `packages/server/src/routes/retrieval.test.ts`. [VERIFIED: `packages/server/src/routes/retrieval.test.ts`] [ASSUMED]
- [ ] Add CLI formatter/JSON tests for capsule-first distilled output in `packages/cli/src/commands/retrieval.test.ts`. [VERIFIED: `packages/cli/src/commands/retrieval.test.ts`] [ASSUMED]

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Existing session resolution in `resolveAuthContext()`. [VERIFIED: `packages/server/src/routes/retrieval.ts`] |
| V3 Session Management | yes | Existing bearer/session-token flow reused unchanged. [VERIFIED: `packages/server/src/lib/context.ts`] [VERIFIED: `packages/server/src/lib/session.ts`] [ASSUMED] |
| V4 Access Control | yes | Keep `requirePermission`, team access, approval, and security-level prefiltering before ranking. [VERIFIED: `packages/server/src/routes/retrieval.ts`] [VERIFIED: `packages/server/src/lib/retrieval/orchestrator.ts`] |
| V5 Input Validation | yes | Zod request/response validation in shared contracts and routes. [VERIFIED: `packages/contracts/src/domain/retrieval.ts`] [VERIFIED: `packages/server/src/routes/retrieval.ts`] |
| V6 Cryptography | yes | Continue using SHA-256 hashes for source/capsule identity and cache integrity; never hand-roll other crypto. [VERIFIED: `packages/server/src/lib/artifacts/derive.ts`] [VERIFIED: `packages/server/src/lib/import-export.ts`] |

### Known Threat Patterns for This Stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Cross-team or over-level capsule leakage | Information Disclosure | Filter eligible artifacts before profile recall/ranking, mirroring current knowledge-entry prefiltering. [VERIFIED: `packages/server/src/lib/retrieval/orchestrator.ts`] [ASSUMED] |
| Script or asset body leakage into retrieval output | Information Disclosure | Keep retrieval bound to `derived.profile` and `derived.capsules`; keep `clientManifest` metadata-only. [VERIFIED: `packages/contracts/src/domain/artifacts.ts`] [VERIFIED: `packages/server/src/lib/artifacts/derive.ts`] |
| Prompt injection or malicious phrasing inside references | Tampering | Treat parsed intent and summary as pure transforms over filtered text; never allow retrieved text to alter auth, routing, or execution policy. [VERIFIED: `packages/server/src/lib/retrieval/summary.ts`] [ASSUMED] |
| Contract drift between CLI and server during migration | Tampering / DoS | Land contract tests first and keep route/CLI parsing strictly schema-driven. [VERIFIED: `packages/contracts/src/domain/retrieval.ts`] [VERIFIED: `packages/server/src/routes/retrieval.ts`] [VERIFIED: `packages/cli/src/commands/retrieval.ts`] |

## Sources

### Primary (HIGH confidence)
- `.planning/ROADMAP.md` - Phase 14 scope, plan split, and milestone dependencies. [VERIFIED: `.planning/ROADMAP.md`]
- `.planning/REQUIREMENTS.md` - RETR/CAPS/COMP requirements and out-of-scope constraints. [VERIFIED: `.planning/REQUIREMENTS.md`]
- `.planning/phases/12-skill-artifact-canonical-model/12-RESEARCH.md` - prior guidance on additive artifact/capsule boundaries. [VERIFIED: `.planning/phases/12-skill-artifact-canonical-model/12-RESEARCH.md`]
- `.planning/phases/12-skill-artifact-canonical-model/12-03-SUMMARY.md` - explicit Phase 14 placeholder handoff for derivation content. [VERIFIED: `.planning/phases/12-skill-artifact-canonical-model/12-03-SUMMARY.md`]
- `.planning/phases/13-skill-import-export-pipeline/13-VERIFICATION.md` - verified artifact import/export and derived-output persistence state. [VERIFIED: `.planning/phases/13-skill-import-export-pipeline/13-VERIFICATION.md`]
- `packages/contracts/src/domain/retrieval.ts` - current seed-only request and flat response contract. [VERIFIED: `packages/contracts/src/domain/retrieval.ts`]
- `packages/contracts/src/domain/artifacts.ts` - current governed profile/capsule/client-manifest contract shapes. [VERIFIED: `packages/contracts/src/domain/artifacts.ts`]
- `packages/contracts/src/domain/operations.ts` - existing distilled export precedent. [VERIFIED: `packages/contracts/src/domain/operations.ts`]
- `packages/server/src/lib/retrieval/orchestrator.ts`, `packages/server/src/lib/retrieval/types.ts`, `packages/server/src/lib/retrieval/assembly.ts`, `packages/server/src/lib/retrieval/summary.ts` - current retrieval architecture and pure-helper boundaries. [VERIFIED: `packages/server/src/lib/retrieval/orchestrator.ts`] [VERIFIED: `packages/server/src/lib/retrieval/types.ts`] [VERIFIED: `packages/server/src/lib/retrieval/assembly.ts`] [VERIFIED: `packages/server/src/lib/retrieval/summary.ts`]
- `packages/server/src/lib/artifacts/derive.ts`, `packages/server/src/lib/artifacts/model.ts`, `packages/server/src/lib/import-export.ts`, `packages/server/src/lib/store.ts` - artifact derivation, persistence, payload storage, and cached outputs. [VERIFIED: `packages/server/src/lib/artifacts/derive.ts`] [VERIFIED: `packages/server/src/lib/artifacts/model.ts`] [VERIFIED: `packages/server/src/lib/import-export.ts`] [VERIFIED: `packages/server/src/lib/store.ts`]
- `packages/server/src/routes/retrieval.ts` and `packages/cli/src/commands/retrieval.ts` - current thin route and seed-only CLI behavior. [VERIFIED: `packages/server/src/routes/retrieval.ts`] [VERIFIED: `packages/cli/src/commands/retrieval.ts`]
- Local test runs on 2026-04-16 - contracts, CLI retrieval, targeted server retrieval, and environment availability. [VERIFIED: local run]

### Secondary (MEDIUM confidence)
- npm registry metadata for `zod`, `fastify`, `commander`, `vitest`, `typescript`, `tsx`, `pino`, and `@langchain/openai`. [VERIFIED: npm registry]

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - package.json, npm registry, and local environment were checked. [VERIFIED: `package.json`] [VERIFIED: npm registry] [VERIFIED: local env]
- Architecture: MEDIUM - current code seams are verified, but the precise v2 compatibility strategy is still a design recommendation. [VERIFIED: current codebase] [ASSUMED]
- Pitfalls: MEDIUM - the placeholder-derivation and governance risks are verified, but some migration-path details depend on the chosen v2 route strategy. [VERIFIED: current codebase] [ASSUMED]

**Research date:** 2026-04-16 [VERIFIED: system date]  
**Valid until:** 2026-05-16 for codebase-grounded findings; revisit sooner if Phase 14 changes route-version strategy. [VERIFIED: current date] [ASSUMED]

## RESEARCH COMPLETE
