---
phase: quick
plan: 260419-eux
subsystem: skills
tags: [skill, llm-agent, cli-guide, documentation]
dependency_graph:
  requires: []
  provides: [trapmap-cli-guide-skill]
  affects: [.agents/skills/]
tech_stack:
  added: []
  patterns: [claude-skill-convention, yaml-frontmatter]
key_files:
  created:
    - .agents/skills/trapmap-cli-guide/SKILL.md
  modified: []
decisions:
  - "Derived all commands and flags from CLI source code (retrieval.ts, knowledge.ts, review.ts, operations.ts, index.ts) to ensure accuracy"
metrics:
  duration: 65s
  completed: "2026-04-19T02:47:43Z"
---

# Quick Task 260419-eux: TrapMap CLI Guide Skill Summary

LLM-oriented skill file teaching agents how to use the TrapMap CLI -- covers all commands, flags, discovery via --help, and query-before-modify discipline.

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | Create trapmap-cli-guide skill directory and SKILL.md | c3ca986 | `.agents/skills/trapmap-cli-guide/SKILL.md` |

## What Was Built

Created `.agents/skills/trapmap-cli-guide/SKILL.md` -- a Claude-compatible skill file that:

1. Explains when to use the skill (interacting with TrapMap knowledge)
2. Shows both invocation methods (built binary vs dev mode via pnpm)
3. Provides a comprehensive commands table covering all 16 CLI commands with their key flags
4. States the discovery rule (use --help, never guess)
5. Enforces query-before-modify discipline (run search before changing code)
6. Documents JSON output convention for programmatic use
7. Lists constraints (factual, source-derived, no invented commands)

All commands and flags were verified against the actual CLI source code in `packages/cli/src/commands/`.

## Verification

- File exists at `.agents/skills/trapmap-cli-guide/SKILL.md` (82 lines)
- Frontmatter has `name: trapmap-cli-guide` and `description` fields
- Body covers: CLI invocation, search command with flags, --help discovery, query-before-modify, JSON flag
- No invented commands -- all content derived from CLI source code

## Deviations from Plan

None -- plan executed exactly as written.

## Self-Check: PASSED

- File exists: `.agents/skills/trapmap-cli-guide/SKILL.md` -- confirmed
- Commit exists: `c3ca986` -- confirmed
