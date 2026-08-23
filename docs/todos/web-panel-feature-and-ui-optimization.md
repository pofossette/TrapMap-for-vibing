# Web Panel 功能补全与 UI 美化优化

## Status

- **Active mainline（2026-08-23 启动）。**
- Owner 已选择本细则并授权开始实现；当前处于 Phase 0 / 2 / 3 / 5 定向切片交叉推进状态，尚未满足 closeout 条件。

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
- 已有中英双语 i18n、Zustand stores、real/mock API seam、G6 graph、review/JSON-edit actions。
- 第三批实现后测试规模为 20 个文件、42 tests。
- 剩余功能缺口包括 auth/RBAC 缺失和 browser bearer provider 为 null。Dashboard 硬编码、图谱/规模预览失真、return-for-correction 映射为 reject，以及 review queue 的客户端 filter/sort/pagination 已清理。
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

- [ ] Add login, logout, and session restoration.
- [ ] Replace the null browser bearer provider with token-bearing HTTP transport.
- [ ] Protect routes from unauthenticated access.
- [ ] Make navigation and actions role-aware.
- [ ] Implement meaningful account switching.
- [ ] Add server-side authorization tests.
- [ ] Prefer gateway session/cookie semantics over insecure browser token persistence when the gateway contract supports it.

### Phase 2: Shared Admin Contracts and Real Routes

- [ ] Add shared Zod schemas in `packages/contracts`.
- [ ] Add routes through `create<X>RouteDefs(deps)` factories in the owning service packages.
- [ ] Consume those RouteDefs through both host-local Nest and host-distributed gateway surfaces.
- [ ] Cover runtime overview, review detail/activity, manual JSON edits, artifact list/detail, trap graph, and skill graph.
- [ ] Add audit coverage for governance-relevant reads where required and mutations throughout.
- [ ] Propagate session tokens through `SessionProvider`.
- [ ] Keep mock mode for development/tests, with a visible and explicit mock label in the UI.

### Phase 3: Feature Completion

- [x] Remove dashboard hardcoding and bind workload, graph, scale, incident, and preview data to real API state.
- [x] Move review-queue filtering, sorting, search, and pagination to the server; preserve distinct filtered and total counts.
- [ ] Load real review files and review activity.
- [x] Introduce distinct return-for-correction semantics instead of mapping that decision to reject.
- [ ] Add artifact level filtering, search, and robust pagination.
- [ ] Wire graph depth, search, and mode controls to actual graph requests/state.
- [ ] Add activity actor/time/type filters and cursor paging.

### Phase 4: UI Polish and Responsive Behavior

- [ ] Apply hairline dark cards and compact status badges within the operational panel language.
- [ ] Reserve yellow emphasis for primary actions and key stats.
- [ ] Standardize empty, loading, and error states.
- [ ] Define mobile table/card strategies and dense-toolbar behavior.
- [ ] Handle graph height, zoom, touch interaction, and responsive layout safely.
- [ ] Maintain visible focus states, bilingual localization, and accessible contrast.

### Phase 5: Quality and Performance

- [ ] Add controller, store, mapper, RBAC, localization, and error-path tests.
- [x] Add route-level code splitting.
- [x] Lazy-load G6.
- [x] Audit bundle size against the pre-split baseline.
- [ ] Document new routes and environment behavior.
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

## Acceptance Gates

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
