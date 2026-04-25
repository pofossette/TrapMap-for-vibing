# Registration

Use these commands when you need to submit new knowledge or import a skill directory.

## Choose the Artifact Type

- Use a `trap` for a compact warning: known failure mode, root cause, fix, and verification.
- Use a `skill` for a reusable workflow that teaches an agent how to operate tools.
- Use both when a workflow is useful but has a recurring failure mode that deserves a separate `AVOID` warning.

Before registering anything, search for duplicates with both skill and trap retrieval.

## Trap Submission

```bash
trapmap trap submit \
  --scope project \
  --label cli \
  --label pnpm \
  --shortcut "Use -- when forwarding CLI args through pnpm scripts" \
  --detail "Problem, root cause, fix, and verification." \
  --json

trapmap trap resubmit <entryId> \
  --label retrieval \
  --shortcut "Updated warning" \
  --file detail.md \
  --json
```

Keep `shortcut` terminal-friendly. Put reusable organization-wide constraints in `global` scope and repository-specific knowledge in `project` scope.

## Skill Import

```bash
trapmap import --file path/to/skill-dir --level 0 --json
trapmap import --file path/to/SKILL.md --level 0 --json
```

Expected skill directory shape:

```text
skill-name/
  SKILL.md
  references/
  assets/
  scripts/
```

Keep `SKILL.md` concise and move detailed operational notes into `references/`.

Use this compact control block inside new skill guidance when possible:

```text
MATCH: when this applies
GOAL: what the agent should achieve
STRATEGY: 3-5 ordered steps
AVOID: specific failure warning
VERIFY: command or observable confirmation
```

Do not register raw logs, secrets, private paths, or long documentation dumps.
