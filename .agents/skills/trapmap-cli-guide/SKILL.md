---
name: "trapmap-cli-guide"
description: "Guide for LLM agents on how to use the TrapMap CLI to query, submit, and manage knowledge entries. Covers command surface, flags, and workflow discipline."
---

# TrapMap CLI Guide for LLM Agents

Use this skill when you need to interact with the TrapMap knowledge system from the terminal -- querying existing pitfalls, submitting new ones, reviewing submissions, or managing entries. This guide covers the CLI surface, invocation methods, and the workflow discipline every agent should follow.

## How to Run the CLI

Two ways to invoke commands:

**Built (after `pnpm build` in `packages/cli`):**

```bash
trapmap <command> [options]
```

**Dev mode (no build needed, uses tsx):**

```bash
pnpm --filter @trapmap/cli dev -- <command> [options]
```

The `--` separator is required when passing args through pnpm. It tells pnpm to forward everything after it to the underlying script.

## Core Commands

| Command | Purpose | Key Flags |
|---------|---------|-----------|
| `search <seed>` | Semantic knowledge retrieval | `--label`, `--scope`, `--mode` (semantic/hybrid/graph-assisted), `--v2` (capsule retrieval), `--max-results`, `--json`, `--no-refinement`, `--summary`, `--stdin` |
| `list` | List entries with filters | `--scope`, `--state`, `--max-level`, `--owner`, `--json` |
| `submit` | Submit new knowledge | `--scope`, `--label`, `--shortcut`, `--detail`, `--file`, `--stdin`, `--required-level`, `--json` |
| `resubmit <entryId>` | Resubmit a rejected entry | `--label`, `--shortcut`, `--detail`, `--file`, `--stdin`, `--json` |
| `review-status [entryId]` | Check submission status | `--json` |
| `review:queue` | View pending reviews | `--status`, `--json` |
| `review:approve <entryId>` | Approve a queued entry | `--notes` (required), `--json` |
| `review:reject <entryId>` | Reject a queued entry | `--notes` (required), `--json` |
| `edit <entryId>` | Edit a knowledge entry | `--shortcut`, `--detail`, `--labels`, `--required-level`, `--json` |
| `deactivate <entryId>` | Deactivate an entry | `--reason` (required), `--json` |
| `import` | Import from file or directory | `--file`, `--level` (both required), `--json` |
| `export` | Export entries to JSON | `--team`, `--include-history`, `--output`, `--json` |
| `artifact-export` | Export a skill artifact | `--artifact` (required), `--format`, `--output`, `--json` |
| `activate` | Fetch and materialize artifact files | `--artifact` (required), `--paths` (required), `--revision`, `--output`, `--json` |
| `migrate` | Migrate legacy entries to artifacts | `--entries`, `--all-approved`, `--all-team`, `--limit`, `--json` |
| `status` | Migration/compatibility status | `--team`, `--json` |

## Discovery Rule

When a command or flag is not listed here, run `trapmap --help` or `trapmap <command> --help` to discover the full surface. Do NOT guess flags or commands. The help output is authoritative.

## Workflow Discipline: Query Before Modify

Before modifying any code or configuration in this project, run one relevant CLI command (typically `search`) to verify current state and understand the knowledge landscape. This ensures you have accurate context before making changes.

Example: before refactoring the retrieval pipeline, run:

```bash
trapmap search "retrieval pipeline" --json
```

This returns any known pitfalls, constraints, or team decisions related to the area you are about to change. If results exist, read them carefully before proceeding.

## JSON Output for Programmatic Use

Always add `--json` when piping or parsing output programmatically. Without `--json`, output is human-readable text that is harder to parse reliably.

```bash
# Good: machine-readable
trapmap search "auth" --json

# Good: human-readable (interactive use only)
trapmap search "auth"
```

## Constraints

- Keep the skill factual and derived from the CLI source code in `packages/cli/src/commands/`.
- Do not invent commands or flags that do not exist.
- When unsure about any command surface, defer to `--help`.
- All commands require an active session (run `trapmap login` first if unauthenticated).
