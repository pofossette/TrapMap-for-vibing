# Phase 2 Brief: Agent-Planning Emits Unified Platform Events

Implement Phase 2 from `docs/todos/agent-eval-framework-evaluation-and-plan.md`.

Requirements:
- Update only the `agent-planning` suite to emit the unified event model.
- Planned touch points:
  - `evals/agent-planning/run.ts`
  - `evals/agent-planning/lib/report.ts`
  - `evals/agent-planning/lib/format.ts`
  - `evals/agent-planning/lib/judge-runner.ts`
  - `evals/agent-planning/lib/actor-runner.ts`
- Emit:
  - run started / finished events
  - case started / finished events
  - deterministic precheck results
  - dimension score, final score, and failure rationale
  - group / slice metadata where it belongs in the platform event stream
- Record step-level trace only where it is already justified by current data; avoid overdesign.
- Keep terminal output and the native JSON report contract unchanged for existing users.

Known implementation guidance:
- The best insertion point is `executeCase()` in `evals/agent-planning/run.ts`, with run-level events in `runAgentPlanningEval()`.
- Do not rely on terminal output for failure detail; the platform stream must use internal structured data.
- Avoid duplicate normalization drift between `run.ts` and `judge-runner.ts` if a shared normalized plan can be reused safely.

Docs:
- If run entry behavior, output fields, or judging semantics change, update:
  - `evals/agent-planning/README.md`
  - `evals/README.md`
  - `docs/operations/TESTING.md`
- If none of those external contracts change, keep docs updates minimal and focus on plan checklist progress.

TDD requirements:
- Write failing tests first for any new platform-event behavior and verify RED before GREEN.

Required validation:
- `rtk pnpm eval -- agent-planning --tier smoke --dry-run --json --json-path ./reports/agent-planning-smoke.json`
- `rtk pnpm eval -- agent-planning --tier core --dry-run`
- `rtk pnpm eval:smoke`

Deliverables:
- `agent-planning` emits stable platform events through the Phase 1 adapter layer.
- Existing native report and CLI output remain backward-compatible.
