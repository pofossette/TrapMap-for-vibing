# Compose Runtime Closeout Insert Regression Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the isolated Compose runtime-closeout gate by completing the missing audit migration journal entry, preserving the corrected knowledge insert binding, and recording only real Tranche 7 and mainline-closeout evidence.

**Architecture:** The first Compose failure was a PostgreSQL knowledge repository binding error; the regression test and two-value correction now cover it. The remaining empty-database failure is migration metadata drift: `0020_observability_audit_correlation.sql` exists and is owned by the compatibility seam, but its tag is absent from Drizzle's `_journal.json`, so Drizzle does not apply it. Register the migration, add a journal-completeness guard beside the existing owner-manifest guard, then run the existing disposable Compose closeout without changing authentication, teams, restart behavior, or maturity semantics.

**Tech Stack:** TypeScript, `pg`, Vitest, pnpm, Docker Compose, Bash.

## Global Constraints

- Preserve the existing `knowledge_entries` column list and migration/schema; this is a parameter-binding fix, not a data-model change.
- Register the already-authored `0020_observability_audit_correlation.sql`; do not replace it with compatibility DDL in `runMigrations()` or duplicate its audit columns in a new migration.
- Treat every `.sql` migration as executable only when its basename has both an ownership-manifest entry and a Drizzle journal tag; an incomplete journal must fail before migration execution.
- Do not add an active team, synthetic user, team membership, or system-admin exception merely to make the closeout probe pass.
- Keep the knowledge-write owner boundary intact: the repository remains exposed only through `createServicePorts(pool, 'knowledge-write')`.
- Do not weaken `ck_knowledge_entries_lifecycle_state` or any database constraint.
- Keep `test:runtime-closeout:compose` disposable: generated key/port, isolated Compose project, and `down --volumes --remove-orphans` cleanup remain unchanged.
- A passing local restart gate proves only local restart isolation. Keep the distributed maturity claim at `Level 2 / transitional-microservice` unless independent measurable scaling, isolation, or operational-benefit evidence is supplied.
- Do not create a Git commit unless the user explicitly requests one.
- Prefix repository commands with `rtk`.

---

## File Map

| File | Responsibility |
| --- | --- |
| `packages/host-distributed/src/shared/ports.ts` | Binds `KnowledgeRepositoryPort.insert()` values to the `knowledge_entries` insert statement. |
| `packages/host-distributed/src/shared/ports.transaction.test.ts` | Regression coverage for ordered insert bindings, alongside lifecycle persistence tests. |
| `packages/server/drizzle/meta/_journal.json` | Drizzle's ordered migration history; must include the `0020_observability_audit_correlation` tag. |
| `packages/server/src/lib/persistence/migration-ownership.ts` | Validates both migration ownership metadata and Drizzle journal coverage. |
| `packages/server/src/lib/persistence/migration-runner.ts` | Reads the journal before invoking Drizzle migration execution. |
| `packages/server/src/lib/persistence/migration-ownership.test.ts` | Regression coverage for missing or stale journal tags. |
| `docs/todos/observability-traceability-closure.md` | Records the actual Compose outcome and only then updates Tranche 7 completion status. |

### Task 0: Restore and Guard Drizzle Journal Coverage

**Files:**

- Modify: `packages/server/drizzle/meta/_journal.json`
- Modify: `packages/server/src/lib/persistence/migration-ownership.ts`
- Modify: `packages/server/src/lib/persistence/migration-runner.ts`
- Modify: `packages/server/src/lib/persistence/migration-ownership.test.ts`

**Interfaces:**

- Consumes: SQL filenames from `packages/server/drizzle/`, the ordered `entries[].tag` strings in `_journal.json`, and `assertMigrationManifestComplete()`.
- Produces: `assertDrizzleJournalComplete(migrations, journalTags)`, which rejects an unjournaled SQL migration or a journal tag without a matching SQL migration before `migrate()` runs.

- [ ] **Step 1: Write the journal-completeness tests.**

Add a test that passes `['0020_observability_audit_correlation.sql']` with `[]` journal tags and expects an error naming the migration. Add a second test that passes no migrations with `['0020_observability_audit_correlation']` and expects an error naming the stale tag. Keep the existing ownership-manifest tests unchanged.

- [ ] **Step 2: Verify RED.**

Run:

```bash
rtk pnpm --filter @trapmap/server test --run src/lib/persistence/migration-ownership.test.ts
```

Expected: the new assertions fail because no journal-completeness helper exists.

- [ ] **Step 3: Implement the guard and register `0020`.**

Append this journal entry after index `19`, retaining the journal's existing version and breakpoint convention:

```json
{
  "idx": 20,
  "version": "7",
  "when": 1779404000000,
  "tag": "0020_observability_audit_correlation",
  "breakpoints": true
}
```

In `migration-ownership.ts`, compare each SQL filename without its `.sql` suffix to the journal tags and throw `MigrationOwnershipError` for either missing or stale entries. In `migration-runner.ts`, read `_journal.json`, validate its `entries[].tag` values with the discovered SQL files, then invoke `migrate()`. Do not add fallback DDL for `audit_events`.

- [ ] **Step 4: Verify GREEN.**

Run:

```bash
rtk pnpm --filter @trapmap/server test --run src/lib/persistence/migration-ownership.test.ts
rtk pnpm typecheck
```

Expected: the migration tests and typecheck exit successfully.

- [ ] **Step 5: Verify an empty database applies `0020`.**

Run the disposable acceptance command in Task 3. Its initial empty PostgreSQL database is the integration assertion: probe creation must get past the `audit_events.event_version` insert before any `knowledge-write` restart occurs.

## Failure Model

The production statement lists columns in this order:

```sql
..., required_level, lifecycle_state, owner_user_id, created_at, updated_at
```

The current values array instead binds:

```ts
..., requiredLevel, ownerUserId, lifecycleState, createdAt, updatedAt
```

Consequently a probe with `actorId: 'system-admin'` attempts to write `system-admin` to `lifecycle_state`. PostgreSQL rejects it through the lifecycle check constraint; the internal HTTP boundary maps the untyped persistence error to `500`. The existing closeout note that attributes this to a missing active team must be corrected after the fixed gate establishes the actual result.

### Task 1: Preserve the SQL Binding Regression Contract

**Files:**

- Modify: `packages/host-distributed/src/shared/ports.transaction.test.ts`
- Reads: `packages/host-distributed/src/shared/ports.ts:150`

**Interfaces:**

- Consumes: `createServicePorts(pool, 'knowledge-write').repos.knowledge.insert(entry)`.
- Produces: a test that fails while positional parameters 8 and 9 are reversed and identifies their intended semantic values.

- [ ] **Step 1: Add the failing repository-level test.**

Place this test at the beginning of the existing `describe('knowledge-write lifecycle persistence', ...)` block. It uses a query spy so no Docker or PostgreSQL process is needed for the red/green loop.

```ts
it('binds lifecycle state before owner user ID when inserting knowledge', async () => {
  const query = vi.fn(async () => ({ rows: [] }));
  const ports = createServicePorts({ query } as never, 'knowledge-write');

  await ports.repos.knowledge.insert({
    id: 'entry-system-admin',
    teamId: null,
    content: 'compose closeout recovery probe',
    title: 'Compose closeout probe',
    labels: ['closeout'],
    lifecycleState: 'submitted',
    ownerUserId: 'system-admin',
    createdAt: '2026-07-12T00:00:00.000Z',
    updatedAt: '2026-07-12T00:00:00.000Z',
  } as never);

  expect(query).toHaveBeenCalledWith(
    expect.stringContaining('INSERT INTO knowledge_entries'),
    [
      'entry-system-admin',
      null,
      'global',
      JSON.stringify(['closeout']),
      'Compose closeout probe',
      'compose closeout recovery probe',
      0,
      'submitted',
      'system-admin',
      '2026-07-12T00:00:00.000Z',
      '2026-07-12T00:00:00.000Z',
    ],
  );
});
```

- [ ] **Step 2: Verify the test is red.**

Run:

```bash
rtk pnpm --filter @trapmap/host-distributed test --run src/shared/ports.transaction.test.ts
```

Expected: one failure in `binds lifecycle state before owner user ID when inserting knowledge`; the received array has `'system-admin'` at index 7 and `'submitted'` at index 8.

- [ ] **Step 3: Keep the failure diagnostic focused.**

Confirm the test has not required a team ID, active session, fake user, migration change, or Compose-script change. If it does, stop and remove that extra setup: the unit test must remain a direct assertion of SQL binding order.

### Task 2: Verify the Corrected Repository Binding

**Files:**

- Modify: `packages/host-distributed/src/shared/ports.ts:154-166`
- Test: `packages/host-distributed/src/shared/ports.transaction.test.ts`

**Interfaces:**

- Consumes: the test introduced in Task 1 and the existing SQL column order.
- Produces: correct values for `lifecycle_state` (`LifecycleState`) and `owner_user_id` (actor/user identifier) without changing `KnowledgeRepositoryPort`.

- [ ] **Step 1: Make the minimum implementation change.**

In the values array passed to `pool.query()`, replace the two reversed values with the following ordered fragment:

```ts
(entry as Record<string, unknown>).requiredLevel ?? 0,
entry.lifecycleState,
entry.ownerUserId,
(entry as Record<string, unknown>).createdAt ?? new Date().toISOString(),
(entry as Record<string, unknown>).updatedAt ?? new Date().toISOString(),
```

The complete surrounding SQL remains unchanged; do not rename placeholders, alter the insert columns, or catch/translate database errors here.

- [ ] **Step 2: Verify the focused test is green.**

Run:

```bash
rtk pnpm --filter @trapmap/host-distributed test --run src/shared/ports.transaction.test.ts
```

Expected: all tests in the file pass, including the new ordered-binding regression.

- [ ] **Step 3: Run type checking.**

Run:

```bash
rtk pnpm typecheck
```

Expected: exit code `0`.

### Task 3: Re-establish the Real Compose Acceptance Evidence

**Files:**

- Modify only if needed for evidence correction: `docs/todos/observability-traceability-closure.md`
- Execute without modification: `scripts/run-compose-runtime-closeout.sh`

**Interfaces:**

- Consumes: the fixed `knowledge-write` insert, Docker daemon availability, and the existing `test:runtime-closeout:compose` script.
- Produces: a measured `knowledge-write` restart recovery time, continuous gateway health, and continuous job-runtime operator status, or a precise new failure record.

- [ ] **Step 1: Confirm Docker is available before the heavyweight gate.**

Run:

```bash
rtk docker info --format '{{.ServerVersion}}'
```

Expected: a Docker Engine version. If the daemon is unavailable, do not mark Tranche 7 complete; record the unavailable external prerequisite and retain all Tranche 7 checkboxes.

- [ ] **Step 2: Run the isolated Compose closeout.**

Run:

```bash
rtk pnpm test:runtime-closeout:compose
```

Expected: after building a disposable project, output matching:

```text
knowledge-write restart recovery: <milliseconds>ms (gateway=true job-runtime=true)
```

The script must clean containers and volumes on success and failure. Do not replace this command with a manually started Compose stack, because the generated key/port and cleanup behavior are part of the acceptance contract.

- [ ] **Step 3: If the gate fails, preserve the actual failure boundary.**

Keep all Tranche 7 items unchecked. Capture the command, the failing phase (startup, authentication, probe creation, restart continuity, or post-restart delegation), and the service logs that the script emits. Do not add a workaround that changes auth/team behavior unless a separately scoped authorization defect is demonstrated by a focused test.

### Task 4: Complete the Tranche 7 Matrix and Close the Mainline Deliberately

**Files:**

- Modify: `docs/todos/observability-traceability-closure.md:253-274`
- Review: `packages/host-distributed/README.md:154-159`
- Review: `docs/operations/TESTING.md`
- Review: `docs/operations/REGRESSION-COMMANDS.md`

**Interfaces:**

- Consumes: a successful Task 3 result and the commands listed in the active Tranche 7 checklist.
- Produces: complete, truthful evidence for the local restart-isolation requirement; no unsupported Level 3 claim.

- [ ] **Step 1: Run the required regression commands after Compose success.**

Run in this order:

```bash
rtk pnpm test:distributed-acceptance
rtk pnpm test:distributed-closeout
rtk pnpm test:observability-closeout
rtk pnpm test:deployment-smoke
rtk pnpm typecheck
rtk pnpm check:docs-drift
rtk pnpm check:structure
```

Expected: every command exits `0`. `eval:smoke` is not required for this SQL-order-only fix because no retrieval, summary, governance, feedback, fixture, or eval runner behavior changes.

- [ ] **Step 2: Update the active Tranche evidence with observed facts only.**

Replace the current blocker line with an entry containing:

```markdown
- Fixed: `createPgKnowledgeRepo().insert()` now binds `lifecycle_state` before `owner_user_id`; a repository regression test covers the positional mapping.
- Passed: `rtk pnpm test:runtime-closeout:compose` — `knowledge-write` restart recovery: `<actual-ms>ms` (gateway=true job-runtime=true).
```

Add each successfully rerun command to the existing `Passed:` evidence line or a new dated entry. Use the exact observed millisecond value; never substitute a target or estimate.

- [ ] **Step 3: Update checkboxes according to the evidence boundary.**

Check the Tranche 7 acceptance, documentation, and verification items only if their stated requirements are met by the completed command matrix and documentation review. Leave the “quantifiable isolation, scaling, or operational benefit / Level 3 evidence” item unchecked: the Compose test documents restart isolation but explicitly does not prove Level 3 maturity.

- [ ] **Step 4: Re-read public command documentation for factual alignment.**

Ensure the README, testing guide, and regression-command guide still describe the Compose gate as a disposable local proof of restart isolation with a 60-second recovery ceiling. If they already say this, make no unrelated documentation edits.

- [ ] **Step 5: Re-scope the remaining Level 3 evidence before archival.**

Move the unchecked quantitative Level 3 evidence from the active Tranche 7 checklist into `docs/todos/open-debt-and-compromises.md` as a deferred platformization/operational-benefit entry, preserving its trigger condition and explicitly stating that Compose restart isolation is not such evidence. Update `docs/todos/observability-traceability-closure.md` so all remaining Tranche 7 checkboxes refer only to evidence produced by this completed mainline.

- [ ] **Step 6: Archive only after the completed evidence is recorded.**

When Steps 1–5 are green, use `git mv` to move `docs/todos/observability-traceability-closure.md` to `docs/archived/archived-plans/`. Update `docs/archived/README.md`, `docs/todos/README.md`, and root `plan.md` so the repository has exactly one status: no active mainline, with compatibility retirement retained only as a deferred candidate. Run:

```bash
rtk pnpm check:docs-drift
rtk pnpm check:structure
```

Expected: both documentation guards pass and no active execution surface points to the archived detail.

## Plan Self-Review

- **Coverage:** Task 1 catches the defect, Task 2 fixes it, Task 3 produces the missing real-runtime evidence, and Task 4 updates the active tranche without overstating maturity.
- **Scope:** The plan explicitly excludes team/auth changes, schema changes, lifecycle-constraint changes, and unrelated platformization debt.
- **Type consistency:** The test verifies the `KnowledgeRepositoryPort.insert()` input already consumed by `createPgKnowledgeRepo`; no new API, contract, or enum is introduced.
- **No placeholders:** The only runtime-specific value is `<actual-ms>`, intentionally supplied by the acceptance command rather than invented in documentation.

## Completion Criteria

- The new repository test fails before and passes after the two-value binding correction.
- `rtk pnpm test:runtime-closeout:compose` reports a measured recovery with `gateway=true` and `job-runtime=true`.
- The required Tranche 7 regression commands pass and the active todo records their actual results.
- The repository continues to claim `Level 2 / transitional-microservice`; the unproven Level 3 benefit remains deferred rather than blocking archival of this completed observability and operational-evidence mainline.
