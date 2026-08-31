
# @trapmap/web-panel

Browser-based admin panel for TrapMap runtime operations, governance review workflows, and knowledge graph inspection.

## Purpose

`@trapmap/web-panel` is the operational console for TrapMap administrators and reviewers. It provides a browser UI for monitoring service health, reviewing and approving intercepted knowledge entries, inspecting skill artifacts and their derivation outputs, and navigating trap and skill topology graphs. Manual interventions (JSON edits, review decisions) are recorded in an audit trail.

## Scripts

```bash
pnpm --filter @trapmap/web-panel dev        # Start Vite dev server
pnpm --filter @trapmap/web-panel build       # Typecheck + production build
pnpm --filter @trapmap/web-panel preview     # Preview production build
pnpm --filter @trapmap/web-panel test        # Run vitest suite
pnpm --filter @trapmap/web-panel test:e2e    # Run Playwright e2e suite
pnpm --filter @trapmap/web-panel test:e2e:ui # Playwright UI mode
pnpm --filter @trapmap/web-panel typecheck   # TypeScript type checking only
```

## Routes

| Path | Page | Description |
|---|---|---|
| `/login` | Login | Access-key authentication; redirects authenticated sessions to `/` and unauthenticated `/` to `/login` via `RequireAuth` |
| `/` | Dashboard | Runtime overview: service health, workload metrics, graph previews, active incidents |
| `/reviews` | Review Queue | Filterable/sortable governance review queue with risk scoring (hidden for `read-only-operator`) |
| `/reviews/:id` | Review Detail | Full review workspace: metadata, validation reports, JSON editor, approve/reject/return actions (disabled for `read-only-operator`) |
| `/artifacts` | Artifacts | Skill artifact browser with lifecycle, scope, and level filters; detail drawer with derivation output; mobile table scrolls horizontally (`min-w-[640px]`) |
| `/trap-graph` | Trap Graph | Interactive topology visualization of traps, cues, tools, environments, and mitigations; `drag-canvas`/`zoom-canvas`, `autoResize`, `min-h-[450px]` responsive container |
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

Endpoints consumed (via token-bearing `browserSessionProvider` reading `useSessionStore`):

| Method | Path | Purpose |
|---|---|---|
| POST | `/v1/auth/login` | Authenticate with `accessKey` (`>=16` chars); mock validates length, real proxies to gateway and reloads `/v1/auth/session` |
| POST | `/v1/auth/logout` | Invalidate session (best-effort, always clears local `clearSession` and navigates to `/login`) |
| GET | `/v1/auth/session` | Load current session (used for restoration and `RequireAuth` guard) |
| POST | `/v1/auth/session/switch` | Switch active account (role-aware navigation via `getVisibleNavigation`) |
| GET | `/api/admin/runtime-overview` | Dashboard metrics |
| GET | `/v1/knowledge/review-queue` | Pending review list with server-side status/search/source/risk filters, sorting, and cursor paging |
| GET | `/api/admin/reviews/:id` | Review detail with files and activity (both `files` and `activity` come from this single real response) |
| POST | `/v1/knowledge/review` | Submit approve/reject/return decision (disabled for `read-only-operator` with `noPermission`) |
| POST | `/api/admin/reviews/:id/json-edits` | Save manual JSON edit |
| GET | `/api/admin/activity` | Activity feed (filterable by actor, type, time, search; cursor-paginated) |
| GET | `/api/admin/artifacts` | Skill artifact list (filterable by lifecycle, scope, level, search) |
| GET | `/api/admin/artifacts/:id` | Skill artifact detail |
| GET | `/api/admin/graphs/trap` | Trap topology graph data (`drag-canvas`/`zoom-canvas`, `min-h-[450px]`) |
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
pnpm --filter @trapmap/web-panel test
```

Test files are co-located with their modules (`*.test.ts` / `*.test.tsx`). Current suite is 27 files / 77 tests and includes:

- `src/app/router/router.test.tsx` + `router-code-splitting.test.ts` -- 8 lazy pages + Suspense boundary
- `src/features/review-detail/service.test.ts` -- Review detail mapping and decision submission (`files` + `activity` from `loadReviewDetail`)
- `src/services/admin-panel-service-context.test.ts` -- `mock` vs `real` mode, bearer `Authorization` header from `useSessionStore`, mock `login` (16-char) / `logout`
- `src/stores/session-store.test.ts` -- `idle -> loading -> success -> error -> clearSession`, `switchError` isolation
- `src/shared/ui/review-action-bar.test.tsx` -- RBAC `read-only-operator` disables all + `noPermission`, `rationaleRequiredWarning` gates `reject`/`return`
- `src/shared/ui/panel-states.test.tsx` -- `EmptyState` hairline `border-dashed` + `border-panel-line`, `ErrorPanel` retry
- `src/stores/i18n-login.test.ts` -- `loginTitle`/`noPermission` bilingual + `*:focus-visible` token presence
- `src/services/mappers/review-item-mapper.test.ts` -- DTO-to-view-model mapping
- `src/stores/json-editor-store.test.ts` -- JSON editor store behavior
- `src/stores/review-queue-store.test.ts` -- Review queue store behavior
- `src/shared/lib/json-editor.test.ts` -- JSON formatting utilities
- `src/shared/ui/g6-graph-component.test.tsx` -- Graph component rendering
- `src/shared/ui/json-editor-panel.test.tsx` -- JSON editor panel rendering
- `src/shared/ui/localization.test.tsx` -- Localization coverage
- `src/pages/graph-page-controls.test.tsx` -- Graph page controls + `trap-graph-view` depth/search helpers
- `src/pages/localization-regressions.test.ts` -- Localization regression checks
- `src/styles/design-tokens.test.ts` -- Dark-first `Inter`/`JetBrains Mono`, `--panel-accent: #faff69`, radii, `40px` control, `*:focus-visible` outline
- `src/vite-config-selection.test.ts` -- Vite config alias resolution

Current production bundle (2026-08-26 tranche): main `732.38 kB (gzip 233.37)` + `login-page 1.88 kB` + G6 preset `1,411.27 kB (gzip 408.72)`; preset is async and not in first-screen script.

## E2E Tests

Playwright e2e scaffold lives in `apps/web-panel/e2e` with `playwright.config.ts` (`testDir: ./e2e`, `baseURL: http://127.0.0.1:4173`, `webServer: pnpm --filter @trapmap/web-panel preview`, `projects: chromium + mobile-chrome`, `expect.timeout 10s`).

```bash
pnpm exec playwright install --with-deps chromium
pnpm --filter @trapmap/web-panel build
pnpm --filter @trapmap/web-panel test:e2e
pnpm --filter @trapmap/web-panel test:e2e:ui      # UI mode
pnpm --filter @trapmap/web-panel test:e2e:headed   # headed
pnpm --filter @trapmap/web-panel test:e2e:debug    # debug
```

All commands are `pnpm`-only; use `pnpm exec` for Playwright.

### Fixtures and helpers

- `e2e/helpers/fixtures.ts` extends Playwright `test` with `mockApi: MockApi`, `vCursor: VCursor`, `authenticatedPage`, plus page-object fixtures (`loginPage`, `appShell`, `reviewQueuePage`, etc.) and `gotoWithRole(page, mockApi, role)`. Each test gets isolated `page`/`mockApi`/`vCursor` (high-parallel). Import via `import { test, expect } from '../helpers/fixtures.js';` and add header `// run with pnpm --filter @trapmap/web-panel test:e2e`.
- `e2e/helpers/mock-api.ts` provides `MockApi(page)` with `page.route` interception for `/v1/auth/session`, `/v1/auth/login`, `/api/admin/**`, `/v1/knowledge/review-queue*`, `/api/admin/graph/**` using static fixtures (4 preset sessions `administrator`/`reviewer`/`read-only-operator`/`unauthenticated`, review queue, runtime, artifacts, trap/skill graphs, activity). Use `await mockApi.mockAllAuthenticated('administrator')` or `await mockApi.mockUnauthorized()` plus `await mockApi.clearMocks()`.
- `e2e/page-objects/**` (`LoginPage`, `AppShell`, `ReviewQueuePage`, `ArtifactPage`, `DashboardPage`, `TrapGraphPage`, `SkillGraphPage`, `ActivityPage`) each accept `(page, vCursor)` and use `vCursor` for clicks.

### v-cursor usage

`VCursor` (`e2e/helpers/v-cursor.ts`) renders a virtual cursor (`[data-v-cursor]`, `#faff69`, `20px`, optional trail/ripple) and animates `moveTo`/`click`/`hover`/`dragTo`/`typeWithCursor`:

```ts
import { test, expect } from '../helpers/fixtures.js';
test('example', async ({ page, mockApi, vCursor }) => {
  await mockApi.mockAllAuthenticated('administrator');
  await page.goto('/');
  const shell = new AppShell(page, vCursor);
  await vCursor.click(shell.reviewsLink);
  await expect(page).toHaveURL(/\/reviews/);
  await vCursor.hover(shell.trapGraphLink);
  await vCursor.dragTo(shell.dashboardLink, shell.activityLink);
});
```

Every spec must use `vCursor` for at least one click (`vCursor.click(locator)`). `vCursor.init()` is auto-called by the fixture; `moveTo` handles `boundingBox` + `scrollIntoViewIfNeeded` + center offset.

### Example specs

`e2e/specs/` contains 4 example specs (12 tests):

- `login.spec.ts` — unauthenticated redirect, valid login via `vCursor`, invalid key error, logout
- `navigation.spec.ts` — authenticated navigation to 7 routes via `vCursor`, back/forward, 404 redirect
- `rbac.spec.ts` — `administrator`/`reviewer` see `/reviews`, `read-only-operator` hidden and `ReviewActionBar` disabled
- `review-queue.spec.ts` — queue load/filter/sort via `vCursor`, click review item, `vCursor` hover/drag on trap graph

Run with `pnpm --filter @trapmap/web-panel test:e2e` to validate scaffold and `v-cursor`.

## Shared UI Components

Reusable components exported from `src/shared/ui`:

`PageContainer`, `PageSection`, `SectionHeader`, `StatusPill`, `StatusBadge`, `SummaryCard`, `EmptyState`, `ErrorPanel`, `SkeletonBlock`, `ConfirmationDialog`, `JsonEditorPanel`, `TimelineItem`, `ReviewActionBar`, `FilterToolbar`, `G6GraphComponent`

## 维护约定（Wave 8）

`@trapmap/web-panel` 是保留并持续维护的包，但按以下约定收敛维护面（本约定只描述规则，不修改源码）：

- **Feature surface 基线**：现有 Routes 表中的页面与功能是当前基线。Experience Gene 主线 closeout 前，新增页面、路由或功能必须先获得明确 owner 决策并切换主线；恢复实现时遵循 [`docs/plans/web-panel-feature-and-ui-optimization-paused.md`](../../docs/plans/web-panel-feature-and-ui-optimization-paused.md)，不得为了演示或实验随意扩面。
- **依赖边界**：panel 只消费 `@trapmap/client-core`（API 传输）与 `@trapmap/contracts`（共享类型/契约）；禁止引入 `@trapmap/backend-core`、`@trapmap/lib`、`@trapmap/service-*` 等后端包。后端数据一律经 gateway API + `createAdminPanelApi` 获取。
- **第三方依赖**：现有依赖（react/react-dom、react-router-dom、zustand、framer-motion、@heroui/react + styles、@antv/g6、tailwindcss 等）为冻结基线；新增任何第三方依赖必须在 PR 中给出文档化理由（用途、替代方案评估、体积/维护成本），并回写本 README 的依赖清单。
- **测试保留**：vitest 配置与 co-located 测试（`*.test.ts(x)`）是强制保留的维护资产，新增/修改页面逻辑时必须同步补充测试；`pnpm --filter @trapmap/web-panel test` 必须保持通过。
- **文档同步**：Routes 表、目录布局、依赖清单变更时必须同步更新本 README。
