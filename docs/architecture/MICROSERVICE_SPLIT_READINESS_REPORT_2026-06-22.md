# 微服务拆分就绪报告（2026-06-22）

## 结论

**还不能开始下一阶段微服务拆分，但 `packages/server` 已完成 compatibility shell 降级。**

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

- `gateway` 鉴权链路是否已经完全脱离“破坏性探针或本地捷径”，本轮未新增专门的跨进程审计证据；当前只验证了 session 校验是只读远程调用，而不是完整的 auth boundary closeout。
- `packages/server` 已退化为这些核心链路的 compatibility shell：candidate apply-resolution、knowledge review、maintenance batch、decay batch 在 server 路由层统一返回 `501 capability_unsupported`，不再承担 authoritative write orchestration。
- `knowledge-read` 仍处于 Phase 1 的临时直接读权威表姿态，债务边界虽已文档化，但尚未收敛到“可无痛物理拆分”的状态。
- `job-runtime` 的 outbox / queue / retry / reclaim 虽有既有实现与文档，但本轮没有新增“它已经成为跨服务一致性主路径”的专项审计证明。
- 本轮尚未基于完整运行环境给出“host-distributed 多进程联调 + eval smoke”全部通过的最终证据前，不能把“逻辑边界收口”直接等同于“可以开始物理拆分”。

## 下一步唯一最高优先级补洞项

**补一组 `host-distributed` 多进程联调 + `eval:smoke` + auth/runtime consistency 证据，证明新的 authoritative write path 在真实运行时闭环成立。**

原因：`packages/server` 降级本身已经完成，但如果 distributed runtime 只是在单测级别成立，当前边界仍不足以支持正式的物理拆分决策。
