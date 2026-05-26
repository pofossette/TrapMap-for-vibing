# System Truth Sources

Each architecture fact has one authoritative source. When secondary docs drift, the authoritative source wins.

| Topic | Authoritative Source | Secondary Docs |
|---|---|---|
| Server entry point | `packages/server/src/app.ts` (`buildServer()`) | `docs/guides/CODE_GUIDE.md`, `docs/architecture/ARCHITECTURE.md` |
| Startup sequence | `packages/server/src/app.ts` (当前 onReady 钩子) → `packages/server/src/bootstrap/run-startup-sequence.ts` (planned, Task 2) | `docs/architecture/ARCHITECTURE.md` |
| Persistence migration state | `docs/reference/DATA_MODEL.md` | `docs/PACKAGES.md`, `docs/architecture/ARCHITECTURE.md` |
| DB schema | `packages/server/src/lib/persistence/schema.ts` (当前) → `packages/server/src/lib/persistence/schema/index.ts` (planned, Task 4) | `docs/reference/DATABASE_SCHEMA.md` |

## Rules

1. **Authoritative source wins.** When secondary docs conflict with the authoritative source, update the secondary doc.
2. **`store_snapshot` is a compatibility layer.** It is no longer the PG primary read path for identity/audit domains (Round 10 Phase 3 completed migration), but it is still used as a compatibility layer for unmigrated domains and on certain startup paths (e.g. candidate recovery). See `docs/reference/DATA_MODEL.md`.
3. All pull requests that touch architecture or persistence docs must verify consistency against this table.
