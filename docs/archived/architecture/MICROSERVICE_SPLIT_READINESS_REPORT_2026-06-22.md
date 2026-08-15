# 微服务拆分就绪报告（2026-06-22）

## 结论

**截至 2026-06-23，distributed 形态的物理微服务拆分前置证据已经基本齐备，但仓库级 Phase 4 收尾仍未完成。`packages/server` 的 maintenance/decay compatibility shell 降级、Gate 2 / Gate 3 / Gate 4 / Gate 6 既有证据，以及本轮在本地 Docker `distributed` 环境下完成的 Gate 5 operator closeout 已形成 distributed 侧通过链；candidate/review 的默认 Fastify legacy 写路径仍是仓库默认入口上的开放迁移窗口。**

## 已满足条件

- `candidate-ingestion` 对 knowledge 最终结果发布已改为通过 remote `KnowledgeWritePort.publishCandidateResult()` 委托；分布式 host 中不再保留本地假 publish 实现。
- `governance-review` 对 knowledge approve / reject / maintenance / decay 的最终 aggregate mutation 已改为通过 remote `KnowledgeWritePort` 委托；不再直接调用 knowledge repo 的 `updateLifecycle()`。
- `knowledge-write` internal command surface 已覆盖：
  - `publishCandidateResult`
  - `approveReviewDecision`
  - `rejectReviewDecision`
  - `applyMaintenanceDecision`
  - `applyDecayDecision`
- 关键失败语义已有测试覆盖，至少覆盖：
  - `404 not-found`
  - `409 conflict`
  - `403 forbidden`
  - `503 unavailable`
  - `504 timeout`
- gateway/internal client 契约已覆盖：
  - trace / request headers 透传
  - timeout 映射
  - 非 `2xx` body 不被吞掉
- truth docs 已回写，已明确 candidate/review 到 knowledge-write 的 remote ownership 事实。

## 本轮 closeout 结果

- `docker compose --profile distributed up -d --build` 现在会启动 distributed gateway `gateway`，不再错误复用 team-monolith `server` 默认值。
- 本地 `http://127.0.0.1:4000/ready` 与 `/v1/operations/status/async` 已稳定返回：
  - `deploymentProfile = "distributed"`
  - `preset = "api"`
  - `routeSurface = "gateway-core"`
  - queue/outbox operator-visible reclaim / dead-letter / recent failure contract
- `pnpm test:runtime-closeout` 已在本地 Docker `distributed` 环境通过。
- `pnpm test:deployment-smoke`、`pnpm test:runtime-foundations`、`pnpm test:distributed-acceptance`、`pnpm eval:smoke` 均通过，未出现与 closeout 结论冲突的结果。

## Remaining Work

- 仍可继续做 deployed environment 复核、RabbitMQ task transport rollout、以及更细粒度恢复矩阵扩展。
- 若要把仓库级 Phase 4 closeout 写成完成，还需要关闭 `packages/server` 上 candidate apply-resolution / knowledge review 的默认 Fastify 迁移窗口，或把它们明确迁到新的默认 host-owned 入口。

执行验收时，使用 [微服务拆分验收清单](../guides/MICROSERVICE_SPLIT_ACCEPTANCE_CHECKLIST.md) 逐项判断。
