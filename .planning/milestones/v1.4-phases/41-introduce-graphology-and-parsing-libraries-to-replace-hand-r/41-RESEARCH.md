# Phase 41: Introduce Graphology and Parsing Libraries to Replace Hand-Rolled Implementations - Research

**Researched:** 2026-04-25
**Domain:** dependency boundary hardening, graph runtime wrappers, parsing wrappers, stable ID generation
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- Phase 41 is a dependency-introduction and wrapper-boundary phase, not the full GraphRAG runtime migration.
- The project should depend on local abstractions rather than importing third-party libraries everywhere.
- `graphology`, `graphology-dag`, `graphology-operators`, `graphology-shortest-path`, `gray-matter`, `mime-types`, and `nanoid` are the chosen dependency family for this direction.
- Public contracts and domain-layer behavior should stay stable while the implementation shifts behind wrappers.

### Already-Landed Groundwork

- Shared parsing and MIME helpers are already present in `@trapmap/contracts`.
- Graphology-backed graph helpers already exist in the server indexing layer.
- The remaining gap from the phase context is a safer shared ID boundary for server-generated identifiers.

### Retrieval Gate Status

- TrapMap retrieval could not be used as a live planning gate in this workspace.
- `node packages/cli/dist/index.js session --json` failed with `fetch failed`.
- The unauthenticated CLI surface hid `skill search-by-content`, even though the command is registered in source behind permission-based visibility.
- This phase therefore proceeds from local code and existing phase context, not from live trap/skill retrieval results.
</user_constraints>

## Summary

Phase 41 is mostly implemented already in the active worktree: the server package now declares the graphology dependency family, the contracts package already centralizes `gray-matter` and `mime-types` behind `parseSkillMarkdown()` and `detectMediaType()`, and server graph assembly has been moved into a dedicated `graph-lite/graphology.ts` wrapper instead of staying embedded in retrieval codepaths. [VERIFIED: packages/server/package.json] [VERIFIED: packages/contracts/src/domain/parsing.ts] [VERIFIED: packages/server/src/lib/indexing/graph-lite/graphology.ts]

The main missing boundary from the phase context is safer server-side ID generation. `generateQueryId()` and duplicate-case creation still assemble identifiers with `Date.now()` and `Math.random()`, which is exactly the ad hoc utility pattern this phase is supposed to replace before later runtime migrations build on it. [VERIFIED: packages/server/src/lib/rag-log.ts] [VERIFIED: packages/server/src/lib/candidates/detector.ts]

The lowest-risk completion path is to add one internal server ID helper backed by `nanoid`, route query IDs and duplicate-case IDs through it, and add regression coverage around the new prefix-preserving format. That closes the remaining utility-boundary gap without reopening graph/runtime behavior that Phase 42 is supposed to own. [RECOMMENDATION]

## Recommended Scope

### In Scope for Phase 41

- Keep graphology usage behind the existing `graph-lite/graphology.ts` wrapper.
- Keep frontmatter and MIME behavior behind the existing contracts parsing surface.
- Add `nanoid` as an explicit server dependency.
- Add one server-local ID helper module for prefixed identifiers.
- Replace ad hoc query and duplicate-case ID generation with the shared helper.
- Add focused regression tests for the new ID format and uniqueness behavior.

### Out of Scope for Phase 41

- Rewriting the remaining retrieval runtime around graphology primitives.
- Database/store migration work.
- Public contract changes unrelated to wrapper adoption.
- Additional library adoption beyond the dependencies already chosen in CONTEXT.md.

## Concrete File Targets

| File | Why It Matters |
|------|----------------|
| `packages/server/package.json` | Needs explicit `nanoid` dependency at the package boundary that owns server-generated IDs |
| `packages/server/src/lib/ids.ts` | New internal wrapper for prefixed ID generation |
| `packages/server/src/lib/rag-log.ts` | Query IDs should stop using `Date.now()` + `Math.random()` |
| `packages/server/src/lib/candidates/detector.ts` | Duplicate-case IDs should stop using ad hoc random suffixes |
| `packages/server/src/lib/rag-log.test.ts` | Existing format assertions need to track the new stable prefixed form |
| `packages/server/src/lib/ids.test.ts` | Direct regression coverage for the new wrapper |

## Validation Architecture

Phase 41 should be considered complete when these observable truths hold:

1. Graphology usage is package-local and accessed through local server helpers, not spread as unchecked direct imports across unrelated modules.
2. Frontmatter parsing and MIME detection remain centralized in `@trapmap/contracts`.
3. Server-generated query IDs and duplicate-case IDs come from one shared helper backed by `nanoid`.
4. Regression tests prove the new ID helper preserves deterministic prefixes and uniqueness expectations.

## Verification Commands

1. `pnpm --filter @trapmap/server test -- src/lib/ids.test.ts src/lib/rag-log.test.ts`
2. `pnpm --filter @trapmap/server typecheck`
