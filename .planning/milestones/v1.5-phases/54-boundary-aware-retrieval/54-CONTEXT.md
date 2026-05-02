# Phase 54: Boundary-aware Retrieval - Context

**Gathered:** 2026-05-02
**Status:** Ready for planning
**Mode:** Derived from the v1.5 roadmap and the applicability-boundary analysis

<domain>
## Phase Boundary

Phase 54 should apply applicability-boundary logic during retrieval and return user-visible explanations of why a result is applicable, weakly applicable, or potentially inapplicable.

This phase is about retrieval policy and explanation. It is not about schema invention or reviewer capture flows.

In scope:
- Accept query-side boundary context such as stack, environment, stage, version, and error/symptom hints
- Intersect query context with approved stored boundaries
- Enforce hard exclusion for required mismatches where policy says the result is invalid
- Apply boosts or penalties for preferred and excluded matches
- Return explanation metadata describing the applicability decision

Out of scope:
- Boundary schema definition
- Submission/review capture UX
- Index construction details
- Feedback-triggered lifecycle changes

</domain>

<decisions>
## Implementation Decisions

### Working assumptions

- "Relevant" and "applicable" are different ranking dimensions and should remain separable in the implementation and in evaluation.
- Some boundary mismatches should filter hard, while others should only penalize confidence. The system needs policy vocabulary, not a single score knob.
- Applicability explanations must be concise and deterministic enough for CLI users and evaluation fixtures.
- Missing boundary data should not always hide a result, but the result should surface uncertainty explicitly.

### Target direction

- Extend retrieval query inputs with optional boundary context fields rather than forcing all callers to provide them.
- Reuse the current parsed-intent pipeline so free-text seeds can still generate boundary hints automatically.
- Introduce a boundary scoring stage after governance filtering and before final ranking assembly.
- Return explanation fields that separate:
  - matched required constraints
  - matched preferred constraints
  - triggered exclusions
  - unknown or missing boundary areas

### Policy direction

- `required` mismatch:
  - exclude by default when the query explicitly asserts the conflicting context
- `excluded` match:
  - strong penalty or exclusion depending on the field and confidence
- `preferred` match:
  - additive boost
- missing query boundary:
  - do not punish the result just because the user did not specify enough context
- missing stored boundary:
  - allow result but mark it as low-confidence applicability

</decisions>

<code_context>
## Existing Code Insights

### Capsule ranking already scores context-like signals

- Capsule recall already computes `situation`, `problem`, `goal`, keyword overlap, and stack/path boosts in [capsule-recall.ts](/home/wunai/Disks/Data/my-project/Trap-Map/packages/server/src/lib/retrieval/capsule-recall.ts:171).
- Phase 54 should extend this scoring model, not replace it wholesale.

### Intent parsing already extracts stack/path hints and error text

- Query parsing already derives structured intent components from a single seed in [intent.ts](/home/wunai/Disks/Data/my-project/Trap-Map/packages/server/src/lib/retrieval/intent.ts:277).
- Those parsed hints are the obvious fallback source for boundary context when the user does not pass structured fields explicitly.

### Public retrieval filters are currently too shallow

- Retrieval contracts currently expose labels, scopes, team, and max-results controls in [retrieval.ts](/home/wunai/Disks/Data/my-project/Trap-Map/packages/contracts/src/domain/retrieval.ts:49).
- There is no public place to express "I am in CI on Node 20" or "this is a production-only incident", which is exactly the gap this phase should close.

### Existing retrieval explanations do not express applicability

- Current responses explain match reasons and citations, but not why the result is safe or unsafe for the caller's environment in [retrieval.ts](/home/wunai/Disks/Data/my-project/Trap-Map/packages/contracts/src/domain/retrieval.ts:61).
- Boundary explanation should be additive and should not disturb the existing citation and reason surfaces.

</code_context>

<specifics>
## Specific Ideas

- Extend retrieval query contracts with optional context fields such as:
  - stacks
  - environments
  - stages
  - versions
  - topology hints
- Add a boundary explanation object per result, for example:
  - `matchedRequired`
  - `matchedPreferred`
  - `triggeredExclusions`
  - `unknownFields`
  - `decision`
- Teach both v1 entry retrieval and v2 capsule retrieval to consume the same boundary-policy layer where practical.
- Add evaluation cases for:
  - same topic, different environment
  - correct stack, wrong version
  - excluded context hit
  - missing boundary on otherwise relevant content

</specifics>

<deferred>
## Deferred Ideas

- Full natural-language explanation generation via LLM
- Personalized retrieval policies per user/team
- Automatic clarification questions when boundary confidence is low
- Cross-query session memory for persistent environment context

</deferred>
