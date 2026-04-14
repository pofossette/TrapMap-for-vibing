---
plan: 03
phase: 5
wave: 3
depends_on:
  - 01
  - 02
files_modified:
  - packages/contracts/src/domain/operations.ts
  - packages/server/src/routes/operations.ts
  - packages/server/src/routes/review.ts
  - packages/server/src/lib/audit.ts
  - packages/server/src/lib/store.ts
  - packages/cli/src/commands/audit.ts
  - packages/cli/src/index.ts
requirements_addressed:
  - OPS-04
autonomous: true
---

# Plan: Audit Trail and Operational Safeguards

<objective>
Implement comprehensive audit trail for review, import, export, and deactivation actions with CLI query capability.
</objective>

<tasks>
<task id="1">
<read_first>
- packages/contracts/src/domain/operations.ts
- packages/contracts/src/domain/common.ts
</read_first>
<action>
Extend `packages/contracts/src/domain/operations.ts`:

1. Add `auditQuerySchema` with:
   - `action`: optional array of action types ['knowledge-reviewed', 'knowledge-imported', 'knowledge-exported', 'knowledge-deactivated', 'member-updated']
   - `actorId`: optional string (filter by actor)
   - `entityId`: optional string (filter by entity)
   - `teamId`: optional string (filter by team)
   - `from`: optional ISO timestamp (filter from date)
   - `to`: optional ISO timestamp (filter to date)
   - `limit`: number default 25, max 100
   - `cursor`: optional string

2. Add `auditListResponseSchema` with:
   - `items`: array of `auditEventSchema`
   - `nextCursor`: nullable string
   - `total`: number

3. Export types: `AuditQuery`, `AuditListResponse`

Note: `auditEventSchema` already exists in operations.ts from Phase 1 contracts.
</action>
<acceptance_criteria>
- `packages/contracts/src/domain/operations.ts` contains `auditQuerySchema`
- `packages/contracts/src/domain/operations.ts` contains `auditListResponseSchema`
- Running `pnpm --filter @skill-shareer/contracts build` exits 0
</acceptance_criteria>
</task>

<task id="2">
<read_first>
- packages/server/src/lib/store.ts
- packages/server/src/lib/knowledge.ts
</read_first>
<action>
Create `packages/server/src/lib/audit.ts`:

1. Export `createAuditEvent(args: { store, data, teamId, actor, action, entityId, payload }): AuditEventRecord`:
   - Generate ID using `store.nextId(data, 'audit')`
   - Set `createdAt` and `updatedAt` to `nowIso()`
   - Return the complete audit record

2. Export `toAuditEvent(record: AuditEventRecord, data: StoreData): AuditEvent`:
   - Map the record to the contract type
   - Resolve actor handle from users array

3. Export `queryAuditEvents(args: { data, query, auth }): { items: AuditEvent[], total: number }`:
   - Filter by action types if specified
   - Filter by actorId if specified
   - Filter by entityId if specified
   - Filter by teamId if specified (or use auth.activeTeamId)
   - Filter by date range if specified
   - For non-system-admin: only show events for teams where user is member, or global events (teamId null)
   - Sort by createdAt descending
   - Apply limit
</action>
<acceptance_criteria>
- `packages/server/src/lib/audit.ts` file exists
- File exports `createAuditEvent` function
- File exports `toAuditEvent` function
- File exports `queryAuditEvents` function
- Running `pnpm --filter @skill-shareer/server build` exits 0
</acceptance_criteria>
</task>

<task id="3">
<read_first>
- packages/server/src/routes/operations.ts
- packages/server/src/routes/review.ts
- packages/server/src/lib/audit.ts
</read_first>
<action>
Update `packages/server/src/routes/operations.ts` to record audit events:

1. In `POST /v1/operations/knowledge/:entryId/deactivate`:
   - After successful deactivation, call `createAuditEvent` with:
     - `action: 'knowledge-deactivated'`
     - `entityId: entry.id`
     - `payload: { reason, previousState: entry.lifecycleState }`

2. In `POST /v1/operations/export`:
   - After building the export bundle, call `createAuditEvent` with:
     - `action: 'knowledge-exported'`
     - `entityId: 'batch'` (or first entry id)
     - `payload: { entryCount, teamId, includeHistory }`

3. In `POST /v1/operations/import`:
   - For each successfully imported entry, call `createAuditEvent` with:
     - `action: 'knowledge-imported'`
     - `entityId: entry.id`
     - `payload: { source, requestedLevel }`
</action>
<acceptance_criteria>
- `packages/server/src/routes/operations.ts` imports `createAuditEvent` from audit lib
- Deactivate endpoint calls `createAuditEvent` with action `'knowledge-deactivated'`
- Export endpoint calls `createAuditEvent` with action `'knowledge-exported'`
- Import endpoint calls `createAuditEvent` with action `'knowledge-imported'`
- Running `pnpm --filter @skill-shareer/server build` exits 0
</acceptance_criteria>
</task>

<task id="4">
<read_first>
- packages/server/src/routes/review.ts
- packages/server/src/lib/audit.ts
</read_first>
<action>
Update `packages/server/src/routes/review.ts` to record audit events:

In `POST /v1/knowledge/review`:
- After successful review decision, call `createAuditEvent` with:
  - `action: 'knowledge-reviewed'`
  - `entityId: entry.id`
  - `payload: { decision, notes, previousState }`

Import `createAuditEvent` from `'../lib/audit.js'`
</action>
<acceptance_criteria>
- `packages/server/src/routes/review.ts` imports `createAuditEvent` from audit lib
- Review endpoint calls `createAuditEvent` with action `'knowledge-reviewed'`
- Running `pnpm --filter @skill-shareer/server build` exits 0
</acceptance_criteria>
</task>

<task id="5">
<read_first>
- packages/server/src/routes/operations.ts
- packages/server/src/lib/audit.ts
- packages/server/src/lib/rbac.ts
</read_first>
<action>
Add audit query endpoint to `packages/server/src/routes/operations.ts`:

1. `GET /v1/operations/audit`:
   - Call `resolveAuthContext` to get auth
   - Require `audit:read` permission using `requirePermission`
   - Parse query params using `auditQuerySchema`
   - Call `queryAuditEvents` with data, query, and auth
   - Map records using `toAuditEvent`
   - Return `auditListResponseSchema.parse({ items, nextCursor: null, total })`

2. Update `packages/server/src/app.ts` to add `'GET /v1/operations/audit'` to documentedRoutes
</action>
<acceptance_criteria>
- `packages/server/src/routes/operations.ts` contains `GET /v1/operations/audit` endpoint
- Endpoint checks `audit:read` permission
- `packages/server/src/app.ts` documentedRoutes contains `'GET /v1/operations/audit'`
- Running `pnpm --filter @skill-shareer/server build` exits 0
</acceptance_criteria>
</task>

<task id="6">
<read_first>
- packages/cli/src/commands/operations.ts
- packages/cli/src/lib/output.ts
</read_first>
<action>
Create `packages/cli/src/commands/audit.ts`:

1. `audit` command:
   - Description: "Query audit trail for team operations"
   - Options:
     - `--action <action>` (can be repeated for multiple actions)
     - `--actor <userId>` (filter by actor)
     - `--entity <entityId>` (filter by entity)
     - `--from <date>` (ISO date string)
     - `--to <date>` (ISO date string)
     - `--limit <n>` (default 25)
     - `--json`
   - Call `GET /v1/operations/audit` with query params
   - Format output showing: timestamp, action, actor handle, entity id, summary
   - Support `--json` flag for raw output

2. Export `registerAuditCommands(program: Command, options: { allowRead: boolean }): void`
</action>
<acceptance_criteria>
- `packages/cli/src/commands/audit.ts` file exists
- File exports `registerAuditCommands` function
- File contains `audit` command with `--action`, `--actor`, `--entity`, `--from`, `--to`, `--limit`, `--json` options
- Running `pnpm --filter @skill-shareer/cli build` exits 0
</acceptance_criteria>
</task>

<task id="7">
<read_first>
- packages/cli/src/index.ts
- packages/cli/src/commands/audit.ts
</read_first>
<action>
Update `packages/cli/src/index.ts`:

1. Import `registerAuditCommands` from `'./commands/audit.js'`

2. Add to `visibility` object:
   - `allowAuditRead: hasPermission(effectivePermissions, 'audit:read')`

3. Add to `api:list` command output (conditionally):
   - `...(visibility.allowAuditRead ? ['audit'] : [])`

4. Call `registerAuditCommands(program, { allowRead: visibility.allowAuditRead })` after other command registrations
</action>
<acceptance_criteria>
- `packages/cli/src/index.ts` imports `registerAuditCommands`
- `visibility` object contains `allowAuditRead`
- `api:list` command conditionally includes `audit`
- `registerAuditCommands` is called
- Running `pnpm --filter @skill-shareer/cli build` exits 0
</acceptance_criteria>
</task>

<task id="8">
<read_first>
- packages/server/src/routes/operations.test.ts
- packages/server/src/lib/audit.ts
</read_first>
<action>
Add tests for audit trail to `packages/server/src/routes/operations.test.ts`:

1. Test `GET /v1/operations/audit`:
   - Test that user with `audit:read` permission can query
   - Test that user without permission gets 403
   - Test filter by action works
   - Test filter by actor works
   - Test filter by date range works
   - Test that non-admin only sees events for their team or global

2. Test audit event creation:
   - Test that deactivation creates audit event
   - Test that export creates audit event
   - Test that import creates audit event for each entry
   - Test that review decision creates audit event

3. Test `queryAuditEvents`:
   - Test all filter combinations
   - Test permission-based filtering for non-admin users
</action>
<acceptance_criteria>
- `packages/server/src/routes/operations.test.ts` contains tests for audit query endpoint
- Tests verify audit events are created for deactivation
- Tests verify audit events are created for export
- Tests verify audit events are created for import
- Tests verify audit events are created for review
- Running `pnpm --filter @skill-shareer/server test` exits 0
</acceptance_criteria>
</task>

<task id="9">
<read_first>
- packages/server/src/routes/operations.ts
- packages/server/src/routes/review.ts
- packages/server/src/routes/knowledge.ts
</read_first>
<action>
Add end-to-end workflow test to `packages/server/src/routes/operations.test.ts`:

Create a comprehensive E2E test that:
1. Creates a knowledge entry as user A
2. Submits it for review
3. Approves it as user B (higher level)
4. Exports the entry
5. Deactivates the entry
6. Queries audit trail and verifies all 4 actions appear:
   - knowledge-reviewed
   - knowledge-exported
   - knowledge-deactivated
   - (and the original submission/review flow)

This validates that the full lifecycle is auditable.
</action>
<acceptance_criteria>
- `packages/server/src/routes/operations.test.ts` contains E2E workflow test
- E2E test verifies audit trail captures full lifecycle
- Running `pnpm --filter @skill-shareer/server test` exits 0
</acceptance_criteria>
</task>
</tasks>

<verification>
<must_haves>
- [ ] Review operations are recorded in audit trail
- [ ] Import operations are recorded in audit trail
- [ ] Export operations are recorded in audit trail
- [ ] Deactivation operations are recorded in audit trail
- [ ] CLI can query audit trail with filters
- [ ] Permissions control audit access
</must_haves>
<validation_steps>
- Command: `pnpm --filter @skill-shareer/server test`
- Manual: Start server, login as admin user, perform review/export/deactivate, then run `skill-shareer audit --json`
</validation_steps>
</verification>