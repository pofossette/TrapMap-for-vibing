# Web Panel 功能补全与 UI 美化优化

## Status

- **Planned / owner-authorized backlog（2026-08-23）。**
- 本文件是下一候选细则，不是 active mainline；只有在 owner 选择并启动某个 phase 后才开始实现。

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
- 现有测试规模为 13 个文件、30 tests。
- 已知功能缺口包括 dashboard 数据硬编码、review queue 客户端过滤、auth/RBAC 缺失、browser bearer provider 为 null、缺少 server pagination/filtering，以及 return-for-correction 被映射为 reject。
- 当前视觉方向仍是蓝色/Geist 风格，尚未形成目标 dark/yellow 运维面板体系。

## Phased Plan

### Phase 0: Baseline and Design-Token Foundation

- [ ] Capture desktop and mobile screenshots of the current seven-route baseline.
- [ ] Map `DESIGN.md` tokens into panel CSS variables without treating it as TrapMap brand law.
- [ ] Establish dark-first styling while retaining light mode.
- [ ] Define electric-yellow usage rules for primary action and key-stat emphasis only.
- [ ] Replace blue/Geist defaults with Inter and JetBrains Mono.
- [ ] Establish 4/6/8/12px radii, hairlines, status colors, and a 40px minimum interactive target size.

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

- [ ] Remove dashboard hardcoding and bind workload, graph, scale, incident, and preview data to real API state.
- [ ] Move review-queue filtering, sorting, search, and pagination to the server; preserve distinct filtered and total counts.
- [ ] Load real review files and review activity.
- [ ] Introduce distinct return-for-correction semantics instead of mapping that decision to reject.
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
- [ ] Add route-level code splitting.
- [ ] Lazy-load G6.
- [ ] Audit bundle size against the pre-split baseline.
- [ ] Document new routes and environment behavior.
- [ ] Capture before/after desktop/mobile screenshots as phase evidence.

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
