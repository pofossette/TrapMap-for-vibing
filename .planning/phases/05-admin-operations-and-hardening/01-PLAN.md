---
plan: 01
phase: 5
wave: 1
depends_on: []
files_modified:
  - packages/contracts/src/domain/operations.ts
  - packages/server/src/routes/operations.ts
  - packages/server/src/routes/knowledge.ts
  - packages/server/src/app.ts
  - packages/cli/src/commands/operations.ts
  - packages/cli/src/index.ts
requirements_addressed:
  - OPS-01
autonomous: true
---

# Plan: Admin Entry Management Endpoints and CLI

<objective>
Add admin entry management endpoints and CLI commands for listing, editing, and deactivating knowledge entries with proper permission checks.
</objective>

<tasks>
<task id="1">
<read_first>
- packages/contracts/src/domain/operations.ts
- packages/contracts/src/domain/knowledge.ts
- packages/contracts/src/domain/common.ts
</read_first>
<action>
Extend the operations contracts in `packages/contracts/src/domain/operations.ts`:

1. Add `knowledgeListRequestSchema` with:
   - `scope`: optional enum ['global', 'project']
   - `lifecycleState`: optional array of lifecycle states
   - `requiredLevelMax`: optional number (filter entries at or below this level)
   - `ownerUserId`: optional string (filter by owner)
   - `limit`: number default 25, max 100
   - `cursor`: optional string

2. Add `knowledgeListResponseSchema` with:
   - `items`: array of `knowledgeListItemSchema`
   - `nextCursor`: nullable string
   - `total`: number

3. Add `knowledgeDeactivateResponseSchema` with:
   - `entry`: `knowledgeEntrySchema`

4. Export types: `KnowledgeListRequest`, `KnowledgeListResponse`, `KnowledgeDeactivateResponse`
</action>
<acceptance_criteria>
- `packages/contracts/src/domain/operations.ts` contains `knowledgeListRequestSchema`
- `packages/contracts/src/domain/operations.ts` contains `knowledgeListResponseSchema`
- `packages/contracts/src/domain/operations.ts` contains `knowledgeDeactivateResponseSchema`
- Running `pnpm --filter @skill-shareer/contracts build` exits 0
</acceptance_criteria>
</task>

<task id="2">
<read_first>
- packages/server/src/routes/knowledge.ts
- packages/server/src/lib/rbac.ts
- packages/server/src/lib/knowledge.ts
- packages/server/src/lib/store.ts
</read_first>
<action>
Create `packages/server/src/routes/operations.ts` with the following endpoints:

1. `GET /v1/operations/knowledge`:
   - Call `resolveAuthContext` to get auth
   - Require `knowledge:export` permission using `requirePermission`
   - Parse query params using `knowledgeListRequestSchema`
   - Filter entries where:
     - For system-admin: all entries
     - For user: only entries where `auth.securityLevel > entry.requiredLevel` OR entry is in their active team
   - Apply optional filters (scope, lifecycleState, requiredLevelMax, ownerUserId)
   - Sort by `updatedAt` descending
   - Return `knowledgeListResponseSchema.parse({ items, nextCursor: null, total })`

2. `POST /v1/operations/knowledge/:entryId/deactivate`:
   - Call `resolveAuthContext` to get auth
   - Require `knowledge:update` permission
   - Parse body using `knowledgeDeactivateRequestSchema`
   - Find entry by `entryId`, return 404 if not found
   - If entry has `teamId`, call `requireTeamAccess(auth, entry.teamId)`
   - Call `requireHigherLevel(auth, entry.requiredLevel)` - only higher level can deactivate
   - Set `entry.lifecycleState = 'deactivated'`
   - Add lifecycle event with type `'deactivated'` and note containing the reason
   - Update `entry.updatedAt`
   - Return `knowledgeDeactivateResponseSchema.parse({ entry: toKnowledgeEntry(data, entry) })`
</action>
<acceptance_criteria>
- `packages/server/src/routes/operations.ts` file exists
- File contains `GET /v1/operations/knowledge` endpoint
- File contains `POST /v1/operations/knowledge/:entryId/deactivate` endpoint
- Both endpoints call `resolveAuthContext`
- Running `pnpm --filter @skill-shareer/server build` exits 0
</acceptance_criteria>
</task>

<task id="3">
<read_first>
- packages/server/src/app.ts
- packages/server/src/routes/operations.ts
</read_first>
<action>
Update `packages/server/src/app.ts`:

1. Import `operationsRoutes` from `'./routes/operations.js'`

2. Register the routes by adding `app.register(operationsRoutes)` after the other route registrations

3. Update the `documentedRoutes` array to include:
   - `'GET /v1/operations/knowledge'`
   - `'POST /v1/operations/knowledge/:entryId/deactivate'`
</action>
<acceptance_criteria>
- `packages/server/src/app.ts` imports `operationsRoutes`
- `packages/server/src/app.ts` calls `app.register(operationsRoutes)`
- `documentedRoutes` array contains `'GET /v1/operations/knowledge'`
- `documentedRoutes` array contains `'POST /v1/operations/knowledge/:entryId/deactivate'`
- Running `pnpm --filter @skill-shareer/server build` exits 0
</acceptance_criteria>
</task>

<task id="4">
<read_first>
- packages/cli/src/commands/knowledge.ts
- packages/cli/src/commands/review.ts
- packages/cli/src/lib/output.ts
- packages/cli/src/lib/http.ts
- packages/server/src/routes/knowledge.ts (existing PATCH /v1/knowledge/:entryId endpoint)
</read_first>
<action>
Create `packages/cli/src/commands/operations.ts` with CLI commands:

1. `list` command:
   - Description: "List knowledge entries with optional filters"
   - Options: `--scope <scope>`, `--state <state>`, `--max-level <n>`, `--owner <userId>`, `--json`
   - Call `GET /v1/operations/knowledge` with query params
   - Format output showing: id, scope, state, requiredLevel, shortcut for each entry
   - Support `--json` flag for raw output

2. `edit` command:
   - Description: "Edit a knowledge entry"
   - Arguments: `<entryId>`
   - Options: `--shortcut <text>`, `--detail <text>`, `--labels <labels>`, `--required-level <n>`, `--json`
   - Call existing `PATCH /v1/knowledge/:entryId` with `{ entryId, shortcut?, detail?, labels?, requiredLevel? }`
   - Only send fields that are provided as options
   - Print confirmation with updated entry id
   - Note: Server endpoint already exists at `packages/server/src/routes/knowledge.ts` line ~170

3. `deactivate` command:
   - Description: "Deactivate a knowledge entry"
   - Arguments: `<entryId>`
   - Required option: `--reason <text>` (min 1 char, max 500)
   - Option: `--json`
   - Call `POST /v1/operations/knowledge/:entryId/deactivate` with `{ entryId, reason }`
   - Print confirmation with entry id and new state
</action>
<acceptance_criteria>
- `packages/cli/src/commands/operations.ts` file exists
- File exports `registerOperationsCommands` function
- `registerOperationsCommands` accepts `program: Command` and `options: OperationsCommandOptions`
- File contains `list` command with `--scope`, `--state`, `--max-level`, `--owner`, `--json` options
- File contains `edit` command with `<entryId>` argument and `--shortcut`, `--detail`, `--labels`, `--required-level`, `--json` options
- File contains `deactivate` command with `<entryId>` argument and `--reason`, `--json` options
- Running `pnpm --filter @skill-shareer/cli build` exits 0
</acceptance_criteria>
</task>

<task id="5">
<read_first>
- packages/cli/src/index.ts
- packages/cli/src/commands/operations.ts
</read_first>
<action>
Update `packages/cli/src/index.ts`:

1. Import `registerOperationsCommands` from `'./commands/operations.js'`

2. Add to `visibility` object:
   - `allowKnowledgeExport: hasPermission(effectivePermissions, 'knowledge:export')`
   - `allowKnowledgeUpdate: securityLevel >= 1 && hasPermission(effectivePermissions, 'knowledge:update')`
   - `allowKnowledgeDeactivate: securityLevel >= 1 && hasPermission(effectivePermissions, 'knowledge:update')`

3. Add to `api:list` command output (conditionally):
   - `...(visibility.allowKnowledgeExport ? ['list'] : [])`
   - `...(visibility.allowKnowledgeUpdate ? ['edit'] : [])`
   - `...(visibility.allowKnowledgeDeactivate ? ['deactivate'] : [])`

4. Call `registerOperationsCommands(program, { allowExport: visibility.allowKnowledgeExport, allowEdit: visibility.allowKnowledgeUpdate, allowDeactivate: visibility.allowKnowledgeDeactivate })` after other command registrations
</action>
<acceptance_criteria>
- `packages/cli/src/index.ts` imports `registerOperationsCommands`
- `visibility` object contains `allowKnowledgeExport`
- `visibility` object contains `allowKnowledgeUpdate`
- `visibility` object contains `allowKnowledgeDeactivate`
- `api:list` command conditionally includes `list`, `edit`, and `deactivate`
- `registerOperationsCommands` is called with appropriate options
- Running `pnpm --filter @skill-shareer/cli build` exits 0
</acceptance_criteria>
</task>

<task id="6">
<read_first>
- packages/server/src/routes/operations.ts
- packages/server/src/lib/retrieval.test.ts
- packages/server/src/lib/store.ts
</read_first>
<action>
Create `packages/server/src/routes/operations.test.ts` with tests:

1. Test `GET /v1/operations/knowledge`:
   - Test that user can list entries where their level > entry.requiredLevel
   - Test that system-admin can list all entries
   - Test that filter by scope works
   - Test that filter by lifecycleState works
   - Test that filter by requiredLevelMax works
   - Test that project entries from other teams are excluded for non-admin

2. Test `POST /v1/operations/knowledge/:entryId/deactivate`:
   - Test that user with level > entry.requiredLevel can deactivate
   - Test that user with level <= entry.requiredLevel gets 403
   - Test that deactivation sets lifecycleState to 'deactivated'
   - Test that deactivation adds lifecycle event with reason
   - Test that 404 is returned for non-existent entry
</action>
<acceptance_criteria>
- `packages/server/src/routes/operations.test.ts` file exists
- File contains test for `GET /v1/operations/knowledge` endpoint
- File contains test for `POST /v1/operations/knowledge/:entryId/deactivate` endpoint
- Running `pnpm --filter @skill-shareer/server test` exits 0
</acceptance_criteria>
</task>
</tasks>

<verification>
<must_haves>
- [ ] Members can list knowledge entries they have permission to access
- [ ] Members can edit entries where their level > entry.requiredLevel
- [ ] Members can deactivate entries where their level > entry.requiredLevel
- [ ] CLI commands `list`, `edit`, and `deactivate` work from terminal
- [ ] Permission checks block unauthorized access
</must_haves>
<validation_steps>
- Command: `pnpm --filter @skill-shareer/contracts build && pnpm --filter @skill-shareer/server build && pnpm --filter @skill-shareer/cli build`
- Command: `pnpm --filter @skill-shareer/server test`
- Manual: Start server, login as user, run `skill-shareer list --help`, `skill-shareer edit --help`, and `skill-shareer deactivate --help`
</validation_steps>
</verification>
