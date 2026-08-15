# TrapMap Web Panel Architecture

## 1. Design Objectives

The web panel should be built as a thin UI shell over explicit application
logic. React components should focus on rendering, interaction wiring, and local
presentation state. Business workflows, data fetching rules, review actions, and
JSON editing rules should live outside presentational components.

The architecture should optimize for:

- UI and logic layer decoupling
- testable state transitions
- replaceable transport and backend adapters
- reusable domain-oriented view models
- low-friction incremental delivery

## 2. Layer Model

The package should be split into five layers.

### 2.1 App Layer

Responsibility:

- bootstrapping
- route registration
- global providers
- top-level layout composition

Contains:

- app entry
- router setup
- theme and provider composition
- app shell orchestration

Constraints:

- no backend request details
- no domain mutation logic

### 2.2 Page Layer

Responsibility:

- page-level composition
- route-bound data loading triggers
- page-specific layout arrangement

Contains:

- dashboard page
- review queue page
- review detail page
- activity page

Constraints:

- pages may call feature hooks or feature facades
- pages should not directly encode transport logic

### 2.3 Feature Layer

Responsibility:

- isolated business workflows per domain area
- view-model preparation for pages
- workflow actions exposed as hooks or controller objects

Feature modules:

- dashboard
- review-queue
- review-detail
- json-editor
- activity-log
- auth-session

Constraints:

- feature state is accessed through selector-based hooks
- feature logic consumes service interfaces, not raw fetch calls

### 2.4 Shared UI Layer

Responsibility:

- reusable render-only components
- layout primitives
- visual status components
- form field wrappers

Contains:

- cards
- tables
- badges
- drawers
- dialogs
- skeletons
- empty states
- animated section wrappers

Constraints:

- no feature-specific business rules
- no direct Zustand store access

### 2.5 Data And Domain Layer

Responsibility:

- API client adapters
- DTO to domain mapping
- command execution
- validation helpers
- pure workflow helpers

Contains:

- transport client wrappers
- query and mutation services
- mappers
- pure reducers or transition helpers
- JSON parsing and formatting utilities

Constraints:

- no React rendering concerns
- deterministic pure logic where possible

## 3. UI/Logic Decoupling Rules

### 3.1 Presentational Components

Presentational components should:

- receive data and callbacks through props
- render HeroUI v3 primitives and Tailwind-based layout
- use Framer Motion only for visual behavior
- avoid importing services, stores, or transport code directly

Examples:

- `ServiceStatusCard`
- `ReviewQueueTable`
- `ReviewActionBar`
- `JsonEditorPanel`

### 3.2 Container And Controller Hooks

Container hooks should:

- read Zustand state
- call feature services
- derive page-ready view models
- expose event handlers to presentational components

Examples:

- `useDashboardPageModel()`
- `useReviewQueuePageModel()`
- `useReviewDetailController()`
- `useJsonEditorController()`

### 3.3 Domain Services

Domain services should:

- expose named use cases instead of generic request wrappers
- map contracts into stable frontend domain models
- centralize error translation

Examples:

- `loadRuntimeOverview()`
- `loadPendingReviews()`
- `submitReviewDecision()`
- `saveManualJsonEdit()`

### 3.4 State Stores

Zustand stores should:

- hold workflow state, not JSX concerns
- expose small selectors and explicit action methods
- avoid one giant global store for the full app

Recommended split:

- `session-store`
- `dashboard-store`
- `review-queue-store`
- `review-detail-store`
- `json-editor-store`
- `ui-store`

## 4. Proposed Directory Structure

```text
packages/web-panel/
  src/
    app/
      bootstrap/
      providers/
      router/
      shell/
    pages/
      dashboard/
      review-queue/
      review-detail/
      activity/
    features/
      auth/
      dashboard/
      review-queue/
      review-detail/
      json-editor/
      activity/
    entities/
      review-item/
      runtime-status/
      audit-event/
    shared/
      ui/
      motion/
      hooks/
      lib/
      types/
    services/
      api/
      mappers/
      adapters/
    stores/
    styles/
    test/
```

## 5. Feature Responsibilities

### 5.1 Dashboard

- aggregate service health cards
- aggregate queue metrics
- expose refresh action
- prepare warning banners and quick links

### 5.2 Review Queue

- own filter, sort, search, and pagination state
- load list data
- normalize query params
- expose navigation into detail workspace

### 5.3 Review Detail

- load selected item context
- show related references and prior actions
- coordinate approval, rejection, correction, and reassignment

### 5.4 JSON Editor

- manage draft JSON text
- validate parse state
- compute dirty state
- format and reset draft
- submit edited payload with rationale

### 5.5 Activity

- load action timeline records
- filter by actor and action type
- expose links back to source entities

## 6. State Design

### 6.1 Server State Versus Client Workflow State

Separate concerns:

- server state: fetched dashboard metrics, review lists, item detail, activity
- client workflow state: filter inputs, dialog visibility, draft JSON, pending
  rationale text, optimistic transition markers

Recommendation:

- use feature services plus Zustand-managed loading snapshots now
- preserve a clean seam so React Query or another cache layer can be introduced
  later without rewriting pages

### 6.2 Store Shape Guidelines

- keep normalized identifiers for item collections where practical
- keep request status as explicit state:
  - `idle`
  - `loading`
  - `success`
  - `error`
- isolate ephemeral modals and toasts in `ui-store`
- keep JSON editor history scoped per active item id

## 7. Service Boundary Design

The panel should not let components call `fetch` directly.

Recommended boundary:

- `services/api/http-client.ts`
- `services/api/admin-panel-api.ts`
- `services/mappers/*.ts`
- `features/*/service.ts`

Flow:

1. page or controller hook triggers feature action
2. feature action calls a named service method
3. service method calls shared HTTP client
4. mapper converts response DTO into domain/view model
5. store updates state
6. presentational components render props

## 8. Animation Strategy With Framer Motion

Framer Motion should be used deliberately, not as decoration.

Use it for:

- shell and page enter transitions
- staggered dashboard card reveals
- status changes in review workflow
- drawer and modal transitions
- inline success or failure feedback around review actions

Do not use it for:

- every button hover
- layout thrash during large tables
- essential meaning that would disappear without animation

Shared motion wrappers should live in `src/shared/motion/` so animation choices
do not leak into business features.

## 9. Testing Strategy

### 9.1 Pure Logic Tests

Test:

- mappers
- JSON validation and formatting helpers
- review decision transition helpers
- query filter normalization

### 9.2 Store Tests

Test:

- state initialization
- request lifecycle transitions
- optimistic and rollback behavior
- draft reset and dirty tracking

### 9.3 Component Tests

Test:

- rendering of main page states
- disabled actions on invalid JSON
- confirmation dialog requirements
- filter and action wiring

## 10. Delivery Sequencing

### 10.1 Foundation

- Vite React scaffold
- Tailwind CSS setup
- HeroUI v3 provider setup
- Framer Motion integration points
- router and shell
- shared UI primitives

### 10.2 Operational Surfaces

- dashboard
- review queue
- activity page

### 10.3 Decision Workspace

- review detail page
- action panel
- JSON editor
- confirmation and rationale flows

### 10.4 Hardening

- audit trace visibility
- accessibility pass
- test expansion
- loading and error state polish

## 11. Design Risks

- review detail scope can expand too quickly and become a monolith
- a single store can become tightly coupled and hard to test
- direct DTO usage in components will leak backend shape into UI
- overusing Framer Motion can harm readability in dense admin screens

## 12. Recommended Implementation Principles

- keep components prop-driven
- keep business actions in feature services and controller hooks
- prefer small stores over one cross-cutting mega-store
- map transport DTOs once near the service boundary
- treat JSON editing as a bounded sub-workflow with its own state model
