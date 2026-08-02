
# TrapMap Skills

Project-level skill artifacts that define AI agent workflows, CLI usage guides, and reference documentation for TrapMap operations. These skills are consumed by coding agents (Claude Code, Codex, OpenAI Codex, etc.) to enforce retrieval-gated planning, knowledge registration, feedback loops, and maintenance discipline.

## Skills

### workflow-with-trapmap

Workflow skill that gates TrapMap work behind retrieval, trap-priority planning, knowledge accumulation, feedback, and maintenance checks. Loaded when the agent needs to plan or implement TrapMap-related tasks.

**Entry:** `workflow-with-trapmap/SKILL.md`

**Control path:**

1. Resolve CLI invocation (`trapmap` or `pnpm --filter @trapmap/cli dev -- <command>`)
2. Pre-plan: skill search-by-content, then select 1-3 direct matches
3. Pre-implementation: trap retrieval with risk/implementation seeds
4. Compile trap-priority plan (blocking traps first, then mitigating skills, then verification)
5. Accumulate compact lessons post-resolution; submit feedback on inaccurate results
6. Check decay state before using potentially aging entries

**References:**

| File | Purpose |
|------|---------|
| `references/retrieval.md` | Auth pre-check, search commands, trap-priority selection |
| `references/registration.md` | Trap submission, skill import, compact skill shape |
| `references/review.md` | Review queue, approve/reject criteria, duplicate resolution |
| `references/artifacts.md` | Export, selective activation, script policies |
| `references/accumulation.md` | Strategy-gene capture (`MATCH/GOAL/STRATEGY/AVOID/VERIFY`) |
| `references/feedback.md` | Feedback submission, queue viewing, batch processing |
| `references/maintenance.md` | Decay lifecycle, maintenance operations, agent guidance |

**Agent config:** `agents/openai.yaml` (OpenAI Codex interface definition)

### trapmap-cli-usage-guide

Compact CLI reference indexed by workflow stage. Loaded only when the agent needs to confirm command signatures, flags, command-family mappings, or output configuration. Not a workflow strategy -- defer to `workflow-with-trapmap` for "why/when" decisions.

**Entry:** `trapmap-cli-usage-guide/SKILL.md`

**References:**

| File | Purpose |
|------|---------|
| `references/cli-index.md` | CLI commands organized by workflow stage (session, retrieval, registration, review, artifacts, feedback, decay, skill management, ops) |

## Directory Structure

```
packages/skills/
  README.md
  workflow-with-trapmap/
    SKILL.md                          # Workflow entry point
    agents/
      openai.yaml                     # OpenAI agent interface config
    references/
      retrieval.md                    # Retrieval gate rules
      registration.md                 # Knowledge registration commands
      review.md                       # Review queue and approval workflow
      artifacts.md                    # Export and activation
      accumulation.md                 # Compact experience capture
      feedback.md                     # Feedback submission and management
      maintenance.md                  # Decay lifecycle and maintenance
  trapmap-cli-usage-guide/
    SKILL.md                          # CLI guide entry point
    references/
      cli-index.md                    # Command index by workflow stage
```

## Skill Design Principles

- **Trap-priority:** Blocking traps take precedence over skills in planning. If a trap conflicts with a skill, the trap wins until explicitly mitigated.
- **Compact strategy-gene shape:** Skills use `MATCH / GOAL / STRATEGY / AVOID / VERIFY` control blocks. The `AVOID` line carries distilled failure warnings.
- **Lazy loading:** Only load the reference file needed for the current operation. Do not bulk-read all references.
- **Auth pre-check:** Always run `trapmap session --json` before retrieval if auth state is uncertain. Never fabricate empty results.
- **Feedback loop:** Submit `trapmap feedback` when retrieved knowledge is inaccurate, outdated, or context-mismatched. Feedback does not block the current task.

## Usage

These skills are designed to be loaded by AI coding agents as part of their workflow. They are not executable packages -- they are structured markdown that agents consume as context.

To import a skill into TrapMap's knowledge base:

```bash
trapmap import --file packages/skills/workflow-with-trapmap --level 0 --json
trapmap import --file packages/skills/trapmap-cli-usage-guide --level 0 --json
```

To use the CLI commands referenced in these skills, install `@trapmap/cli` or run via the monorepo:

```bash
trapmap <command> [options]
# or in dev mode:
pnpm --filter @trapmap/cli dev -- <command> [options]
```

## Dependencies

This package has no runtime dependencies. It references the following TrapMap components:

- `@trapmap/cli` -- CLI binary used by all referenced commands
- TrapMap backend service -- authentication, retrieval, knowledge storage, review, feedback
