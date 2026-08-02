
# @trapmap/web-panel

Browser-based admin panel for TrapMap runtime operations, governance review workflows, and knowledge graph inspection.

## Purpose

`@trapmap/web-panel` is the operational console for TrapMap administrators and reviewers. It provides a browser UI for monitoring service health, reviewing and approving intercepted knowledge entries, inspecting skill artifacts and their derivation outputs, and navigating trap and skill topology graphs. Manual interventions (JSON edits, review decisions) are recorded in an audit trail.

## Scripts

```bash
rtk pnpm --filter @trapmap/web-panel dev        # Start Vite dev server
rtk pnpm --filter @trapmap/web-panel build       # Typecheck + production build
rtk pnpm --filter @trapmap/web-panel preview     # Preview production build
rtk pnpm --filter @trapmap/web-panel test        # Run vitest suite
rtk pnpm --filter @trapmap/web-panel typecheck   # TypeScript type checking only
```

## Routes

| Path | Page | Description |
|---|---|---|
| `/` | Dashboard | Runtime overview: service health, workload metrics, graph previews, active incidents |
| `/reviews` | Review Queue | Filterable/sortable governance review queue with risk scoring |
| `/reviews/:id` | Review Detail | Full review workspace: metadata, validation reports, JSON editor, approve/reject/return actions |
| `/artifacts` | Artifacts | Skill artifact browser with lifecycle, scope, and level filters; detail drawer with derivation output |
| `/trap-graph` | Trap Graph | Interactive topology visualization of traps, cues, tools, environments, and mitigations |
| `/skill-graph` | Skill Graph | Per-artifact graph in derivation or semantic mode, with inspector panel |
| `/activity` | Activity Feed | Audit timeline of review decisions, manual interventions, and system events |

## Architecture

### Directory Layout

| Directory | Responsibility |
|---|---|
| `src/app` | Bootstrap, providers (Toast), route definitions, shell (sidebar nav, header, mobile drawer) |
| `src/pages` | Route-bound page compositions |
| `src/features` | Workflow logic and page-model hooks per feature domain |
| `src/services` | API transport layer, HTTP client, mock API, DTO mappers |
| `src/stores` | Zustand state slices (dashboard, review queue, review detail, session, theme, i18n, json editor) |
| `src/shared/enum-types` | Shared TypeScript types for API contracts, view models, enums |
| `src/shared/ui` | Reusable UI components (PageContainer, StatusBadge, G6GraphComponent, JsonEditorPanel, ReviewActionBar, FilterToolbar, etc.) |
| `src/shared/lib` | Utilities: request state machine, JSON editor helpers, display label localizers |
| `src/shared/motion` | Framer Motion page transitions and fade-in wrappers |
| `src/styles` | Global CSS and Tailwind design tokens |

### API Layer

The panel communicates with the TrapMap gateway via `AdminPanelApiContract`. Two implementations are provided:

- **Real API** (`createAdminPanelApi`) -- HTTP client backed by `@trapmap/client-core`'s `apiRequest`.
- **Mock API** (`createMockAdminPanelApi`) -- In-memory mock for local development and testing.

Endpoints consumed:

| Method | Path | Purpose |
|---|---|---|
| GET | `/v1/auth/session` | Load current session |
| POST | `/v1/auth/session/switch` | Switch active account |
| GET | `/api/admin/runtime-overview` | Dashboard metrics |
| GET | `/v1/knowledge/review-queue` | Pending review list (paginated, filtered by status) |
| GET | `/api/admin/reviews/:id` | Review detail with files and activity |
| POST | `/v1/knowledge/review` | Submit approve/reject/return decision |
| POST | `/api/admin/reviews/:id/json-edits` | Save manual JSON edit |
| GET | `/api/admin/activity` | Activity feed (filterable by actor, type) |
| GET | `/api/admin/artifacts` | Skill artifact list (filterable by lifecycle, scope, level, search) |
| GET | `/api/admin/artifacts/:id` | Skill artifact detail |
| GET | `/api/admin/graphs/trap` | Trap topology graph data |
| GET | `/api/admin/graphs/skill/:id` | Skill graph data (derivation or semantic mode) |

### State Management

Zustand stores with a shared `RequestState<T>` state machine (`idle` -> `loading` -> `success` / `error`):

| Store | Purpose |
|---|---|
| `useDashboardStore` | Runtime overview data |
| `useReviewQueueStore` | Review list items and filter state |
| `useReviewDetailStore` | Selected review detail |
| `useSessionStore` | Authenticated session, account switching |
| `useThemeStore` | Dark/light theme (persisted to `localStorage`) |
| `useI18nStore` | Language toggle (Chinese/English, persisted to `localStorage`) |
| `useJsonEditorStore` | JSON editor draft state and dirty tracking |

### Internationalization

Full bilingual support (Chinese `cn` and English `en`) via `useI18nStore`. All user-facing strings are routed through `t(key)`. Language preference persists across sessions via `localStorage`.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `VITE_ADMIN_PANEL_API_BASE_URL` | `window.location.origin` | Override gateway origin for API requests |
| `VITE_ADMIN_PANEL_API_MODE` | `real` | Set to `mock` for local dev with in-memory API. Production builds reject `mock`. |

## Key Dependencies

| Package | Purpose |
|---|---|
| `@trapmap/client-core` | HTTP request primitives and `SessionProvider` interface |
| `@trapmap/contracts` | Shared domain types (`KnowledgeEntry`, `ReviewQueueResponse`, `SkillArtifact`, `ReviewDecisionRequest`) |
| `@antv/g6` | Graph visualization engine for trap and skill topology |
| `@heroui/react` | UI component library (Button, Card, Modal, Dropdown, Toast, Select, Chip, etc.) |
| `framer-motion` | Page transitions and animated layout |
| `react-router-dom` | Client-side routing |
| `zustand` | Lightweight state management |
| `tailwindcss` | Utility-first CSS framework |

## Testing

```bash
rtk pnpm --filter @trapmap/web-panel test
```

Test files are co-located with their modules (`*.test.ts` / `*.test.tsx`). Current coverage includes:

- `src/app/router/router.test.tsx` -- Route configuration assertions
- `src/features/review-detail/service.test.ts` -- Review detail mapping and decision submission
- `src/services/admin-panel-service-context.test.ts` -- API context creation
- `src/services/mappers/review-item-mapper.test.ts` -- DTO-to-view-model mapping
- `src/stores/json-editor-store.test.ts` -- JSON editor store behavior
- `src/stores/review-queue-store.test.ts` -- Review queue store behavior
- `src/shared/lib/json-editor.test.ts` -- JSON formatting utilities
- `src/shared/ui/g6-graph-component.test.tsx` -- Graph component rendering
- `src/shared/ui/json-editor-panel.test.tsx` -- JSON editor panel rendering
- `src/shared/ui/localization.test.tsx` -- Localization coverage
- `src/pages/graph-page-controls.test.tsx` -- Graph page controls
- `src/pages/localization-regressions.test.ts` -- Localization regression checks
- `src/vite-config-selection.test.ts` -- Vite config alias resolution

## Shared UI Components

Reusable components exported from `src/shared/ui`:

`PageContainer`, `PageSection`, `SectionHeader`, `StatusPill`, `StatusBadge`, `SummaryCard`, `EmptyState`, `ErrorPanel`, `SkeletonBlock`, `ConfirmationDialog`, `JsonEditorPanel`, `TimelineItem`, `ReviewActionBar`, `FilterToolbar`, `G6GraphComponent`
