# Implementation Phase Template

Use this template when writing a new implementation plan for TrapMap. Plans should be standalone, testable, and independently mergeable.

---

## Plan Header

```markdown
# [Feature Name] Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** [One sentence: what this plan delivers.]

**Architecture:** [How it fits into the existing system. Name the seams being reused or created.]

**Tech Stack:** TypeScript, Fastify, Vitest. [Add any project-specific technologies.]
```

## Scope

List every file that will be created or modified:

- `packages/server/src/lib/...`
- `packages/server/src/routes/...`
- Test files for each modified module

## Phase Naming Convention

| Phase | Name Pattern | Purpose |
|-------|-------------|---------|
| Phase 0 | Freeze | Lock down current behavior, record baseline tests, document migration boundary |
| Phase 1, 2, 3... | Incremental implementation | One logical change per phase |
| S1, S2, S3... | Stabilization sub-phases | Bug fixes, hardening, or cleanup between major phases |

## Principle Rules

1. **Contracts -> Server -> CLI chain.** Always modify contracts first, then server implementation, then CLI consumers. Never skip a layer.
2. **Must be testable.** Every phase must be verifiable by running tests before proceeding to the next.
3. **Independently mergeable.** Each phase should be a valid, self-contained commit. If phase N fails, phases 0 through N-1 should still pass.
4. **No phase may break existing behavior** unless the plan explicitly states a breaking change with migration notes.

## Phase 0 Template (Freeze)

```markdown
## Phase 0: Freeze current contract and migration boundary

- [ ] Preserve the current HTTP contract for the affected endpoints.
- [ ] Decide which parts are shared and which remain endpoint-specific.
- [ ] Record baseline tests (list exact commands).

**Completion standard**

- The contract remains unchanged.
- The migration target is explicit before code extraction starts.

**Document updates**

- [ ] Update the root `plan.md` status if this plan starts.

**Test and eval updates**

- [ ] Record baseline tests:
  - `pnpm test -- --run [test-file-paths]`

**Example structure or code**

\```ts
// Minimal interface or type showing the current contract
\```
```

## Phase N Template (Implementation)

```markdown
## Phase N: [Short descriptive name]

- [ ] [Task 1: specific, actionable step]
- [ ] [Task 2]
- [ ] [Task 3]

**Completion standard**

- [Measurable criterion: what test proves this phase is done]

**Document updates**

- [ ] Update [specific doc file] to reflect [specific change].

**Test and eval updates**

- [ ] [Add/extend tests for the new behavior]
- [ ] Run: `pnpm test -- --run [affected test files]`

**Example structure or code**

\```ts
// Key code pattern introduced in this phase
\```
```

## Verification and Closeout Template

```markdown
## Phase N+1: Verification and closeout

- [ ] Run focused tests for all modified modules.
- [ ] Run `pnpm typecheck`.
- [ ] Run `pnpm check:structure`.
- [ ] Update completion notes and mark plan as done.

**Completion standard**

- All phases are verified, tests pass, docs are current.
```
