# Phase 18: CLI Skill Lookup Commands - Research

**Researched:** 2026-04-19 [VERIFIED: codebase grep]
**Domain:** CLI skill lookup over governed skill artifacts in the existing retrieval stack [VERIFIED: codebase grep]
**Confidence:** HIGH [VERIFIED: codebase grep]

<user_constraints>
## User Constraints

### Locked Decisions
- Goal: enable users to search skills by content and retrieve skill IDs with metadata. [VERIFIED: codebase grep]
- CLI surface must support `skill search-by-content <text>`. [VERIFIED: codebase grep]
- Results must include skill ID, title, and brief metadata for each match. [VERIFIED: codebase grep]
- Command must support JSON output mode for agent-friendly consumption. [VERIFIED: codebase grep]
- Results must be permission-filtered by the caller's team and security level. [VERIFIED: codebase grep]
- Phase scope is limited to Phase 18; editing/history/review work belongs to later phases. [VERIFIED: codebase grep]

### Claude's Discretion
- Pick the most consistent Commander namespace and command shape for the new lookup command. [VERIFIED: codebase grep]
- Choose the shared contract location and exact request/response schema shape. [VERIFIED: codebase grep]
- Choose the server-side search helper and endpoint shape as long as governance matches existing patterns. [VERIFIED: codebase grep]

### Deferred Ideas (OUT OF SCOPE)
- Skill edit flow and history preservation are Phase 19. [VERIFIED: codebase grep]
- Skill edit review workflow is Phase 20. [VERIFIED: codebase grep]
- Logging work is Phases 21-22. [VERIFIED: codebase grep]
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SKED-01 | User can search skills by content text and receive matching skill IDs with brief metadata. [VERIFIED: codebase grep] | Add a dedicated artifact lookup contract, expose a thin Fastify search route guarded like retrieval, and add a nested `skill search-by-content` Commander command that prints text or JSON from the shared response schema. [VERIFIED: codebase grep] |
</phase_requirements>

## Summary

Phase 18 should be implemented as an additive artifact-search surface on top of the existing retrieval architecture, not as a new standalone subsystem. The codebase already has a stable pattern for Commander command registration, shared Zod contracts, thin Fastify routes, and governed artifact recall through `rankCapsules()` plus `isArtifactGovernanceEligible()`. [VERIFIED: codebase grep] The cheapest correct implementation is to reuse those seams and return artifact-level matches instead of capsule-level matches. [ASSUMED]

The most consistent CLI shape is a new nested `skill` command group with a `search-by-content` subcommand, because the CLI already uses nested groups for `team` and `member`, while flat verbs remain legacy knowledge operations. [VERIFIED: codebase grep] The most consistent permission story is to reuse `knowledge:search`, because the shared permission enum and CLI visibility model currently define no `skill:*` search permission. [VERIFIED: codebase grep] Reusing that permission for Phase 18 is a design recommendation rather than an explicit locked decision. [ASSUMED]

**Primary recommendation:** Add `packages/cli/src/commands/skill.ts`, a `skillLookup*` contract in `packages/contracts/src/domain/retrieval.ts`, and a thin `POST /v1/retrieval/skills/search-by-content` route backed by a server helper that ranks governed capsules and collapses them to unique artifacts. [ASSUMED]

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Commander | 14.0.3, published 2026-01-31 [VERIFIED: npm registry] | Nested CLI command surface for `skill search-by-content` [VERIFIED: codebase grep] | The repo already boots its CLI from Commander and Commander supports nested subcommands via `.command()`. [VERIFIED: codebase grep] [CITED: https://github.com/tj/commander.js] |
| Zod | 4.3.6, published 2026-01-22 [VERIFIED: npm registry] | Shared request/response schemas across CLI and server [VERIFIED: codebase grep] | Contracts already flow through shared Zod schemas, and Zod is the project's contract boundary. [VERIFIED: codebase grep] [CITED: https://zod.dev/] |
| Fastify | 5.8.5, published 2026-04-14 [VERIFIED: npm registry] | Thin HTTP route layer for the new search endpoint [VERIFIED: codebase grep] | Existing retrieval and operations routes parse contracts, resolve auth, and delegate. [VERIFIED: codebase grep] [CITED: https://fastify.dev/docs/latest/Reference/TypeScript/] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Vitest | 4.1.4, published 2026-04-09 [VERIFIED: npm registry] | Contract, CLI, and route/helper tests [VERIFIED: codebase grep] | Use for targeted package tests and thin-route/JSON-shape regression coverage. [VERIFIED: codebase grep] [CITED: https://vitest.dev/guide/cli.html] |
| Existing retrieval helpers | In-repo helpers, current workspace state [VERIFIED: codebase grep] | Governance filtering and content ranking over skill artifacts [VERIFIED: codebase grep] | Use `isArtifactGovernanceEligible()`, `buildProfileShortlist()`, `rankCapsules()`, and `getCapsuleRecords()` instead of inventing a second permission or ranking path. [VERIFIED: codebase grep] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| New nested `skill` command group [ASSUMED] | Add another flat root verb like `skill-search` [ASSUMED] | Flat verbs would be inconsistent with existing grouped namespaces and would make Phase 19/20 skill commands harder to extend cleanly. [VERIFIED: codebase grep] [ASSUMED] |
| Retrieval route plugin [ASSUMED] | Operations route plugin [ASSUMED] | This feature is a search/read concern guarded like retrieval, not an export/edit concern guarded like operations. [VERIFIED: codebase grep] [ASSUMED] |
| Artifact results derived from governed capsule ranking [ASSUMED] | New profile-only text matcher [ASSUMED] | Profile-only matching is simpler but weaker for content search because Phase 14 already invested in capsule-native content ranking. [VERIFIED: codebase grep] [ASSUMED] |

**Installation:**
```bash
npm view commander version
npm view zod version
npm view fastify version
npm view vitest version
```

**Version verification:** Current registry versions verified in this session: Commander `14.0.3`, Zod `4.3.6`, Fastify `5.8.5`, Vitest `4.1.4`. [VERIFIED: npm registry]

## Architecture Patterns

### Recommended Project Structure
```text
packages/
├── cli/src/commands/skill.ts           # New nested skill CLI namespace
├── contracts/src/domain/retrieval.ts   # Additive lookup request/response schemas
├── server/src/lib/retrieval/skill-lookup.ts  # Artifact-level lookup helper
└── server/src/routes/retrieval.ts      # Thin search route registration
```

### Pattern 1: Add Skill Commands As A Nested Commander Namespace
**What:** Create `const skill = program.command('skill')` and hang `search-by-content` below it. [ASSUMED] Commander explicitly supports nested subcommands, and the repo already uses that pattern for `team` and `member`. [VERIFIED: codebase grep] [CITED: https://github.com/tj/commander.js]
**When to use:** Use this for all new skill lifecycle commands starting in Phase 18 so Phases 19-20 extend one stable namespace. [ASSUMED]
**Example:**
```typescript
// Source: codebase pattern from packages/cli/src/commands/team.ts and Commander docs
const skill = program.command('skill').description('Search and manage skill artifacts');

skill
  .command('search-by-content')
  .argument('<text>', 'Search text')
  .option('--max-results <n>', 'Maximum number of matches', '10')
  .option('--json', 'Output JSON')
  .action(async (text, flags) => {
    // load session, call shared endpoint, print shared schema
  });
```

### Pattern 2: Keep The Route Thin And Reuse Retrieval Governance
**What:** Parse auth, require permission, parse body with Zod, delegate to one helper, and parse the helper response with the shared response schema. [VERIFIED: codebase grep]
**When to use:** Use this for the new lookup endpoint so business logic stays outside `routes/retrieval.ts`. [VERIFIED: codebase grep]
**Example:**
```typescript
// Source: codebase pattern from packages/server/src/routes/retrieval.ts
app.post('/v1/retrieval/skills/search-by-content', async (request) => {
  const auth = await resolveAuthContext(app.skillShareer, request);
  requirePermission(auth, 'knowledge:search');

  const query = skillLookupQuerySchema.parse(request.body);
  const result = await searchSkillsByContent(app.skillShareer, auth, query);

  return skillLookupResponseSchema.parse(result);
});
```

### Pattern 3: Rank Governed Capsules, Then Collapse To Unique Artifacts
**What:** Reuse the Phase 14 capsule pipeline for content relevance, then emit one result per `artifactId` using the highest-ranked capsule as the artifact score and reason. [ASSUMED]
**When to use:** Use this when the user wants skill IDs, not raw capsule payloads, but search quality should still follow the existing artifact-content ranking path. [ASSUMED]
**Example:**
```typescript
// Source: codebase pattern from packages/server/src/lib/retrieval/orchestrator.ts and capsule-recall.ts
const governanceFilters = {
  teamId: auth.activeTeamId,
  securityLevel: auth.securityLevel,
  isSystemAdmin: auth.subjectType === 'system-admin',
};

const ranked = rankCapsules(data.skillArtifacts ?? [], parseSeedIntent(query.text), governanceFilters, query.maxResults * 3);
const uniqueArtifacts = dedupeByArtifactId(ranked).slice(0, query.maxResults);
```

### Anti-Patterns to Avoid
- **New permission family for Phase 18:** The permission enum has no `skill:search`; changing auth surface now expands scope beyond the phase. [VERIFIED: codebase grep] [ASSUMED]
- **Searching `artifactFilePayloads` directly:** Payload storage includes activation-time content and bypasses the retrieval boundary that earlier phases established. [VERIFIED: codebase grep]
- **Returning one row per capsule:** The success criteria require skill IDs, so route and CLI output must be artifact-unique. [VERIFIED: codebase grep] [ASSUMED]
- **Putting business logic in the route or CLI formatter:** Existing patterns keep ranking/governance in helpers and presentation in `printResult()`. [VERIFIED: codebase grep]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Permission gating | A new ad hoc skill ACL path [ASSUMED] | `requirePermission(auth, 'knowledge:search')` plus existing CLI visibility checks [VERIFIED: codebase grep] | The current shared permission model only exposes knowledge-search for read search actions. [VERIFIED: codebase grep] |
| Team/level filtering | Inline artifact filters scattered across route/helper [ASSUMED] | `isArtifactGovernanceEligible()` and the same `teamId/securityLevel/isSystemAdmin` inputs Phase 14 already uses [VERIFIED: codebase grep] | This avoids cross-team leakage and keeps governance parity with capsule retrieval. [VERIFIED: codebase grep] |
| Search ranking | A fresh profile matcher disconnected from retrieval [ASSUMED] | `parseSeedIntent()` + `rankCapsules()` + artifact dedupe [VERIFIED: codebase grep] [ASSUMED] | The ranking and reason strings already exist on the artifact-content path. [VERIFIED: codebase grep] |
| CLI JSON output | Manual `console.log(JSON.stringify(...))` branches in every handler [ASSUMED] | `printResult()` with the shared schema object [VERIFIED: codebase grep] | The helper already standardizes human vs JSON output. [VERIFIED: codebase grep] |

**Key insight:** Phase 18 is mostly composition work; the risky part is preserving governance and artifact uniqueness while exposing a new command surface. [VERIFIED: codebase grep] [ASSUMED]

## Common Pitfalls

### Pitfall 1: Duplicate Skill IDs From Multiple Matching Capsules
**What goes wrong:** One artifact can produce several capsule hits, so the command can print the same skill ID more than once if the response is built directly from capsule matches. [VERIFIED: codebase grep] [ASSUMED]
**Why it happens:** `rankCapsules()` returns capsule candidates, not artifact candidates. [VERIFIED: codebase grep]
**How to avoid:** Dedupe on `artifactId` after ranking and keep the highest-scoring candidate as the artifact match. [ASSUMED]
**Warning signs:** JSON snapshots contain repeated `artifactId` values for the same query. [ASSUMED]

### Pitfall 2: Governance Drift Between Skill Lookup And v2 Retrieval
**What goes wrong:** Skill lookup can expose artifacts from another team or above the caller's level if it filters `skillArtifacts` manually instead of reusing the Phase 14 governance helper. [VERIFIED: codebase grep] [ASSUMED]
**Why it happens:** Export routes and retrieval routes enforce similar but separate read guards, so it is easy to copy the wrong pattern. [VERIFIED: codebase grep]
**How to avoid:** Centralize lookup filtering in one helper that consumes `isArtifactGovernanceEligible()`. [VERIFIED: codebase grep] [ASSUMED]
**Warning signs:** Tests equivalent to `otherTeamArtifact` or `highLevelArtifact` begin passing through search results. [VERIFIED: codebase grep]

### Pitfall 3: Putting The New Command In The Wrong CLI Surface
**What goes wrong:** The command works locally but is invisible in discoverability flows because `api:list` and top-level registration are not updated. [VERIFIED: codebase grep] [ASSUMED]
**Why it happens:** The root index owns both visibility flags and command registration. [VERIFIED: codebase grep]
**How to avoid:** Add the new registration in `packages/cli/src/index.ts` and include `skill search-by-content` in `api:list` when search permission is present. [VERIFIED: codebase grep] [ASSUMED]
**Warning signs:** `trapmap api:list` omits the new command even though `trapmap skill --help` shows it. [ASSUMED]

### Pitfall 4: Overexposing Artifact Data
**What goes wrong:** The search response leaks derived capsule bodies, payload content, or client-manifest details when the phase only needs IDs plus brief metadata. [VERIFIED: codebase grep] [ASSUMED]
**Why it happens:** Existing artifact export responses are broader than this feature. [VERIFIED: codebase grep]
**How to avoid:** Define a purpose-built lookup result schema with metadata-only fields. [ASSUMED]
**Warning signs:** The response shape starts resembling `distilledArtifactSchema` or `retrievalV2ResponseSchema`. [VERIFIED: codebase grep] [ASSUMED]

## Code Examples

Verified patterns from the current codebase:

### Commander Nested Group Pattern
```typescript
// Source: packages/cli/src/commands/team.ts
const team = program.command('team').description('Manage and inspect available teams');

team
  .command('list')
  .option('--json', 'Output JSON')
  .action(async (flags) => {
    const state = await loadCliState();
    requireSessionToken(state);
    const response = await apiRequest(state, { path: '/v1/teams' });
    printResult(response.data, flags, formatter);
  });
```

### Thin Route Pattern
```typescript
// Source: packages/server/src/routes/retrieval.ts
app.post('/v2/retrieval/search', async (request) => {
  const auth = await resolveAuthContext(app.skillShareer, request);
  requirePermission(auth, 'knowledge:search');
  const query = retrievalV2QuerySchema.parse(request.body);
  const result = await searchKnowledgeV2(app.skillShareer, auth, query);
  return retrievalV2ResponseWithHintsSchema.parse(result);
});
```

### Artifact Governance Pattern
```typescript
// Source: packages/server/src/lib/retrieval/capsule-recall.ts
if (artifact.lifecycleState !== 'approved') return false;
if (filters.isSystemAdmin) return true;
if (artifact.teamId !== null && artifact.teamId !== filters.teamId) return false;
if (filters.securityLevel < artifact.requiredLevel) return false;
return true;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| v1 retrieval returns knowledge entries and buckets them into `globalConstraints` / `projectKnowledge`. [VERIFIED: codebase grep] | v2 retrieval ranks governed skill capsules and returns capsule matches plus artifact profile hints. [VERIFIED: codebase grep] | Phase 14, completed 2026-04-16. [VERIFIED: codebase grep] | Phase 18 should search the artifact-native path instead of reviving legacy knowledge-entry search for skills. [VERIFIED: codebase grep] [ASSUMED] |
| Artifact export exposes whole bundle or distilled projections. [VERIFIED: codebase grep] | Phase 18 needs a metadata-only lookup response optimized for IDs and brief summaries. [VERIFIED: codebase grep] [ASSUMED] | Phase 18 planning scope. [VERIFIED: codebase grep] | Avoid coupling lookup consumers to export payloads. [ASSUMED] |

**Deprecated/outdated:**
- Using flat root verbs for new skill lifecycle work is outdated for this phase; future skill flows need a stable `skill ...` namespace. [VERIFIED: codebase grep] [ASSUMED]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Phase 18 should reuse `knowledge:search` instead of introducing `skill:search`. [ASSUMED] | Summary, Architecture Patterns, Don't Hand-Roll | Planner may under-scope auth changes if product intent actually requires a new permission. |
| A2 | The best endpoint home is `POST /v1/retrieval/skills/search-by-content` rather than an operations route. [ASSUMED] | Summary, Architecture Patterns | Planner may place the route in the wrong module and create churn in Phase 18 implementation. |
| A3 | Artifact search should rank capsules and collapse to artifacts instead of introducing a brand-new profile matcher. [ASSUMED] | Summary, Architecture Patterns, Don't Hand-Roll | If the team wants profile-only semantics, helper design and tests will need adjustment. |

## Open Questions (RESOLVED)

1. **Permission model for Phase 18**
   - Resolution: Phase 18 will reuse `knowledge:search` as the required permission for skill lookup.
   - Reason: the current shared permission enum, CLI visibility checks, and retrieval routes already use `knowledge:search` for read-search behavior, and Phase 18 is scoped to additive lookup rather than auth-surface expansion. [VERIFIED: codebase grep]
   - Follow-up boundary: if later milestones need separate policy between legacy knowledge search and artifact search, that should be introduced as a distinct auth phase rather than bundled into Phase 18. [ASSUMED]

2. **Minimum brief metadata returned by lookup**
   - Resolution: the shared lookup contract should return `artifactId`, `title`, `slug`, `labels`, `scope`, `requiredLevel`, `sourceKind`, `score`, and `reason`.
   - Reason: this satisfies the roadmap requirement for skill ID plus brief metadata, keeps text output informative enough for humans, and remains metadata-only without exposing capsule content or activation payloads. [ASSUMED]
   - Output guidance: text mode may choose a compact rendering, but the JSON contract should include the full metadata set above. [ASSUMED]

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | CLI/server execution and tests [VERIFIED: codebase grep] | ✓ [VERIFIED: local command] | 20.19.5 [VERIFIED: local command] | — |
| pnpm | Workspace package scripts [VERIFIED: codebase grep] | ✓ [VERIFIED: local command] | 10.33.0 [VERIFIED: local command] | `npm` can inspect registry versions, but workspace test/build scripts are defined for `pnpm`. [VERIFIED: codebase grep] [ASSUMED] |
| npm | Registry version verification [VERIFIED: npm registry] | ✓ [VERIFIED: local command] | 10.8.2 [VERIFIED: local command] | — |

**Missing dependencies with no fallback:**
- None identified for planning Phase 18. [VERIFIED: local command] [ASSUMED]

**Missing dependencies with fallback:**
- None identified for planning Phase 18. [VERIFIED: local command] [ASSUMED]

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.4 [VERIFIED: npm registry] |
| Config file | none discovered; packages use direct `vitest run` scripts. [VERIFIED: codebase grep] |
| Quick run command | `pnpm --filter @trapmap/contracts test -- src/index.test.ts && pnpm --filter @trapmap/server test -- src/lib/retrieval/capsule-recall.test.ts && pnpm --filter @trapmap/cli test -- src/commands/skill.test.ts` [VERIFIED: codebase grep] [ASSUMED] |
| Full suite command | `pnpm test` [VERIFIED: codebase grep] |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SKED-01 | Shared lookup request/response schemas validate defaults and metadata-only result shape. [ASSUMED] | contract | `pnpm --filter @trapmap/contracts test -- src/index.test.ts` [VERIFIED: codebase grep] | ✅ |
| SKED-01 | Server lookup helper returns only approved, in-team, within-level skill artifacts and dedupes artifacts with multiple capsule hits. [ASSUMED] | unit | `pnpm --filter @trapmap/server test -- src/lib/retrieval/skill-lookup.test.ts` [ASSUMED] | ❌ Wave 0 |
| SKED-01 | Retrieval route stays thin, enforces search permission, and returns the shared response schema. [ASSUMED] | route | `pnpm --filter @trapmap/server test -- src/routes/retrieval.test.ts` [VERIFIED: codebase grep] | ✅ |
| SKED-01 | CLI command prints stable human output and raw JSON from the shared schema. [ASSUMED] | CLI | `pnpm --filter @trapmap/cli test -- src/commands/skill.test.ts` [ASSUMED] | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** targeted package test for the touched package plus `pnpm --filter @trapmap/contracts typecheck` or package-local typecheck when contracts change. [VERIFIED: codebase grep] [ASSUMED]
- **Per wave merge:** `pnpm --filter @trapmap/contracts test && pnpm --filter @trapmap/server test && pnpm --filter @trapmap/cli test` [VERIFIED: codebase grep] [ASSUMED]
- **Phase gate:** `pnpm test && pnpm typecheck` before `/gsd-verify-work`. [VERIFIED: codebase grep]

### Wave 0 Gaps
- [ ] `packages/server/src/lib/retrieval/skill-lookup.test.ts` — covers governed artifact dedupe and ranking-to-artifact projection. [ASSUMED]
- [ ] `packages/cli/src/commands/skill.test.ts` — covers nested command registration, endpoint path, text output, and JSON output. [ASSUMED]
- [ ] `packages/cli/src/commands/skill.ts` — needed to keep future skill commands out of `retrieval.ts`. [ASSUMED]

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no [VERIFIED: codebase grep] | Existing session resolution only; Phase 18 does not add login/session flows. [VERIFIED: codebase grep] |
| V3 Session Management | no [VERIFIED: codebase grep] | Existing saved-session behavior only; no new session semantics. [VERIFIED: codebase grep] |
| V4 Access Control | yes [VERIFIED: codebase grep] | `requirePermission()` plus artifact governance filtering by team and security level. [VERIFIED: codebase grep] |
| V5 Input Validation | yes [VERIFIED: codebase grep] | Shared Zod request/response schemas in `@trapmap/contracts`. [VERIFIED: codebase grep] [CITED: https://zod.dev/] |
| V6 Cryptography | no [VERIFIED: codebase grep] | No new crypto behavior in this phase. [VERIFIED: codebase grep] |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Unauthorized artifact enumeration across teams [VERIFIED: codebase grep] | Information Disclosure | Reuse `isArtifactGovernanceEligible()` or equivalent gating before ranking or formatting. [VERIFIED: codebase grep] |
| Search results exposing high-security skills to lower-level users [VERIFIED: codebase grep] | Information Disclosure | Enforce `requiredLevel` checks before search result assembly. [VERIFIED: codebase grep] |
| Oversized or malformed search payloads [VERIFIED: codebase grep] | Denial of Service | Bound input with Zod, including text length and `maxResults`. [VERIFIED: codebase grep] |

## Sources

### Primary (HIGH confidence)
- Codebase grep and file reads:
  - `packages/cli/src/index.ts`
  - `packages/cli/src/commands/retrieval.ts`
  - `packages/cli/src/commands/team.ts`
  - `packages/server/src/routes/retrieval.ts`
  - `packages/server/src/routes/operations.ts`
  - `packages/server/src/lib/retrieval/orchestrator.ts`
  - `packages/server/src/lib/retrieval/capsule-recall.ts`
  - `packages/server/src/lib/store.ts`
  - `packages/contracts/src/domain/common.ts`
  - `packages/contracts/src/domain/retrieval.ts`
  - `packages/contracts/src/domain/operations.ts`
  - `packages/contracts/src/index.ts`
- npm registry verification:
  - `commander` `14.0.3` and publish timestamp `2026-01-31T01:47:17.592Z`
  - `zod` `4.3.6` and publish timestamp `2026-01-22T19:14:35.382Z`
  - `fastify` `5.8.5` and publish timestamp `2026-04-14T12:07:12.232Z`
  - `vitest` `4.1.4` and publish timestamp `2026-04-09T07:36:52.741Z`
- Official docs:
  - https://github.com/tj/commander.js
  - https://zod.dev/
  - https://fastify.dev/docs/latest/Reference/TypeScript/
  - https://vitest.dev/guide/cli.html

### Secondary (MEDIUM confidence)
- None beyond the primary sources listed above. [VERIFIED: source inventory]

### Tertiary (LOW confidence)
- None beyond the primary sources listed above. [VERIFIED: source inventory]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - package usage is visible in workspace manifests and current versions were verified against npm. [VERIFIED: codebase grep] [VERIFIED: npm registry]
- Architecture: HIGH - command registration, route shape, and governance helpers are already implemented in adjacent features. [VERIFIED: codebase grep]
- Pitfalls: MEDIUM - most are direct extrapolations from existing capsule/governance behavior rather than already-failed Phase 18 code. [VERIFIED: codebase grep] [ASSUMED]

**Research date:** 2026-04-19 [VERIFIED: codebase grep]
**Valid until:** 2026-05-03 for planning purposes unless the permission model or package versions change first. [ASSUMED]
