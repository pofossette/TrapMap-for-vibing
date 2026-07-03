# Phase 0 Brief: Freeze Boundaries And Event Model

Implement Phase 0 from `docs/todos/agent-eval-framework-evaluation-and-plan.md`.

Requirements:
- Add `docs/todos/agent-eval-platform-event-model.md`.
- Define the three layers clearly: TrapMap Eval Kernel, Platform Model, Platform Adapters.
- Define the unified event family exactly as:
  - `EvalRunStarted`
  - `EvalRunFinished`
  - `EvalCaseStarted`
  - `EvalCaseFinished`
  - `EvalScoreRecorded`
  - `EvalAssertionRecorded`
  - `EvalTraceStepRecorded`
- Define the minimum event fields exactly as:
  - `suite`
  - `tier`
  - `runId`
  - `caseId`
  - `scenarioId`
  - `timestamp`
  - `tags`
  - `payload`
- Document how the new event model maps back to the existing TrapMap report schema.
- Record the explicit non-goals for first-round platform integration:
  - `retrieval-live`
  - CI hard gate takeover
  - `badcase export` replacement
- Update `docs/todos/agent-eval-framework-evaluation-and-plan.md` checkboxes for Phase 0 and any directly related global checklist items.
- Update `docs/todos/agent-eval-framework-scorecard.md` only if it needs a short note to align with the new event-model-first execution path. Do not turn it into an implementation plan.

Constraints:
- Keep the root `plan.md` as an index only.
- Do not change runtime code in this task.
- The new event-model doc must become the sole design input for Phase 1 code work.
- Keep wording aligned with current plan terminology: kernel, platform model, platform adapters, double-write mirror, native TrapMap truth source.

Required validation:
- `rtk pnpm check:docs-drift`
- `rtk pnpm check:structure`

Deliverables:
- Updated docs only.
- No unrelated doc churn.
