# TrapMap Web Panel Requirements

## 1. Overview

`@trapmap/web-panel` is the administrator-facing browser console for TrapMap. It
is intended for runtime operations, governance review, and manual intervention
work that benefits from a visual workflow and structured forms.

The first phase should prioritize safe operational visibility and human review
flows over broad end-user functionality. The panel is not a general knowledge
authoring frontend; it is an internal control surface for administrators and
reviewers.

## 2. Goals

- Provide a single web entry point for administrators to understand platform
  health and workload state.
- Provide a review workspace for pending human-governed items.
- Provide a manual intervention surface for fixing payloads before approval or
  resubmission.
- Preserve auditability for all human actions taken in the panel.

## 3. Non-Goals

- Public or anonymous access
- Rich end-user content authoring
- Full system configuration management in phase 1
- Complex collaborative editing
- Real-time multi-user synchronization beyond basic refresh or polling

## 4. Primary Users

### 4.1 Platform Administrator

Needs to inspect service health, queue state, and operational blockers.

### 4.2 Governance Reviewer

Needs to open pending review items, evaluate machine-generated or user-submitted
content, and decide approve, reject, or send back for correction.

### 4.3 Incident Operator

Needs to manually inspect and repair malformed JSON payloads or metadata when
automation cannot proceed safely.

## 5. Functional Scope

### 5.1 Authentication And Access Control

- The panel must require authenticated administrator access.
- The panel should support role-aware UI visibility:
  - administrator
  - reviewer
  - read-only operator
- Sensitive actions must require explicit confirmation.

### 5.2 Service Status And Runtime Dashboard

- Show current service status for TrapMap runtime components.
- Show environment-level summary:
  - deployment profile
  - service version or build identifier
  - last successful health check time
  - degraded or failed services
- Show queue and workload summary:
  - pending review count
  - candidate ingestion backlog
  - failed jobs count
  - recent processing throughput
- Show recent incidents or actionable warnings when data is available.

### 5.3 Pending Review Queue

- List items requiring human review.
- Support filtering by:
  - status
  - source
  - risk level
  - created time
  - assigned reviewer
- Support sorting by newest, oldest, highest risk, and longest waiting.
- Surface compact item metadata in the list:
  - title or identifier
  - source
  - current status
  - created time
  - risk markers
  - assignment state

### 5.4 Review Detail Workspace

- Open a selected item into a dedicated detail view.
- Show structured review context:
  - raw payload summary
  - extracted metadata
  - related trap or knowledge references
  - system-generated warnings
  - prior review history
- Provide review actions:
  - approve
  - reject
  - return for correction
  - save draft decision
  - reassign
- Require reviewer rationale for reject and return-for-correction actions.

### 5.5 Manual JSON Intervention

- Provide a simple online JSON editor embedded in the review workflow.
- Allow loading the current JSON payload for the selected item.
- Support JSON formatting and validation before save.
- Highlight invalid JSON states clearly and block submission while invalid.
- Support side-by-side comparison between original and edited JSON in a later
  phase; for phase 1, this can be a single editor with change summary metadata.
- Provide actions:
  - format JSON
  - reset to original
  - apply edited payload
  - copy JSON
- Record edited-by, edited-at, and edit rationale when manual changes are saved.

### 5.6 Audit And Activity Visibility

- Show recent operator actions relevant to the current item.
- Preserve immutable action history for:
  - status transitions
  - approvals
  - rejections
  - reassignment
  - manual JSON edits
- Show action actor, timestamp, and reason.

## 6. Interface Information Architecture

### 6.1 Application Shell

The application shell should provide:

- top navigation with environment identity and signed-in user
- left navigation or compact sidebar for primary sections
- global status indicator for system health
- page-level loading, error, and empty states

Primary navigation entries:

- Dashboard
- Review Queue
- Review Detail
- Activity

### 6.2 Dashboard Page

The dashboard should include:

- service health summary cards
- queue status cards
- recent failure or warning panel
- quick links to pending review segments

Dashboard page functions:

- inspect current runtime state
- jump to filtered review queues
- identify degraded services needing follow-up

### 6.3 Review Queue Page

The review queue page should include:

- filter bar
- search input
- sort selector
- queue table or card list
- pagination or incremental loading

Review queue page functions:

- scan pending work quickly
- narrow items by risk or status
- open an item into the review workspace

### 6.4 Review Detail Page

The review detail page should include:

- item header with status, source, and timestamps
- metadata summary section
- machine analysis or warnings section
- related references section
- action panel
- manual JSON editor panel
- activity timeline

Review detail page functions:

- inspect the full context of a governed item
- make a review decision
- edit machine-produced JSON when safe manual repair is necessary
- view prior actions before taking a new one

### 6.5 Activity Page

The activity page should include:

- recent admin actions list
- filters by actor, action type, and time range
- links back to affected records

Activity page functions:

- trace operator behavior
- support auditing and incident review

## 7. JSON Editor Requirements

The JSON editor is intentionally simple in phase 1 and should optimize for
operability rather than advanced IDE-like features.

Required capabilities:

- text area or code-editor style JSON input
- syntax-aware validation feedback
- pretty-print formatting
- reset to server-original payload
- disabled save when JSON is invalid
- optional schema-based validation in a later increment

Required surrounding workflow:

- editor is always scoped to one review item
- save action requires an edit reason
- review actions can consume the edited JSON payload
- unsaved change warning should appear before navigation away

## 8. State Management Expectations

The package stack should use:

- React for UI composition
- Zustand for client-side app and workflow state
- Framer Motion for page transitions, staged reveals, and stateful workflow
  animations
- Vite for local development and build
- Vitest for unit and component-level testing
- Biome for formatting and linting
- Tailwind CSS for styling tokens and layout utilities
- HeroUI v3 for accessible UI primitives

Suggested store slices:

- auth/session state
- dashboard data state
- review queue query state
- review item detail state
- JSON editor draft state
- transient UI state such as toasts, dialogs, and loading

## 9. API Integration Expectations

The web panel should prefer shared contracts and transport layers from existing
workspace packages where practical.

- Use `@trapmap/contracts` for request and response shapes whenever available.
- Use `@trapmap/client-core` as the baseline HTTP client layer when browser
  compatibility and session flow fit the need.
- Avoid duplicating backend data contracts in panel-local code.

## 10. Quality Requirements

- The panel should remain usable on desktop widths first, with tablet support as
  a secondary goal and mobile support for read-only inspection where practical.
- All destructive or high-impact actions must present confirmation UI.
- Error states must be explicit and actionable.
- Loading states must distinguish between initial page load and action-in-flight.
- UI components should be testable in isolation.

## 11. Suggested Delivery Phases

### Phase 1

- package bootstrap
- app shell
- dashboard scaffolding with mocked or placeholder service data
- review queue scaffolding
- review detail scaffolding
- simple JSON editor with validation and formatting

### Phase 2

- live API integration
- richer review actions and optimistic updates
- audit timeline integration
- role-aware route guards

### Phase 3

- diff view for original versus edited JSON
- schema-aware validation
- bulk review operations
- incident analytics and historical trends

## 12. Open Design Decisions

- Which backend host or route surface will expose dashboard metrics to the web
  panel
- Whether authentication is reused from an existing TrapMap session model or a
  new browser-specific flow
- Whether review item locking or assignment is required to avoid reviewer
  conflicts
- Whether the JSON editor should remain plain text or adopt a richer embedded
  code editor in later phases
