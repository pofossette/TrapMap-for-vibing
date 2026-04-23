# Phase 30: Fixture Trace - Context

**Gathered:** 2026-04-23
**Status:** Ready for planning
**Mode:** Derived from current eval runner gaps and prior phase outcomes

<domain>
## Phase Boundary

Phase 30 should turn the evaluation stack from partially wired infrastructure into a real executable regression surface by connecting scenarios, fixture seeding, live endpoint execution, and retrieval-context trace output.

This phase is about evaluation truthfulness and observability, not CI polish.

In scope:
- Materialize eval scenarios into real in-process fixture state
- Ensure retrieval eval executes against true scenario data
- Ensure summary eval executes against real endpoint responses instead of mock data
- Add response/context trace fields needed for downstream groundedness and context-quality checks

Out of scope:
- Large benchmark expansion by query type and mode
- CI dashboards and scheduled regression orchestration
- Major retrieval algorithm changes except where trace support requires additive schema work

</domain>

<decisions>
## Implementation Decisions

### Working assumptions

- Retrieval and summary evaluation should remain TypeScript-native and run against the repo's real server contracts.
- Scenario-driven fixtures should be deterministic and isolated per eval execution context.
- Evaluation-specific context trace should be additive and opt-in where possible, so normal API consumers are not forced to receive large payloads.
- Summary evaluation should consume real summaries and real supporting context from executed endpoints, not synthetic placeholders.

### Target direction

- Finish the missing fixture materialization path in the retrieval eval adapter layer.
- Replace mock summary generation with true route execution and real context assembly.
- Introduce a governed trace surface that exposes what the system actually used, not a reconstructed approximation.

</decisions>

<code_context>
## Existing Code Insights

### Retrieval eval gap

- The retrieval runner is structurally real, but scenario seeding is still a placeholder in [adapters.ts](/home/wunai/Disks/Data/my-project/Trap-Map/evals/retrieval/lib/adapters.ts:141).
- Scenarios already exist under `evals/retrieval/scenarios/`, so the missing piece is execution-time materialization rather than schema design.

### Summary eval gap

- Summary execution is still mock-driven in [run.ts](/home/wunai/Disks/Data/my-project/Trap-Map/evals/summary/run.ts:197).
- The current implementation generates a fake summary and fake context instead of calling the route and extracting real returned evidence.

### Existing summary surfaces

- v1 summary building is deterministic and citation-driven in [summary.ts](/home/wunai/Disks/Data/my-project/Trap-Map/packages/server/src/lib/retrieval/summary.ts:67).
- v2 has `buildCapsuleSummary()` available but it is not actually integrated into `searchKnowledgeV2` today in [summary.ts](/home/wunai/Disks/Data/my-project/Trap-Map/packages/server/src/lib/retrieval/summary.ts:174) and [orchestrator.ts](/home/wunai/Disks/Data/my-project/Trap-Map/packages/server/src/lib/retrieval/orchestrator.ts:698).

### Existing normalization/report substrate

- Retrieval eval already normalizes v1/v2 responses into a common shape in [normalize.ts](/home/wunai/Disks/Data/my-project/Trap-Map/evals/retrieval/lib/normalize.ts:1).
- Metric and governance calculators are already present in [metrics.ts](/home/wunai/Disks/Data/my-project/Trap-Map/evals/retrieval/lib/metrics.ts:1) and [governance.ts](/home/wunai/Disks/Data/my-project/Trap-Map/evals/retrieval/lib/governance.ts:1).
- This means Phase 30 should focus on input truth and trace fidelity, not metric invention.

### Logging and traceability foundation

- RAG pipeline timing is already captured in logs by the orchestrator, which may provide a pattern for trace metadata attachment.
- Current response contracts already support citations; trace work should build on that rather than invent a second unrelated evidence model.

</code_context>

<specifics>
## Specific Ideas

- Build a scenario loader that seeds users, memberships, knowledge entries, skill artifacts, and derived fields from the existing `fixtures` objects.
- Decide whether eval traces should live in normal response payloads behind a flag like `includeTrace` or in dedicated eval-only adapter extraction.
- Add enough trace detail to support future context-precision checks:
  - returned IDs
  - citation/evidence snippets
  - text chunks or capsule/source content actually used
  - selected mode and route path
- Ensure v2 summary path becomes real if summary evaluation is expected on `/v2/retrieval/search`.

</specifics>

<deferred>
## Deferred Ideas

- External RAGAS integration as the primary runner
- Cross-repo benchmark publishing
- Heavy tracing for production traffic by default

</deferred>
