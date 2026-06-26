# 代码迁移任务列表：Knowledge-Write + Governance-Review

## 角色

- 状态：`proposed`
- 目标：把 `knowledge-write + governance-review` 成熟服务样板的代码迁移任务落到具体包和文件

## 任务 1：冻结共享 contract 与 adapter seam

### 文件

- [ ] [`packages/backend-core/src/ports/internal-ports.ts`](../../packages/backend-core/src/ports/internal-ports.ts)
- [ ] [`packages/host-distributed/src/shared/internal-knowledge-write-client.ts`](../../packages/host-distributed/src/shared/internal-knowledge-write-client.ts)
- [ ] [`packages/host-distributed/src/governance-review/ports.ts`](../../packages/host-distributed/src/governance-review/ports.ts)

### 目标

- [ ] 收口 `governance-review -> knowledge-write` 的 command surface
- [ ] 明确 `in-process` / `remote` 双 adapter 的对齐点
- [ ] 冻结错误语义、超时、重试、幂等 contract

## 任务 2：收口 governance-review 服务边界

### 文件

- [ ] [`packages/service-governance-review/src/deps.ts`](../../packages/service-governance-review/src/deps.ts)
- [ ] [`packages/service-governance-review/src/routes.ts`](../../packages/service-governance-review/src/routes.ts)
- [ ] [`packages/service-governance-review/src/server.ts`](../../packages/service-governance-review/src/server.ts)
- [ ] [`packages/host-distributed/src/governance-review/server.ts`](../../packages/host-distributed/src/governance-review/server.ts)

### 目标

- [ ] 让 `governance-review` 只拥有治理命令入口与流程语义
- [ ] 去掉未命名的最终聚合写路径
- [ ] 保证最终状态变更统一委托给 `knowledge-write`

## 任务 3：收口 knowledge-write 服务边界

### 文件

- [ ] [`packages/service-knowledge-write/src/deps.ts`](../../packages/service-knowledge-write/src/deps.ts)
- [ ] [`packages/service-knowledge-write/src/routes.ts`](../../packages/service-knowledge-write/src/routes.ts)
- [ ] [`packages/service-knowledge-write/src/server.ts`](../../packages/service-knowledge-write/src/server.ts)
- [ ] [`packages/host-distributed/src/knowledge-write/server.ts`](../../packages/host-distributed/src/knowledge-write/server.ts)

### 目标

- [ ] 让 `knowledge-write` 成为知识最终聚合写入 owner
- [ ] 收口 lifecycle / apply decision 写路径
- [ ] 明确写侧 follow-up 与异步边界

## 任务 4：补齐 owner 级运行时语义

### 文件

- [ ] [`packages/host-distributed/src/gateway/server.ts`](../../packages/host-distributed/src/gateway/server.ts)
- [ ] [`packages/host-distributed/src/job-runtime/server.ts`](../../packages/host-distributed/src/job-runtime/server.ts)
- [ ] [`packages/server/src/routes/operations/status.ts`](../../packages/server/src/routes/operations/status.ts)
- [ ] [`packages/server/src/routes/operations/stats.ts`](../../packages/server/src/routes/operations/stats.ts)

### 目标

- [ ] 让 operator 能看出治理命令与最终写入的 owner 边界
- [ ] 让 follow-up queue / workflow / failure taxonomy 可按服务解释
- [ ] 不再只暴露“系统有任务”，而要暴露“哪个服务拥有哪个任务”

## 任务 5：收口文档与事实源

### 文件

- [ ] [`docs/architecture/ARCHITECTURE.md`](../../docs/architecture/ARCHITECTURE.md)
- [ ] [`docs/architecture/DEPLOYMENT.md`](../../docs/architecture/DEPLOYMENT.md)
- [ ] [`docs/reference/SYSTEM_TRUTH_SOURCES.md`](../../docs/reference/SYSTEM_TRUTH_SOURCES.md)
- [ ] [`docs/reference/api-surface.md`](../../docs/reference/api-surface.md)
- [ ] 受影响 package README

### 目标

- [ ] 固化这组样板的 owner 描述
- [ ] 固化 distributed 与单体共享同一 business truth 的叙事
- [ ] 固化当前保留的例外与关闭条件

## 任务 6：补齐测试门

### 文件/入口

- [ ] [`packages/host-distributed/src/gateway/distributed-acceptance.test.ts`](../../packages/host-distributed/src/gateway/distributed-acceptance.test.ts)
- [ ] [`packages/host-distributed/src/governance-review/delegation-acceptance.test.ts`](../../packages/host-distributed/src/governance-review/delegation-acceptance.test.ts)
- [ ] [`packages/service-governance-review/src/routes.test.ts`](../../packages/service-governance-review/src/routes.test.ts)
- [ ] [`packages/service-knowledge-write/src/routes.test.ts`](../../packages/service-knowledge-write/src/routes.test.ts)
- [ ] [`packages/host-distributed/src/gateway/distributed-runtime-closeout.test.ts`](../../packages/host-distributed/src/gateway/distributed-runtime-closeout.test.ts)

### 目标

- [ ] 证明治理命令不直接改最终聚合
- [ ] 证明跨服务错误语义稳定
- [ ] 证明 owner 级 runtime/closeout 证据存在

## 任务 7：生成冻结后的 client / adapter

### 文件

- [ ] [`packages/backend-core/src/ports/internal-ports.ts`](../../packages/backend-core/src/ports/internal-ports.ts)
- [ ] [`packages/host-distributed/src/shared/internal-knowledge-write-client.ts`](../../packages/host-distributed/src/shared/internal-knowledge-write-client.ts)
- [ ] [`packages/host-distributed/src/governance-review/ports.ts`](../../packages/host-distributed/src/governance-review/ports.ts)
- [ ] [`packages/host-distributed/src/knowledge-write/ports.ts`](../../packages/host-distributed/src/knowledge-write/ports.ts)

### 目标

- [ ] 为 frozen command surface 生成 `in-process` / `remote` 双 adapter
- [ ] 保持 request/trace 传播一致
- [ ] 保持 `403 / 404 / 409 / 503 / 504` 失败语义和 `InvocationError` 映射一致

## 任务 8：补 health / readiness / metrics

### 文件

- [ ] [`packages/service-governance-review/src/routes.ts`](../../packages/service-governance-review/src/routes.ts)
- [ ] [`packages/service-governance-review/src/server.ts`](../../packages/service-governance-review/src/server.ts)
- [ ] [`packages/service-knowledge-write/src/routes.ts`](../../packages/service-knowledge-write/src/routes.ts)
- [ ] [`packages/service-knowledge-write/src/server.ts`](../../packages/service-knowledge-write/src/server.ts)
- [ ] [`packages/host-distributed/src/gateway/distributed-runtime-closeout.test.ts`](../../packages/host-distributed/src/gateway/distributed-runtime-closeout.test.ts)

### 目标

- [ ] 让两个服务都有独立 health / readiness / ownership 语义
- [ ] 暴露 queue / outbox / workflow / dead-letter / backlog 的 owner 视角
- [ ] 让 runtime closeout 能证明 operator 可按服务解释故障与 backlog

## 任务 9：加 acceptance case

### 文件

- [ ] [`packages/host-distributed/src/gateway/distributed-acceptance.test.ts`](../../packages/host-distributed/src/gateway/distributed-acceptance.test.ts)
- [ ] [`packages/host-distributed/src/governance-review/delegation-acceptance.test.ts`](../../packages/host-distributed/src/governance-review/delegation-acceptance.test.ts)
- [ ] [`packages/service-governance-review/src/routes.test.ts`](../../packages/service-governance-review/src/routes.test.ts)
- [ ] [`packages/service-knowledge-write/src/routes.test.ts`](../../packages/service-knowledge-write/src/routes.test.ts)

### 目标

- [ ] 证明 `governance-review` 不直接改最终聚合
- [ ] 证明 `knowledge-write` 接住最终 mutation
- [ ] 证明错误语义、request/trace、超时和幂等 contract 稳定

## 任务 10：补服务 README

### 文件

- [ ] [`packages/service-governance-review/README.md`](../../packages/service-governance-review/README.md)
- [ ] [`packages/service-knowledge-write/README.md`](../../packages/service-knowledge-write/README.md)
- [ ] [`packages/host-distributed/README.md`](../../packages/host-distributed/README.md)

### 目标

- [ ] 写清 owner、同步 / 异步 boundary、health/readiness/metrics 入口和失败语义
- [ ] 写清 gateway 与 service owner 的责任划分
- [ ] 写清当前仍保留的 compatibility / delegation 例外

## 任务 11：替换低信号提示词

### 文件

- [ ] [`docs/todos/nestjs-service-evolution-02-modular-monolith-cutover.md`](../../docs/todos/nestjs-service-evolution-02-modular-monolith-cutover.md)
- [ ] [`docs/todos/nestjs-service-evolution-knowledge-write-governance-review-pilot.md`](../../docs/todos/nestjs-service-evolution-knowledge-write-governance-review-pilot.md)

### 目标

- [ ] 把暗示“跨 owner 直接读写仍是默认低风险实现”的表述替换成命名 query seam / command seam / owner exception
- [ ] 保证后续执行者按 frozen contract 做机械实现，不再回退到 shared-state 口径

## 建议执行顺序

1. 冻结 `backend-core` contract 与 adapter seam
2. 收口 `governance-review`
3. 收口 `knowledge-write`
4. 补 owner 级 runtime 语义
5. 回写文档事实源
6. 补齐 acceptance / closeout 测试
7. 生成冻结后的 client / adapter
8. 补 health / readiness / metrics
9. 加 acceptance case
10. 补服务 README
11. 替换低信号提示词

## 最小验证

- [ ] `pnpm test:deployment-smoke`
- [ ] `pnpm test:distributed-acceptance`
- [ ] 受影响包最小测试集合
- [ ] `pnpm typecheck`
- [ ] 若影响治理/反馈/eval runner，补 `pnpm eval:smoke`
- [ ] `pnpm check:docs-drift`
- [ ] `pnpm check:structure`

## 完成定义

- 代码任务已经直接映射到具体包与文件。
- 执行者可以不再做额外目录摸底，直接按任务列表推进。
