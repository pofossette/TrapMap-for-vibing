# Web Panel 功能补全与 UI 美化优化

## Status

- **Active mainline（2026-09-02 从 Gene 恢复）。**
- 本细则已于 2026-08-23 启动首批实现；2026-08-25 起暂停，2026-09-02 随 Experience Gene 完成 closeout（`docs/archived/archived-plans/experience-gene-program-mainline-archived.md`）后由根 `plan.md` 显式切回并恢复为 active mainline。
- 原 paused 文件 `docs/plans/web-panel-feature-and-ui-optimization-paused.md` 已 `git mv` 至本路径；后续执行顺序、owner、证据和回写记录以本文件为准。

## Product Stance

Web Panel 是保留的战略性 human-in-the-loop 产品，用于治理审核、运行观测和人工干预。不得移除、弃用或用 CLI 取代它。

## Goal

补全真实运维工作流，并现代化 Web Panel UI；所有浏览器能力继续只经 gateway 暴露，不破坏 gateway-only 架构。

## Non-Goals

- 禁止 panel 直接导入或访问 service/backend 包。
- 禁止绕过 gateway 授权、审计或 RouteDef 边界。
- 禁止照搬 ClickHouse 品牌文案；`DESIGN.md` 只是视觉语言分析参考。
- 禁止移除 mock mode；mock 继续服务本地开发和测试。
- 不做营销站改版。

## Current Baseline

- 七条管理路由已经存在：Dashboard、Review Queue、Review Detail、Artifacts、Trap Graph、Skill Graph、Activity。
- 已有中英双语 i18n（含 2026-08-26 新增 `loginTitle`/`noPermission` 等 10 项）、Zustand stores（含 `clearSession`）、real/mock API seam（含 `login`/`logout`）、G6 graph、review/JSON-edit actions。
- 第七批实现后测试规模为 23 个文件、64 tests（含 `admin-panel-service-context.test.ts` bearer 透传与 mock login/logout）。
- 剩余功能缺口包括 server-side authorization tests 与 gateway session/cookie 偏好待补；browser bearer provider 为 null、路由未保护、导航未按角色区分的缺口已在 2026-08-26 tranche 关闭。Dashboard 硬编码、return-for-correction 映射为 reject、review queue 客户端 filter/sort/pagination，以及 activity 本地过滤/无 cursor 已清理。Dashboard 的 artifact 规模统计仍受 snapshot 首页上限约束。
- 目标 dark/yellow token 已建立并替换蓝色/Geist 默认值；全站响应式细节、空态统一与真实模式仍待完成。

## Phased Plan

### Phase 0: Baseline and Design-Token Foundation

- [ ] Capture desktop and mobile screenshots of the current seven-route baseline.
- [x] Map `DESIGN.md` tokens into panel CSS variables without treating it as TrapMap brand law.
- [x] Establish dark-first styling while retaining light mode.
- [x] Define electric-yellow usage rules for primary action and key-stat emphasis only.
- [x] Replace blue/Geist defaults with Inter and JetBrains Mono.
- [x] Establish 4/6/8/12px radii, hairlines, status colors, and a 40px minimum interactive target size.

### Phase 1: Session and RBAC

- [x] Add login, logout, and session restoration (`apps/web-panel/src/pages/login/login-page.tsx`, `Apps/web-panel/src/stores/session-store.ts:clearSession`, `services/admin-panel-service-context.test.ts` mock login/logout coverage).
- [x] Replace the null browser bearer provider with token-bearing HTTP transport (`services/admin-panel-service-context.ts:browserSessionProvider` now reads `useSessionStore.getState().request.payload.token`, bearer header verified in `admin-panel-service-context.test.ts:attaches bearer token`).
- [x] Protect routes from unauthenticated access (`app/router/router.tsx:RequireAuth` + `/login` lazy route, `app/router/router-code-splitting.test.ts` updated to 8, preserves mock vs real seam).
- [x] Make navigation and actions role-aware (`app/shell/app-shell.tsx:getVisibleNavigation` filters `/reviews` to `administrator|reviewer`, `shared/ui/review-action-bar.tsx` disables for `read-only-operator` with `t('noPermission')`, `pages/review-detail/review-detail-page.tsx` passes role).
- [x] Implement meaningful account switching (mock seam already `switchSessionAccount`; real path now propagates bearer token via `SessionProvider`; desktop + mobile shell both use `getVisibleNavigation`).
- [x] Add server-side authorization tests. (`apps/web-panel/src/services/admin-panel-server-authorization.test.ts` 6 real-transport tests: unauthenticated `GET /api/admin/reviews` → 401 → `isUnauthorizedError` + `RequireAuth` redirect `/login`, unauthenticated `POST /api/admin/reviews/:id/decision` → 401 → redirect, authenticated `read-only-operator` `POST` → 403 → `noPermission` no redirect, `administrator` `GET` 200, `reviewer` `POST` 200, `isUnauthorizedError` contract; mock 403 already in `admin-panel-rbac.test.ts`; verified `pnpm --filter @trapmap/web-panel test --run` 30 files 98 tests, `typecheck`/`build` PASS; commit `test(web-panel): add server-side authorization tests`).
- [x] Prefer gateway session/cookie semantics over insecure browser token persistence when the gateway contract supports it. (conditional — `apps/web-panel/src/stores/session-store.ts:resolveSessionTransportPreference/isCookieTransportPreferred` + `apps/web-panel/src/services/admin-panel-service-context.ts:browserSessionProvider.getFetchOptions()` now prefer `credentials:'include'` + `trapmap_session` when `VITE_ADMIN_PANEL_SESSION_MODE=cookie` or `document.cookie` contains `trapmap_session`; `apps/web-panel/src/services/api/http-client.ts:createHttpClient` respects explicit `provider.getFetchOptions()` before token-presence fallback, keeping bearer with documented insecure persistence warning while gateway `SESSION_TRANSPORT=cookie`/`Set-Cookie` contract is still Bearer-only at `host-local` `auth-context.ts` + `host-distributed` `registerAuthHook`; verified `pnpm --filter @trapmap/web-panel test --run src/services/admin-panel-session-cookie-preference.test.ts` 4 tests — cookie via env includes credentials even with bearer token, bearer mode sends `Authorization` without credentials, auto-detect via `document.cookie`, opportunistic fallback; `VITE_ADMIN_PANEL_SESSION_MODE` declared in `apps/web-panel/src/vite-env.d.ts` + `docs/operations/ENVIRONMENT.md` conditional section; `pnpm --filter @trapmap/web-panel typecheck/build` PASS)

### Phase 2: Shared Admin Contracts and Real Routes

- [ ] Add shared Zod schemas in `packages/contracts`.
- [ ] Add routes through `create<X>RouteDefs(deps)` factories in the owning service packages.
- [ ] Consume those RouteDefs through both host-local Nest and host-distributed gateway surfaces.
- [ ] Cover runtime overview, review detail/activity, manual JSON edits, artifact list/detail, trap graph, and skill graph.
- [ ] Add audit coverage for governance-relevant reads where required and mutations throughout.
- [x] Propagate session tokens through `SessionProvider` (`services/admin-panel-service-context.ts:browserSessionProvider` now bearer-aware, verified by `admin-panel-service-context.test.ts:attaches bearer token`, `README.md` endpoint table updated).
- [x] Keep mock mode for development/tests, with a visible and explicit mock label in the UI.

### Phase 3: Feature Completion

- [x] Remove dashboard hardcoding and bind workload, graph, scale, incident, and preview data to real API state.
- [x] Move review-queue filtering, sorting, search, and pagination to the server; preserve distinct filtered and total counts.
- [x] Load real review files and review activity (`features/review-detail/service.ts:loadReviewDetail` consumes single `api.loadReviewDetail(reviewId) -> {entry, files, activity}` real `GET /api/admin/reviews/:id`; both real and mock return same shape, verified by `service.test.ts`).
- [x] Introduce distinct return-for-correction semantics instead of mapping that decision to reject.
- [x] Add artifact level filtering, search, and robust pagination.
- [x] Wire graph depth, search, and mode controls to actual graph requests/state.
- [x] Add activity actor/time/type filters and cursor paging.

### Phase 4: UI Polish and Responsive Behavior

- [x] Apply hairline dark cards and compact status badges within the operational panel language (`styles/index.css` dark/light `--panel-line` `1px` hairline, `rounded-panel-lg` `border-panel-line`, `shared/ui/status-badge.tsx` compact `text-[11px]` `border-panel-line`, section cards `rounded-panel-lg border-panel-line shadow-panel`).
- [x] Reserve yellow emphasis for primary actions and key stats (`--panel-accent: #faff69` only in `.panel-primary-action` and `ApiModeBadge` mock chip; `StatusBadge` stays neutral `soft`).
- [x] Standardize empty, loading, and error states (`shared/ui/empty-state.tsx` dashed `border-dashed` + localized `noDataAvailable`, `error-panel.tsx` rose `border-rose-500/30` + retry `retryRequest`, `skeleton-block.tsx` `card|line|table` variants used in `activity-page`, `artifacts-page`, `review-detail-page`).
- [x] Define mobile table/card strategies and dense-toolbar behavior (`pages/artifacts/artifacts-page.tsx` filters `grid md:grid-cols-4` collapsing, table `overflow-x-auto min-w-[640px]` scroll, `activity-page.tsx`/`review-queue-page.tsx` `FilterToolbar` wraps).
- [x] Handle graph height, zoom, touch interaction, and responsive layout safely (`shared/ui/g6-graph-component.tsx` `min-h-[450px]`, `autoResize: true`, `behaviors: ['drag-canvas','zoom-canvas','drag-element-force','click-select']`, `layout: d3-force`).
- [x] Maintain visible focus states, bilingual localization, and accessible contrast (`styles/index.css:*:focus-visible {outline: 2px solid var(--panel-accent)}`, `stores/i18n-store.ts` 10 new login keys verified in `i18n-login.test.ts` + `design-tokens.test.ts`; contrast via `panel-text`/`panel-muted` tokens).

### Phase 5: Quality and Performance

- [x] Add controller, store, mapper, RBAC, localization, and error-path tests (`stores/session-store.test.ts` store lifecycle + `clearSession`, `shared/ui/review-action-bar.test.tsx` RBAC, `shared/ui/panel-states.test.tsx` empty/error, `stores/i18n-login.test.ts` bilingual + `*:focus-visible` token, existing mapper/store coverage; suite now 27 files 77 tests).
- [x] Add route-level code splitting.
- [x] Lazy-load G6.
- [x] Audit bundle size against the pre-split baseline (main `732.38 kB gzip 233.37` + `login-page 1.88 kB gzip 0.95` + G6 preset `1,411.27 kB gzip 408.72` async; baseline `2,248.09 kB -> 710.25 kB` preserved in `Progress Log`).
- [x] Document new routes and environment behavior (`apps/web-panel/README.md` routes `/login` + `Authorization: Bearer` via `browserSessionProvider` + env `VITE_ADMIN_PANEL_API_*` table + testing table updated to 27/77).
- [ ] Capture before/after desktop/mobile screenshots as phase evidence.

## Progress Log

### 2026-08-23: foundation tranche

- 建立 Inter / JetBrains Mono、dark-first yellow accent、hairline surface、radius 与 40px control token，并为 token 回归补测试。
- Dashboard 改为一次加载 runtime、trap graph、artifact list 和 primary skill graph 的 snapshot；工作负载、事件、图谱统计与知识规模不再使用硬编码数字。
- 将 Dashboard header/service/pending/graph/scale/incident sections 拆分为独立组件，并移除模型中计算后从未渲染的 cards 数组，避免继续扩大页面级复杂度。
- Review Queue 区分 `filteredTotal`（当前筛选命中数）与后端 `total`，先修复分页下计数误导；服务端 filter/sort/pagination 仍是后续 tranche。
- 七个页面全部 route-level lazy load；App Shell 增加 skeleton Suspense boundary。G6 随 graph route chunk 延迟加载。
- 构建基线从单 JS `2,248.09 kB (gzip 666.27 kB)` 变为初始主 JS `710.25 kB (gzip 227.32 kB)` 加异步 G6 preset `1,411.49 kB (gzip 408.80 kB)`；preset 不进入首屏 script。
- 全仓 fallow dead-code 从 13 项清零：移除确认未用导出/类型与过期豁免，显式声明 CLI 直接依赖的 zod，并把有意重复的 host/server entry exports 登记到 fallow 配置。

### Deferred after this tranche

- Phase 0 的 before screenshots 尚未捕获，Phase 5 的 after screenshot review 也未完成。
- Real admin routes、browser bearer/session propagation、RBAC 和 visible mock label 未实现。
 - `/v1/knowledge/review-queue` 的 server-side query parity 目前只覆盖 host-local；host-distributed 尚无同路径 RouteDef，已登记在 gateway parity 债务中。

### 2026-08-23: correction-return tranche

- 将 `return-for-correction` 从 Web Panel 本地映射为 reject 改为共享契约中的一等决策。
- 打通 governance-review → knowledge-write → PostgreSQL owner 链路：该决策记录独立审计和历史事件，并把知识条目送回 `submitted` 修正流，不再永久锁定。
- host-local Nest gateway 与 host-distributed gateway 均支持该决策；distributed internal HTTP/RPC client 补齐 `returnReviewDecision` 方法。
- Mock API 同步使用 `submitted` 状态；Web Panel 抽取 decision helper 并用测试锁住“不改写决策、拒绝/退回必须填写理由”的行为。

### 2026-08-23: review-queue server-query tranche

- 共享契约扩展 search/source/riskLevel/sort，响应区分授权队列 `total`、筛选后 `filteredTotal` 与 `nextCursor`。
- 在 governance-review domain 新增纯查询规则：agent-risk scoring、search、source/risk 过滤、四种排序和 offset cursor；owner projection 在权限过滤后应用同一套规则。
- Host-local gateway 使用共享 schema 接收查询参数，Panel transport 发送完整筛选与分页参数，客户端不再二次过滤或排序。
- Review Queue store 维护 cursor 分页并在筛选变化时重置；页面提供上一页/下一页控制。Mock seam 同步实现服务端语义并扩充多状态 fixture。
- 当前构建首屏主 JS 为 `712.07 kB (gzip 227.77 kB)`；共享评分逻辑保留在 Panel mapper 内，避免为一个小函数引入 contracts runtime barrel。

### 2026-08-23: activity-query and mock-signal tranche

- Activity seam 新增 actor、type、search、起止时间过滤与 offset cursor；响应区分 `filteredTotal`、授权总量 `total` 和 `nextCursor`。
- Activity 页面移除本地二次过滤，改为服务端式查询状态；工具栏支持操作员、类型、日期范围、搜索，并提供上一页/下一页。
- Mock mode 同步实现查询语义并补充 system-ingestion fixture；`getAdminPanelApiMode()` 驱动桌面/移动端常显黄色 “Mock 数据” 标识。
- Mock 模式桌面/移动截图确认侧边栏和 header 都能显式识别 “Mock 数据”；真实模式冒烟与 `/api/admin/activity` 生产 RouteDef 仍待补。

### 2026-08-23: artifact-query tranche

- Artifact seam 新增 lifecycle、scope、requiredLevel 和 search 组合过滤，按更新时间与 ID 确定性排序，并使用 offset cursor 分页；响应区分筛选命中 `filteredTotal` 与授权总量 `total`。
- Real transport 序列化完整查询参数，页面移除全量加载假设，增加需求级别筛选、结果计数和上一页/下一页控制；筛选变化时重置 cursor。
- Dashboard snapshot 显式请求最多 100 个工件，并优先选择带推导结果的工件作为 Skill Graph 预览，避免分页排序变化让空推导 fixture 抢占预览位。
- 当前构建首屏主 JS 为 `730.14 kB (gzip 232.61 kB)`；异步 G6 preset 保持 `1,411.49 kB (gzip 408.80 kB)` 且不进入首屏 script。

### Current compromises

- 已在 2026-08-26 关闭 bearer null / 路由未保护 / 导航未按角色区分；已在 2026-08-31 关闭 server-side authorization tests（真实传输 401/403 + `RequireAuth` 重定向覆盖，`apps/web-panel/src/services/admin-panel-server-authorization.test.ts` 6 tests）；已在 2026-08-31 通过 P4B 条件偏好关闭 gateway session/cookie 偏好（`VITE_ADMIN_PANEL_SESSION_MODE=cookie` 或 `document.cookie:trapmap_session` 时 `credentials:'include'` 优先，参见 `session-store.ts:resolveSessionTransportPreference` + `admin-panel-service-context.ts:browserSessionProvider.getFetchOptions` + `http-client.ts:createHttpClient` 显式偏好分支，`admin-panel-session-cookie-preference.test.ts` 4 tests，`SESSION_TRANSPORT=cookie` 仍为预留 — 当前 `host-local` `auth-context` 与 `host-distributed` `registerAuthHook` 仍仅 Bearer）；剩余 `Phase 2` 生产 `/api/admin/*` RouteDef 待 Gene closeout 后继续。
- Dashboard 的 capsule 计数来自 snapshot 首页最多 100 个工件，超过该规模的精确聚合需要专用 admin aggregate endpoint。

### 2026-08-23: graph-controls tranche

- 将 Trap Graph 的邻域深度从展示控件接入实际视图状态：以选中节点为根计算无向 1-hop、2-hop 或完整连通分量，并只保留可见节点诱导的边；层级过滤先于邻域遍历执行。
- Skill Graph 的 derivation/semantic 模式请求补齐回归测试；节点搜索关键字继续作为 G6 高亮输入。Artifact picker 显式请求最多 100 个工件，避免正确分页后的 Artifacts API 默认首页让选择器意外截断。
- 新增纯 `trap-graph-view` helper 与 7 个测试，覆盖层级过滤、1/2 hop、连通分量、诱导边、无选中根的全量回退、隐藏根识别和深度窄化。
- 当选中根被层级过滤隐藏时，页面显式清空 selection 并回到无根全量过滤态；深度选项经窄化 parser 归一化，避免未知值绕过类型约束。
- 当前构建首屏主 JS 保持 `730.14 kB (gzip 232.62 kB)`；异步 G6 preset 保持 `1,411.49 kB (gzip 408.80 kB)` 且不进入首屏 script。

### Graph compromises

- Artifact picker 的 100-item snapshot 是当前 UI 上限；超过该规模的完整选择、搜索和分页需要专用 admin artifact-summary query 或 picker 分页流程。

### 2026-08-26: session and RBAC tranche (user-authorized, off mainline)

- 修复 `services/admin-panel-service-context.ts:browserSessionProvider` 从 `null` 改为 `useSessionStore.getState().request.payload.token` 的 token-bearing transport；`shared/enum-types/api.ts` 新增 `login`/`logout`，`services/api/admin-panel-api.ts` 实现 `POST /v1/auth/login|logout`，`services/api/mock-admin-panel-api.ts` 校验 16 位阈值并切换 `activeAccountId`/`authenticated`。
- 新增 `pages/login/login-page.tsx`（`loginTitle`/`accessKeyPlaceholder`/`authRequired` 等 10 项双语），`app/router/router.tsx` 新增 `/login` lazy 路由与 `RequireAuth` 守卫（`authenticated===false -> /login`），桌面/移动端共享同一守卫；`app/router/router-code-splitting.test.ts` 更新为 8 个 lazy `pages/` 导入。
- 导航与操作按角色区分：`app/shell/app-shell.tsx:getVisibleNavigation` 限制 `read-only-operator` 不可见 `/reviews`，`shared/ui/review-action-bar.tsx` 对 `read-only-operator` 全量禁用并显示 `t('noPermission')`，`pages/review-detail/review-detail-page.tsx` 传入 `role`；`stores/session-store.ts` 新增 `clearSession`，`app/shell` 的 `logout` 走 `POST /v1/auth/logout` best-effort 后本地清理并 `navigate('/login')`。
- i18n 新增 10 项 login/noPermission，`admin-panel-service-context.test.ts` 新增 bearer 透传与 mock login/logout 回归；当前构建主 JS `732.38 kB (gzip 233.37 kB)` + login chunk `1.88 kB (gzip 0.95 kB)`，`pnpm --filter @trapmap/web-panel test` 23 files 64 tests、`typecheck`、`build`、`pnpm typecheck`、`check:docs`/`check:structure` 均通过，`fallow audit --base HEAD` 13 changed files 无新增问题。
- 仍保留：gateway session/cookie 偏好、`Phase 2` 的真实 `contracts` RouteDefs 与 `Phase 4/5` 的 UI polish/screenshot 证据（按 paused successor 约束，不在本 tranche 内宣告 closeout；server-side authorization tests 已于 2026-08-31 通过 `admin-panel-server-authorization.test.ts` 关闭）。

### 2026-08-31: gateway session/cookie preference tranche (P4B off mainline)

- 新增 `apps/web-panel/src/stores/session-store.ts:resolveSessionTransportPreference/isCookieTransportPreferred`（`VITE_ADMIN_PANEL_SESSION_MODE=cookie|bearer` 显式或 `document.cookie` 含 `trapmap_session` 时判 `cookie`，否则 `bearer`，并文档化 bearer 持久化相对 `httpOnly` 的不安全警告）；`apps/web-panel/src/services/admin-panel-service-context.ts:browserSessionProvider.getFetchOptions/isGatewayCookieModePreferred` 在 cookie 偏好时始终返回 `{credentials:'include'}`（即使 store 仍有 bearer token 也优先 cookie），bearer 回退时仅无 token / 有 cookie 时 `include`；`apps/web-panel/src/services/api/http-client.ts:createHttpClient` 的 `wrappedProvider.getFetchOptions()` 优先尊重 `provider.getFetchOptions()` 显式偏好再回退到 token-presence 启发，保持并发隔离且不全局 patch。
- 新增 `apps/web-panel/src/services/admin-panel-session-cookie-preference.test.ts` 4 个测试：env `cookie` 时即使有 bearer 也 `credentials:include`；env `bearer` 时有 token 则 `Authorization: Bearer` 且无 `credentials`；无 env 但 `document.cookie` 含 `trapmap_session` 时自动切 cookie 且 `getSessionToken` 回退解码；无 token 无 cookie 时 opportunistic `include`；验证 `isCookieTransportPreferred/resolveSessionTransportPreference/isGatewayCookieModePreferred`。
- `apps/web-panel/src/vite-env.d.ts` 新增 `VITE_ADMIN_PANEL_SESSION_MODE` 类型，`docs/operations/ENVIRONMENT.md` 新增 conditional `Gateway session / cookie 偏好（P4B）` 小节说明 `SESSION_TRANSPORT` 与 `VITE_ADMIN_PANEL_SESSION_MODE` 需两端同时切 `cookie` 才形成 `httpOnly` 闭环；当前 `host-local` `auth-context.ts` + `host-distributed` `registerAuthHook` 仍仅 Bearer，故为条件偏好。
- 当前取证：`pnpm --filter @trapmap/web-panel test --run` 31 files 102 tests、`pnpm --filter @trapmap/web-panel typecheck` 0、`pnpm --filter @trapmap/web-panel build` 3659 modules（首屏与 G6 保持 P4A 基线）；`pnpm typecheck` 0；`docs/plans/web-panel-feature-and-ui-optimization-paused.md` Phase1 `Prefer gateway session/cookie` 勾选为条件完成；commit `feat(web-panel): prefer gateway cookie session when available`。
- 仍保留：`Phase 2` 生产 `/api/admin/*` RouteDef 与截图证据。

### 2026-08-31: server-side authorization tranche (P4A off mainline)

- 新增 `services/admin-panel-server-authorization.test.ts` 6 个真实传输授权测试：`GET /api/admin/reviews` 401 → `isUnauthorizedError` 真且 `withAuthRedirect` 经 `queueMicrotask` 清理 `useSessionStore` 并经 `window.__trapmapNavigate` 重定向 `/login`（`RequireAuth` 的 `isUnauthorizedSession` 覆盖 `error` 与 `authenticated:false` 分支）；`POST /api/admin/reviews/:id/decision` 401 同路径；`read-only-operator` `POST` 403 → `isUnauthorizedError` 假、无重定向、`isUnauthorizedSession` 仍 `false` 对应 `noPermission` 禁用（服务端强制）；`administrator` `GET` 与 `reviewer` `POST` 200 成功且附 `Bearer` 头校验。
- 复用 `services/admin-panel-rbac.test.ts` 的 mock 侧 403/401 已覆盖；新用例补足真实 `apiRequest` → `ApiError(401/403)` → `isUnauthorizedError` → `RequireAuth` 的 gateway 侧链路，证明授权不止于客户端守卫。
- 当前取证：`pnpm --filter @trapmap/web-panel test --run` 30 files 98 tests、`pnpm --filter @trapmap/web-panel typecheck` 0、`pnpm --filter @trapmap/web-panel build` 3659 modules（首屏 `732.38 kB gzip 233.37` + `login 1.88 kB gzip 0.95` + G6 `1,411.27 kB gzip 408.72` async）、`pnpm typecheck` 0；`docs/plans/web-panel-feature-and-ui-optimization-paused.md` Phase1 `Add server-side authorization tests` 勾选并回写 `Current compromises` 移除该项；commit `test(web-panel): add server-side authorization tests`。
- 仍保留：gateway session/cookie 偏好（`browserSessionProvider` 已支持 `trapmap_session` cookie 回退与 `credentials:include` 隔离，参见 `http-client.ts:10-24` P3A 修复）、`Phase 2` RouteDefs 与截图证据。

## Acceptance Gates

### Pause Gates

- Experience Gene 主线已完成代码/契约、聚焦测试、事实源回写和文档守卫验证。
- 根 `plan.md` 已显式把 active mainline 切回本主题。
- 本文件已迁回 `docs/todos/`，或已基于其最新状态创建新的 active 细则。

- `pnpm --filter @trapmap/web-panel test --run`
- `pnpm --filter @trapmap/web-panel typecheck`
- `pnpm --filter @trapmap/web-panel build`
- `pnpm typecheck`
- Documentation changes require `pnpm check:docs` and `pnpm check:structure`.
- Gateway/API surface changes additionally require `pnpm test:deployment-smoke`.
- Cross-package/boundary changes additionally require `pnpm exec fallow audit --base main`.
- Complete manual mock-mode and real-mode smoke checks plus desktop/mobile screenshot review before closing implementation work.

## Commit Policy

Implementation commits go to `pre` with clear conventional subjects. Never merge or rebase `main`.
