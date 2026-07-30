# Wave 9 Legacy Snapshot Backfill Design

## Goal

Retire the `store_snapshot` JSONB compatibility store without losing legacy
domain records. A short-lived host-owned maintenance operation will read the
single PostgreSQL `store_snapshot.main` row once and write each supported
bucket through the concrete owner that owns its destination tables. After
verified migration evidence, the operation, its source adapter, the table,
and all `JsonStore`/`PostgresStore` compatibility code are deleted.

This is a development-stage cutover. It provides neither a runtime fallback
nor a durable import/export format.

## Scope

The operation is deliberately separate from normal service startup and from
the external gateway. `host-distributed` owns its composition because it may
depend on each owner implementation; services expose only a narrow,
temporary backfill input port and never import another service's concrete
implementation.

The source adapter issues a parameterized read for `key = 'main'`, validates
the JSON against an explicit legacy snapshot contract, and creates immutable
bucket views. No service receives the aggregate snapshot or an aggregate
store abstraction. The coordinator removes itself and every temporary port
in the same Wave 9 deletion change after acceptance evidence is recorded.

## Bucket Disposition

| Legacy bucket | Disposition | Destination owner | Acceptance rule |
| --- | --- | --- | --- |
| `users`, `teams`, `memberships`, `sessions`, `accessKeys`, `auditEvents` | migrate | `service-identity-access` | count and persisted required fields match |
| `knowledgeEntries`, `skillArtifacts`, `artifactFilePayloads` | migrate | `service-knowledge-write` | count, identity, revision and payload fields match |
| `candidateSubmissions`, `duplicateCases`, `entityLineage` | migrate | `service-candidate-ingestion` | count and canonical record contents match |
| `feedbackQueue`, `conflicts` | migrate | `service-governance-review` | count and canonical record contents match |
| `graphIndexDocuments` | rebuild from migrated owner data | `service-knowledge-read` | rebuild completes and owner projection count/keys match its authoritative sources |
| `promptVersion`, `rebuildState` | do not copy | `service-knowledge-read` | a clean full rebuild establishes current owner-local index state |
| `counters` | do not copy | none | no live destination consumes legacy counter allocation; owners generate identifiers locally |

The legacy contract rejects unknown top-level buckets, missing business
buckets, and malformed records. Only the retired technical state fields
`counters`, `promptVersion`, and `rebuildState` may use their explicit empty
or null defaults. A damaged business bucket must never be mistaken for an
intentionally empty owner domain.

## Execution Model

1. The coordinator loads and validates the legacy row before any owner write.
2. It performs dependency-ordered owner work: identity, knowledge-write,
   candidate-ingestion, governance-review, then knowledge-read rebuild.
3. Each owner handles only its bucket(s) inside local database transactions.
   The coordinator does not attempt a distributed transaction.
4. Owner behavior is strict and idempotent: insert a missing record; skip an
   equal record; reject a same-identity record with different canonical
   contents. Required-field and foreign-key failures are rejected.
5. Each owner returns source count, matching destination count, inserted and
   skipped counts, and record-scoped errors. The coordinator accepts success
   only when every bucket reports zero errors and full verification.
6. A failure terminates with a non-zero result and retains `store_snapshot`.
   Prior successful owner writes remain safe to retry because equality is
   checked before each write. There is no partial-success deletion path.

The implementation writes structured results to stdout for the operator and
the active detail records the exact invocation, source fingerprint/counts,
destination counts, and outcome. It does not write a JSON export file or
preserve a package script once the cutover succeeds.

## Validation Fixture

The integration fixture contains every bucket in the table above, including
cross-owner references: identity references used by audit data, knowledge and
artifact relationships, candidate/duplicate/lineage relationships, governance
records, and graph documents derived from migrated source data. It asserts:

- source and destination counts for every migrated bucket;
- required persisted fields and representative nested payload fields;
- a second run skips all equal destination records;
- a conflicting destination record is rejected without overwrite;
- a missing required source field is rejected before destination mutation;
- graph/index metadata is rebuilt from authoritative owner records, not copied
  from the compatibility snapshot.

The fixture is an implementation test input, not a new production data path.

## Deletion Gate

Destructive deletion is authorized only after all of these are green:

1. focused owner and coordinator tests cover the validation fixture;
2. the representative development PostgreSQL database backfill completes with
   matching verification and its factual result is recorded in the active
   compatibility-retirement detail;
3. all normal runtime paths no longer read or write `store_snapshot`;
4. the Wave 9 migration drops the table only after the evidence above;
5. the source adapter, coordinator command, temporary ports, legacy fixtures,
   `JsonStore`, `PostgresStore`, legacy schema/migration assets, and remaining
   production call sites are deleted in that retirement change;
6. empty-database Compose acceptance applies owner migrations and exercises
   the deployed flow without the compatibility store.

Docker/Compose evidence is required for final closeout. If Docker remains
unavailable, this fact is recorded as an external verification blocker; unit
tests and static scans do not substitute for it.

## Alternatives Rejected

Direct SQL JSONB expansion would be shorter but embeds domain validation and
record equivalence outside the owner modules. A JSON export/import workflow
would create a sensitive intermediate artifact and a second data path to
maintain. A runtime dual-read fallback would leave ownership ambiguous. The
chosen short-lived coordinator retains one source format, owner-local write
semantics, and a clear deletion boundary.

## Non-Goals

This work does not retire `packages/server`; that is Wave 10 and requires its
own validated plan. It does not claim cross-service atomicity, support
production rolling upgrade, or retain a generic snapshot migration framework.
