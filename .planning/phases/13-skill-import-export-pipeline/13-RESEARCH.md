# Phase 13: Skill Import/Export Pipeline - Research

**Researched:** 2026-04-16 [VERIFIED: system date]  
**Domain:** Artifact-native import/export planning for skill directories on top of the Phase 12 canonical artifact/store seams [VERIFIED: `.planning/ROADMAP.md`] [VERIFIED: `.planning/REQUIREMENTS.md`] [VERIFIED: `.planning/phases/12-skill-artifact-canonical-model/12-RESEARCH.md`] [VERIFIED: `.planning/phases/12-skill-artifact-canonical-model/12-VERIFICATION.md`] [VERIFIED: `.planning/phases/12-skill-artifact-canonical-model/12-03-SUMMARY.md`]  
**Confidence:** HIGH [VERIFIED: required roadmap/requirements/Phase 12 docs plus current contracts/server/CLI/store files were read in this session]

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
No `13-CONTEXT.md` exists for Phase 13, so there are no additional locked decisions to copy verbatim. [VERIFIED: `.codex/get-shit-done/bin/gsd-tools.cjs init phase-op "13"`]

### Claude's Discretion
No `13-CONTEXT.md` exists for Phase 13, so recommendation latitude comes from the roadmap, requirements, AGENTS.md, the required-reading files, and the direct user prompt only. [VERIFIED: `.codex/get-shit-done/bin/gsd-tools.cjs init phase-op "13"`] [VERIFIED: user prompt]

### Deferred Ideas (OUT OF SCOPE)
No `13-CONTEXT.md` exists for Phase 13, so there are no additional deferred ideas to copy verbatim. [VERIFIED: `.codex/get-shit-done/bin/gsd-tools.cjs init phase-op "13"`]
</user_constraints>

## Summary

Current import/export is still entirely knowledge-entry shaped. The shared operations contracts only define `importEntrySchema`, `exportBundleSchema`, and audit actions for `knowledge-*`; the server export route only reads `data.knowledgeEntries`; the server import route only parses `ImportRequest.entries` into `KnowledgeRecord`; and the CLI import/export commands only read one text file or JSON bundle and send legacy knowledge payloads. [VERIFIED: `packages/contracts/src/domain/operations.ts:41-72`] [VERIFIED: `packages/server/src/routes/operations.ts:200-353`] [VERIFIED: `packages/cli/src/commands/operations.ts:242-367`] That means Phase 12’s canonical `skillArtifacts`, file manifests, derived profile/capsule/client-manifest outputs, and `sourceKind` metadata exist in the repo but are not consumed by import/export yet. [VERIFIED: `packages/contracts/src/domain/artifacts.ts:19-322`] [VERIFIED: `packages/server/src/lib/store.ts:313-402`] [VERIFIED: `packages/server/src/lib/artifacts/model.ts:219-327`] [VERIFIED: `packages/server/src/lib/artifacts/derive.ts:294-320`]

The exact loss point is duplicated and explicit: both the server and CLI have a hand-rolled `parseClaudeSkill()` that strips a `SKILL.md` file down to `{ scope, labels, shortcut, detail }`, with `name` mapped to `shortcut` and the body mapped to `detail`. No directory traversal happens, no `references/`, `assets/`, or `scripts/` are read, no canonical `files[]` manifest is built, and no `SkillArtifact` record is created. [VERIFIED: `packages/server/src/lib/import-export.ts:11-57`] [VERIFIED: `packages/cli/src/commands/operations.ts:34-82`] The current export path is equally lossy because it serializes only `knowledgeEntrySchema` items, not artifact revisions or derived manifests. [VERIFIED: `packages/contracts/src/domain/operations.ts:46-50`] [VERIFIED: `packages/server/src/routes/operations.ts:200-256`]

Phase 13 should therefore be planned as a strict seam-consumption phase: extend shared operations contracts for artifact-native import/export, replace the flattening helpers with canonical artifact bundle helpers, wire the server routes to `createSkillArtifactRecord()` plus `deriveSkillArtifactOutputs()`/`applyDerivedArtifactOutputs()`, and make the CLI do local filesystem packaging/materialization while keeping RBAC, approval, team scope, security level, and audit flow on the existing server boundaries. [VERIFIED: `packages/server/src/lib/artifacts/model.ts:219-327`] [VERIFIED: `packages/server/src/lib/artifacts/derive.ts:87-320`] [VERIFIED: `packages/server/src/routes/operations.ts:200-353`] [VERIFIED: `.planning/REQUIREMENTS.md`] [ASSUMED]

**Primary recommendation:** Make `bundle-json` the canonical transport between CLI and server, treat `skill-dir` as a CLI-local read/write flow built from that transport, and reserve `distilled-json` for export-only projections derived from canonical artifacts. [VERIFIED: `packages/contracts/src/domain/artifacts.ts:175-234`] [VERIFIED: `packages/server/src/lib/artifacts/derive.ts:222-320`] [ASSUMED]

## Project Constraints (from AGENTS.md)

- Shared contracts must remain the only cross-package truth between CLI and server. [VERIFIED: `AGENTS.md`]
- The interface must stay imperative CLI commands with predictable stdout and optional JSON mode. [VERIFIED: `AGENTS.md`]
- Skill packaging must stay Claude-compatible around `SKILL.md`, frontmatter, and directory-scoped assets. [VERIFIED: `AGENTS.md`]
- Retrieval remains text-only in v1.x, so Phase 13 must not index `assets/` as primary knowledge or turn scripts into model-context bodies. [VERIFIED: `AGENTS.md`] [VERIFIED: `.planning/REQUIREMENTS.md`]
- Access control must continue to combine role templates with explicit permissions and remain enforced on the server. [VERIFIED: `AGENTS.md`]
- Do not introduce server-side script execution, browser UI dependence, or multimodal retrieval in this phase. [VERIFIED: `AGENTS.md`] [VERIFIED: `.planning/REQUIREMENTS.md`]

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| IMEX-01 | CLI 支持从目录导入 skill artifact [VERIFIED: `.planning/REQUIREMENTS.md`] | CLI must scan a local directory, build canonical file entries matching `skillArtifactFileSchema`, and POST an artifact-native bundle instead of a local path string. [VERIFIED: `packages/contracts/src/domain/artifacts.ts:41-58`] [VERIFIED: `packages/server/src/routes/operations.ts:259-353`] [ASSUMED] |
| IMEX-02 | CLI 支持导出标准 skill 目录，不强制包含 sidecar 私有元数据 [VERIFIED: `.planning/REQUIREMENTS.md`] | Export should be driven from canonical artifact revisions and derived manifests; `skill-dir` should omit private sidecar metadata by default and be materialized by the CLI from canonical server data. [VERIFIED: `packages/contracts/src/domain/artifacts.ts:175-234`] [VERIFIED: `packages/server/src/lib/artifacts/derive.ts:222-320`] [ASSUMED] |
| IMEX-03 | 系统兼容单 `SKILL.md` 导入并自动包装为最小 artifact [VERIFIED: `.planning/REQUIREMENTS.md`] | Add a compatibility path that wraps one `SKILL.md` into a one-file canonical artifact with `sourceKind: 'single-skill-md'` instead of flattening it to `KnowledgeSubmission`. [VERIFIED: `packages/contracts/src/domain/artifacts.ts:263-280`] [VERIFIED: `packages/server/src/lib/import-export.ts:11-57`] [ASSUMED] |
| IMEX-04 | 导入时对 `references/`、`assets/`、`scripts/` 建立清晰的索引与交付策略 [VERIFIED: `.planning/REQUIREMENTS.md`] | Reuse the existing canonical file flags and derivation boundary: only `SKILL.md` plus `references/` feed derivation; `assets/` and `scripts/` remain activation metadata. [VERIFIED: `packages/contracts/src/domain/artifacts.ts:19-77`] [VERIFIED: `packages/server/src/lib/artifacts/derive.ts:87-90`] [VERIFIED: `packages/server/src/lib/artifacts/derive.ts:222-275`] |
| COMP-01 | `contracts` 继续作为 CLI 与 server 的唯一共享契约真源 [VERIFIED: `.planning/REQUIREMENTS.md`] | All new import/export request, response, and format enums should land in `packages/contracts/src/domain/operations.ts` before CLI/server wiring. [VERIFIED: `packages/contracts/src/domain/operations.ts:41-142`] [ASSUMED] |
| COMP-02 | 现有 RBAC、审批、team scope、security level 与审计流程在 v1.2 中保持有效 [VERIFIED: `.planning/REQUIREMENTS.md`] | Phase 13 should keep using `requirePermission()`, `resolveAuthContext()`, pre-review, store transactions, and audit emission on the current operations route boundary. [VERIFIED: `packages/server/src/routes/operations.ts:200-353`] [VERIFIED: `.planning/phases/12-skill-artifact-canonical-model/12-VERIFICATION.md`] [ASSUMED] |
| COMP-04 | v1.2 的新结构不引入服务端脚本执行、浏览器 UI 依赖或多模态检索要求 [VERIFIED: `.planning/REQUIREMENTS.md`] | Import/export should move files and metadata only; scripts stay descriptor-only, and assets stay out of derivation. [VERIFIED: `packages/contracts/src/domain/artifacts.ts:64-77`] [VERIFIED: `packages/contracts/src/domain/artifacts.ts:161-188`] [VERIFIED: `packages/server/src/lib/artifacts/derive.ts:245-265`] |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Read a local skill directory and classify `SKILL.md` / `references/` / `assets/` / `scripts/` | Browser / Client (CLI) [ASSUMED] | API / Backend [ASSUMED] | The server only receives HTTP payloads and cannot read the caller’s filesystem path directly, so the CLI must package local files before upload. [VERIFIED: `packages/cli/src/commands/operations.ts:290-360`] [VERIFIED: `packages/server/src/routes/operations.ts:259-353`] |
| Validate import/export payload shapes and format selection | API / Backend [VERIFIED: existing route validation pattern] | Browser / Client (CLI) [ASSUMED] | Route validation is already centralized in shared Zod schemas parsed on the server, with the CLI consuming the same contracts. [VERIFIED: `packages/contracts/src/domain/operations.ts:41-72`] [VERIFIED: `packages/server/src/routes/operations.ts:204`] [VERIFIED: `packages/cli/src/commands/operations.ts:268-273`] |
| Apply RBAC, team scope, security level, pre-review, and audit during import/export | API / Backend [VERIFIED: current route behavior] | Database / Storage [VERIFIED: store transaction use] | Governance and audit are enforced inside `operations.ts` transactions and must stay there. [VERIFIED: `packages/server/src/routes/operations.ts:201-249`] [VERIFIED: `packages/server/src/routes/operations.ts:260-353`] |
| Persist artifact roots, immutable revisions, and cached derived outputs | Database / Storage [VERIFIED: `skillArtifacts` store] | API / Backend [VERIFIED: model/derive helpers] | Phase 12 already established additive artifact persistence and cached derivation on revisions. [VERIFIED: `packages/server/src/lib/store.ts:389-402`] [VERIFIED: `packages/server/src/lib/artifacts/model.ts:219-327`] [VERIFIED: `packages/server/src/lib/artifacts/derive.ts:294-320`] |
| Materialize `skill-dir` exports onto disk | Browser / Client (CLI) [ASSUMED] | API / Backend [ASSUMED] | Writing a directory tree is a client-local responsibility; the server should return canonical data, not write into the caller’s filesystem. [VERIFIED: `packages/cli/src/commands/operations.ts:242-285`] [ASSUMED] |

## Standard Stack

### Core
| Library / Module | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js | `v22.20.0` [VERIFIED: local env] | Filesystem traversal, hashing, and JSON serialization in CLI/server [VERIFIED: local env] | Already installed and used for both packages; Phase 13 needs no runtime change. [VERIFIED: `package.json`] |
| TypeScript | `^5.9.3` in workspace [VERIFIED: `package.json`] | Shared contracts and import/export helpers [VERIFIED: repo structure] | The repo is already TS-first across CLI/server/contracts. [VERIFIED: `AGENTS.md`] |
| Zod | `^4.3.6` server, contracts already on Zod 4 [VERIFIED: `packages/server/package.json`] [VERIFIED: code imports] | Request/response and artifact schema validation [VERIFIED: repo code] | COMP-01 requires shared contract truth, and this repo already encodes it in Zod. [VERIFIED: `packages/contracts/src/domain/operations.ts`] [VERIFIED: `packages/contracts/src/domain/artifacts.ts`] |
| Fastify operations routes | `^5.6.1` [VERIFIED: `packages/server/package.json`] | Authenticated import/export HTTP surface [VERIFIED: `packages/server/src/routes/operations.ts`] | Existing operational flows already live here, so Phase 13 should extend them instead of introducing a second transport. [VERIFIED: `packages/server/src/routes/operations.ts`] |
| Canonical artifact model + derivation helpers | in-repo [VERIFIED: Phase 12 code] | Create artifacts, revisions, and derived profile/capsule/client-manifest outputs [VERIFIED: `packages/server/src/lib/artifacts/model.ts`] [VERIFIED: `packages/server/src/lib/artifacts/derive.ts`] | Phase 12 created these exact seams for downstream import/export consumption. [VERIFIED: `.planning/phases/12-skill-artifact-canonical-model/12-03-SUMMARY.md`] |

### Supporting
| Library / Module | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Commander | `^14.0.1` [VERIFIED: `packages/cli/package.json`] | CLI flags for import/export modes and output paths [VERIFIED: `packages/cli/src/commands/operations.ts`] | Use for `--format`, `--dir`, `--output`, and compatibility flags without changing the existing CLI style. [ASSUMED] |
| `JsonStore` | in-repo [VERIFIED: `packages/server/src/lib/store.ts`] | Additive persistence for `skillArtifacts` beside `knowledgeEntries` [VERIFIED: `packages/server/src/lib/store.ts:389-402`] | Use for Phase 13 persistence; do not create a second artifact store. [ASSUMED] |
| Vitest | `^3.2.4` [VERIFIED: `package.json`] | Contract, route, and CLI regression coverage [VERIFIED: package scripts] | Existing test runner across the monorepo. [VERIFIED: `package.json`] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Artifact-native operation schemas in `packages/contracts/src/domain/operations.ts` [ASSUMED] | Reusing `importEntrySchema` / `exportBundleSchema` and stuffing artifact data into ad hoc payload fields [ASSUMED] | Reuse would preserve the current flattening problem and violate COMP-01 by pushing package-local interpretations back into CLI/server code. [VERIFIED: `packages/contracts/src/domain/operations.ts:41-72`] |
| CLI-local `skill-dir` materialization from canonical JSON [ASSUMED] | Server-side zip/archive streaming [ASSUMED] | Archive streaming adds format and extraction complexity that the roadmap does not require; the repo already uses JSON + local file writes for CLI outputs. [VERIFIED: `packages/cli/src/commands/operations.ts:275-285`] |
| Reusing Phase 12 derivation helpers after import [VERIFIED: existing seam] | Re-deriving export projections with route-local bespoke logic [ASSUMED] | Route-local logic would fork the same profile/capsule/client-manifest semantics that Phase 12 already centralized. [VERIFIED: `packages/server/src/lib/artifacts/derive.ts:294-320`] |

**Installation:** No new package is required by the repo evidence gathered for Phase 13; the current runtime, contracts, Fastify routes, and artifact helpers are sufficient. [VERIFIED: `package.json`] [VERIFIED: `packages/server/package.json`] [VERIFIED: `packages/cli/package.json`] [ASSUMED]

## Architecture Patterns

### System Architecture Diagram

```text
Local skill dir / single SKILL.md
        |
        v
CLI filesystem reader + classifier
        |
        | canonical import bundle JSON
        v
POST /v1/operations/import
        |
        v
Server schema validation + auth + permission checks
        |
        +--> pre-review adapter + duplicate checks
        |
        v
createSkillArtifactRecord / appendSkillArtifactRevision
        |
        +--> deriveSkillArtifactOutputs
        |        |
        |        +--> profile/capsules from SKILL.md + references/
        |        +--> clientManifest metadata for references/assets/scripts
        |
        v
JsonStore.skillArtifacts + audit event

Export request
        |
        v
POST /v1/operations/export (format selector)
        |
        v
Server auth + artifact selection + projection
        |
        +--> distilled-json response
        +--> bundle-json response
        |
        v
CLI output handler
        |
        +--> print JSON/stdout
        +--> materialize skill-dir on disk
```

### Recommended Project Structure

```text
packages/
├── contracts/src/domain/
│   └── operations.ts          # Phase 13 import/export format enums and request/response schemas
├── server/src/lib/
│   ├── import-export.ts       # canonical bundle parsing/rendering helpers replacing flattening helpers
│   └── artifacts/
│       ├── model.ts           # create/append artifact revisions
│       └── derive.ts          # post-import derived outputs and export projections
└── cli/src/
    ├── commands/operations.ts # import/export command flags and API calls
    └── lib/                   # optional skill-dir scan/write helpers if command file grows too large
```

### Pattern 1: Canonical Bundle Transport
**What:** Use one shared JSON transport shape that carries artifact metadata plus file entries and file bodies for import/export, then have the CLI translate between that transport and on-disk directories. [ASSUMED]  
**When to use:** Use for `13-01` directory import, `13-02` single-file auto-wrap, and `13-03` `bundle-json` plus `skill-dir` export. [VERIFIED: `.planning/ROADMAP.md`] [ASSUMED]

**Why this is the cleanest boundary:** The server can only consume HTTP payloads, while the CLI can access local disk. That makes canonical JSON the narrowest shared seam that still preserves directory structure. [VERIFIED: `packages/server/src/routes/operations.ts:259-353`] [VERIFIED: `packages/cli/src/commands/operations.ts:303-360`] [ASSUMED]

### Pattern 2: Import Creates/Updates Artifacts, Not Knowledge Entries
**What:** Replace `createImportedEntry()` with artifact-native persistence that calls `createSkillArtifactRecord()` for new artifacts or `appendSkillArtifactRevision()` for re-imports of an existing slug/artifact. [VERIFIED: `packages/server/src/lib/import-export.ts:120-141`] [VERIFIED: `packages/server/src/lib/artifacts/model.ts:219-360`] [ASSUMED]  
**When to use:** Use for every artifact-native import in Phase 13, including auto-wrapped single `SKILL.md`. [VERIFIED: `.planning/ROADMAP.md`] [ASSUMED]

**File-level recommendation:**  
- `packages/server/src/lib/import-export.ts`: replace `parseClaudeSkill()` and `createImportedEntry()` with helpers that build canonical artifact payloads, compute a real `sourceHash`, classify files, and optionally auto-wrap single `SKILL.md`. [VERIFIED: `packages/server/src/lib/import-export.ts:11-141`] [ASSUMED]  
- `packages/server/src/routes/operations.ts`: keep auth/audit transaction shape, but branch to artifact-native create/update logic instead of `data.knowledgeEntries.push(importedRecord)`. [VERIFIED: `packages/server/src/routes/operations.ts:285-339`] [ASSUMED]

### Pattern 3: Derive Once on Import, Reuse on Export
**What:** Immediately run `deriveSkillArtifactOutputs()` after artifact persistence and cache the results back onto the revision with `applyDerivedArtifactOutputs()`, then let export reuse those cached outputs for `distilled-json`. [VERIFIED: `packages/server/src/lib/artifacts/derive.ts:294-320`] [VERIFIED: `packages/server/src/lib/artifacts/derive.ts:323-340`] [ASSUMED]  
**When to use:** Use in `13-01` and `13-02` for import completion, and in `13-03` for distilled export. [VERIFIED: `.planning/ROADMAP.md`] [ASSUMED]

### Pattern 4: `skill-dir` Is a CLI Flow, Not a Separate Canonical Server Model
**What:** Treat `skill-dir` export as “fetch canonical bundle JSON from the server, then write a directory tree locally.” [ASSUMED]  
**When to use:** Use in `13-03` to avoid introducing archive formats or server-side filesystem semantics. [ASSUMED]

**Recommended split:**  
- Server format: `bundle-json` and `distilled-json`. [ASSUMED]  
- CLI flow: `--format skill-dir` calls the `bundle-json` export route and writes the tree to `--output`. [ASSUMED]

### Anti-Patterns to Avoid

- **Do not keep using `parseClaudeSkill()` as the core import path:** it destroys directory structure immediately and duplicates logic in CLI and server. [VERIFIED: `packages/server/src/lib/import-export.ts:11-57`] [VERIFIED: `packages/cli/src/commands/operations.ts:34-82`]
- **Do not send a local directory path to the server and expect the server to read it:** the current architecture is HTTP-based, not shared-filesystem-based. [VERIFIED: `packages/server/src/routes/operations.ts:259-353`] [ASSUMED]
- **Do not export private sidecar metadata into `skill-dir` by default:** IMEX-02 explicitly says standard skill directory export should not force private sidecars. [VERIFIED: `.planning/REQUIREMENTS.md`] [ASSUMED]
- **Do not reintroduce text flattening during export:** `distilled-json` can be compact, but `bundle-json` and `skill-dir` must round-trip file structure. [ASSUMED]
- **Do not execute scripts or include asset/script bodies in derivation:** Phase 12 already established those boundaries and COMP-04 forbids loosening them. [VERIFIED: `packages/contracts/src/domain/artifacts.ts:161-188`] [VERIFIED: `packages/server/src/lib/artifacts/derive.ts:214-275`] [VERIFIED: `.planning/REQUIREMENTS.md`]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cross-package import/export payloads | Package-local CLI/server DTOs [ASSUMED] | Shared Zod contracts in `packages/contracts/src/domain/operations.ts` [VERIFIED: current contract pattern] | COMP-01 already requires shared contract truth, and the current operations flow depends on parsed schemas on both sides. [VERIFIED: `packages/contracts/src/domain/operations.ts:41-142`] [VERIFIED: `packages/cli/src/commands/operations.ts:8-14`] |
| File role inference | Ad hoc per-command guesses about what counts as `reference` / `asset` / `script` [ASSUMED] | The existing canonical file kinds/sources in `artifacts.ts` [VERIFIED: Phase 12 contract] | Phase 12 already codified the four allowed sources and kinds. [VERIFIED: `packages/contracts/src/domain/artifacts.ts:19-58`] |
| Distilled export content | A second distilled-output implementation inside `operations.ts` [ASSUMED] | Cached `derived.profile`, `derived.capsules`, and `derived.clientManifest` [VERIFIED: Phase 12 derivation seam] | Reusing cached derived outputs prevents divergence from Phase 12 semantics. [VERIFIED: `packages/contracts/src/domain/artifacts.ts:194-234`] [VERIFIED: `packages/server/src/lib/artifacts/derive.ts:294-320`] |
| Script delivery | Inline script bodies in default export payloads [ASSUMED] | Metadata-only script descriptors and explicit bundle export only when requested [ASSUMED] | The canonical contracts explicitly keep scripts metadata-only in client manifests. [VERIFIED: `packages/contracts/src/domain/artifacts.ts:161-188`] |

**Key insight:** Phase 13 should consume the Phase 12 artifact model, not invent a second “import artifact” representation. [VERIFIED: `.planning/phases/12-skill-artifact-canonical-model/12-03-SUMMARY.md`] [ASSUMED]

## Common Pitfalls

### Pitfall 1: Preserving Flattening for Compatibility Too Long
**What goes wrong:** The planner keeps the legacy knowledge-entry import as the primary path and bolts directory support around it, so `references/`, `assets/`, and `scripts/` still disappear. [VERIFIED: current flattening behavior in `packages/server/src/lib/import-export.ts:11-57`]  
**Why it happens:** The current CLI and server already parse `SKILL.md` into `shortcut/detail`, so reusing that path looks cheap. [VERIFIED: `packages/server/src/lib/import-export.ts:11-57`] [VERIFIED: `packages/cli/src/commands/operations.ts:34-82`]  
**How to avoid:** Make canonical artifact bundle import the default code path in `13-01`, and implement `13-02` by auto-wrapping into that path rather than keeping a separate flattening pipeline. [ASSUMED]  
**Warning signs:** `KnowledgeSubmission`, `importEntrySchema`, or `createImportedEntry()` still appear in the new artifact import path. [VERIFIED: current legacy seams] [ASSUMED]

### Pitfall 2: Letting `skill-dir` Become a Server Filesystem Concern
**What goes wrong:** The server starts dealing with caller-local output directories, archive extraction, or path writing semantics. [ASSUMED]  
**Why it happens:** “Export a directory” sounds like a server responsibility unless the client/server boundary is made explicit. [ASSUMED]  
**How to avoid:** Keep the server focused on canonical JSON responses and have the CLI materialize files locally. [ASSUMED]  
**Warning signs:** Proposed route contracts include local absolute paths or server-side unzip/write behavior. [ASSUMED]

### Pitfall 3: Breaking Governance While Switching Aggregates
**What goes wrong:** Import/export starts bypassing existing permission checks or creates artifact-specific governance logic outside the current operations route transaction boundary. [ASSUMED]  
**Why it happens:** The aggregate changes from `knowledgeEntries` to `skillArtifacts`, so it is easy to think governance should move too. [ASSUMED]  
**How to avoid:** Keep `resolveAuthContext()`, `requirePermission()`, team access, requested-level checks, pre-review, and audit emission in `operations.ts`; only swap the persisted aggregate and contract shapes. [VERIFIED: `packages/server/src/routes/operations.ts:200-353`] [ASSUMED]  
**Warning signs:** Artifact import/export is implemented in a new unaudited route or skips `knowledge:import` / `knowledge:export` permissions. [VERIFIED: current permission names] [ASSUMED]

### Pitfall 4: Forgetting the Real `sourceHash`
**What goes wrong:** New artifact revisions persist a non-canonical or invalid `sourceHash`, which then breaks deterministic caching and round-trip verification. [VERIFIED: `skillArtifactRevisionSchema` requires a 64-char hash in `packages/contracts/src/domain/artifacts.ts:211-234`]  
**Why it happens:** `createSkillArtifactRecord()` currently seeds `revision.sourceHash` with concatenated file hashes instead of a single SHA-256 digest. [VERIFIED: `packages/server/src/lib/artifacts/model.ts:257-266`]  
**How to avoid:** Centralize Phase 13 source-hash computation in one helper before calling record builders, and use the same hash for persistence and derived-output caching. [ASSUMED]  
**Warning signs:** Initial artifact creation and re-import revision append compute `sourceHash` differently. [VERIFIED: `packages/server/src/lib/artifacts/model.ts:257-266`] [VERIFIED: `packages/server/src/lib/artifacts/model.ts:335-371`] [ASSUMED]

### Pitfall 5: Missing CLI Regression Coverage
**What goes wrong:** The server route works, but the CLI cannot actually scan directories, auto-wrap `SKILL.md`, or materialize `skill-dir` correctly. [ASSUMED]  
**Why it happens:** There is currently no `packages/cli/src/commands/operations.test.ts`; the only CLI command test present is retrieval-focused. [VERIFIED: `find packages/cli/src -name '*.test.ts'`]  
**How to avoid:** Create CLI tests in Wave 0 for import source detection, format flag handling, and output writing behavior. [ASSUMED]  
**Warning signs:** Phase 13 plans only extend server tests and skip CLI tests entirely. [ASSUMED]

## Code Examples

Verified current seams that Phase 13 must replace or consume:

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
[VERIFIED: `packages/server/src/lib/import-export.ts:43-56`]

### Current Canonical File Boundary From Phase 12
```typescript
// Source: packages/contracts/src/domain/artifacts.ts
export const skillArtifactFileSchema = z.object({
  path: z.string().min(1).max(512),
  kind: skillArtifactFileKindSchema,
  sha256: z.string().length(64),
  sizeBytes: z.number().int().min(0),
  mediaType: z.string().min(1).max(160),
  source: skillArtifactFileSourceSchema,
  includeInDerivation: z.boolean(),
  activationOnly: z.boolean(),
});
```
[VERIFIED: `packages/contracts/src/domain/artifacts.ts:41-58`]

### Current Derivation Eligibility Filter
```typescript
// Source: packages/server/src/lib/artifacts/derive.ts
function getDerivationEligibleFiles(revision: SkillArtifactRevisionRecord) {
  return revision.files
    .filter((f) => f.includeInDerivation && !f.activationOnly)
    .sort((a, b) => a.path.localeCompare(b.path));
}
```
[VERIFIED: `packages/server/src/lib/artifacts/derive.ts:87-91`]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `SKILL.md` parsed into `shortcut/detail` knowledge submissions [VERIFIED: current code] | Canonical `SkillArtifact` + `files[]` + cached derived outputs exist in Phase 12 [VERIFIED: Phase 12 code] | 2026-04-16 in Phase 12 [VERIFIED: `.planning/ROADMAP.md`] | Phase 13 should bridge operations to the new artifact model instead of extending the old flattening path. [ASSUMED] |
| Export returns `knowledgeEntrySchema[]` only [VERIFIED: current code] | Roadmap requires `skill-dir`, `distilled-json`, and `bundle-json` flows [VERIFIED: roadmap] | Planned for Phase 13 [VERIFIED: `.planning/ROADMAP.md`] | Export contracts and CLI output handling must become format-aware. [ASSUMED] |
| CLI/server each own a duplicate `parseClaudeSkill()` [VERIFIED: current code] | Canonical import helpers should live once per boundary and reuse shared contracts [ASSUMED] | Planned for Phase 13 [VERIFIED: user prompt] | Phase 13 should remove duplicated flattening logic and keep only compatibility auto-wrap. [ASSUMED] |

**Deprecated/outdated:**
- Legacy `parseClaudeSkill()` flattening as the main import pipeline is outdated for v1.2 because it cannot satisfy IMEX-01/03/04. [VERIFIED: `packages/server/src/lib/import-export.ts:11-57`] [VERIFIED: `.planning/REQUIREMENTS.md`]
- `exportBundleSchema` with `items: knowledgeEntrySchema[]` is outdated for Phase 13 planning because it cannot round-trip a skill directory. [VERIFIED: `packages/contracts/src/domain/operations.ts:46-50`] [VERIFIED: `.planning/ROADMAP.md`]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `bundle-json` should be the canonical server transport, and `skill-dir` should be a CLI materialization flow built from it. | Summary / Architecture Patterns | If wrong, Phase 13 may need archive/streaming work that expands the endpoint design and test surface. |
| A2 | Artifact-native import/export request and response schemas should be added to `packages/contracts/src/domain/operations.ts` instead of a new contracts file. | Phase Requirements / Recommended Structure | If wrong, planner may split contracts across modules and create avoidable API discovery churn. |
| A3 | Audit behavior should stay on the current operations route and may be preserved via existing action families plus richer payloads rather than a new audit surface. | Summary / Common Pitfalls | If wrong, extra contract and audit-query changes may be required in Phase 13. |
| A4 | `skill-dir` export should omit private sidecars by default while `bundle-json` can carry fuller canonical data. | Phase Requirements / Anti-Patterns | If wrong, export format boundaries will need to be renegotiated before plan execution. |

## Resolved Decisions

1. **Export target selection**
   - Decision: Phase 13 export targets one artifact at a time by `artifactId`.
   - Why: `skill-dir` materialization writes one Claude-compatible tree to one local output directory, so the export contract must identify one canonical artifact instead of reusing the legacy “all matching entries” behavior. [VERIFIED: `.planning/ROADMAP.md`] [VERIFIED: `packages/server/src/routes/operations.ts:200-256`]
   - Consequence: `bundle-json`, `distilled-json`, and `skill-dir` flows should all use an explicit `artifactId` selector in the shared export request contract. Broader filtering can be added in a later phase if needed. [ASSUMED]

2. **Compatibility auto-wrap boundary**
   - Decision: the CLI detects a lone local `SKILL.md`, while the server import schema and normalization path explicitly accept `sourceKind: 'single-skill-md'`.
   - Why: the CLI owns local filesystem inspection, but compatibility must still be a system property rather than a CLI-only trick so non-CLI callers can send the same canonical one-file bundle. [VERIFIED: `packages/cli/src/commands/operations.ts:303-355`] [VERIFIED: `packages/server/src/routes/operations.ts:273-342`] [VERIFIED: `packages/contracts/src/domain/artifacts.ts:263-280`]
   - Consequence: there should be one canonical artifact importer with two bounded input modes: `skill-directory` and `single-skill-md`. [ASSUMED]

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | CLI/server import-export code and tests [VERIFIED: repo structure] | ✓ [VERIFIED: local env] | `v22.20.0` [VERIFIED: local env] | — |
| `pnpm` | package-filtered test commands [VERIFIED: `package.json`] | ✓ [VERIFIED: local env] | `10.33.0` [VERIFIED: local env] | npm could run package scripts manually, but existing workflow is pnpm-first. [ASSUMED] |

**Missing dependencies with no fallback:**
- None found for this phase’s local code/config workflow. [VERIFIED: local env] [ASSUMED]

**Missing dependencies with fallback:**
- None found. [VERIFIED: local env] [ASSUMED]

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest `^3.2.4` [VERIFIED: `package.json`] |
| Config file | none — package scripts use `vitest run` directly [VERIFIED: `package.json`] [VERIFIED: `packages/server/package.json`] [VERIFIED: `packages/cli/package.json`] |
| Quick run command | `pnpm --filter @skill-shareer/server test -- src/routes/operations.test.ts src/lib/artifacts/model.test.ts src/lib/artifacts/derive.test.ts` [VERIFIED: package scripts and existing test files] |
| Full suite command | `pnpm test` [VERIFIED: `package.json`] |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| IMEX-01 | Directory import builds canonical artifact revisions and persists them in `skillArtifacts` without flattening. [ASSUMED] | integration + route | `pnpm --filter @skill-shareer/server test -- src/routes/operations.test.ts src/lib/artifacts/model.test.ts src/lib/artifacts/derive.test.ts` [VERIFIED: existing files] | ✅ |
| IMEX-02 | Export supports `bundle-json`, `distilled-json`, and CLI `skill-dir` materialization without forced private sidecars. [ASSUMED] | route + CLI | `pnpm --filter @skill-shareer/server test -- src/routes/operations.test.ts && pnpm --filter @skill-shareer/cli test -- src/commands/operations.test.ts` [ASSUMED] | server ✅ / CLI ❌ Wave 0 |
| IMEX-03 | Single `SKILL.md` import auto-wraps to a minimal artifact with `sourceKind: single-skill-md`. [ASSUMED] | unit + route + CLI | `pnpm --filter @skill-shareer/server test -- src/routes/operations.test.ts src/lib/artifacts/model.test.ts && pnpm --filter @skill-shareer/cli test -- src/commands/operations.test.ts` [ASSUMED] | server ✅ / CLI ❌ Wave 0 |
| IMEX-04 | `references/`, `assets/`, and `scripts/` are classified and delivered according to Phase 12 derivation boundaries. [VERIFIED: requirements + Phase 12 seam] | unit + regression | `pnpm --filter @skill-shareer/server test -- src/lib/artifacts/derive.test.ts src/routes/operations.test.ts` [VERIFIED: existing files] | ✅ |
| COMP-01 | Contracts remain the single shared truth for new import/export formats. [VERIFIED: requirement] | contract | `pnpm --filter @skill-shareer/contracts test -- src/index.test.ts` [VERIFIED: existing file] | ✅ |
| COMP-02 / COMP-04 | RBAC/audit stay effective and scripts/assets do not cross the established boundary. [VERIFIED: requirements] | route + regression | `pnpm --filter @skill-shareer/server test -- src/routes/operations.test.ts src/routes/review.test.ts src/routes/knowledge.test.ts src/lib/artifacts/derive.test.ts` [VERIFIED: existing files] | ✅ |

### Sampling Rate
- **Per task commit:** `pnpm --filter @skill-shareer/server test -- src/routes/operations.test.ts src/lib/artifacts/model.test.ts src/lib/artifacts/derive.test.ts`
- **Per wave merge:** `pnpm --filter @skill-shareer/contracts test -- src/index.test.ts && pnpm --filter @skill-shareer/server test -- src/routes/operations.test.ts src/routes/review.test.ts src/routes/knowledge.test.ts src/lib/artifacts/model.test.ts src/lib/artifacts/derive.test.ts`
- **Phase gate:** `pnpm test`

### Wave 0 Gaps
- [ ] `packages/cli/src/commands/operations.test.ts` — needed for import source detection, format flags, and `skill-dir` materialization; currently missing. [VERIFIED: `find packages/cli/src -name '*.test.ts'`]
- [ ] Contract tests in `packages/contracts/src/index.test.ts` for artifact-native operations schemas — existing contract tests cover artifacts, but not Phase 13 operation request/response shapes yet. [VERIFIED: `packages/contracts/src/index.test.ts`] [ASSUMED]
- [ ] Authenticated route cases in `packages/server/src/routes/operations.test.ts` for artifact import/export success paths — current coverage is schema/auth smoke plus legacy `parseClaudeSkill`, not artifact-native round-trip flows. [VERIFIED: `packages/server/src/routes/operations.test.ts:296-463`] [ASSUMED]

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes [VERIFIED: route auth context] | `resolveAuthContext()` on operations routes. [VERIFIED: `packages/server/src/routes/operations.ts:201`] |
| V3 Session Management | yes [VERIFIED: existing session-based auth flow] | Existing bearer-session handling in server/CLI auth path. [VERIFIED: `packages/cli/src/commands/operations.ts:257-258`] [VERIFIED: `packages/server/src/routes/operations.ts`] |
| V4 Access Control | yes [VERIFIED: current operations route] | `requirePermission()`, `requireHigherLevel()`, and team access checks. [VERIFIED: `packages/server/src/routes/operations.ts:202`] [VERIFIED: `packages/server/src/routes/operations.ts:261`] |
| V5 Input Validation | yes [VERIFIED: contract parsing pattern] | Shared Zod schemas in contracts parsed by CLI/server. [VERIFIED: `packages/contracts/src/domain/operations.ts`] [VERIFIED: `packages/server/src/routes/operations.ts:204`] |
| V6 Cryptography | yes [VERIFIED: repo crypto use] | Node `crypto` SHA-256 for token hashing and artifact/source hashes. [VERIFIED: `packages/server/src/lib/store.ts:404-410`] [VERIFIED: `packages/server/src/lib/artifacts/derive.ts:16-17`] |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Path traversal during `skill-dir` export or directory import classification [ASSUMED] | Tampering | Normalize and validate relative paths; reject absolute paths and `..` segments before writing or persisting file entries. [ASSUMED] |
| Unauthorized import/export of higher-security artifacts [VERIFIED: current risk domain] | Information Disclosure / Elevation of Privilege | Keep existing permission and requested-level checks on the server route boundary. [VERIFIED: `packages/server/src/routes/operations.ts:201-224`] [VERIFIED: `packages/server/src/routes/operations.ts:287-296`] |
| Script body leakage or server-side execution [VERIFIED: requirements] | Elevation of Privilege | Preserve metadata-only script handling and never execute scripts on the server. [VERIFIED: `packages/contracts/src/domain/artifacts.ts:161-188`] [VERIFIED: `.planning/REQUIREMENTS.md`] |
| Asset/script leakage into derivation or distilled export [VERIFIED: Phase 12 boundary] | Information Disclosure | Reuse `includeInDerivation` / `activationOnly` and Phase 12 derivation helpers. [VERIFIED: `packages/contracts/src/domain/artifacts.ts:53-57`] [VERIFIED: `packages/server/src/lib/artifacts/derive.ts:87-90`] |
| Audit trail drift during aggregate swap from knowledge entries to skill artifacts [ASSUMED] | Repudiation | Emit audit events in the same store transaction and include artifact IDs, source kind, and export format in payload. [VERIFIED: `packages/server/src/routes/operations.ts:238-249`] [VERIFIED: `packages/server/src/routes/operations.ts:320-330`] [ASSUMED] |

## Sources

### Primary (HIGH confidence)
- `AGENTS.md` — project constraints, workflow rules, and stack expectations used for Phase 13 planning.
- `.planning/ROADMAP.md` — Phase 13 plan split and milestone sequencing.
- `.planning/REQUIREMENTS.md` — IMEX-01/02/03/04 and COMP-01/02/04 requirements.
- `.planning/phases/12-skill-artifact-canonical-model/12-RESEARCH.md` — prior-phase research framing for artifact-first seams.
- `.planning/phases/12-skill-artifact-canonical-model/12-VERIFICATION.md` — verified evidence that Phase 12 contracts/store/derivation are present and additive.
- `.planning/phases/12-skill-artifact-canonical-model/12-03-SUMMARY.md` — explicit note that Phase 13 should consume derivation seams.
- `packages/contracts/src/domain/artifacts.ts` — canonical file/revision/derived-output contracts.
- `packages/contracts/src/domain/operations.ts` — current legacy import/export contract surface.
- `packages/server/src/lib/import-export.ts` — current flattening import behavior.
- `packages/server/src/lib/store.ts` — additive `skillArtifacts` persistence model.
- `packages/server/src/lib/artifacts/model.ts` — artifact create/append helpers.
- `packages/server/src/lib/artifacts/derive.ts` — derivation and client-manifest behavior.
- `packages/server/src/routes/operations.ts` — current import/export/auth/audit route behavior.
- `packages/server/src/routes/operations.test.ts` — current route/test coverage shape.
- `packages/cli/src/commands/operations.ts` — current CLI import/export behavior.
- `package.json`, `packages/server/package.json`, `packages/cli/package.json` — runtime and validation tooling baseline.

### Secondary (MEDIUM confidence)
- None — this research stayed within repo-local primary sources. [VERIFIED: session actions]

### Tertiary (LOW confidence)
- None. [VERIFIED: session actions]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - entirely verified from repo manifests and current code paths. [VERIFIED: `package.json`] [VERIFIED: `packages/server/package.json`] [VERIFIED: `packages/cli/package.json`]
- Architecture: HIGH - the import/export gap and the intended Phase 12 seams are explicit in current contracts/server/CLI files. [VERIFIED: `packages/contracts/src/domain/operations.ts`] [VERIFIED: `packages/contracts/src/domain/artifacts.ts`] [VERIFIED: `packages/server/src/routes/operations.ts`] [VERIFIED: `packages/server/src/lib/import-export.ts`]
- Pitfalls: MEDIUM - grounded in verified current behavior, with implementation recommendations that remain design-level until Phase 13 code exists. [VERIFIED: current repo files] [ASSUMED]

**Research date:** 2026-04-16 [VERIFIED: system date]  
**Valid until:** 2026-05-16 for repo-local planning unless Phase 13 code lands earlier and changes these seams. [ASSUMED]
