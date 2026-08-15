# TrapMap Web Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first usable TrapMap admin web panel with clear UI and logic separation, covering dashboard, review queue, review detail, activity, and a simple manual JSON editor.

**Architecture:** The panel is a Vite + React application with feature-oriented modules. Render-only UI components live separately from controller hooks, Zustand stores, and service adapters; DTO-to-view-model mapping happens at the service boundary so backend contracts do not leak into presentational components.

**Tech Stack:** TypeScript, React, Zustand, Vite, Vitest, Biome, Tailwind CSS, HeroUI v3, Framer Motion

---

## File Structure

### Create

- `packages/web-panel/src/app/bootstrap/index.tsx`
- `packages/web-panel/src/app/providers/app-providers.tsx`
- `packages/web-panel/src/app/router/router.tsx`
- `packages/web-panel/src/app/shell/app-shell.tsx`
- `packages/web-panel/src/pages/dashboard/dashboard-page.tsx`
- `packages/web-panel/src/pages/review-queue/review-queue-page.tsx`
- `packages/web-panel/src/pages/review-detail/review-detail-page.tsx`
- `packages/web-panel/src/pages/activity/activity-page.tsx`
- `packages/web-panel/src/features/dashboard/use-dashboard-page-model.ts`
- `packages/web-panel/src/features/review-queue/use-review-queue-page-model.ts`
- `packages/web-panel/src/features/review-detail/use-review-detail-controller.ts`
- `packages/web-panel/src/features/json-editor/use-json-editor-controller.ts`
- `packages/web-panel/src/features/activity/use-activity-page-model.ts`
- `packages/web-panel/src/features/dashboard/service.ts`
- `packages/web-panel/src/features/review-queue/service.ts`
- `packages/web-panel/src/features/review-detail/service.ts`
- `packages/web-panel/src/features/json-editor/service.ts`
- `packages/web-panel/src/features/activity/service.ts`
- `packages/web-panel/src/services/api/http-client.ts`
- `packages/web-panel/src/services/api/admin-panel-api.ts`
- `packages/web-panel/src/services/mappers/runtime-status-mapper.ts`
- `packages/web-panel/src/services/mappers/review-item-mapper.ts`
- `packages/web-panel/src/services/mappers/activity-event-mapper.ts`
- `packages/web-panel/src/stores/session-store.ts`
- `packages/web-panel/src/stores/dashboard-store.ts`
- `packages/web-panel/src/stores/review-queue-store.ts`
- `packages/web-panel/src/stores/review-detail-store.ts`
- `packages/web-panel/src/stores/json-editor-store.ts`
- `packages/web-panel/src/stores/ui-store.ts`
- `packages/web-panel/src/shared/ui/`
- `packages/web-panel/src/shared/motion/`
- `packages/web-panel/src/shared/lib/json-editor.ts`
- `packages/web-panel/src/shared/lib/request-state.ts`
- `packages/web-panel/src/test/`
- `packages/web-panel/src/main.tsx`
- `packages/web-panel/src/index.css`
- `packages/web-panel/tailwind.config.ts`
- `packages/web-panel/postcss.config.js`

### Modify

- `packages/web-panel/package.json`
- `packages/web-panel/tsconfig.json`
- `packages/web-panel/vite.config.ts`
- `packages/web-panel/vitest.config.ts`
- `packages/web-panel/docs/requirements.md`
- `packages/web-panel/docs/architecture.md`

### Test

- `packages/web-panel/src/shared/lib/json-editor.test.ts`
- `packages/web-panel/src/stores/review-queue-store.test.ts`
- `packages/web-panel/src/stores/json-editor-store.test.ts`
- `packages/web-panel/src/features/review-detail/service.test.ts`
- `packages/web-panel/src/pages/review-detail/review-detail-page.test.tsx`

## Task 1: Foundation And Tooling

**Files:**

- Create: `packages/web-panel/src/main.tsx`
- Create: `packages/web-panel/src/app/bootstrap/index.tsx`
- Create: `packages/web-panel/src/app/providers/app-providers.tsx`
- Create: `packages/web-panel/src/app/router/router.tsx`
- Create: `packages/web-panel/src/app/shell/app-shell.tsx`
- Create: `packages/web-panel/src/index.css`
- Create: `packages/web-panel/tailwind.config.ts`
- Create: `packages/web-panel/postcss.config.js`
- Modify: `packages/web-panel/package.json`
- Modify: `packages/web-panel/vite.config.ts`
- Modify: `packages/web-panel/vitest.config.ts`

- [ ] Add runtime and styling dependencies: `react`, `react-dom`, `zustand`, `tailwindcss`, `postcss`, `autoprefixer`, `framer-motion`, `@heroui/react`, and routing package selected by the implementation.
- [ ] Configure Vite for a browser React app instead of the current placeholder config.
- [ ] Add Tailwind CSS entrypoint and wire global design tokens for an admin-focused visual system.
- [ ] Establish `AppProviders` to hold HeroUI provider, router provider, and future session provider seam.
- [ ] Replace the placeholder `bootstrapWebPanel()` entry with a real `main.tsx` browser mount.
- [ ] Add a minimal route tree for `/`, `/reviews`, `/reviews/:id`, and `/activity`.
- [ ] Verify with `pnpm --filter @trapmap/web-panel typecheck` and `pnpm --filter @trapmap/web-panel test`.

## Task 2: Shared Contracts For UI/Logic Separation

**Files:**

- Create: `packages/web-panel/src/shared/lib/request-state.ts`
- Create: `packages/web-panel/src/shared/motion/`
- Create: `packages/web-panel/src/shared/ui/`
- Create: `packages/web-panel/src/services/api/http-client.ts`
- Create: `packages/web-panel/src/services/api/admin-panel-api.ts`

- [ ] Introduce a shared request-state model used across stores, such as `idle | loading | success | error`.
- [ ] Define shared app shell primitives for page container, section heading, empty state, error panel, skeleton block, and confirmation dialog.
- [ ] Add shared Framer Motion wrappers for page enter, list stagger, and panel reveal.
- [ ] Build a thin HTTP client wrapper over `@trapmap/client-core` or a browser-friendly equivalent adapter, keeping request concerns outside components.
- [ ] Define one admin API surface with named methods rather than page-specific fetch calls.

## Task 3: Domain Mapping And Service Layer

**Files:**

- Create: `packages/web-panel/src/services/mappers/runtime-status-mapper.ts`
- Create: `packages/web-panel/src/services/mappers/review-item-mapper.ts`
- Create: `packages/web-panel/src/services/mappers/activity-event-mapper.ts`
- Create: `packages/web-panel/src/features/dashboard/service.ts`
- Create: `packages/web-panel/src/features/review-queue/service.ts`
- Create: `packages/web-panel/src/features/review-detail/service.ts`
- Create: `packages/web-panel/src/features/json-editor/service.ts`
- Create: `packages/web-panel/src/features/activity/service.ts`
- Test: `packages/web-panel/src/features/review-detail/service.test.ts`

- [ ] Define frontend domain models for runtime status, review list item, review detail, manual JSON draft metadata, and activity event.
- [ ] Implement DTO-to-domain mapping functions so components never consume raw backend response shape.
- [ ] Create named service functions:
  - `loadRuntimeOverview`
  - `loadPendingReviews`
  - `loadReviewDetail`
  - `submitReviewDecision`
  - `saveManualJsonEdit`
  - `loadActivityFeed`
- [ ] Add unit tests for mapper and service behavior with mocked transport responses.

## Task 4: Zustand Store Topology

**Files:**

- Create: `packages/web-panel/src/stores/session-store.ts`
- Create: `packages/web-panel/src/stores/dashboard-store.ts`
- Create: `packages/web-panel/src/stores/review-queue-store.ts`
- Create: `packages/web-panel/src/stores/review-detail-store.ts`
- Create: `packages/web-panel/src/stores/json-editor-store.ts`
- Create: `packages/web-panel/src/stores/ui-store.ts`
- Test: `packages/web-panel/src/stores/review-queue-store.test.ts`
- Test: `packages/web-panel/src/stores/json-editor-store.test.ts`

- [ ] Keep stores small and workflow-scoped instead of creating one app-wide mega store.
- [ ] Implement explicit action methods for fetch lifecycle, filter updates, detail refresh, dialog visibility, and toast notifications.
- [ ] Model JSON editor state with:
  - original payload
  - draft text
  - validation error
  - dirty flag
  - edit rationale
- [ ] Add store tests covering initialization, request transitions, dirty tracking, reset behavior, and action updates.

## Task 5: Controller Hooks And Page Models

**Files:**

- Create: `packages/web-panel/src/features/dashboard/use-dashboard-page-model.ts`
- Create: `packages/web-panel/src/features/review-queue/use-review-queue-page-model.ts`
- Create: `packages/web-panel/src/features/review-detail/use-review-detail-controller.ts`
- Create: `packages/web-panel/src/features/json-editor/use-json-editor-controller.ts`
- Create: `packages/web-panel/src/features/activity/use-activity-page-model.ts`

- [ ] Build controller hooks that connect stores plus services and return page-ready props.
- [ ] Keep event handlers, formatted labels, and action gating inside these hooks rather than inside presentational components.
- [ ] Ensure review detail controller owns approval, rejection, reassignment, and correction workflows.
- [ ] Ensure JSON editor controller owns parse validation, formatting, reset, unsaved-change behavior, and save eligibility.

## Task 6: App Shell And Navigation UI

**Files:**

- Create: `packages/web-panel/src/app/shell/app-shell.tsx`
- Create: `packages/web-panel/src/shared/ui/`

- [ ] Build a durable app shell with top identity bar, left navigation, page title region, and status indicator.
- [ ] Use HeroUI v3 primitives for accessible navigation and dialogs.
- [ ] Apply Tailwind CSS tokens for a distinct admin-console look rather than generic defaults.
- [ ] Use Framer Motion only for route transition and staged shell reveal, not for dense data tables.

## Task 7: Dashboard And Activity Screens

**Files:**

- Create: `packages/web-panel/src/pages/dashboard/dashboard-page.tsx`
- Create: `packages/web-panel/src/pages/activity/activity-page.tsx`

- [ ] Implement dashboard cards for service health, queue backlog, failed jobs, and warning summary.
- [ ] Implement activity page with filters, list states, and link-back affordances.
- [ ] Keep pages composition-only by feeding them controller/view-model data and shared UI components.
- [ ] Add loading, empty, and error states for both pages.

## Task 8: Review Queue Screen

**Files:**

- Create: `packages/web-panel/src/pages/review-queue/review-queue-page.tsx`

- [ ] Implement filter bar, search input, sort selector, and queue results region.
- [ ] Represent row actions and risk indicators through shared UI components.
- [ ] Ensure queue page never mutates backend state directly; it only navigates or updates local query state.
- [ ] Add interaction tests for filter and navigation wiring where practical.

## Task 9: Review Detail Workspace

**Files:**

- Create: `packages/web-panel/src/pages/review-detail/review-detail-page.tsx`
- Test: `packages/web-panel/src/pages/review-detail/review-detail-page.test.tsx`

- [ ] Build the review detail workspace from composable sections:
  - item header
  - metadata summary
  - warnings panel
  - related references
  - action panel
  - JSON editor panel
  - activity timeline
- [ ] Keep action gating and rationale rules in the controller layer.
- [ ] Add confirmation requirements for approve, reject, and return-for-correction flows.
- [ ] Add component tests for invalid JSON save blocking and required rationale behavior.

## Task 10: JSON Editor Sub-Workflow

**Files:**

- Create: `packages/web-panel/src/shared/lib/json-editor.ts`
- Test: `packages/web-panel/src/shared/lib/json-editor.test.ts`

- [ ] Implement pure helpers for parse, pretty-print, dirty detection, and editor error messages.
- [ ] Wire the editor as a bounded workflow with store plus controller plus presentational panel.
- [ ] Require edit rationale before save.
- [ ] Preserve original payload for reset and future diff support.
- [ ] Ensure review actions can operate on the edited payload when present.

## Task 11: Hardening And Documentation

**Files:**

- Modify: `packages/web-panel/README.md`
- Modify: `packages/web-panel/docs/requirements.md`
- Modify: `packages/web-panel/docs/architecture.md`

- [ ] Update package README with real local commands and module map after implementation.
- [ ] Reconcile requirements doc with any route or service naming decisions made during implementation.
- [ ] Keep architecture doc aligned with actual folder structure and controller/store split.
- [ ] Run `pnpm --filter @trapmap/web-panel typecheck`, `pnpm --filter @trapmap/web-panel test`, and any package-specific lint command once added.

## Self-Review

### Spec Coverage

- Covered: dashboard, review queue, review detail, activity, JSON editor, audit visibility, UI/logic decoupling, Framer Motion usage, Zustand state boundaries, service boundary design.
- Gap intentionally deferred: authentication backend specifics, live metrics route design, multi-reviewer locking.

### Placeholder Scan

- No `TBD`, `TODO`, or “implement later” placeholders are used for execution tasks.
- Deferred items are explicitly named in the self-review and are not presented as completed scope.

### Type Consistency

- Service names, store names, and controller names are consistent across tasks.
- JSON editor state model remains scoped to `json-editor-store` and `use-json-editor-controller`.
