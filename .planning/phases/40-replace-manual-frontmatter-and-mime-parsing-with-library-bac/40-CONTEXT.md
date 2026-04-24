# Phase 40: Replace Manual Frontmatter and MIME Parsing with Library-Backed Utilities - Context

**Gathered:** 2026-04-24
**Status:** Ready for planning
**Mode:** Derived from the dependency review for replacing hand-rolled parsing utilities

<domain>
## Phase Boundary

Phase 40 should replace the project's manual SKILL frontmatter parsing and MIME detection helpers with shared library-backed utilities.

This phase is about low-risk infrastructure replacement in parsing and metadata detection. It is not about GraphRAG runtime behavior or storage migration.

In scope:
- Replace manual YAML frontmatter parsing for `SKILL.md`
- Replace hand-maintained MIME type lookup tables
- Introduce shared utility wrappers so CLI and server stop duplicating parsing behavior
- Keep current product behavior and contract shapes stable while removing brittle regex/string-splitting logic

Out of scope:
- Graph algorithms and graph runtime migration
- Database/store migration
- Retrieval ranking or compiler changes
- Major changes to skill derivation semantics beyond using safer parsing primitives

</domain>

<decisions>
## Implementation Decisions

### Working assumptions

- The current codebase has duplicated manual frontmatter parsing and MIME lookup logic, which is not worth maintaining.
- Replacing these helpers should be behavior-preserving first; any semantic changes to how skills are interpreted should be explicit and separately tested.
- Parsing should be centralized so CLI import and server import/export stop drifting.

### Target direction

- Introduce a shared parsing utility module used by both CLI and server paths.
- Replace ad-hoc regex plus line splitting with a maintained frontmatter parser.
- Replace static extension maps with a maintained MIME database.
- Keep the replacement thin: project code should depend on local wrappers, not on third-party libraries directly everywhere.

### Dependency decision

- Add `gray-matter` for frontmatter parsing.
- Add `mime-types` for MIME lookup.
- If raw YAML access is needed beyond what `gray-matter` exposes, add `js-yaml`; otherwise do not add it in this phase.
- Do not introduce Markdown AST parsing yet; that belongs to a later derivation-focused phase if needed.

</decisions>

<code_context>
## Existing Code Insights

### Duplicate frontmatter parsing exists in both CLI and server

- CLI import logic manually parses `SKILL.md` frontmatter in [operations.ts](/home/wunai/project/TrapMap-for-vibing/packages/cli/src/commands/operations.ts:113).
- Server import/export logic does the same in [import-export.ts](/home/wunai/project/TrapMap-for-vibing/packages/server/src/lib/import-export.ts:258).
- Skill derivation also uses a custom parser in [derive.ts](/home/wunai/project/TrapMap-for-vibing/packages/server/src/lib/artifacts/derive.ts:414).

### MIME lookup is currently a hand-maintained table

- CLI command code uses a manual extension-to-MIME map in [operations.ts](/home/wunai/project/TrapMap-for-vibing/packages/cli/src/commands/operations.ts:170).
- That table is already broad enough to be maintenance overhead but still incomplete enough to drift.

### Derivation currently mixes parsing and domain logic

- Skill derivation in [derive.ts](/home/wunai/project/TrapMap-for-vibing/packages/server/src/lib/artifacts/derive.ts:446) currently uses regex extraction for sections on top of manual frontmatter parsing.
- Phase 40 should stabilize the frontmatter layer first without over-scoping into full Markdown semantics.

</code_context>

<specifics>
## Specific Ideas

- Create one shared helper for:
  - parsing frontmatter into `title`, `description`, labels, and body
  - resolving MIME type from file path or extension
- Route both CLI and server parsing callsites through those helpers.
- Preserve current fallback behavior where possible:
  - missing frontmatter still fails gracefully
  - body content still wins over short description when both exist
- Add regression tests for:
  - quoted and unquoted YAML values
  - list-style labels
  - unknown file extensions
  - cross-package consistency between CLI and server parsing

</specifics>

<deferred>
## Deferred Ideas

- Markdown AST parsing with `remark`
- Richer section extraction for `Situation` / `Problem` / `Goal`
- Schema-level validation of arbitrary frontmatter keys
- File content sniffing beyond extension-based MIME detection

</deferred>
