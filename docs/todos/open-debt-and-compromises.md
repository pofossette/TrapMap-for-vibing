# 长期工程债务与平台成熟度登记

> **角色：** 受根 [`../../plan.md`](../../plan.md) 管理的长期问题登记册。
> **状态：** `deferred`；不构成第二条 active mainline。
> **2026-08-22 平台化主线 closeout：** 已关闭条目已物理移除（历史见 docs/archived/archived-plans/debt-mcp-platformization-mainline-archived.md 与 git history）；本册为净收缩后的仍开放集。

## 使用规则

- 每项记录必须包含来源、影响、当前边界、进入条件和后续落点。
- 任一项满足进入条件时，创建新的 active detail 并由根 `plan.md` 显式链接。

## 长期问题池

### web-panel real admin 路径不可运行（刷新于 2026-08-22）

- 来源/影响/边界：同原登记（5 个 /api/admin/* 无后端实现，mock 模式可用）。
- 进入条件：需要真实管理控制台时。
- 后续落点：按 RouteDef 工厂补 owner service 路由 + SessionProvider token 回填（蓝图见主线归档 Task A10）。

### eval:smoke CI 完整补跑（环境门控，刷新于 2026-08-22）

- 来源：本机无 docker daemon；A4 端到端、A15 镜像重建与 compose replicas 演示均需 docker/kind。
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

### 工程维护信号（持续跟踪，基线见 FALLOW_BASELINE_2026-08-22.md）

- 已知继承热点清单与进入条件维持原登记口径；仅 hotspot 关联生产故障/边界违规时开 scoped tranche。

## 审核检查表

- [x] 2026-08-22 closeout：关闭条目物理移除，净收缩核对完成。
