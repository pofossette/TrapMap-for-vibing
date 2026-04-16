# Phase 12: Skill Artifact Canonical Model - Research

**Researched:** 2026-04-16 [VERIFIED: system date]  
**Domain:** Additive artifact-first contracts and store evolution for skill-native retrieval on top of the existing knowledge/review/indexing stack [VERIFIED: `.planning/ROADMAP.md`] [VERIFIED: `.planning/REQUIREMENTS.md`] [VERIFIED: `packages/contracts/src/domain/knowledge.ts`] [VERIFIED: `packages/server/src/lib/store.ts`]  
**Confidence:** MEDIUM [VERIFIED: current repo state, package metadata, npm registry, and local validation baseline were reviewed]

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
No `*-CONTEXT.md` exists for Phase 12, so there are no additional locked decisions to copy verbatim. [VERIFIED: `node ".codex/get-shit-done/bin/gsd-tools.cjs" init phase-op "12"`] [VERIFIED: phase dir contents]

### Claude's Discretion
No `*-CONTEXT.md` exists for Phase 12, so recommendation latitude comes from the roadmap, requirements, AGENTS.md, and the direct phase prompt only. [VERIFIED: `node ".codex/get-shit-done/bin/gsd-tools.cjs" init phase-op "12"`] [VERIFIED: user prompt]

### Deferred Ideas (OUT OF SCOPE)
No `*-CONTEXT.md` exists for Phase 12, so there are no additional deferred ideas to copy verbatim. [VERIFIED: `node ".codex/get-shit-done/bin/gsd-tools.cjs" init phase-op "12"`]
</user_constraints>

## Summary

Phase 12 should be planned as an additive canonical-model phase, not a replacement migration. The current server, contracts, and store are still centered on `KnowledgeEntry` with immutable-ish revision history, approval/review metadata, scope/security governance, audit events, and lifecycle-driven indexing. [VERIFIED: `packages/contracts/src/domain/knowledge.ts`] [VERIFIED: `packages/server/src/lib/knowledge.ts`] [VERIFIED: `packages/server/src/lib/store.ts`] [VERIFIED: `packages/server/src/lib/indexing/pipeline.ts`] Phase 16 is the milestone phase explicitly assigned to migrate legacy entries into minimal skill artifacts, so Phase 12 should introduce new artifact-first shapes and storage beside the v1 model instead of rewriting existing routes or deleting `knowledgeEntries`. [VERIFIED: `.planning/ROADMAP.md`] [VERIFIED: `.planning/REQUIREMENTS.md`]

The current import path proves why an artifact-first model is needed. `parseClaudeSkill()` currently flattens a `SKILL.md` file into `shortcut/detail/labels/scope`, discarding directory structure and any distinction between `references/`, `assets/`, and `scripts/`. [VERIFIED: `packages/server/src/lib/import-export.ts`] At the same time, the retrieval/indexing stack already has a strong precedent for canonical normalization plus derived projections: one normalized document feeds all adapters, and derived artifacts such as `embeddingCache`, keyword persisted state, citations, and summaries are treated as downstream outputs rather than as the source of truth. [VERIFIED: `packages/server/src/lib/indexing/normalize.ts`] [VERIFIED: `packages/server/src/lib/indexing/types.ts`] [VERIFIED: `packages/server/src/lib/retrieval/citations.ts`] [VERIFIED: `packages/server/src/lib/retrieval/summary.ts`]

The clean Phase 12 boundary is therefore: shared contracts define canonical artifact, revision, file-manifest, derived profile, derived capsule, and derived client-manifest shapes; the server store persists those canonical records with governance inherited from the artifact root; derivation is deterministic and text-boundary-aware so only `SKILL.md` plus `references/` produce model-context capsules; `assets/` and `scripts/` remain activation-only metadata in this phase. [VERIFIED: `.planning/REQUIREMENTS.md`] [VERIFIED: `AGENTS.md`] [ASSUMED]

**Primary recommendation:** Add a new `SkillArtifact` aggregate with immutable `revisions[]`, canonical `files[]`, and cached `derived` outputs, keep governance at the artifact/revision boundary, and leave legacy `KnowledgeEntry` routes untouched until Phase 16. [VERIFIED: `.planning/ROADMAP.md`] [VERIFIED: `.planning/REQUIREMENTS.md`] [ASSUMED]

## Project Constraints (from AGENTS.md)

- Keep the monorepo separation between CLI, server, and shared contracts; shared schemas remain the only cross-package truth. [VERIFIED: `AGENTS.md`]
- Keep the CLI/API surface imperative and contract-driven; Phase 12 should not require CLI-side inference of artifact internals. [VERIFIED: `AGENTS.md`]
- Keep skill packaging Claude-compatible around `SKILL.md`, frontmatter, and directory-scoped assets. [VERIFIED: `AGENTS.md`]
- Keep retrieval text-only in v1.x; model-context derivation must stay text-first. [VERIFIED: `AGENTS.md`]
- Keep access control as role templates plus explicit permissions, enforced on the server. [VERIFIED: `AGENTS.md`]
- Do not recommend approaches that require server-side script execution, browser UI, or multimodal retrieval. [VERIFIED: `AGENTS.md`] [VERIFIED: `.planning/REQUIREMENTS.md`]

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ARTF-01 | 系统将 skill 目录作为一等导入对象，至少支持 `SKILL.md`、`references/`、`assets/`、`scripts/` [VERIFIED: `.planning/REQUIREMENTS.md`] | Make `fileManifest` the canonical per-revision file inventory with a required `kind` discriminator and path/hash metadata. [ASSUMED] |
| ARTF-02 | 服务端存储 skill artifact 元数据、文件清单、revision 与 source hash [VERIFIED: `.planning/REQUIREMENTS.md`] | Persist artifact root metadata plus immutable revisions and per-file SHA-256 hashes in `JsonStore`; do not flatten to `shortcut/detail`. [VERIFIED: `packages/server/src/lib/store.ts`] [VERIFIED: `packages/server/src/lib/import-export.ts`] [ASSUMED] |
| ARTF-03 | skill artifact 生命周期继续受现有审批、scope、security level 与 audit 约束 [VERIFIED: `.planning/REQUIREMENTS.md`] | Reuse current lifecycle, review, scope, required-level, and audit patterns at the artifact/revision layer instead of inventing a second governance system. [VERIFIED: `packages/contracts/src/domain/common.ts`] [VERIFIED: `packages/contracts/src/domain/knowledge.ts`] [VERIFIED: `packages/server/src/lib/knowledge.ts`] [VERIFIED: `packages/server/src/routes/review.ts`] |
| CAPS-01 | 系统从 `SKILL.md` 与 `references/` 派生 skill profile 与 knowledge capsules [VERIFIED: `.planning/REQUIREMENTS.md`] | Add deterministic `derived.profile` and `derived.capsules` outputs keyed to a revision hash, with capsule sources restricted to text-intended files. [ASSUMED] |
| CAPS-02 | `assets/` 不作为主要知识索引来源，文本资产如需进入模型上下文必须通过 `references/` [VERIFIED: `.planning/REQUIREMENTS.md`] | File manifests need an explicit inclusion boundary so `assets/*` can be delivered later but excluded from capsule derivation now. [ASSUMED] |
| CAPS-03 | `scripts/` 不进入模型上下文，仅保留能力描述、参数与副作用元数据 [VERIFIED: `.planning/REQUIREMENTS.md`] | Store script descriptors in the revision manifest and derived client manifest only; never store script bodies as capsules. [ASSUMED] |
| COMP-01 | `contracts` 继续作为 CLI 与 server 的唯一共享契约真源 [VERIFIED: `.planning/REQUIREMENTS.md`] | All new artifact/profile/capsule/client-manifest shapes should land in `packages/contracts/src/domain/*` before server wiring. [VERIFIED: `packages/contracts/src/index.ts`] |
| COMP-02 | 现有 RBAC、审批、team scope、security level 与审计流程在 v1.2 中保持有效 [VERIFIED: `.planning/REQUIREMENTS.md`] | Derived outputs inherit artifact governance; retrieval/activation phases should consume already-governed derived outputs rather than invent per-capsule ACLs. [VERIFIED: `packages/server/src/lib/retrieval/orchestrator.ts`] [VERIFIED: `packages/server/src/routes/review.ts`] [ASSUMED] |
</phase_requirements>

## Standard Stack

### Core
| Library / Module | Version | Purpose | Why Standard |
|------------------|---------|---------|--------------|
| Node.js | local `v22.20.0` [VERIFIED: local env] | Runtime for contracts tests, server code, and derivation helpers [VERIFIED: local env] | Already installed and used across the monorepo; Phase 12 should stay on the existing runtime. [VERIFIED: `package.json`] |
| TypeScript | workspace `^5.9.3`, npm current `6.0.2` [VERIFIED: `package.json`] [VERIFIED: npm registry] | Define shared schemas, store records, derivation types, and tests [VERIFIED: codebase grep] | The repo is already TS-first across contracts/server/cli. [VERIFIED: `AGENTS.md`] |
| Zod | contracts `^4.1.12`, server `^4.3.6`, npm current `4.3.6` [VERIFIED: `packages/contracts/package.json`] [VERIFIED: `packages/server/package.json`] [VERIFIED: npm registry] | Canonical contract schemas for artifact/revision/profile/capsule/client manifest [VERIFIED: `packages/contracts/src/domain/knowledge.ts`] | Existing contract source-of-truth pattern already uses Zod. [VERIFIED: `packages/contracts/src/index.ts`] |
| Fastify | workspace `^5.6.1`, npm current `5.8.5` [VERIFIED: `packages/server/package.json`] [VERIFIED: npm registry] | Existing route surface that will later expose artifact import/export/retrieval flows [VERIFIED: `packages/server/src/app.ts`] | Phase 12 should prepare server-internal domain/storage seams, not introduce a new transport. [VERIFIED: `AGENTS.md`] |
| Internal `JsonStore` | in-repo [VERIFIED: `packages/server/src/lib/store.ts`] | Persist artifact roots, revisions, file manifests, and cached derived outputs [VERIFIED: `packages/server/src/lib/store.ts`] | All current domain state already lives here, including lifecycle, audit, and index state. [VERIFIED: `packages/server/src/lib/store.ts`] |

### Supporting
| Library / Module | Version | Purpose | When to Use |
|------------------|---------|---------|-------------|
| Existing lifecycle/indexing modules | in-repo [VERIFIED: codebase grep] | Reuse canonical-normalization and derived-output patterns for artifacts [VERIFIED: `packages/server/src/lib/indexing/normalize.ts`] [VERIFIED: `packages/server/src/lib/indexing/pipeline.ts`] | Use as design precedent, not as a one-to-one storage model. [ASSUMED] |
| Existing retrieval citation/summary modules | in-repo [VERIFIED: codebase grep] | Show how derived outputs should remain downstream from governed source records [VERIFIED: `packages/server/src/lib/retrieval/citations.ts`] [VERIFIED: `packages/server/src/lib/retrieval/summary.ts`] | Use to justify cached `derived` projections keyed by revision. [ASSUMED] |
| Vitest | workspace `^3.2.4`, npm current `4.1.4` [VERIFIED: `package.json`] [VERIFIED: npm registry] | Contract tests and derivation/storage tests for Phase 12 [VERIFIED: repo tests] | Existing test runner; no new framework is justified. [VERIFIED: `package.json`] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Additive `SkillArtifact` records in `JsonStore` [ASSUMED] | Replacing `KnowledgeRecord` immediately [ASSUMED] | Immediate replacement conflicts with Phase 16’s explicit migration scope and would force compatibility work into Phase 12. [VERIFIED: `.planning/ROADMAP.md`] |
| Cached `derived` outputs on artifact revisions [ASSUMED] | Recomputing profile/capsules/client manifests on every read [ASSUMED] | Read-time derivation would repeat work and blur the canonical-vs-derived boundary that the indexing stack already separates. [VERIFIED: `packages/server/src/lib/indexing/normalize.ts`] [VERIFIED: `packages/server/src/lib/indexing/pipeline.ts`] |
| Explicit file kinds and inclusion rules [ASSUMED] | Inferring model-context eligibility from filename extensions alone [ASSUMED] | Extension-only rules are too weak to enforce `references/` vs `assets/` vs `scripts/` boundaries. [VERIFIED: `.planning/REQUIREMENTS.md`] |

**Installation:** No new external stack is required for Phase 12; keep the existing monorepo/runtime/tooling baseline. [VERIFIED: `package.json`] [ASSUMED]

## Architecture Patterns

### Recommended Project Structure
```text
packages/
├── contracts/src/domain/
│   ├── skill-artifact.ts      # canonical artifact/revision/file/derived schemas [ASSUMED]
│   └── operations.ts          # later request/response wiring consumes canonical schemas [ASSUMED]
└── server/src/lib/
    ├── artifacts/
    │   ├── model.ts           # store-record helpers and mappers [ASSUMED]
    │   ├── derive.ts          # profile/capsule/client-manifest derivation [ASSUMED]
    │   └── files.ts           # file-manifest classification and hashing [ASSUMED]
    └── store.ts               # additive StoreData arrays/types for artifacts [ASSUMED]
```

### Pattern 1: Artifact Root + Immutable Revisions
**What:** Model the skill as one governed artifact root with metadata that changes slowly, plus immutable revisions that capture source file manifests and derived outputs. [ASSUMED]  
**When to use:** Use for every imported/exported skill directory and for the minimal auto-wrapped artifact introduced later in Phase 13/16. [VERIFIED: `.planning/ROADMAP.md`] [ASSUMED]

**Recommended canonical shape:**
```typescript
// Source basis: existing KnowledgeEntry governance model + Phase 12 requirements
const skillArtifactSchema = z.object({
  id: entityIdSchema,
  teamId: entityIdSchema.nullable(),
  scope: scopeSchema,
  requiredLevel: securityLevelSchema,
  lifecycleState: lifecycleStateSchema,
  owner: actorRefSchema,
  slug: z.string().min(1).max(160),
  title: z.string().min(1).max(280),
  activeRevision: z.number().int().min(1),
  metadata: z.object({
    sourceKind: z.enum(['skill-directory', 'single-skill-md', 'legacy-knowledge']),
    submissionCount: z.number().int().min(0),
    revisionCount: z.number().int().min(1),
    latestSubmissionId: entityIdSchema.nullable(),
    latestSubmittedAt: isoTimestampSchema.nullable(),
    latestReviewedAt: isoTimestampSchema.nullable(),
    latestDecision: z.enum(['approve', 'reject']).nullable(),
  }),
  revisions: z.array(skillArtifactRevisionSchema).min(1),
  reviewHistory: z.array(reviewDecisionSchema).default([]),
  reviewNotes: z.array(reviewNoteSchema).default([]),
  lifecycleHistory: z.array(skillArtifactLifecycleEventSchema).default([]),
}).merge(auditMetadataSchema);
```
[ASSUMED]

**Why this pattern fits the repo:** Current `KnowledgeEntry` already centralizes governance, lifecycle history, submissions, and audit-friendly reviewer metadata on one root entity. [VERIFIED: `packages/contracts/src/domain/knowledge.ts`] [VERIFIED: `packages/server/src/lib/knowledge.ts`] Phase 12 should preserve that pattern while changing the content model from flat text to file-backed revisions. [ASSUMED]

### Pattern 2: File Manifest Is Canonical; Derived Outputs Are Cached Projections
**What:** Each revision should carry a canonical `files[]` manifest, and every derived profile/capsule/client-manifest payload should reference those files by `fileId` or `path`, not duplicate source content as the source of truth. [ASSUMED]  
**When to use:** Use whenever downstream phases need import/export parity, deterministic derivation, or activation metadata. [VERIFIED: `.planning/ROADMAP.md`] [VERIFIED: `.planning/REQUIREMENTS.md`]

**Recommended file-manifest shape:**
```typescript
const skillArtifactFileSchema = z.object({
  id: entityIdSchema,
  path: z.string().min(1).max(512),
  kind: z.enum(['skill', 'reference', 'asset', 'script']),
  mediaType: z.string().min(1).max(160),
  sha256: z.string().length(64),
  sizeBytes: z.number().int().min(0),
  textSource: z.boolean(),
  modelContextEligible: z.boolean(),
  activationEligible: z.boolean(),
  notes: z.array(z.string()).default([]),
});
```
[ASSUMED]

**Current-code precedent:** The indexing stack already treats `NormalizedIndexDocument` as canonical input and vector/keyword/graph payloads as derived state keyed by revision and content hash. [VERIFIED: `packages/server/src/lib/indexing/types.ts`] [VERIFIED: `packages/server/src/lib/indexing/normalize.ts`] [VERIFIED: `packages/server/src/lib/indexing/pipeline.ts`] Phase 12 should copy that source-vs-derived separation. [ASSUMED]

### Pattern 3: Governance Lives on Artifact/Revision, Not on Capsules
**What:** Capsules, profiles, and client manifests should inherit artifact governance instead of carrying their own independent ACL or review state. [ASSUMED]  
**When to use:** Always. Capsules are retrieval units, not governance units. [ASSUMED]

**Why:** Current retrieval security works because approval, team access, and security level are enforced before recall runs. [VERIFIED: `packages/server/src/lib/retrieval/orchestrator.ts`] [VERIFIED: `packages/server/src/routes/review.ts`] [VERIFIED: `packages/server/src/routes/knowledge.ts`] Giving capsules their own approval/security state would duplicate those rules and create drift. [ASSUMED]

### Pattern 4: Derivation Boundaries by Directory Role
**What:**  
- `SKILL.md`: profile seed and top-level capsule seed. [ASSUMED]  
- `references/`: capsule sources and optional activation targets. [ASSUMED]  
- `assets/`: activation-only metadata, never primary capsule input. [VERIFIED: `.planning/REQUIREMENTS.md`] [ASSUMED]  
- `scripts/`: activation-only metadata plus declared capability/policy, never model-context content. [VERIFIED: `.planning/REQUIREMENTS.md`] [ASSUMED]

**Current-code precedent:** The existing import path has no directory-role distinction and therefore cannot satisfy the v1.2 requirements without a new canonical model. [VERIFIED: `packages/server/src/lib/import-export.ts`]  

### Anti-Patterns to Avoid

- **Flattening artifacts back to `shortcut/detail` during storage:** That recreates the current lossy import model and blocks Phase 13 export parity. [VERIFIED: `packages/server/src/lib/import-export.ts`] [VERIFIED: `.planning/ROADMAP.md`]
- **Treating derived capsules as reviewable source documents:** Approval should remain on artifact revisions, not on every generated derivative. [VERIFIED: `packages/contracts/src/domain/knowledge.ts`] [ASSUMED]
- **Storing `assets/` or `scripts/` text as capsule bodies:** This violates `CAPS-02` and `CAPS-03`. [VERIFIED: `.planning/REQUIREMENTS.md`]
- **Using the current graph adapter’s in-memory cache pattern for canonical artifacts:** `graph.ts` is intentionally lightweight and in-memory; Phase 12 needs durable canonical storage. [VERIFIED: `packages/server/src/lib/indexing/adapters/graph.ts`]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Governance history for artifacts | A brand-new approval/review schema family [ASSUMED] | Reuse the current lifecycle/review note/decision patterns and adapt them to artifact/revision IDs. [VERIFIED: `packages/contracts/src/domain/knowledge.ts`] [VERIFIED: `packages/server/src/lib/knowledge.ts`] | Keeps review, audit, and Phase 16 compatibility aligned. [ASSUMED] |
| Derived-output invalidation | Ad hoc booleans like `needsProfileRefresh` and `needsCapsuleRefresh` scattered across records [ASSUMED] | Derive outputs from revision/file hashes and store `sourceHash` / `derivedAt` metadata per derived projection. [ASSUMED] | The indexing pipeline already proves content-hash-based idempotency is the right seam here. [VERIFIED: `packages/server/src/lib/indexing/normalize.ts`] [VERIFIED: `packages/server/src/lib/indexing/pipeline.ts`] |
| Model-context eligibility | Heuristics buried in retrieval code [ASSUMED] | Explicit manifest flags such as `kind`, `textSource`, `modelContextEligible`, and `activationEligible`. [ASSUMED] | Phase 14 and 15 need stable boundaries without reparsing file paths differently. [VERIFIED: `.planning/ROADMAP.md`] |
| Compatibility bridge | Immediate rewrite of `/v1/knowledge` routes to artifact semantics [ASSUMED] | Add new artifact model first and preserve legacy entry routes until Phase 16. [VERIFIED: `.planning/ROADMAP.md`] | Keeps Phase 12 focused and avoids compatibility rework. [VERIFIED: `.planning/ROADMAP.md`] |

**Key insight:** Phase 12 is the “canonical source and derivation boundary” phase, not the “new retrieval behavior” phase and not the “migration” phase. [VERIFIED: `.planning/ROADMAP.md`] [ASSUMED]

## Common Pitfalls

### Pitfall 1: Making the Revision the Governance Root
**What goes wrong:** Review/audit/scope/security logic gets duplicated across revisions, and later retrieval has to guess which revision owns policy. [ASSUMED]  
**Why it happens:** Artifact-first designs often confuse immutable content revisions with the governed aggregate root. [ASSUMED]  
**How to avoid:** Keep artifact root governance plus an `activeRevision` pointer; revisions stay immutable content snapshots with inherited governance. [ASSUMED]  
**Warning signs:** Proposed schemas put `scope`, `requiredLevel`, or `lifecycleState` only on revisions and not on the artifact root. [ASSUMED]

### Pitfall 2: Letting `assets/` Leak into Capsules
**What goes wrong:** Activation payloads become part of model context, reintroducing the oversized-context problem Phase 14/15 are trying to avoid. [VERIFIED: `.planning/REQUIREMENTS.md`] [ASSUMED]  
**Why it happens:** It is tempting to treat any text-like file as searchable knowledge. [ASSUMED]  
**How to avoid:** Require `kind === 'reference' || kind === 'skill'` for capsule derivation in Phase 12. [ASSUMED]  
**Warning signs:** Capsule code references `assets/` paths or infers inclusion from MIME type alone. [ASSUMED]

### Pitfall 3: Storing Script Bodies as Retrieval Content
**What goes wrong:** The server begins acting as a script-distribution-and-context engine instead of a governed text retrieval system. [VERIFIED: `.planning/REQUIREMENTS.md`] [ASSUMED]  
**Why it happens:** Script files are often text, so naive derivation treats them like references. [ASSUMED]  
**How to avoid:** Store script metadata only in Phase 12: path, hash, declared purpose, parameter hints, side effects, and default execution policy. [ASSUMED]  
**Warning signs:** Client manifest and capsules both include the full script body. [ASSUMED]

### Pitfall 4: Reusing Legacy Import Shapes as the Canonical Contract
**What goes wrong:** Phase 13 import/export still cannot round-trip a real skill directory because the canonical shape has already thrown away path and kind information. [VERIFIED: `packages/server/src/lib/import-export.ts`] [VERIFIED: `.planning/ROADMAP.md`]  
**Why it happens:** The current system already parses `SKILL.md` into `KnowledgeSubmission`, so the easiest short-term move is to keep that shape. [VERIFIED: `packages/server/src/lib/import-export.ts`]  
**How to avoid:** Make the canonical contract file-backed first; keep flattening only as a compatibility import mode later. [VERIFIED: `.planning/ROADMAP.md`] [ASSUMED]  
**Warning signs:** Proposed Phase 12 contracts have no `files[]` or `revision.sourceHash`. [ASSUMED]

### Pitfall 5: Coupling Phase 12 to Retrieval Ranking Details
**What goes wrong:** Phase 12 over-specifies ranking fields that belong to Phase 14 and forces later rework. [VERIFIED: `.planning/ROADMAP.md`] [ASSUMED]  
**Why it happens:** Capsules are a retrieval unit, so it is easy to bake retrieval scoring assumptions into their stored contract too early. [ASSUMED]  
**How to avoid:** Store capsule identity, source references, and distilled text fields only; ranking stays a retrieval concern. [ASSUMED]  
**Warning signs:** Capsule schema includes score boosts, rerank data, or parsed seed intent fields. [ASSUMED]

## Code Examples

Verified current seams that Phase 12 should build on:

### Current Lossy `SKILL.md` Import
```typescript
// Source: packages/server/src/lib/import-export.ts
const name = frontmatter['name'];
const description = frontmatter['description'] ?? '';
const detailContent = body.trim() || description;

return {
  scope: 'project',
  labels: ['imported', 'skill'],
  shortcut: name,
  detail: detailContent,
};
```
[VERIFIED: `packages/server/src/lib/import-export.ts`]

### Current Canonical-Normalization Pattern
```typescript
// Source: packages/server/src/lib/indexing/normalize.ts
export function normalizeKnowledgeIndexDocument(
  entry: KnowledgeRecord,
): NormalizedIndexDocument {
  const canonicalText = buildCanonicalText(entry);
  const tokens = buildTokens(canonicalText);
  const contentHash = buildContentHash(canonicalText);

  return {
    entryId: entry.id,
    teamId: entry.teamId,
    scope: entry.scope,
    requiredLevel: entry.requiredLevel,
    lifecycleState: entry.lifecycleState,
    revision: entry.history.length,
    shortcut: entry.shortcut,
    detail: entry.detail,
    labels: entry.labels,
    canonicalText,
    tokens,
    contentHash,
    normalizedAt: new Date().toISOString(),
  };
}
```
[VERIFIED: `packages/server/src/lib/indexing/normalize.ts`]

### Current Review/Lifecycle Mutation Pattern
```typescript
// Source: packages/server/src/lib/knowledge.ts
args.entry.reviewHistory.push(reviewDecision);
args.entry.reviewNotes.push(note);
args.entry.lifecycleState = args.decision === 'approve' ? 'approved' : 'rejected';
args.entry.lifecycleHistory.push(
  createLifecycleEvent(args.store, args.data, {
    type: args.decision === 'approve' ? 'reviewer-approved' : 'reviewer-rejected',
    createdAt: args.decidedAt,
    actorUserId: args.reviewerUserId,
    submissionId: latestSubmission?.id ?? null,
    revision: args.entry.latestRevision.revision,
    state: args.entry.lifecycleState,
    note: args.notes,
  }),
);
```
[VERIFIED: `packages/server/src/lib/knowledge.ts`]

### Recommended Derived Output Envelope
```typescript
// Source basis: current index-state + summary/citation derived-output pattern
const skillArtifactDerivedSchema = z.object({
  profile: skillProfileSchema.nullable(),
  capsules: z.array(skillCapsuleSchema).default([]),
  clientManifest: skillClientManifestSchema.nullable(),
  sourceHash: z.string().length(64),
  derivedAt: isoTimestampSchema,
});
```
[ASSUMED]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single `SKILL.md` imports flatten to `KnowledgeSubmission { shortcut, detail, labels, scope }`. [VERIFIED: `packages/server/src/lib/import-export.ts`] | v1.2 Phase 12 needs file-backed skill artifacts with revisions and manifests. [VERIFIED: `.planning/ROADMAP.md`] [VERIFIED: `.planning/REQUIREMENTS.md`] | Milestone v1.2 was defined on 2026-04-16. [VERIFIED: `.planning/STATE.md`] | Canonical storage must stop discarding directory structure. [ASSUMED] |
| Search/indexing currently derive projections from canonical source records and persist adapter state by content hash. [VERIFIED: `packages/server/src/lib/indexing/pipeline.ts`] [VERIFIED: `packages/server/src/lib/indexing/types.ts`] | Phase 12 should apply the same pattern to profile/capsule/client-manifest derivation. [ASSUMED] | Pattern established in v1.1 phases 8-11. [VERIFIED: `.planning/phases/08-索引生命周期/08-RESEARCH.md`] [VERIFIED: `.planning/phases/11-索引生命周期集成/11-RESEARCH.md`] | Keeps canonical source and cached derived outputs separate. [ASSUMED] |
| Retrieval still operates on flat `KnowledgeEntry` records. [VERIFIED: `packages/server/src/lib/retrieval/orchestrator.ts`] | Phase 14 will switch retrieval’s main object to skill-derived capsules. [VERIFIED: `.planning/ROADMAP.md`] [VERIFIED: `.planning/REQUIREMENTS.md`] | Planned for v1.2. [VERIFIED: `.planning/ROADMAP.md`] | Phase 12 should define capsule identity and source references now, but not ranking logic yet. [ASSUMED] |

**Deprecated/outdated:**

- Treating flattened `shortcut/detail` as the only canonical imported-skill representation is outdated for v1.2. [VERIFIED: `packages/server/src/lib/import-export.ts`] [VERIFIED: `.planning/REQUIREMENTS.md`]
- Using in-memory-only caches for canonical artifact state is outdated for this phase; durable store records are required. [VERIFIED: `packages/server/src/lib/indexing/adapters/graph.ts`] [ASSUMED]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `SkillArtifact` should be added additively beside `KnowledgeEntry` rather than replacing it in Phase 12. | Summary, Standard Stack, Don’t Hand-Roll | Planner may under-scope migration work if the user actually wants immediate replacement. |
| A2 | Governance should live on the artifact root with revisions inheriting scope/level/lifecycle rather than owning independent policy. | Architecture Patterns, Pitfalls | If revision-level policy is required, the contract model needs more complexity. |
| A3 | `fileManifest` should include explicit inclusion flags such as `modelContextEligible` and `activationEligible`. | Architecture Patterns, Don’t Hand-Roll | If the team prefers purely derived flags, Phase 13/15 may compute these instead of persisting them. |
| A4 | `derived.profile`, `derived.capsules`, and `derived.clientManifest` should be cached on revisions with `sourceHash` and `derivedAt`. | Summary, Architecture Patterns | If derivation is kept fully ephemeral, storage work would be smaller but retrieval/import/export phases would repeat work. |
| A5 | Phase 12 should not yet introduce new public artifact routes and should stay focused on contracts/store/derivation seams. | Summary, Validation | If the planner wants vertical slices with routes now, tasks must widen. |

## Open Questions (RESOLVED)

1. **Should `title` be strictly sourced from frontmatter `name`, or can it fall back to body content when frontmatter is incomplete?** [VERIFIED: current parser requires `name` in frontmatter via `parseClaudeSkill()`]
Resolution: keep the canonical artifact/profile contracts strict in Phase 12 and require the title to come from validated skill metadata, matching today’s `parseClaudeSkill()` expectation. [VERIFIED: `packages/server/src/lib/import-export.ts`] Looser inputs belong to Phase 13 compatibility import wrapping, not to the canonical Phase 12 contract layer. [VERIFIED: `.planning/ROADMAP.md`] [ASSUMED]

2. **Should `references/` content be stored inline in revision records or only as file metadata plus detached content blobs?** [ASSUMED]
Resolution: store text content inline for Phase 12 because the current `JsonStore` is a single durable JSON document and no detached blob store exists yet. [VERIFIED: `packages/server/src/lib/store.ts`] Keep file metadata and derived-output boundaries explicit so a later persistence move is mechanical rather than structural. [ASSUMED]

3. **Does the team want artifact-scoped audit actions now, or is reusing generic `knowledge-*` audit actions acceptable until Phase 13/16?** [VERIFIED: current audit action enum is still knowledge-centric in `operations.ts` contracts]
Resolution: Phase 12 should preserve the current knowledge-centric audit route surface and prove coexistence with it; artifact-specific audit action enums should wait until the first route phase that can actually emit them. [VERIFIED: `packages/contracts/src/domain/operations.ts`] [VERIFIED: `packages/server/src/routes/operations.ts`] [VERIFIED: `.planning/ROADMAP.md`] This keeps Phase 12 additive and route-light while still meeting COMP-02 through coexistence regression coverage. [ASSUMED]

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | contracts tests, server code, derivation helpers [VERIFIED: repo scripts] | ✓ [VERIFIED: local env] | `v22.20.0` [VERIFIED: local env] | — |
| pnpm | workspace test/typecheck commands [VERIFIED: `package.json`] | ✓ [VERIFIED: local env] | `10.33.0` [VERIFIED: local env] | — |
| npm | package version verification [VERIFIED: research commands] | ✓ [VERIFIED: local env] | `11.6.2` [VERIFIED: local env] | — |

**Missing dependencies with no fallback:** None identified for a contracts/store-only implementation path. [VERIFIED: local env] [ASSUMED]

**Missing dependencies with fallback:** None identified. [VERIFIED: local env]

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest `3.2.4` in workspace [VERIFIED: `package.json`] |
| Config file | none; package scripts call `vitest run` directly [VERIFIED: `packages/server/package.json`] [VERIFIED: `packages/contracts/package.json`] |
| Quick smoke command | `pnpm --filter @skill-shareer/contracts test -- src/index.test.ts` [ASSUMED: Phase 12 should keep one sub-30s contract smoke target] |
| Quick run command | `pnpm --filter @skill-shareer/contracts test && pnpm --filter @skill-shareer/server test -- src/lib/indexing/pipeline.test.ts src/routes/operations.test.ts` [VERIFIED: local runs] [ASSUMED: add new Phase 12 tests to these targets] |
| Full suite command | `pnpm test && pnpm --filter @skill-shareer/server typecheck` [VERIFIED: `package.json`] [VERIFIED: local runs] |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ARTF-01 | Canonical contracts accept directory-backed skill artifact structures with `skill/reference/asset/script` file kinds. [ASSUMED] | contract | `pnpm --filter @skill-shareer/contracts test` [VERIFIED: local run] | `packages/contracts/src/index.test.ts` exists; Phase 12 cases need to be added. [VERIFIED: repo files] |
| ARTF-02 | Store/mappers persist artifact metadata, revisions, file manifests, and source hashes without flattening. [ASSUMED] | unit | `pnpm --filter @skill-shareer/server test -- src/lib/artifacts/model.test.ts` [ASSUMED] | ❌ Wave 0 |
| ARTF-03 | Artifact lifecycle/governance preserves scope, level, review, and audit inheritance. [ASSUMED] | unit/integration | `pnpm --filter @skill-shareer/server test -- src/lib/artifacts/model.test.ts src/routes/review.test.ts` [ASSUMED] | route tests exist; artifact-specific tests do not. [VERIFIED: repo files] |
| CAPS-01 | Derivation generates stable profile and capsules from `SKILL.md` + `references/`. [ASSUMED] | unit | `pnpm --filter @skill-shareer/server test -- src/lib/artifacts/derive.test.ts` [ASSUMED] | ❌ Wave 0 |
| CAPS-02 | `assets/` are excluded from capsule derivation and retained only for activation metadata. [ASSUMED] | unit | `pnpm --filter @skill-shareer/server test -- src/lib/artifacts/derive.test.ts` [ASSUMED] | ❌ Wave 0 |
| CAPS-03 | `scripts/` never become capsule content and only emit capability/policy metadata. [ASSUMED] | unit | `pnpm --filter @skill-shareer/server test -- src/lib/artifacts/derive.test.ts` [ASSUMED] | ❌ Wave 0 |
| COMP-01 | Contracts remain the canonical shared truth for artifact/profile/capsule/client manifest shapes. [VERIFIED: `.planning/REQUIREMENTS.md`] | contract | `pnpm --filter @skill-shareer/contracts test` [VERIFIED: local run] | existing contract test file exists. [VERIFIED: repo files] |
| COMP-02 | New artifact records do not break current governance boundaries. [VERIFIED: `.planning/REQUIREMENTS.md`] | smoke/manual + unit | `pnpm --filter @skill-shareer/server test -- src/routes/review.test.ts src/routes/knowledge.test.ts src/routes/operations.test.ts` [ASSUMED] | existing route tests exist; Phase 12 should extend them with additive artifact coexistence coverage. [VERIFIED: repo files] |

### Sampling Rate

- **Per task commit:** `pnpm --filter @skill-shareer/contracts test` plus the smallest affected server test target. [VERIFIED: existing scripts] [ASSUMED]
- **Per wave merge:** `pnpm test`. [VERIFIED: `package.json`]
- **Phase gate:** `pnpm test && pnpm --filter @skill-shareer/server typecheck`, after absorbing current baseline failures. [VERIFIED: local runs] [ASSUMED]

### Wave 0 Gaps

- [ ] `packages/server/src/lib/artifacts/model.test.ts` — canonical store record and mapper coverage for ARTF-02/03. [ASSUMED]
- [ ] `packages/server/src/lib/artifacts/derive.test.ts` — deterministic derivation coverage for CAPS-01/02/03. [ASSUMED]
- [ ] `packages/contracts/src/index.test.ts` additions — schema coverage for artifact/revision/file/profile/capsule/client-manifest contracts. [ASSUMED]
- [ ] Export surface repair in `@skill-shareer/contracts` / server compile path — current server typecheck fails on contract/export drift and adapter interface mismatches before any Phase 12 work. [VERIFIED: `pnpm --filter @skill-shareer/server typecheck` run on 2026-04-16]
- [ ] Retrieval/indexing red-baseline triage — current server tests include failing summary/citation and adapter remove cases unrelated to Phase 12 planning. [VERIFIED: `pnpm --filter @skill-shareer/server test -- src/lib/indexing/pipeline.test.ts src/lib/retrieval/summary.test.ts src/lib/retrieval/citations.test.ts src/routes/operations.test.ts` run on 2026-04-16]

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes [VERIFIED: current server auth/session routes exist] | Existing session/auth flow; artifact routes should reuse `resolveAuthContext()`. [VERIFIED: `packages/server/src/app.ts`] [VERIFIED: `packages/server/src/lib/context.ts`] |
| V3 Session Management | yes [VERIFIED: current session model exists] | Existing bearer/session token handling. [VERIFIED: `packages/server/src/lib/context.ts`] |
| V4 Access Control | yes [VERIFIED: project constraints and current routes] | Keep `requirePermission`, `requireTeamAccess`, and `requireHigherLevel` as the enforcement model. [VERIFIED: `packages/server/src/routes/review.ts`] [VERIFIED: `packages/server/src/routes/knowledge.ts`] [VERIFIED: `packages/server/src/routes/operations.ts`] |
| V5 Input Validation | yes [VERIFIED: current contracts pattern] | Zod schemas in `packages/contracts` remain the canonical validation layer. [VERIFIED: `packages/contracts/src/index.ts`] |
| V6 Cryptography | yes [VERIFIED: Phase 12 requires source hashes] | Use existing Node crypto SHA-256 hashing pattern; never hand-roll file hashing. [VERIFIED: `packages/server/src/lib/store.ts`] [ASSUMED: reuse same Node crypto approach for artifact files] |

### Known Threat Patterns for This Phase

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Unauthorized access to artifact-derived capsules or manifests | Information Disclosure | Inherit artifact/team/security governance and filter before retrieval or export. [VERIFIED: current retrieval and route enforcement] [ASSUMED] |
| Script body leakage into model context | Information Disclosure / Elevation | Exclude `scripts/` from capsules and only expose script metadata plus policy. [VERIFIED: `.planning/REQUIREMENTS.md`] [ASSUMED] |
| Asset poisoning into search context | Tampering | Only `SKILL.md` and `references/` are model-context eligible in Phase 12. [VERIFIED: `.planning/REQUIREMENTS.md`] [ASSUMED] |
| Hash drift between canonical files and derived outputs | Tampering | Persist per-file SHA-256 and revision `sourceHash`; invalidate derived outputs on hash change. [ASSUMED] |
| Compatibility break from changing shared contracts without coordinated server updates | Denial of Service | Land contracts first, then server/store wiring, and keep legacy knowledge routes compiling until migration phase. [VERIFIED: `.planning/REQUIREMENTS.md`] [VERIFIED: current server typecheck drift] [ASSUMED] |

## Sources

### Primary (HIGH confidence)

- `.planning/ROADMAP.md` - Phase 12 scope and downstream dependency boundaries. [VERIFIED: codebase grep]
- `.planning/REQUIREMENTS.md` - ARTF/CAPS/COMP requirements and out-of-scope constraints. [VERIFIED: codebase grep]
- `AGENTS.md` - project constraints around contracts, CLI boundaries, text-only retrieval, and Claude-compatible skills. [VERIFIED: codebase grep]
- `packages/contracts/src/domain/knowledge.ts` - current governance/revision/review schema pattern. [VERIFIED: codebase grep]
- `packages/contracts/src/domain/operations.ts` - current import/export/audit contract surface. [VERIFIED: codebase grep]
- `packages/contracts/src/domain/retrieval.ts` - current derived-output contract pattern for citations/summary. [VERIFIED: codebase grep]
- `packages/server/src/lib/store.ts` - current durable storage model and transaction semantics. [VERIFIED: codebase grep]
- `packages/server/src/lib/import-export.ts` - current lossy skill import seam. [VERIFIED: codebase grep]
- `packages/server/src/lib/indexing/normalize.ts`, `pipeline.ts`, `types.ts` - canonical normalization and derived-output precedent. [VERIFIED: codebase grep]
- `packages/server/src/lib/retrieval/orchestrator.ts`, `citations.ts`, `summary.ts` - current retrieval and cached-derived-output patterns. [VERIFIED: codebase grep]
- `packages/server/src/routes/review.ts`, `knowledge.ts`, `operations.ts` - current governance enforcement points. [VERIFIED: codebase grep]
- `npm view` for `zod`, `fastify`, `@langchain/openai`, `@langchain/core`, `typescript`, `vitest`, `commander`, `pino`, `tsx` - current package versions. [VERIFIED: npm registry]

### Secondary (MEDIUM confidence)

- `.planning/phases/08-索引生命周期/08-RESEARCH.md` - prior guidance on canonical normalization and derived adapter state. [VERIFIED: repo file]
- `.planning/phases/09-图辅助检索/09-RESEARCH.md` - prior guidance on lightweight graph data remaining server-internal. [VERIFIED: repo file]
- `.planning/phases/10-回答与引用/10-RESEARCH.md` - prior guidance on derived outputs as structured contract data. [VERIFIED: repo file]
- `.planning/phases/11-索引生命周期集成/11-RESEARCH.md` - current indexing-integration seam and post-commit mutation pattern. [VERIFIED: repo file]

### Tertiary (LOW confidence)

- Proposed artifact/profile/capsule/client-manifest schemas and additive coexistence approach are design recommendations inferred from current repo patterns and roadmap boundaries, not yet implemented. [ASSUMED]

## Metadata

**Confidence breakdown:**  
- Standard stack: HIGH - versions and repo usage were verified locally and via npm registry. [VERIFIED: local env] [VERIFIED: npm registry]  
- Architecture: MEDIUM - strong current-code precedent exists, but the exact artifact contract shapes are still design recommendations. [VERIFIED: codebase grep] [ASSUMED]  
- Pitfalls: MEDIUM - they are grounded in current repo seams and requirement boundaries, but several relate to not-yet-implemented Phase 12 decisions. [VERIFIED: codebase grep] [ASSUMED]

**Research date:** 2026-04-16 [VERIFIED: system date]  
**Valid until:** 2026-05-16 unless Phase 12 contract/store work lands earlier and changes the artifact seam materially. [ASSUMED]
