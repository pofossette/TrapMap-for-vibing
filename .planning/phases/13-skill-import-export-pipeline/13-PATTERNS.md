# Phase 13: Skill Import/Export Pipeline - Pattern Map

**Mapped:** 2026-04-16
**Files analyzed:** 11
**Analogs found:** 11 / 11

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `packages/contracts/src/domain/operations.ts` | config | request-response | `packages/contracts/src/domain/operations.ts` | exact |
| `packages/contracts/src/index.test.ts` | test | contract-validation | `packages/contracts/src/index.test.ts` | exact |
| `packages/server/src/routes/operations.ts` | route | request-response | `packages/server/src/routes/operations.ts` | exact |
| `packages/server/src/routes/operations.test.ts` | test | request-response | `packages/server/src/routes/operations.test.ts` | exact |
| `packages/server/src/lib/import-export.ts` | utility | transform, file-I/O | `packages/server/src/lib/import-export.ts` + `packages/server/src/lib/artifacts/model.ts` | role-match |
| `packages/server/src/lib/store.ts` | model | persistence | `packages/server/src/lib/store.ts` | exact |
| `packages/server/src/lib/artifacts/model.ts` | model | CRUD | `packages/server/src/lib/artifacts/model.ts` | exact |
| `packages/server/src/lib/artifacts/derive.ts` | service | transform | `packages/server/src/lib/artifacts/derive.ts` | exact |
| `packages/cli/src/commands/operations.ts` | controller | request-response, file-I/O | `packages/cli/src/commands/operations.ts` | exact |
| `packages/cli/src/commands/operations.test.ts` | test | request-response, file-I/O | `packages/cli/src/commands/retrieval.test.ts` | role-match |
| `packages/cli/src/lib/skill-artifact-export.ts` | utility | file-I/O, transform | `packages/cli/src/commands/operations.ts` | role-match |

## Pattern Assignments

### `packages/contracts/src/domain/operations.ts` (config, request-response)

**Primary analog:** `packages/contracts/src/domain/operations.ts`

**Reuse**

- Keep the contract file as the single CLI/server seam with schema-first exports and type aliases.
- Follow the existing request/response pairing pattern and colocated type exports.

**Imports/type export pattern** (`packages/contracts/src/domain/operations.ts:1-15`, `130-142`)
```ts
import { z } from 'zod';

import {
  actorRefSchema,
  auditMetadataSchema,
  entityIdSchema,
  lifecycleStateSchema,
  scopeSchema,
  securityLevelSchema,
} from './common.js';
...
export type ExportBundle = z.infer<typeof exportBundleSchema>;
export type ImportEntry = z.infer<typeof importEntrySchema>;
export type ImportRequest = z.infer<typeof importRequestSchema>;
```

**Schema organization pattern** (`packages/contracts/src/domain/operations.ts:41-72`)
```ts
export const exportRequestSchema = z.object({
  teamId: entityIdSchema.nullable().optional(),
  includeHistory: z.boolean().default(true),
});

export const exportBundleSchema = z.object({
  exportedAt: z.string(),
  exportedBy: actorRefSchema,
  items: z.array(knowledgeEntrySchema),
});

export const importRequestSchema = z.object({
  entries: z.array(importEntrySchema).min(1),
});
```

**What to preserve**

- New artifact-native import/export schemas should live beside, not outside, the existing operations schemas.
- Keep request schema names noun-first and response/result names parallel.
- Prefer enums/unions in contracts instead of CLI-local string literals.

**Do not reuse**

- Do not extend `knowledgeSubmissionSchema` for the new canonical artifact path (`52-59`); that shape is flat and knowledge-entry specific.
- Do not keep `exportBundleSchema.items: z.array(knowledgeEntrySchema)` (`46-50`) as the Phase 13 export core.
- Do not keep `source: z.enum(['json', 'claude-skill'])` (`52-55`, `61-66`) as the only import discriminator.

### `packages/contracts/src/index.test.ts` (test, contract-validation)

**Primary analog:** `packages/contracts/src/index.test.ts`

**Reuse**

- Extend the existing schema parse/reject style rather than creating a second contract-test file.
- Keep assertions close to the exported contract surface so operation schema drift is caught in one place.

**What to preserve**

- Positive parse coverage for new operation contracts.
- Negative coverage for path traversal, invalid format selectors, and missing `artifactId` on export.

**Do not reuse**

- Do not leave Phase 13 operation contracts untested while relying only on route tests.

### `packages/server/src/routes/operations.ts` (route, request-response)

**Primary analog:** `packages/server/src/routes/operations.ts`

**Reuse**

- Keep auth, permission checks, schema parsing, transaction scope, and audit emission at the route boundary.
- Reuse the route-local control flow shape for import/export and swap only the aggregate and payload logic.

**Route guard pattern** (`packages/server/src/routes/operations.ts:200-205`, `259-273`)
```ts
const auth = await resolveAuthContext(app.skillShareer, request);
requirePermission(auth, 'knowledge:export');

const body = exportRequestSchema.parse((request.body as Record<string, unknown>) ?? {});
```

```ts
const auth = await resolveAuthContext(app.skillShareer, request);
requirePermission(auth, 'knowledge:import');

if (auth.subjectType === 'system-admin') {
  throw new AppError(403, 'invalid_subject', 'System admin cannot import entries directly');
}

const body = importRequestSchema.parse((request.body as Record<string, unknown>) ?? {});
```

**Transaction + per-item result pattern** (`packages/server/src/routes/operations.ts:275-353`)
```ts
const results: Array<{ success: boolean; entry: ReturnType<typeof toKnowledgeEntry> | null; error: string | null; source: 'json' | 'claude-skill'; }> = [];

await app.skillShareer.store.transact(async (data) => {
  for (const entryPayload of body.entries) {
    if (entryPayload.requestedLevel > auth.securityLevel) {
      results.push({ success: false, entry: null, error: `requestedLevel ${entryPayload.requestedLevel} exceeds user level ${auth.securityLevel}`, source: entryPayload.source });
      failedCount++;
      continue;
    }
    ...
  }
});
```

**Audit pattern** (`packages/server/src/routes/operations.ts:238-250`, `320-330`)
```ts
const auditEvent = createAuditEvent({
  store: app.skillShareer.store,
  data,
  teamId: auth.activeTeamId,
  actor: auth,
  action: 'knowledge-imported',
  entityId: importedRecord.id,
  payload: { source: entryPayload.source, requestedLevel: entryPayload.requestedLevel },
});
data.auditEvents.push(auditEvent);
```

**What to preserve**

- Keep `resolveAuthContext()`, `requirePermission()`, team-level filtering, and requested-level enforcement in this file.
- Keep auditing inside the same transaction as persistence.
- Keep shape validation via shared contract schemas before business logic.

**Do not reuse**

- Do not keep `data.knowledgeEntries` as the import/export backing collection (`208`, `318`).
- Do not keep `toKnowledgeEntry()`/`exportBundleSchema` as the final serialization path for artifact-native export (`226-256`).
- Do not keep `runPreReview({ existingEntries: data.knowledgeEntries, submission: entryPayload })` unchanged (`299-303`) if the artifact import payload no longer matches `KnowledgeSubmission`.

### `packages/server/src/routes/operations.test.ts` (test, request-response)

**Primary analog:** `packages/server/src/routes/operations.test.ts`

**Reuse**

- Preserve route-level `app.inject()` tests with minimal fixtures and authenticated setup inside `beforeEach` or per-test transactions.
- Preserve coexistence/regression tests that assert `skillArtifacts` do not break existing route behavior.

**Basic route schema/auth pattern** (`packages/server/src/routes/operations.test.ts:296-401`)
```ts
const response = await app.inject({
  method: 'POST',
  url: '/v1/operations/export',
  payload: { teamId: null, includeHistory: true },
});

expect(response.statusCode).toBe(401);
```

**Fixture setup pattern** (`packages/server/src/routes/operations.test.ts:662-814`)
```ts
await store.transact(async (data) => {
  if (!data.counters) data.counters = {};
  if (!data.skillArtifacts) data.skillArtifacts = [];
  ...
  data.skillArtifacts = [{ ... }];
});
```

**Coexistence assertion pattern** (`packages/server/src/routes/operations.test.ts:816-840`)
```ts
const response = await app.inject({
  method: 'GET',
  url: '/v1/operations/audit?limit=10',
  headers: { authorization: `Bearer ${auditSessionId}` },
});

expect(response.statusCode).toBe(200);

const data = await store.snapshot();
expect(data.skillArtifacts).toBeDefined();
expect(data.skillArtifacts.length).toBe(1);
```

**What to preserve**

- Keep route tests focused on auth, schema acceptance, transaction behavior, and coexistence with additive `skillArtifacts`.
- Add Phase 13 import/export coverage here rather than inventing a second integration test file first.

**Do not reuse**

- Do not keep assertions centered only on `knowledgeEntries` payloads for import/export.
- Do not model artifact export success around `json.events`; follow the actual contract produced by the route under test.

### `packages/server/src/lib/import-export.ts` (utility, transform/file-I/O)

**Primary analogs:** `packages/server/src/lib/import-export.ts`, `packages/server/src/lib/artifacts/model.ts`

**Reuse**

- Keep this file as the narrow translation seam for import/export shaping.
- Preserve the small pure-helper style and keep route code from learning file classification details.

**Current small-helper style** (`packages/server/src/lib/import-export.ts:11-57`, `64-114`)
```ts
export function parseClaudeSkill(content: string): KnowledgeSubmission | null { ... }

export function detectDuplicates(
  entry: KnowledgeSubmission,
  existing: KnowledgeRecord[],
): KnowledgeRecord[] { ... }
```

**Artifact payload target shape to build toward** (`packages/server/src/lib/artifacts/model.ts:219-249`)
```ts
payload: {
  scope: 'global' | 'project';
  labels: string[];
  title: string;
  slug: string;
  requiredLevel: number;
  files: Array<{ path; kind; sha256; sizeBytes; mediaType; source; includeInDerivation; activationOnly; }>;
  scriptDescriptors: Array<{ path; sha256; capability; argsSchemaSummary; sideEffectSummary; defaultPolicy; }>;
  sourceKind: 'skill-directory' | 'single-skill-md' | 'legacy-knowledge';
};
```

**What to preserve**

- Keep classification and normalization helpers out of `routes/operations.ts`.
- Centralize source-hash computation here so create/update paths share one implementation.
- Use this file to bridge legacy single-file import into the canonical artifact payload.

**Do not reuse**

- Do not copy `parseClaudeSkill()` as the main Phase 13 import implementation (`11-57`); it is explicitly lossy.
- Do not keep `createImportedEntry()` (`120-141`); artifact-native import should target `createSkillArtifactRecord()`/`appendSkillArtifactRevision()`.
- Do not keep duplicate detection based only on `shortcut` + flattened `detail` (`64-114`) for artifact-native submissions.

### `packages/server/src/lib/store.ts` (model, persistence)

**Primary analog:** `packages/server/src/lib/store.ts`

**Reuse**

- Follow the existing record-first persistence style and additive store evolution already used for `skillArtifacts`.
- Keep new payload persistence fields explicit and typed instead of hiding them in unstructured blobs.

**What to preserve**

- Additive coexistence with existing `knowledgeEntries`, `auditEvents`, and `skillArtifacts`.
- Clear record interfaces for any imported file payload storage Phase 13 adds.

**Do not reuse**

- Do not put artifact file payload persistence into route-local state or ad hoc JSON bags outside `StoreData`.

### `packages/server/src/lib/artifacts/model.ts` (model, CRUD)

**Primary analog:** `packages/server/src/lib/artifacts/model.ts`

**Reuse**

- Use `createSkillArtifactRecord()`/`appendSkillArtifactRevision()` as the persistence shape for Phase 13 imports.
- Preserve additive coexistence with legacy `knowledgeEntries`.
- Preserve lifecycle, review-note, metadata, and owner/governance handling at the artifact root.

**Create-record pattern** (`packages/server/src/lib/artifacts/model.ts:253-327`)
```ts
const revision: SkillArtifactRevisionRecord = {
  revision: 1,
  sourceHash: args.payload.files.map((f) => f.sha256).join(''),
  files: args.payload.files,
  submittedAt: args.createdAt,
  submittedByUserId: args.ownerUserId,
  scriptDescriptors: args.payload.scriptDescriptors,
  derived: null,
};
...
if (!args.data.skillArtifacts) {
  args.data.skillArtifacts = [];
}
args.data.skillArtifacts.push(artifact);
```

### `packages/cli/src/lib/skill-artifact-export.ts` (utility, file-I/O, transform)

**Primary analog:** `packages/cli/src/commands/operations.ts`

**Reuse**

- Keep filesystem writing and safe path normalization on the CLI side.
- Use small helper functions for directory materialization so the command stays focused on flag parsing and HTTP calls.

**What to preserve**

- Relative-path-only materialization for `SKILL.md`, `references/`, `assets/`, and `scripts/`.
- Stable JSON-vs-filesystem output branching controlled by explicit export format flags.

**Do not reuse**

- Do not make the helper depend on server-local filesystem assumptions or private sidecar files.

**Append-revision pattern** (`packages/server/src/lib/artifacts/model.ts:335-415`)
```ts
const revisionNumber = args.artifact.history.length + 1;
const revision: SkillArtifactRevisionRecord = {
  revision: revisionNumber,
  sourceHash: args.payload.sourceHash,
  files: args.payload.files,
  submittedAt: args.submittedAt,
  submittedByUserId: args.ownerUserId,
  scriptDescriptors: args.payload.scriptDescriptors,
  derived: null,
};
```

**Serialization pattern** (`packages/server/src/lib/artifacts/model.ts:424-457`)
```ts
return skillArtifactSchema.parse({
  id: record.id,
  teamId: record.teamId,
  scope: record.scope,
  labels: record.labels,
  title: record.title,
  slug: record.slug,
  requiredLevel: record.requiredLevel,
  ...
});
```

**What to preserve**

- Keep governance on the artifact root, not per file or per revision.
- Keep immutable revision append semantics for re-import/update.
- Serialize through shared contract schemas with `toSkillArtifact()`.

**Do not reuse**

- Do not keep the initial `sourceHash` implementation from `createSkillArtifactRecord()` (`257-266`); concatenated file hashes are not the final canonical hash shape.
- Do not bypass `toSkillArtifact()` when returning artifacts to routes.

### `packages/server/src/lib/artifacts/derive.ts` (service, transform)

**Primary analog:** `packages/server/src/lib/artifacts/derive.ts`

**Reuse**

- Reuse derivation boundaries exactly: only derivation-eligible files contribute to profile/capsules; assets and scripts remain manifest metadata.
- Reuse deterministic sorting and cached derived-output application.

**Derivation boundary pattern** (`packages/server/src/lib/artifacts/derive.ts:87-100`)
```ts
function getDerivationEligibleFiles(revision: SkillArtifactRevisionRecord) {
  return revision.files
    .filter((f) => f.includeInDerivation && !f.activationOnly)
    .sort((a, b) => a.path.localeCompare(b.path));
}
```

**Client manifest pattern** (`packages/server/src/lib/artifacts/derive.ts:222-275`)
```ts
const references = referenceFiles
  .sort((a, b) => a.path.localeCompare(b.path))
  .map((f) => ({ path: f.path, sha256: f.sha256, sizeBytes: f.sizeBytes, mediaType: f.mediaType }));

const scripts = revision.scriptDescriptors
  .sort((a, b) => a.path.localeCompare(b.path))
  .map((d) => ({
    path: d.path,
    sha256: d.sha256,
    capability: d.capability,
    argsSchemaSummary: d.argsSchemaSummary,
    sideEffectSummary: d.sideEffectSummary,
    defaultPolicy: d.defaultPolicy,
  }));
```

**Derive + cache pattern** (`packages/server/src/lib/artifacts/derive.ts:294-320`, `339-367`)
```ts
const derived = deriveSkillArtifactOutputs(artifact, revision);
...
revision.derived = derivedRecord;
artifact.latestRevision = revision;
```

**What to preserve**

- Export `distilled-json` should be built from `revision.derived`, not a new route-local projection.
- Keep deterministic ordering and metadata-only manifest generation.
- Keep `applyDerivedArtifactOutputs()` in the import pipeline after persistence.

**Do not reuse**

- Do not copy the placeholder text/content behavior in `buildSkillProfile()` and `buildSkillCapsules()` (`125-154`, `180-208`) as the final import/export mapping logic.
- Do not let assets or raw script bodies enter derived outputs.

### `packages/cli/src/commands/operations.ts` (controller, request-response/file-I/O)

**Primary analog:** `packages/cli/src/commands/operations.ts`

**Reuse**

- Preserve Commander registration style, session bootstrap, contract parsing, `--json` behavior, and local output-file writing.
- Preserve the pattern where CLI owns local file reading/writing and the server only owns HTTP payloads.

**Command registration pattern** (`packages/cli/src/commands/operations.ts:242-367`)
```ts
program
  .command('export')
  .description('Export knowledge entries to JSON')
  .option('--team <teamId>', 'Filter by team ID (use "null" for global entries)')
  .option('--include-history', 'Include submission and review history', true)
  .option('--output <path>', 'Write output to file instead of stdout')
  .option('--json', 'Output JSON')
  .action(async (flags) => {
    const state = await loadCliState();
    requireSessionToken(state);
    ...
  });
```

**Server-call + contract-parse pattern** (`packages/cli/src/commands/operations.ts:268-285`, `357-366`)
```ts
const response = await apiRequest<ExportBundle>(state, {
  method: 'POST',
  path: '/v1/operations/export',
  body,
});
const parsed = exportBundleSchema.parse(response.data);
```

**Local file I/O ownership pattern** (`packages/cli/src/commands/operations.ts:279-282`, `303-355`)
```ts
const { writeFile } = await import('node:fs/promises');
await writeFile(flags.output, JSON.stringify(parsed, null, 2), 'utf8');
```

```ts
const fileContent = await resolveTextInput({ file: flags.file }, 'import');
```

**What to preserve**

- Keep local disk packaging/materialization in CLI code.
- Keep JSON mode machine-readable and stable.
- Keep command file as the registration surface; move bulky directory-scan helpers into `packages/cli/src/lib/` only if Phase 13 adds enough file-system logic to justify it.

**Do not reuse**

- Do not keep the duplicated `parseClaudeSkill()` implementation (`34-82`).
- Do not keep import detection limited to “JSON array/export bundle or one flat SKILL.md” (`313-355`).
- Do not make `skill-dir` a server path parameter; CLI should materialize it locally after receiving canonical data.

### `packages/cli/src/commands/operations.test.ts` (test, request-response/file-I/O)

**Primary analog:** `packages/cli/src/commands/retrieval.test.ts`

**Reuse**

- Follow the Vitest mocking style used by retrieval command tests.
- Mock `apiRequest`, `loadCliState`, and file/input helpers, then assert command registration behavior via `Command.parseAsync()`.

**Mocking pattern** (`packages/cli/src/commands/retrieval.test.ts:9-33`)
```ts
vi.mock('../lib/http.js', () => ({
  apiRequest: vi.fn(),
  requireSessionToken: vi.fn(),
}));

vi.mock('../lib/config.js', () => ({
  loadCliState: vi.fn(() => ({ serverUrl: 'http://localhost:3000', sessionToken: 'mock-token', ... })),
}));
```

**Command execution pattern** (`packages/cli/src/commands/retrieval.test.ts:74-90`, `176-187`)
```ts
const program = new Command();
registerRetrievalCommands(program, { allowSearch: true });

await program.parseAsync(['search', 'test seed'], { from: 'user' });

expect(http.apiRequest).toHaveBeenCalledWith(
  expect.anything(),
  expect.objectContaining({ method: 'POST', path: '/v1/retrieval/search', body: expect.objectContaining({ seed: 'test seed' }) }),
);
```

**What to preserve**

- Add a dedicated `operations.test.ts` rather than forcing unrelated command tests to absorb import/export coverage.
- Test `--json`, format selection, local directory write behavior, and compatibility single-file import detection with mocks.

**Do not reuse**

- Do not rely only on console-output assertions for file materialization paths; assert the fs helper/mocked writer inputs directly when possible.

## Shared Patterns

### Auth and RBAC
**Source:** `packages/server/src/routes/operations.ts:200-205`, `259-271`
**Apply to:** all import/export route changes

```ts
const auth = await resolveAuthContext(app.skillShareer, request);
requirePermission(auth, 'knowledge:export');
...
if (auth.subjectType === 'system-admin') {
  throw new AppError(403, 'invalid_subject', 'System admin cannot import entries directly');
}
```

Planner note: keep Phase 13 on the existing `knowledge:import` / `knowledge:export` permission seams unless a later phase explicitly renames governance.

### Artifact Additivity
**Source:** `packages/server/src/lib/artifacts/model.ts:321-327`, `packages/server/src/routes/operations.test.ts:655-841`
**Apply to:** artifact-native import persistence and route regressions

```ts
if (!args.data.skillArtifacts) {
  args.data.skillArtifacts = [];
}
args.data.skillArtifacts.push(artifact);
```

Planner note: preserve additive coexistence with `knowledgeEntries`; do not convert Phase 13 into a destructive migration.

### Derivation Boundary
**Source:** `packages/server/src/lib/artifacts/derive.ts:87-100`, `222-275`
**Apply to:** import normalization and export projection

```ts
return revision.files
  .filter((f) => f.includeInDerivation && !f.activationOnly)
  .sort((a, b) => a.path.localeCompare(b.path));
```

Planner note: `SKILL.md` + `references/` feed distilled outputs; `assets/` and `scripts/` stay metadata-only by default.

### CLI Contract Parsing
**Source:** `packages/cli/src/commands/operations.ts:268-285`, `357-366`
**Apply to:** new CLI import/export modes

```ts
const response = await apiRequest<ExportBundle>(state, {
  method: 'POST',
  path: '/v1/operations/export',
  body,
});
const parsed = exportBundleSchema.parse(response.data);
```

Planner note: parse server responses through contracts in the command layer before formatting or writing files.

## Naming and Organization To Preserve

- Keep import/export contracts in `packages/contracts/src/domain/operations.ts`; do not create package-local DTOs.
- Keep server HTTP orchestration in `packages/server/src/routes/operations.ts`; put normalization/helpers in `packages/server/src/lib/import-export.ts`.
- Keep artifact persistence in `packages/server/src/lib/artifacts/model.ts` and derivation/projection logic in `packages/server/src/lib/artifacts/derive.ts`.
- Keep CLI command registration in `packages/cli/src/commands/operations.ts`; only extract a new `packages/cli/src/lib/...` helper if directory traversal/materialization becomes too large for one file.
- Preserve `skill-directory`, `single-skill-md`, `legacy-knowledge`, `bundle-json`, `distilled-json`, and `skill-dir` naming consistently once introduced; avoid ad hoc synonyms like `artifact-json` or `folder-export`.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `packages/cli/src/commands/operations.test.ts` | test | file-I/O | No existing operations CLI test exists; use `retrieval.test.ts` for mocking shape only. |

## Metadata

**Analog search scope:** `packages/contracts/src/domain`, `packages/server/src/routes`, `packages/server/src/lib`, `packages/server/src/lib/artifacts`, `packages/cli/src/commands`
**Files scanned:** 12
**Pattern extraction date:** 2026-04-16
