# 长期工程债务与平台成熟度登记

> **角色：** 受根 [`../../plan.md`](../../plan.md) 管理的长期问题登记册。
> **状态：** `deferred`；不构成第二条 active mainline。
> **2026-08-22 平台化主线 closeout：** 已关闭条目已物理移除（历史见 docs/archived/archived-plans/debt-mcp-platformization-mainline-archived.md 与 git history）；本册为净收缩后的仍开放集。

## 使用规则

- 每项记录必须包含来源、影响、当前边界、进入条件和后续落点。
- 任一项满足进入条件时，创建新的 active detail 并由根 `plan.md` 显式链接。

## 长期问题池

### Dead Code and Architecture Order Cleanup closeout 延后（2026-08-22 补登记）

- 来源：主线实现已于 2026-08-16 提交，但 Task 11-13 的正式 closeout、debt-register 回写核对与归档仍未完成；挂起的历史实现细节保留在 [`dead-code-and-architecture-order-cleanup.md`](dead-code-and-architecture-order-cleanup.md)。
- 影响：实现事实与主线档案状态不一致，读者可能把挂起的历史 checklist 误认作仍开放的主线；closeout 证据也没有统一归档。
- 当前边界：这是文档与 closeout 债务，不是重新实施信号；不得把该文件恢复为第二条 active mainline。
- 进入条件：owner 启动专门的 closeout tranche 并确认无需补充实现工作。
- 后续落点：完成 Task 11-13，核对本册条目后用 `git mv` 归档细则，并同步根计划、todo 与归档索引。

### web-panel real admin 路径不可运行（刷新于 2026-08-22）

- 来源/影响/边界：同原登记（5 个 `/api/admin/*` 无后端实现，mock 模式可用）。`apps/web-panel` 本身仍是战略性 human-in-the-loop 产品和治理人工审核保障，必须保留；本条债务仅限于其管理动作尚未接入生产化后端。
- 2026-08-23 刷新：面板侧已完成 design-token、Dashboard snapshot 绑定、队列 filtered/total 计数区分和 route-level splitting 第一批工作；这不改变 real admin 路由缺失、bearer provider 为 null 或 RBAC 缺失的债务状态。
- 2026-08-23 追加：治理审核的 `return-for-correction` 已接入 contracts、governance/knowledge owner 和双宿主网关；Web Panel 不再把它伪装成 reject。real admin surface 与 RBAC 债务继续保留。
- 2026-08-23 追加：Activity 的 actor/type/time/search/cursor 查询已在 mock seam 与页面完成，UI 常显 mock 标识；这不改变 `/api/admin/activity` 生产 RouteDef 缺失或 bearer/RBAC 债务。
- 2026-08-23 追加：Artifacts 的 level/search/lifecycle/scope 过滤、确定性排序和 cursor 分页已在 mock seam 与页面完成；这不改变 `/api/admin/artifacts` 生产 RouteDef 缺失或 bearer/RBAC 债务。
- 2026-08-23 追加：Trap/Skill 图谱的深度、搜索和模式状态已完成接线；Skill 工件选择器仍受最多 100 个 snapshot 工件约束，且不改变生产 admin graph/artifact RouteDef 缺失或 bearer/RBAC 债务。
- 2026-08-26 追加（user-authorized tranche）：`browserSessionProvider` 已改为 token-bearing（`useSessionStore`），新增 `/login` 守卫与 `read-only-operator` 导航/操作区分，mock `login`/`logout` 与 bearer 透传已补回归；这不改变 `/api/admin/*` 生产 RouteDef 缺失与 server-side authorization tests 债务。
- 进入条件：需要真实管理控制台时。
- 后续落点：Gene 主线 closeout 后恢复 [`../plans/web-panel-feature-and-ui-optimization-paused.md`](../plans/web-panel-feature-and-ui-optimization-paused.md) 的 phased path 实现；实现必须继续使用 RouteDef 工厂补 owner service 路由，并回填 SessionProvider token。

### eval:smoke CI 完整补跑（环境门控，刷新于 2026-08-22）

- 来源：本机无 docker daemon；A4 端到端、A15 镜像重建与 compose replicas 演示均需 docker/kind。
- 2026-08-22 增补：Skill Lookup 主线的 retrieval 单测已绿；完整 `pnpm eval:smoke` 继续受同一环境门控约束。
- 进入条件：CI 或具备 docker 的本地环境。
- 后续落点：CI 跑 `pnpm eval:smoke` 全量 + `docker compose build candidate-worker outbox-worker` + replicas 演示，结果回填本条并关闭。

### 安全候选 CI advisory 补跑（2026-08-22 新拆）

- 来源：A13 reachability 人工矩阵 reachable=0（见 docs/archived/reports/SECURITY_CANDIDATES_2026-08-22.md）；pnpm audit 因离线未执行。
- 进入条件：联网 CI 环境。
- 后续落点：CI 执行 audit 并回填矩阵行。

### 平台化 L3 运营验证批（C6-C8 残余，2026-08-22 新立）

- 已交付：k8s/base manifests（未经集群验证）、TRAPMAP_TASK_TRANSPORT=amqp 特性开关（pg 默认不变）、job-runtime TRAPMAP_JOB_RUNTIME_DATABASE_URL 回退试点。
- 待办（需 kind/docker/双库环境）：kind 冒烟断言 pod Ready+/readyz 200；amqp live smoke；job-runtime 双库双跑等价验证与回滚演练。
- 进入条件：具备 k8s(kind)/docker 环境。
- 后续落点：逐项验证后更新 DEPLOYMENT.md/SERVICE-DISCOVERY.md 成熟度表述至 Level 3 达成口径。

### route-surface adoption-time inventory drift（2026-08-22 新立）

- 来源：`scripts/check-route-surface.ts` 首次接入时发现 api-surface 保留已退役 server 包路由、部分真实 gateway RouteDef 未列入 canonical API 表，以及 ARTIFACTS 图表中的历史 operations/artifacts 路径。完整路径清单冻结在 `SURFACE_INVENTORY_DRIFT`。
- 影响：守卫可阻断新增漂移，但已知旧差异在清账前不会失败；文档读者仍可能看到未实现的旧外部端点。
- 当前边界：例外只允许既有清单；新增 documented-not-real 或 real-not-documented 会立即被 `check:docs` 阻断。`/v2/retrieval/search` 继续单独豁免。
- 进入条件：清理 api-surface / ARTIFACTS 与两宿主 RouteDef 的历史面，或启动宿主网关 parity tranche。
- 后续落点：按服务族拆分“route surface inventory reconciliation”，先修正文档，再决定缺失端点是实现还是移出公开契约。

### gateway surface parity gaps：v2 capsule、knowledge review queue 与 host-local v3（2026-08-22 新立）

- 来源：Skill Lookup closeout 勘察确认 `/v2/retrieval/search` 在两宿主均缺 RouteDef，CLI `--v2` 会 404；`/v3/retrieval/search` 只在 host-distributed 注册，host-local 的 CLI `load` 会 404。两项原实现均随旧 server 包退役或未做宿主 parity。
- 2026-08-23 补充：`GET /v1/knowledge/review-queue` 目前只有 host-local RouteDef；host-distributed 缺少同路径 parity，因此 Web Panel 的新 server-side queue query 不适用于 heavy 形态。
- 影响：CLI 的对应调用路径在指定后端形态下不可用；api-surface 对 v2 的承诺仍超出真实网关面。
- 当前边界：不阻塞 v1 检索和新的 artifact-first skill lookup；D 守卫将 `/v2/retrieval/search` 显式豁免，其余新增漂移会被阻断。
- 进入条件：CLI `--v2` 或 capsule retrieval 产品需求启动时处理 v2；host-local/v3 parity 纳入下一个 gateway surface reconciliation tranche。
- 后续落点：优先决定“实现 endpoint”还是“收缩 CLI/docs surface”，然后按 RouteDef 工厂补齐并更新 api-surface。

### 工程维护信号（持续跟踪，基线见 FALLOW_BASELINE_2026-08-22.md）

- 已知继承热点清单与进入条件维持原登记口径；仅 hotspot 关联生产故障/边界违规时开 scoped tranche。

## 审核检查表

- [x] 2026-08-22 closeout：关闭条目物理移除，净收缩核对完成。
