# Retrieval

Use retrieval as a hard gate before TrapMap planning and implementation. The goal is not to load everything; the goal is to select a small control set.

## CLI Invocation

Use the built binary when available:

```bash
trapmap <command> [options]
```

In this monorepo, use dev mode when the binary is not installed:

```bash
pnpm --filter @trapmap/cli dev -- <command> [options]
```

The `--` separator is required so pnpm forwards arguments to the CLI script.

## Auth Preflight

If retrieval state is uncertain, run:

```bash
trapmap session --json
```

If unauthenticated, ask the user for the appropriate access key/server details or report that TrapMap retrieval is blocked. Do not fabricate empty results.

## Skill Before Plan

Run this before forming a plan:

```bash
trapmap skill search-by-content "<task or domain seed>" --max-results 5 --json
```

`skill search-by-content` supports `--max-results` and `--json`. Do not add trap search flags to this command.

Select the top 1-3 matches that are directly applicable. Put weaker matches in citations or ignore them.

## Trap Before Implementation

Run this after planning and before code changes:

```bash
trapmap search "<planned implementation area or risk seed>" --scope project --mode graph-assisted --max-results 5 --json
```

Useful `search` flags include `--label`, `--scope`, `--mode semantic|hybrid|graph-assisted`, `--v2`, `--summary`, `--stdin`, and `--no-refinement`.

Use `--v2` when you need capsule-native output or activation hints:

```bash
trapmap search "<planned implementation area or risk seed>" --scope project --v2 --max-results 5 --json
```

## Agent Context Load

Use `load` for pre-formatted agent-consumable context (markdown with routing, plan, and skill sections):

```bash
trapmap load "<seed>" --scope project --json
```

`load` flags: `--scope`, `--label` (repeatable), `--max-results`, `--skill-budget`, `--max-depth`, `--fallback`, `--stdin`, `--json`.

Default output is markdown wrapped in `<!-- trapmap-load-context -->` markers. Use `--json` for raw structured data.

## Trap-First Selection

Compile results in this order:

1. Blocking traps and hard constraints.
2. Skills/capsules that directly mitigate those traps.
3. Verification commands or observable confirmations.
4. Extra matches as citations only.

If a trap conflicts with a skill, the trap wins until the plan explicitly mitigates it.

If a command or flag is uncertain, run:

```bash
trapmap --help
trapmap <command> --help
```
