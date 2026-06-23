# 微服务拆分就绪报告（2026-06-22）

## 结论

**截至 2026-06-23，仍然还不能开始下一阶段物理微服务拆分，但 `packages/server` 已完成 compatibility shell 降级，且 Gate 2 / Gate 3 / Gate 4 / Gate 6 已满足；当前唯一主阻塞收敛到 Gate 5 的 docker / deployed runtime operator closeout。**

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

## 未满足条件

- `gateway` 鉴权链路现在已有多进程 closeout 自动化证据，证明 session 仅经 identity-access 校验、request/trace header 可跨进程透传、非 `2xx` body 不被吞掉；但仍未达到 docker / deployed runtime 的最终 operator 审计级别。
- `packages/server` 已退化为这些核心链路的 compatibility shell：candidate apply-resolution、knowledge review、maintenance batch、decay batch 在 server 路由层统一返回 `501 capability_unsupported`，不再承担 authoritative write orchestration。
- `job-runtime` 现在已有 gateway -> internal job-runtime 的真实 HTTP ownership 验收，并新增 queue stale-running reclaim、outbox retryable failure、dead-letter、stale-processing reclaim 的 focused 恢复证据；剩余缺口只在 docker / deployed runtime 下如何经 `/v1/operations/status/async` 稳定呈现 operator closeout。
- 本轮尚未基于完整运行环境给出“distributed compose / deployed runtime + async operator status closeout”的最终证据前，不能把“逻辑边界收口”直接等同于“可以开始物理拆分”。

## 下一步唯一最高优先级补洞项

**完成 Gate 5 的部署级 operator closeout：在 `docker compose --profile distributed up -d` 或等价 deployed runtime 上运行 `rtk pnpm test:runtime-closeout`，用现有 `/v1/operations/status/async` contract 固定 queue/outbox recovery matrix 的 operator-visible 证据。**

原因：截至 2026-06-23，`rtk pnpm eval:smoke` 已全量通过，不再把阻塞归因到 distributed write path 未接管或 read contract 漂移。下一判断只剩 Gate 5 的 operator closeout 是否已在完整运行环境中可审计、可复现、可解释。

执行验收时，使用 [微服务拆分验收清单](../guides/MICROSERVICE_SPLIT_ACCEPTANCE_CHECKLIST.md) 逐项判断。
