# Phase 32 Context

## Objective

Restructure `skill` and `trap` into two resource namespaces such that, in the final product, the only user-visible difference is the command namespace itself.

Target outcome:

- `trap ...` and `skill ...` expose the same command set
- the same flags and argument shapes are used wherever the operation is semantically the same
- text output and JSON output are structurally identical for matching operations
- review, history, list, edit, import, export, and permission behavior are identical
- the only allowed difference is which resource adapter is invoked underneath

## Non-Negotiable Requirement

This phase must not produce two similar-but-different systems.

The required architecture is:

- one shared command model
- one shared server workflow model
- one shared contract shape for equivalent operations
- one shared formatter layer
- one shared governance model for lifecycle, review, audit, and authorization
- separate resource adapters only for `trap` and `skill`

Any design that allows `trap` and `skill` to drift in flags, output structure, review behavior, or lifecycle semantics does not meet the requirement.

## Current State

- `skill` already exists as a dedicated CLI namespace, but it is implemented through artifact-specific command code and operations routes.
- `trap` is still represented by the legacy `knowledge` model and mostly exposed as root-level commands rather than a dedicated namespace.
- Storage is already physically separated enough to support this split: `knowledgeEntries` and `skillArtifacts` exist as distinct collections.
- The main problem is not storage; it is inconsistent interface boundaries and duplicated product semantics.

## Required Design Principle

The product layer must treat `trap` and `skill` as two instances of the same governed resource pattern.

That means:

1. The CLI layer defines one canonical command matrix.
2. The server layer defines one canonical operation matrix.
3. The contracts layer defines one canonical response/request shape per operation type.
4. The formatter layer renders one canonical human-readable output shape per operation type.
5. Resource-specific code only maps generic operations onto trap-specific or skill-specific persistence details.

## Canonical Operation Matrix

The implementation should aim for a one-to-one command surface such as:

- `trap search ...` / `skill search ...`
- `trap edit ...` / `skill edit ...`
- `trap history ...` / `skill history ...`
- `trap review queue ...` / `skill review queue ...`
- `trap review approve ...` / `skill review approve ...`
- `trap review reject ...` / `skill review reject ...`
- `trap list ...` / `skill list ...`
- `trap export ...` / `skill export ...`
- `trap import ...` / `skill import ...`
- `trap deactivate ...` / `skill deactivate ...` if the operation is supported for both

If an operation exists for one namespace and not the other, that difference must be explicitly justified as a domain impossibility rather than an implementation shortcut.

## Allowed vs Forbidden Differences

Allowed differences:

- endpoint prefix or command prefix (`trap` vs `skill`)
- internal storage shape
- internal field mapping
- resource-specific metadata that is additive and does not alter the shared command contract

Forbidden differences:

- different flag names for equivalent operations
- different JSON envelope shapes for equivalent operations
- different human-readable output layouts for equivalent operations
- different review rules for equivalent operations
- different lifecycle semantics for equivalent operations
- duplicated business logic implemented separately in trap and skill codepaths

## Recommended Technical Shape

### CLI

- Introduce a shared resource command registrar that accepts a resource adapter.
- The adapter provides namespace name, route mapping, schema bindings, and any resource-specific payload translation.
- Root-level legacy commands remain as temporary aliases to the `trap` namespace only for compatibility.

### Server

- Introduce shared governed-resource handlers for queueing, reviewing, editing, listing, export/import, and lifecycle transitions.
- Put resource-specific lookup and persistence details behind trap and skill repository adapters.
- Expose `/v1/traps/*` and `/v1/skills/*` as symmetric public APIs.
- Keep legacy `/v1/knowledge/*` endpoints as compatibility wrappers during migration.

### Contracts

- Equivalent trap and skill operations should be isomorphic by default.
- If separate schemas are needed for naming clarity, they should still be structurally aligned and generated from shared base schemas where possible.
- Resource-specific fields should be additive, not shape-breaking.

## Migration Order

1. Define the canonical shared operation matrix first.
2. Add `trap` namespace without changing behavior.
3. Move CLI registration to shared command builders.
4. Move server routes to shared governed-resource handlers plus adapters.
5. Align contracts and formatter outputs so matching operations are structurally identical.
6. Preserve legacy `knowledge` and root command aliases until the new namespace is stable.
7. Rename internal `knowledge` terminology to `trap` only after the external behavior is already unified.

## Risks

- Renaming `knowledge` too early will mix semantic cleanup with interface migration and create unnecessary breakage.
- If the canonical shared command matrix is not defined first, the codebase will drift into namespace-specific behavior again.
- If resource-specific metadata leaks into top-level contracts, output parity will break and the requirement will no longer hold.

## Acceptance Standard

This phase is successful only if a user can treat `trap` and `skill` as the same product surface with different resource names.

Practical acceptance check:

- for each shared operation, replacing the leading command from `trap` to `skill` should preserve the same interaction model
- help text should show the same operation family and flag structure
- JSON mode should preserve the same envelope and field naming conventions
- text mode should preserve the same layout and meaning
- implementation review should show one shared workflow path with resource adapters, not duplicated business logic
