# Deployment Flexibility Plan 03: Distributed Service Topology

## 状态

- 状态：`active`
- 审计结论：这是当前最主要的未完成子计划。topology 词汇和 metadata 已有初步实现，但代码映射、边界验证和文档闭环还没完全收口。

## 目标

为重后端提供第一阶段可落地的微服务拓扑，同时保持共享 core 和共享 PostgreSQL。

## 当前事实

- 现有代码已经有进程角色分离基础：
  - API 入口：`packages/server/src/index.ts`
  - worker 入口：`packages/server/src/worker.ts`
  - task worker bootstrap：`packages/server/src/bootstrap/bootstrap-workers.ts`
  - outbox/lifecycle bootstrap：`packages/server/src/bootstrap/*`
- 当前已有 topology 代码入口：
  - `packages/server/src/lib/runtime/service-topology.ts`
  - `packages/server/src/lib/runtime/service-topology.test.ts`
- 当前 `serviceUnit` 只覆盖：
  - `candidate-ingestion`
  - `knowledge-governance`
  - `full-platform`
- distributed phase-1 已在 runtime metadata 中显式写入：
  - `gateway`
  - `retrieval`
  - `candidate-ingestion`
  - `governance`
  - `outbox-runtime`
- 但 retrieval / governance / gateway 的实现边界仍主要体现在 topology metadata 与路由语义上，尚未完全收敛成更强的代码结构隔离。

## 已完成

- distributed phase-1 服务词汇已进入 runtime topology。
- 共享基础设施与延后隔离边界已能在 topology snapshot 中表达。
- topology 测试文件已出现，说明这不再只是文档层方案。

## 剩余收口

- 已补齐各服务边界到 route family、worker ownership、readiness 语义的映射入口：
  - `service-topology.ts`
  - `runtime-metadata.ts`
  - `/health` / `/ready` / `/meta/routes`
- 已明确 retrieval 是“内部逻辑服务边界”，不等于当前已有独立运行时二进制。
- 剩余重点转为后续是否真的拆出 retrieval / governance 独立 runtime，而不是继续模糊 phase-1 边界。

## 详细改动内容

- 规划 `distributed` 第一阶段服务边界，至少说明以下单元：
  - `gateway`
  - `retrieval`
  - `candidate-ingestion`
  - `governance`
  - `outbox/async workers`
- 定义每个服务的职责、拥有的 capability、允许暴露的路由或内部接口。
- 明确哪些能力仍然共享：
  - PostgreSQL
  - outbox 语义
  - 认证/权限模型
  - shared contracts
- 明确哪些边界先不做：
  - 独立数据库
  - 独立 package 拆仓
  - 复杂 service mesh / event backbone
- 规定本阶段的部署目标是“强服务隔离的产品化部署”，不是“一次性做完最终分布式架构”。

## 目标拓扑

第一阶段建议明确为以下逻辑服务：

1. `gateway`
   - 对外唯一入口
   - 统一 auth/session
   - 统一 CLI surface
   - 路由到内部服务或本地实现

2. `retrieval`
   - 负责 search/load/read-model/capsule recall
   - 拥有 retrieval 读侧与查询编排
   - 不直接承载 review/governance 变更命令

3. `candidate-ingestion`
   - 负责 candidate submit / dedup / resolution / processing
   - 与 async task ownership 强关联

4. `governance`
   - 负责 knowledge/skill review、maintenance、decay、feedback remediation 等治理写路径

5. `outbox-runtime`
   - 负责 outbox 消费、派生刷新、shared jobs follow-up
   - 可以是独立 worker runtime，而不是完整业务服务

## 建议分步

### Step 1. 扩展 service topology 词汇

- 在 runtime/service 配置中引入比当前 `serviceUnit` 更接近产品部署的 service identity。
- `serviceUnit` 可保留为 ownership 语义，但需要补充：
  - gateway-facing identity
  - retrieval identity
  - governance identity

### Step 2. 明确每个服务的能力边界

- `gateway`
  - 不拥有重异步任务
  - 可拥有 auth/session 与外部 API
- `retrieval`
  - 只读或读主导
  - 可拥有 retrieval-specific cache/read-model
- `candidate-ingestion`
  - 拥有 candidate task work
- `governance`
  - 拥有治理写路径与 shared job task work
- `outbox-runtime`
  - 拥有 outbox work

### Step 3. 规定共享基础设施

- 首期共享：
  - PostgreSQL
  - contracts
  - auth/session 模型
  - outbox 事实源
- 可选：
  - RabbitMQ task transport
- 暂不做：
  - per-service DB
  - cross-service event contract versioning platform
  - repo/package 拆仓

### Step 4. 将服务边界落回代码结构

- `packages/server` 内仍可保持单包，但需要用 runtime/topology seam 表达：
  - 哪些 routes 属于 gateway
  - 哪些 services 属于 retrieval
  - 哪些 workers 属于 candidate/governance/outbox
- 必要时新增 service topology 文档或配置模块，而不是只靠 compose 命名表达边界。

## 涉及代码入口

- `packages/server/src/index.ts`
- `packages/server/src/worker.ts`
- `packages/server/src/app.ts`
- `packages/server/src/bootstrap/bootstrap-workers.ts`
- `packages/server/src/bootstrap/bootstrap-lifecycle.ts`
- `packages/server/src/lib/runtime/service-unit.ts`
- `packages/server/src/lib/runtime/service-topology.ts`
- `packages/server/src/lib/runtime/runtime-metadata.ts`
- `packages/server/src/lib/runtime/http-surface.ts`
- `packages/server/src/routes/retrieval.ts`
- `packages/server/src/routes/candidates.ts`
- `packages/server/src/routes/review.ts`
- `packages/server/src/routes/operations.ts`

## 需要同步更新的文档

- `docs/architecture/DEPLOYMENT.md`
- `docs/architecture/ARCHITECTURE.md`
- `docs/PACKAGES.md`
- 如有需要新增：`docs/architecture/components/` 下的服务拓扑说明

## 需要补充或更新的测试

- `packages/server/src/lib/runtime/service-unit.test.ts`
  - 验证服务单元 ownership 语义。
- `packages/server/src/lib/runtime/runtime-metadata.test.ts`
  - 验证远程 owner / 本地非 owner / 分布式 readiness 语义。
- `packages/server/src/lib/runtime/service-topology.test.ts`
  - 验证 distributed phase-1 服务清单、共享基础设施和 deferred isolation 边界。
- `packages/server/src/__tests__/service-boundary-guard.test.ts`
  - 如现有 guard 覆盖不足，补充对新边界的约束。

建议补充的具体场景：

- `gateway` 进程在不拥有 candidate/outbox worker 时仍为 ready。
- `retrieval` 服务边界不会反向依赖 governance 写路径。
- `candidate-ingestion` 与 `governance` 的 worker ownership 不互相混淆。
- `distributed` profile 下的 `/health` / `/ready` 能正确体现 remote ownership。
- topology snapshot 会稳定暴露 `shared-postgres-phase1`，避免文档和实现对当前阶段边界产生歧义。

## 验收标准

- 微服务拓扑不再只是 docker compose 命名，而是代码和文档中都存在的正式概念。
- 首期共享 PostgreSQL 的边界在所有相关文档中写清楚。
- retrieval/candidate/governance/gateway/outbox 的职责边界对实现者足够清晰，不需要临场决策。
- retrieval 若仍未独立成单独 runtime，也必须在文档中明确其当前属于逻辑边界而非独立部署单元。

## 交付要求

- 每个服务边界必须能映射回具体代码装配点，而不是只停留在图示层。
- 微服务拓扑文档必须写清楚“首期共享 PostgreSQL”的约束，避免误读成已拆库。
