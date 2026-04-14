---
plan: 02
phase: 5
wave: 2
depends_on:
  - 01
files_modified:
  - packages/contracts/src/domain/operations.ts
  - packages/server/src/routes/operations.ts
  - packages/server/src/lib/import-export.ts
  - packages/cli/src/commands/operations.ts
requirements_addressed:
  - OPS-02
  - OPS-03
autonomous: true
---

# Plan: Bulk Import/Export Workflows

<objective>
Implement bulk import/export endpoints with validation, duplicate detection, and security level enforcement.
</objective>

<tasks>
<task id="1">
<read_first>
- packages/contracts/src/domain/operations.ts
- packages/contracts/src/domain/knowledge.ts
- packages/contracts/src/domain/common.ts
</read_first>
<action>
Extend `packages/contracts/src/domain/operations.ts`:

1. Add `importResultItemSchema` with:
   - `success`: boolean
   - `entry`: `knowledgeEntrySchema` (nullable)
   - `error`: string (nullable, for failures)
   - `source`: enum ['json', 'claude-skill']

2. Add `importResponseSchema` with:
   - `results`: array of `importResultItemSchema`
   - `importedCount`: number
   - `failedCount`: number

3. Add `claudeSkillMetadataSchema` with:
   - `name`: string
   - `description`: string (optional)
   - `version`: string (optional)

4. Add `claudeSkillImportSchema` with:
   - `metadata`: `claudeSkillMetadataSchema`
   - `content`: string (the SKILL.md content)
   - `requestedLevel`: `securityLevelSchema`

5. Export types: `ImportResultItem`, `ImportResponse`, `ClaudeSkillMetadata`, `ClaudeSkillImport`
</action>
<acceptance_criteria>
- `packages/contracts/src/domain/operations.ts` contains `importResultItemSchema`
- `packages/contracts/src/domain/operations.ts` contains `importResponseSchema`
- `packages/contracts/src/domain/operations.ts` contains `claudeSkillImportSchema`
- Running `pnpm --filter @skill-shareer/contracts build` exits 0
</acceptance_criteria>
</task>

<task id="2">
<read_first>
- packages/server/src/lib/knowledge.ts
- packages/server/src/lib/store.ts
- packages/server/src/lib/pre-review.ts
- packages/contracts/src/domain/operations.ts
</read_first>
<action>
Create `packages/server/src/lib/import-export.ts`:

1. Export `parseClaudeSkill(content: string): KnowledgeSubmission | null`:
   - Parse frontmatter from SKILL.md format (content between `---` markers)
   - Extract `name` as shortcut, `description` as detail
   - Default labels to ['imported', 'skill']
   - Default scope to 'project'
   - Return null if parsing fails

2. Export `detectDuplicates(entry: KnowledgeSubmission, existing: KnowledgeRecord[]): KnowledgeRecord[]`:
   - Find entries where shortcut is identical (case-insensitive)
   - Find entries where detail similarity > 0.8 (using simple word overlap for now)
   - Return matching entries

3. Export `createImportedEntry(args: { store, data, ownerUserId, teamId, payload, requestedLevel, source, createdAt, preReview }): KnowledgeRecord`:
   - Call `createKnowledgeEntryRecord` with the submission
   - Set lifecycle state to preReview status
   - Return the record
</action>
<acceptance_criteria>
- `packages/server/src/lib/import-export.ts` file exists
- File exports `parseClaudeSkill` function
- File exports `detectDuplicates` function
- File exports `createImportedEntry` function
- Running `pnpm --filter @skill-shareer/server build` exits 0
</acceptance_criteria>
</task>

<task id="3">
<read_first>
- packages/server/src/routes/operations.ts
- packages/server/src/lib/import-export.ts
- packages/server/src/lib/rbac.ts
- packages/server/src/lib/knowledge.ts
</read_first>
<action>
Add import/export endpoints to `packages/server/src/routes/operations.ts`:

1. `POST /v1/operations/export`:
   - Call `resolveAuthContext` to get auth
   - Require `knowledge:export` permission
   - Parse body using `exportRequestSchema`
   - If `teamId` specified in request, filter entries by teamId
   - For non-system-admin: only export entries where `auth.securityLevel >= entry.requiredLevel`
   - Filter: if teamId specified, match entry.teamId; if null, export global only
   - Map entries using `toKnowledgeEntry`
   - Return `exportBundleSchema.parse({ exportedAt: nowIso(), exportedBy: actorRef, items })`

2. `POST /v1/operations/import`:
   - Call `resolveAuthContext` to get auth
   - Require `knowledge:import` permission
   - Parse body using `importRequestSchema`
   - Get `ownerUserId` from auth (must be real user, not system-admin)
   - For each entry in `entries`:
     - Validate `requestedLevel <= auth.securityLevel`, else fail with error
     - Run `runPreReview` with existing entries
     - Call `createImportedEntry` and add to store
     - Track result (success/failure)
   - Return `importResponseSchema.parse({ results, importedCount, failedCount })`
</action>
<acceptance_criteria>
- `packages/server/src/routes/operations.ts` contains `POST /v1/operations/export` endpoint
- `packages/server/src/routes/operations.ts` contains `POST /v1/operations/import` endpoint
- Export endpoint checks `knowledge:export` permission
- Import endpoint checks `knowledge:import` permission
- Import validates `requestedLevel <= auth.securityLevel`
- Running `pnpm --filter @skill-shareer/server build` exits 0
</acceptance_criteria>
</task>

<task id="4">
<read_first>
- packages/server/src/app.ts
</read_first>
<action>
Update `packages/server/src/app.ts`:

Add to `documentedRoutes` array:
- `'POST /v1/operations/export'`
- `'POST /v1/operations/import'`

(Note: The endpoints are already in operations.ts which is registered, just need to document them)
</action>
<acceptance_criteria>
- `documentedRoutes` array in `packages/server/src/app.ts` contains `'POST /v1/operations/export'`
- `documentedRoutes` array in `packages/server/src/app.ts` contains `'POST /v1/operations/import'`
</acceptance_criteria>
</task>

<task id="5">
<read_first>
- packages/cli/src/commands/operations.ts
- packages/cli/src/lib/output.ts
- packages/cli/src/lib/input.ts
</read_first>
<action>
Add import/export CLI commands to `packages/cli/src/commands/operations.ts`:

1. `export` command:
   - Description: "Export knowledge entries to JSON"
   - Options: `--team <teamId>`, `--include-history`, `--output <path>`, `--json`
   - Call `POST /v1/operations/export` with `{ teamId, includeHistory }`
   - If `--output` specified, write to file; otherwise print to stdout
   - Print summary: "Exported N entries"

2. `import` command:
   - Description: "Import knowledge entries from JSON or skill files"
   - Options: `--file <path>`, `--level <n>` (required, default to user's level), `--json`
   - Read JSON file containing array of entries or SKILL.md content
   - Parse entries and set `requestedLevel` from `--level` flag
   - Call `POST /v1/operations/import` with `{ entries }`
   - Print summary: "Imported N entries, failed M"
</action>
<acceptance_criteria>
- `packages/cli/src/commands/operations.ts` contains `export` command
- `packages/cli/src/commands/operations.ts` contains `import` command
- Export command has `--team`, `--output`, `--json` options
- Import command has `--file`, `--level`, `--json` options
- Running `pnpm --filter @skill-shareer/cli build` exits 0
</acceptance_criteria>
</task>

<task id="6">
<read_first>
- packages/cli/src/index.ts
- packages/cli/src/commands/operations.ts
</read_first>
<action>
Update `packages/cli/src/index.ts`:

1. Add to `visibility` object:
   - `allowKnowledgeImport: securityLevel >= 1 && hasPermission(effectivePermissions, 'knowledge:import')`

2. Update the `registerOperationsCommands` call to include new options:
   - `allowImport: visibility.allowKnowledgeImport`

3. Add to `api:list` command output (conditionally):
   - `...(visibility.allowKnowledgeExport ? ['export'] : [])`
   - `...(visibility.allowKnowledgeImport ? ['import'] : [])`
</action>
<acceptance_criteria>
- `visibility` object in `packages/cli/src/index.ts` contains `allowKnowledgeImport`
- `api:list` command conditionally includes `export` and `import`
- `registerOperationsCommands` called with `allowImport` option
- Running `pnpm --filter @skill-shareer/cli build` exits 0
</acceptance_criteria>
</task>

<task id="7">
<read_first>
- packages/server/src/routes/operations.test.ts
- packages/server/src/lib/import-export.ts
</read_first>
<action>
Add tests for import/export to `packages/server/src/routes/operations.test.ts`:

1. Test `POST /v1/operations/export`:
   - Test that user can export entries where their level >= entry.requiredLevel
   - Test that entries above user's level are excluded
   - Test that team filter works
   - Test that system-admin can export all entries

2. Test `POST /v1/operations/import`:
   - Test that import succeeds when requestedLevel <= user's level
   - Test that import fails when requestedLevel > user's level
   - Test that import creates entries with correct lifecycle state
   - Test that multiple entries can be imported
   - Test that partial success is tracked (some fail, some succeed)

3. Test `parseClaudeSkill`:
   - Test parsing valid SKILL.md with frontmatter
   - Test returning null for invalid content

4. Test `detectDuplicates`:
   - Test detecting duplicate by shortcut
   - Test returning empty array when no duplicates
</action>
<acceptance_criteria>
- `packages/server/src/routes/operations.test.ts` contains tests for export endpoint
- `packages/server/src/routes/operations.test.ts` contains tests for import endpoint
- Tests exist for `parseClaudeSkill` function
- Tests exist for `detectDuplicates` function
- Running `pnpm --filter @skill-shareer/server test` exits 0
</acceptance_criteria>
</task>
</tasks>

<verification>
<must_haves>
- [ ] Members can export knowledge they have access to in JSON format
- [ ] Members can import knowledge entries from JSON
- [ ] Imported entries' requiredLevel cannot exceed importer's level
- [ ] Duplicate detection works during import
</must_haves>
<validation_steps>
- Command: `pnpm --filter @skill-shareer/contracts build && pnpm --filter @skill-shareer/server build && pnpm --filter @skill-shareer/cli build`
- Command: `pnpm --filter @skill-shareer/server test`
- Manual: Start server, login, run `skill-shareer export --help` and `skill-shareer import --help`
</validation_steps>
</verification>
