# Active Plans

This directory contains active or still-referenced long-horizon design plans.

Rules:

1. Root `plan.md` is the current execution tracker.
2. `docs/plans/` is for design plans that current docs still cite as context.
3. Obsolete execution plans must move to `docs/archived/archived-plans/`.
4. Obsolete reports must move to `docs/archived/reports/`.
5. New plans should use templates from `_templates/` for consistent structure.

## Templates

| Template | When to use |
|----------|------------|
| [`_templates/implementation-phase.md`](./_templates/implementation-phase.md) | Incremental feature implementation with phased delivery |
| [`_templates/backend-stabilization.md`](./_templates/backend-stabilization.md) | Stabilizing existing backend functionality before enhancement |

## Current Files

| File | Status | Why it remains here |
|---|---|---|
| `fm-agent-scan/` | active-reference | FM-agent raw report remediation plans, source packs, and reconciled live-gap matrices |
| `capsule-contextual-enrichment-plan.md` | active-reference | Retrieval/capsule design context |
| `round4-cross-table-consistency-plan.md` | active-reference | Artifact structured facts source cited by package docs |
| `v2-multi-recall-plan.md` | active-reference | Retrieval design context |
