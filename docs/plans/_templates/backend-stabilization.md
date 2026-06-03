# Backend Stabilization Template

Use this template when the goal is to stabilize existing backend functionality before enhancing or exposing it. Applies to cross-table consistency, repository hardening, and data integrity work.

---

## Plan Header

```markdown
# [Subsystem Name] Stabilization Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** [Stabilize/harden/verify] [subsystem] so that [downstream capability] is safe to proceed.

**Tech Stack:** TypeScript, Fastify, PostgreSQL, Drizzle, Vitest.
```

## Stabilizability-First Principle

1. **All functions must be stabilizable before enhancement.** Do not add new features to an unstable foundation. If the current behavior is not well-tested or well-documented, fix that first.
2. **No API exposure until stabilizable.** Do not expose new routes, CLI commands, or public interfaces for code that does not yet have baseline test coverage and documented contracts.
3. **Preserve backward compatibility.** Stabilization work must not change observable behavior unless the plan explicitly calls out a breaking change with migration notes.

## Phase Structure (Numeric Ranges)

| Phase Range | Name | Purpose |
|-------------|------|---------|
| 0-1 | Verify | Freeze current behavior, document gaps, record baseline tests, confirm what works and what does not |
| 1-2 | Bug hunt | Fix known issues, add missing constraints, extend test coverage for edge cases |
| 2-3 | Improvement + archival | Enhance robustness, add operator tooling, close out and archive |

## Background and Baseline Template

```markdown
## 1. Background

[Why stabilization is needed now. What changed recently that surfaces this gap.]

## 2. Goals

1. [Concrete goal 1: e.g., "Define and enforce cross-table consistency rules"]
2. [Concrete goal 2]
3. [Concrete goal 3]

## 3. Boundaries

### 3.1 Included

- [Scope item 1]
- [Scope item 2]

### 3.2 Not included

- [Out of scope item 1]
- [Out of scope item 2]

### 3.3 Key assumptions

- [Assumption about environment, e.g., "Can start from a fresh database"]
- [Assumption about data, e.g., "JSONB cache fields remain as compatibility fallback"]

## 4. Current Baseline

### 4.1 What already exists

- [List existing implementations, migrations, tests]

### 4.2 Current gaps

- [List what is missing or insufficiently tested]
```

## Phase Template (Verify)

```markdown
## Phase N: [Verification topic]

- [ ] [Task to document current state]
- [ ] [Task to run existing tests and record results]
- [ ] [Task to identify untested paths]

**Completion standard**

- The current behavior is documented with enough detail that a newcomer can understand it.
- Baseline test results are recorded for comparison.

**Document updates**

- [ ] Update [specific doc] with current state.

**Test and eval updates**

- [ ] Record baseline:
  - `rtk pnpm test -- --run [relevant test files]`
```

## Phase Template (Bug Hunt)

```markdown
## Phase N: [Fix topic]

- [ ] [Task to fix specific issue]
- [ ] [Task to add constraint or validation]
- [ ] [Task to add test coverage for the fix]

**Completion standard**

- [Specific test case that proves the bug is fixed]
- [Edge case that was previously untested now passes]

**Document updates**

- [ ] Update [specific doc] to reflect the fix.

**Test and eval updates**

- [ ] Add regression tests for the fixed behavior.
- [ ] Extend existing tests with edge case coverage.
```

## Phase Template (Improvement + Archival)

```markdown
## Phase N: [Improvement topic]

- [ ] [Task to enhance robustness or add operator tooling]
- [ ] [Task to add documentation]

**Completion standard**

- Operators can [perform specific action] without ad hoc library calls.
- All phases are verified and plan can be archived.

**Document updates**

- [ ] Update [operations/architecture docs].
- [ ] Update plan status to complete.
```

## Verification and Closeout

```markdown
## Final Phase: Verification and closeout

- [ ] Run all modified test suites.
- [ ] Run `rtk pnpm typecheck`.
- [ ] Run `rtk pnpm check:structure`.
- [ ] Confirm all completion standards are met.
- [ ] Archive this plan to `docs/archived/archived-plans/`.

**Completion standard**

- Stabilization is complete: all functions are testable, documented, and safe for downstream enhancement.
```
