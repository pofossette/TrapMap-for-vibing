# 微服务拆分就绪报告（2026-06-22）

## 结论

**截至 2026-06-23，仍然还不能开始下一阶段物理微服务拆分，但 `packages/server` 已完成 compatibility shell 降级，且 Gate 2 / Gate 3 / Gate 5 已有新的多进程 closeout 自动化证据可重新评估。**

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
- `knowledge-read` 已收口为显式 projection adapter，并暴露 freshness/fallback contract；但底层仍共享 authoritative PostgreSQL 读模型，尚未达到独立 read-store 或异步投影级别的物理拆分成熟度。
- `job-runtime` 现在已有 gateway -> internal job-runtime 的真实 HTTP ownership 验收，并新增 stale-running reclaim 的 focused 恢复证据；但 outbox claim / retry / dead-letter 的完整生产级恢复矩阵仍未全部关闭。
- 本轮尚未基于完整运行环境给出“host-distributed 多进程联调 + eval smoke”全部通过的最终证据前，不能把“逻辑边界收口”直接等同于“可以开始物理拆分”。

## 下一步唯一最高优先级补洞项

**补齐 `eval:smoke` 与 read-side Phase 2 收口，确认失败原因不再指向 distributed write path 未接管或 read contract 漂移。**

原因：distributed runtime 多进程 closeout 已固定到自动化测试矩阵中，下一阻塞点已从“写路径是否真实接管”转向“eval 结果与 read-side 物理拆分准备度是否收口”。

执行验收时，使用 [微服务拆分验收清单](../guides/MICROSERVICE_SPLIT_ACCEPTANCE_CHECKLIST.md) 逐项判断。
