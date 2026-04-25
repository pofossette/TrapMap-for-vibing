# Compact Experience Accumulation

Use this when a human says a solved issue is worth preserving.

1. Summarize the reusable lesson in one sentence.
2. Search existing skills and traps for duplicates.
3. Choose `trap`, `skill`, or both.
4. For traps, submit a concise warning with root cause, fix, and verification.
5. For skills, create a small skill directory with compact `SKILL.md` guidance and optional `references/evidence.md`.
6. Register through `trapmap trap submit` or `trapmap import`.
7. Leave approval or duplicate resolution to the review workflow.

## Strategy-Gene Shape

Use compact, control-oriented content. This is the default shape for agent-facing TrapMap skills:

```text
MATCH: when this applies
GOAL: what the agent should achieve
STRATEGY: 3-5 ordered steps
AVOID: specific failure warning
VERIFY: command or observable confirmation
```

The `AVOID` line is where failure history belongs. Distill the failure into a warning; do not append the whole failure transcript.

## Capture Rules

- Prefer one targeted skill over a broad manual.
- Keep examples short and only include them when they prevent a real mistake.
- Put long evidence, if needed, in `references/evidence.md` and load it only during review.
- Include the validation command actually run, or an observable confirmation if no command exists.
- Do not paste raw chat logs, secrets, tokens, or private paths into reusable knowledge.

## Trap Detail Template

```text
Problem: what failed
Root cause: why it failed
Fix: what resolved it
Verification: command/output or observable confirmation
Avoid: the shortest reusable warning
```
