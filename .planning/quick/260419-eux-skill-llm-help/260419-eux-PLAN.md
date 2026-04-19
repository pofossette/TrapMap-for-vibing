---
phase: quick
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .agents/skills/trapmap-cli-guide/SKILL.md
autonomous: true
requirements: [quick-task]

must_haves:
  truths:
    - "An LLM reading the skill knows how to run trapmap search to query knowledge"
    - "An LLM reading the skill knows to run --help for any command it hasn't seen before"
    - "An LLM reading the skill knows to call the tool once before modifying code to verify understanding"
  artifacts:
    - path: ".agents/skills/trapmap-cli-guide/SKILL.md"
      provides: "LLM-oriented guide for using the TrapMap CLI"
      min_lines: 40
  key_links: []
---

<objective>
Create a new project skill that teaches LLM agents (Claude Code, Cursor, etc.) how to use the TrapMap CLI to query and manage knowledge entries.

Purpose: When an LLM agent works in this codebase, it should know the CLI surface, the key commands, and the workflow discipline (query before modify). This replaces ad-hoc codebase exploration with a concise skill file the agent loads automatically.

Output: `.agents/skills/trapmap-cli-guide/SKILL.md` -- a Claude-compatible skill file following the same frontmatter convention as the existing `skill-shareer-knowledge` skill.
</objective>

<execution_context>
@/home/wunai/project/TrapMap-for-vibing/.claude/get-shit-done/workflows/execute-plan.md
@/home/wunai/project/TrapMap-for-vibing/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.agents/skills/skill-shareer-knowledge/SKILL.md
@packages/cli/src/index.ts
@packages/cli/src/commands/retrieval.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create trapmap-cli-guide skill directory and SKILL.md</name>
  <files>.agents/skills/trapmap-cli-guide/SKILL.md</files>
  <action>
Create directory `.agents/skills/trapmap-cli-guide/` and write `SKILL.md` inside it.

The SKILL.md must follow the Claude skill convention (YAML frontmatter with `name` and `description`, then markdown body). Use the existing `.agents/skills/skill-shareer-knowledge/SKILL.md` as the format reference.

Content structure:

**Frontmatter:**
```yaml
---
name: "trapmap-cli-guide"
description: "Guide for LLM agents on how to use the TrapMap CLI to query, submit, and manage knowledge entries. Covers command surface, flags, and workflow discipline."
---
```

**Body sections (in this order):**

1. **Header + When to use** -- explain this skill is for LLM agents that need to interact with TrapMap knowledge (query existing pitfalls, submit new ones, review submissions).

2. **How to run the CLI** -- Two ways:
   - Built: `trapmap <command>` (after `pnpm build` in packages/cli)
   - Dev: `pnpm --filter @trapmap/cli dev -- <command>` (uses tsx, no build needed)
   Note: The `-- ` separator is required when passing args through pnpm.

3. **Core commands table** -- A concise table covering the most useful commands:
   | Command | Purpose | Key flags |
   | `search <seed>` | Semantic knowledge retrieval | `--label`, `--scope`, `--mode` (semantic/hybrid/graph-assisted), `--v2` (capsule retrieval), `--max-results`, `--json`, `--no-refinement`, `--summary` |
   | `list` | List entries with filters | `--scope`, `--state`, `--max-level`, `--owner`, `--json` |
   | `submit` | Submit new knowledge | `--scope`, `--label`, `--shortcut`, `--detail`, `--file`, `--required-level`, `--json` |
   | `review-status [entryId]` | Check submission status | `--json` |
   | `review:queue` | View pending reviews | `--status`, `--json` |
   | `review:approve <id>` / `review:reject <id>` | Review decisions | `--notes` (required), `--json` |
   | `edit <entryId>` | Edit a knowledge entry | `--shortcut`, `--detail`, `--labels`, `--required-level`, `--json` |
   | `deactivate <entryId>` | Deactivate an entry | `--reason` (required), `--json` |
   | `import --file <path> --level <n>` | Import from file/dir | `--json` |
   | `export` | Export entries to JSON | `--team`, `--output`, `--json` |
   | `artifact-export --artifact <id>` | Export skill artifact | `--format`, `--output`, `--json` |
   | `activate --artifact <id> --paths <paths>` | Fetch artifact files | `--revision`, `--output`, `--json` |
   | `status` | Migration/compatibility status | `--team`, `--json` |

4. **Discovery rule** -- When a command or flag is not listed here, run `trapmap --help` or `trapmap <command> --help` to discover the full surface. Do NOT guess flags or commands.

5. **Workflow discipline: query before modify** -- Before modifying any code or configuration in this project, run one relevant CLI command (typically `search`) to verify current state and understand the knowledge landscape. This ensures the agent has accurate context before making changes. Example: before refactoring the retrieval pipeline, run `trapmap search "retrieval pipeline" --json` to see if there are known pitfalls.

6. **JSON output for programmatic use** -- Always add `--json` when piping or parsing output programmatically. Without `--json`, output is human-readable text that is harder to parse.

7. **Constraints** -- Keep the skill factual and derived from the CLI source code. Do not invent commands or flags that don't exist. When unsure, defer to `--help`.
  </action>
  <verify>
    <automated>test -f .agents/skills/trapmap-cli-guide/SKILL.md && grep -q "trapmap-cli-guide" .agents/skills/trapmap-cli-guide/SKILL.md && grep -q "search" .agents/skills/trapmap-cli-guide/SKILL.md && grep -q "\-\-help" .agents/skills/trapmap-cli-guide/SKILL.md && echo "PASS"</automated>
  </verify>
  <done>SKILL.md exists with frontmatter (name: trapmap-cli-guide), covers search command, --help discovery, and query-before-modify discipline. File is 50+ lines.</done>
</task>

</tasks>

<verification>
- SKILL.md file exists at `.agents/skills/trapmap-cli-guide/SKILL.md`
- Frontmatter has `name` and `description` fields matching Claude skill convention
- Body covers: CLI invocation methods, search command with flags, --help discovery rule, query-before-modify discipline, JSON flag guidance
- No invented commands or flags -- all content matches CLI source code in `packages/cli/src/commands/`
</verification>

<success_criteria>
- `.agents/skills/trapmap-cli-guide/SKILL.md` exists and is a valid Claude skill
- An LLM reading only this file can correctly invoke `trapmap search`, knows to use `--help` for unknown commands, and knows to query before modifying code
</success_criteria>

<output>
After completion, create `.planning/quick/260419-eux-skill-llm-help/260419-eux-SUMMARY.md`
</output>
