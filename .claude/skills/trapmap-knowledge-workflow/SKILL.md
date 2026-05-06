---
name: trapmap-knowledge-workflow
description: Use when planning or implementing TrapMap work, operating the TrapMap CLI, or preserving solved engineering pitfalls. Enforces skill-before-plan and trap-before-implementation retrieval, trap-first plan compilation, CLI help verification, artifact activation/review, and compact experience capture.
---

# TrapMap Knowledge Workflow

## Control Path

1. Resolve the CLI invocation first: prefer `trapmap`; in this monorepo use `pnpm --filter @trapmap/cli dev -- <command>` when the built binary is unavailable.
2. Before planning, read [references/retrieval.md](references/retrieval.md) and retrieve matching skills with a task seed. Use `trapmap load "<seed>"` for pre-formatted agent context or `trapmap search` for raw retrieval. Use only the 1-3 most targeted matches as planning controls.
3. Before implementation, retrieve matching traps with a risk/implementation seed. Treat matching traps as constraints before applying any skill guidance.
4. Compile a trap-first plan: list blocking traps, then the skills/capsules that directly mitigate them, then verification commands. Keep extra matches as citations instead of loading them all into context.
5. If the task scope changes materially, rerun retrieval with a seed that matches the new scope.
6. If TrapMap retrieval is blocked by auth, server, or install state, record the exact blocker. Do not claim there were no relevant traps or skills.
7. After a solved issue, preserve reusable experience only when it is compact, verified, and non-secret. Use [references/accumulation.md](references/accumulation.md).

## Reference Map

Load only the reference needed for the current operation:

- [references/retrieval.md](references/retrieval.md): auth preflight, exact search commands, trap-first selection rules.
- [references/registration.md](references/registration.md): trap submission, skill import, and compact skill shape.
- [references/review.md](references/review.md): review queues, approve/reject criteria, duplicate resolution.
- [references/artifacts.md](references/artifacts.md): export, selective activation, script policy.
- [references/accumulation.md](references/accumulation.md): Strategy-Gene-style `MATCH/GOAL/STRATEGY/AVOID/VERIFY` capture.

## Guardrails

- Verify uncertain commands with `trapmap --help` or `trapmap <command> --help`; the CLI source/help is authoritative.
- Prefer JSON output for agent-to-agent/tool parsing.
- Do not paste raw chat logs, secrets, access keys, private paths, or bulky documentation into reusable knowledge.
- Do not naively compose many skills. A single targeted skill plus explicit `AVOID` warnings is usually stronger than a large bundle of partially relevant guidance.
