---
name: "skill-shareer-knowledge"
description: "Draft a Skill Shareer knowledge submission payload from a pitfall, fix, and scope."
---

# Skill Shareer Knowledge

Use this skill when you want to turn a solved engineering pitfall into a structured
Skill Shareer submission.

## Inputs

- Problem summary
- Fix or operating guidance
- Scope: `global` or `project`
- Suggested labels

## Output

Use the local template at `templates/submission-template.md` and fill in:

1. `shortcut` with the concise reusable takeaway
2. `detail` with the fuller explanation or remediation
3. `labels` with searchable tags
4. `scope` with either `global` or `project`

## Constraints

- Keep `shortcut` short enough for terminal display
- Put reusable constraints in `global` scope
- Put team or repository specifics in `project` scope
