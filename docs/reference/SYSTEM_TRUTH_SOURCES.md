# System Truth Sources

Each architecture fact has one authoritative source. When secondary docs drift, the authoritative source wins.

| Topic | Authoritative Source | Secondary Docs |
|---|---|---|
| Server entry point | `packages/server/src/app.ts` (`buildServer()`) | `docs/guides/CODE_GUIDE.md`, `docs/architecture/ARCHITECTURE.md` |
| Startup sequence | `packages/server/src/bootstrap/run-startup-sequence.ts` | `docs/architecture/ARCHITECTURE.md`, `docs/guides/CODE_GUIDE.md` |
| Persistence migration state | `docs/reference/DATA_MODEL.md` | `docs/PACKAGES.md`, `docs/architecture/ARCHITECTURE.md` |
| DB schema | `packages/server/src/lib/persistence/schema/index.ts` (barrel, re-exports all domain table modules) | `docs/reference/DATABASE_SCHEMA.md` |
| Server data-access boundary | `packages/server/src/lib/actors/lookup.ts` (actor lookup), `packages/server/src/lib/repos/index.ts` (`SkillShareerRepos`) | `docs/PACKAGES.md`, `docs/reference/DATA_MODEL.md` |

## Rules

1. **Authoritative source wins.** When secondary docs conflict with the authoritative source, update the secondary doc.
2. **`store_snapshot` is a compatibility layer.** It is no longer the PG primary read path for identity/audit domains (Round 10 Phase 3 completed migration), but it is still used as a compatibility layer for unmigrated domains and on certain startup paths (e.g. candidate recovery). See `docs/reference/DATA_MODEL.md`.
3. **Route/business logic reads current aggregate state from `repos`, not from snapshot compatibility data.** The canonical data-access boundary for server business logic is `app.skillShareer.repos`. Actor lookup (user handles, membership levels) uses `packages/server/src/lib/actors/lookup.ts` backed by `repos.user` and `repos.membership`. The only remaining `store.snapshot()` / `store.transact()` usage in core routes is for the supersede workflow, which will be migrated in Phase 3.
4. All pull requests that touch architecture or persistence docs must verify consistency against this table.

## CI Guards

Two automated guards enforce these rules on every PR. They run as the `architecture-guardrails` job in CI and can be run locally.

### Doc Drift Guard

```bash
pnpm check:docs-drift
```

Checks that key documentation files contain required phrases and do not contain stale or banned phrases. Rules are defined in `scripts/complexity-budgets.json` under `docRules`.

Current rules:
- `docs/guides/CODE_GUIDE.md` must contain `buildServer()` and must NOT contain `createApp()`
- `docs/architecture/ARCHITECTURE.md` must contain a reference to `SYSTEM_TRUTH_SOURCES.md`

**To add a new rule:** edit `scripts/complexity-budgets.json` and add an entry to `docRules` with `file`, optional `mustContain`, and optional `mustNotContain` arrays.

### Complexity Budget Guard

```bash
pnpm check:complexity
```

Checks that tracked hotspot files do not exceed their configured line budgets. Rules are defined in `scripts/complexity-budgets.json` under `lineBudgets`.

Current budgets:
| File | Budget | Current |
|---|---|---|
| `packages/server/src/app.ts` | 350 lines | ~307 |
| `packages/server/src/routes/candidates.ts` | 150 lines | ~15 |
| `packages/server/src/lib/persistence/schema.ts` | 200 lines | ~16 |
| `packages/server/src/lib/artifacts/pg-repository.ts` | 250 lines | ~17 |

**To adjust a budget:** edit `scripts/complexity-budgets.json` and update the `maxLines` value for the relevant file. Budgets should be set at a level that triggers a warning before a file becomes unmanageable, not at the current size.

**To add a new tracked file:** add an entry to `lineBudgets` with `file` and `maxLines`.
