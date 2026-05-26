# System Truth Sources

Each architecture fact has one authoritative source. When secondary docs drift, the authoritative source wins.

| Topic | Authoritative Source | Secondary Docs |
|---|---|---|
| Server entry point | `packages/server/src/app.ts` (`buildServer()`) | `docs/guides/CODE_GUIDE.md`, `architecture.md` |
| Startup sequence | `packages/server/src/bootstrap/run-startup-sequence.ts` | `docs/architecture/ARCHITECTURE.md` |
| Persistence migration state | `docs/reference/DATA_MODEL.md` | `docs/PACKAGES.md`, `docs/architecture/ARCHITECTURE.md` |
| DB schema | `packages/server/src/lib/persistence/schema/index.ts` | `docs/reference/DATABASE_SCHEMA.md` |

## Rules

1. **Authoritative source wins.** When secondary docs conflict with the authoritative source, update the secondary doc.
2. **`store_snapshot` is a compatibility layer**, not the PG primary read path for identity/audit domains. The authoritative current migration state is in `docs/reference/DATA_MODEL.md`.
3. All pull requests that touch architecture or persistence docs must verify consistency against this table.
