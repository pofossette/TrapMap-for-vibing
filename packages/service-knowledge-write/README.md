# @trapmap/service-knowledge-write

宿主组件共享的知识写入服务模块。

## 边界归属

`knowledge-write` 拥有知识写入模型、最终聚合变更和生命周期规则。它接受来自 `governance-review`（审查/维护/衰减决策）和 `candidate-ingestion`（候选发布）的委托调用。

- **数据归属**：`knowledge-aggregate`、`knowledge-lifecycle`、`trap-aggregate`、`evidence-record`、`knowledge-revision`、`lifecycle-event`
- **投影归属**：无（读侧投影由 `knowledge-read` 拥有）
- **不拥有**：`governance-command-flow`、`review-queue`、`feedback-record`、`candidate-ingestion-workflow`、`retrieval-read-projection`

### 同步边界

`knowledge-write` 拥有最终聚合变更、生命周期规则和权威写入真相。它不拥有治理命令流判断本身。更改知识生命周期状态的唯一权威路径是通过本服务。

### 异步边界

聚合变更后的后续操作（检索投影刷新、工件/技能后续处理、出站事件分发）进入出站队列/工作流作为异步后续处理，永不返回同步命令路径。`job-runtime` 拥有队列/出站/工作流传输。`knowledge-write` 负责触发权威写入侧事件；下游消费者读取具名事件/任务类型，而非依赖隐式副作用。

## 命令表

`knowledge-write` 暴露的完整命令表：

- `submit` - 新知识条目
- `updateEntry` - 内容/标签更新
- `resubmit` - 重新提交流程
- `supersede` - 替换式废弃
- `createTrap` - 创建陷阱聚合
- `approveReviewDecision` - 委托自 `governance-review`
- `rejectReviewDecision` - 委托自 `governance-review`
- `applyMaintenanceDecision` - 委托自 `governance-review`
- `applyDecayDecision` - 委托自 `governance-review`
- `publishCandidateResult` - 委托自 `candidate-ingestion`
- `listTraps` / `getTrap` - 陷阱查询（同步，本地于所有者）

所有委托命令通过 `KnowledgeWritePort` 进入。不允许路由级或仓库级绕过。

## RPC 端点

`POST /internal/rpc/knowledge-write`

统一的 RPC 端点，供跨进程调用方以单一 HTTP 入口调用 `knowledge-write` 的委托命令。请求体包含 `method` 字段指定命令名，以及 `input` 字段传递该命令的参数。

**支持的 method 值：**

| method | 说明 |
|---|---|
| `approveReviewDecision` | 批准审查决策 |
| `rejectReviewDecision` | 驳回审查决策 |
| `applyMaintenanceDecision` | 执行维护决策 |
| `applyDecayDecision` | 执行衰减决策 |
| `publishCandidateResult` | 发布候选结果 |

**请求体示例：**

```json
{
  "method": "approveReviewDecision",
  "input": {
    "entryId": "...",
    "actorId": "...",
    "note": "审查通过",
    "evidence": {}
  }
}
```

**成功响应**：`200 { "ok": true, "result": ... }`

**错误响应**：遵循与其他端点一致的 `InvocationError` 映射（参见"失败语义"部分）。

## 失败语义

## Async capability boundary

`knowledge-write` 在 authoritative transaction 内追加本地 outbox event，但 queue/outbox 的 claim、complete、fail、requeue、retry 与 dead-letter runtime 操作归 `job-runtime`。operator status 只暴露只读 snapshot；服务不得从该诊断能力获得 runtime mutation capability。

`knowledge-write` 与所有其他所有者共享相同的 `InvocationError` 分类体系。HTTP 状态码映射如下：

- `403 forbidden` - 执行者缺少此写入权限
- `404 not-found` - 目标条目/陷阱/候选不存在或无法定位权威聚合
- `409 conflict` - 状态冲突、重复应用或生命周期前置条件未满足
- `503 unavailable` - 服务或关键持久化依赖当前不可用
- `504 timeout` - 保留给跨所有者调用方解释调用超时；`knowledge-write` 本身很少抛出此错误
- `401` 仍为网关/认证传输层关注点

幂等性：同一治理/候选命令对 `knowledge-write` 的重复执行必须产生相同的聚合变更结果。出站重试重放相同的权威事件，永不计算第二次聚合变更。死信操作者动作要么重新排队/重放，要么声明事件过期。

## 健康 / 就绪 / 归属端点

- `GET /internal/health` - 基本存活性，包含所有者声明和委托来源列表
- `GET /internal/readiness` - 持久化可达性，报告 `aggregateMutationAuthority: true`、`lifecycleRuleAuthority: true` 和 `followUpDisposition: 'outbox-queue-workflow-async'`
- `GET /internal/live` / `GET /internal/ready` - 分别为无依赖 liveness 与 persistence readiness 的 service-level probe
- `GET /internal/ownership` - 完整静态所有者声明（数据/投影归属、不拥有列表、命令表、接受委托来源列表）
- `GET /internal/operator-status` - pool health、queue/outbox follow-up、timeout 与 idempotency 诊断；异步运行时仍由 `job-runtime` 解释

操作可见性目标：

- **最终写入完成但后续未收敛**：通过本服务的就绪状态和 job-runtime 队列/出站快照可见
- **陈旧处理/回收**：解释为 `job-runtime` 运行时所有者行为，而非 `knowledge-write` 业务语义漂移

## 兼容性 / 委托例外

- **共享 PostgreSQL（过渡期）**：继续与其他服务共享 PostgreSQL 实例，但具有显式模式/表所有者。`knowledge-write` 权威拥有知识/陷阱/证据/生命周期表。
- **具名查询接缝**：读侧消费者（`knowledge-read`、操作投影）通过具名投影接缝或派生搜索索引读取；它们不通过直接写入知识表来绕过 `knowledge-write`。

## 验证

- `rtk pnpm test:distributed-acceptance` - 验证多进程委托、错误映射和请求/追踪传播
- `rtk pnpm --filter @trapmap/service-knowledge-write test --run` - 路由级命令和失败语义
- `rtk pnpm typecheck`

## 相关文档

- 试点计划：[`docs/archived/archived-plans/nestjs-service-evolution-knowledge-write-governance-review-pilot.md`](../../docs/archived/archived-plans/nestjs-service-evolution-knowledge-write-governance-review-pilot.md)
- 迁移任务列表：[`docs/archived/archived-plans/nestjs-service-evolution-knowledge-write-governance-review-migration-tasklist.md`](../../docs/archived/archived-plans/nestjs-service-evolution-knowledge-write-governance-review-migration-tasklist.md)
- 成熟度评估：[`docs/archived/archived-plans/nestjs-service-evolution-distributed-maturity-assessment.md`](../../docs/archived/archived-plans/nestjs-service-evolution-distributed-maturity-assessment.md)
- 真相来源：[`docs/reference/SYSTEM_TRUTH_SOURCES.md`](../../docs/reference/SYSTEM_TRUTH_SOURCES.md)
