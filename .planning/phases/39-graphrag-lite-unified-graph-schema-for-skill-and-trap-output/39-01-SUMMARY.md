---
phase: 39-graphrag-lite-unified-graph-schema-for-skill-and-trap-output
plan: 01
subsystem: contracts
tags: [graphrag, contracts, zod, activation-metadata]
requires:
  - phase: 38
    provides: "Graph-plan route family and routed v3 response envelope"
provides:
  - "Unified additive graph schema for trap and skill outputs"
  - "Metadata-only activation references on selected skill nodes"
affects: [39-02, v3-retrieval, evals]
tech-stack:
  added: []
  patterns: [additive-graph-schema, manifest-backed-activation-metadata]
key-files:
  modified:
    - packages/contracts/src/domain/plans.ts
    - packages/contracts/src/domain/plans.test.ts
requirements-completed: [P39-01, P39-02]
completed: 2026-04-25
---

# Phase 39 Plan 01 Summary

Added an additive `graph` contract to the trap-first plan surface so traps and skills now share one public node/edge model. Skill nodes now carry metadata-only activation references derived from the existing client-manifest contracts instead of inventing a second activation shape.

No commit was created in this session because the repo already had unrelated in-flight work. Verification: `pnpm --filter @trapmap/contracts test -- src/domain/plans.test.ts src/index.test.ts`.
