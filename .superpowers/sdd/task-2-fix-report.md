# Task 2 Fix Report: Migrate Missing Smoke Test Assertions to config-driven docRules

## Status: DONE

## What Was Done

Added 12 missing docRule entries to `scripts/complexity-budgets.json` that were present in the smoke test but not yet migrated to the config-driven format.

### Changes to `docs/todos/open-debt-and-compromises.md` entry

Added 9 new `mustContain` strings:
- `service-to-service auth hardening`
- `dashboard-as-code`
- `alert rule pack`
- `PgBouncer`
- `Node heap presets`
- `PgBouncer / pool introspection contract`
- `不扩成新的 monitoring platform`
- `container CPU/memory checked-in defaults`
- `当前仍留在 active todo 的剩余 closeout 只剩`

Added 1 new `mustNotContain` string:
- `模糊 later`

### Changes to `docs/todos/README.md` entry

Added 2 new `mustNotContain` strings (new key added to existing entry):
- `唯一活跃细则`
- `| \`microservice-platform-evolution-plan.md\` | 微服务平台能力增强：服务发现、内部 RPC、可观测性与资源治理 |`

## Verification

- JSON syntax validated successfully
- `pnpm check:docs-drift` passed: **All 43 doc rule(s) passed.**
