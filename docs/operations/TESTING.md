# 测试指南

本文档说明 TrapMap 的测试架构、运行方法和用例编写规范。

> **历史说明**：本文档中大量测试命令引用 `packages/server（Wave-10 已删除）` 路径，该包已于 Wave-10 删除。当前测试命令请使用 `rtk pnpm test:file -- <repo-root-relative-test-path>` 格式，路径指向当前存在的包（如 `packages/service-*`、`packages/host-local`、`packages/contracts` 等）。

## 测试架构

TrapMap 采用两级评估体系：

```mermaid
flowchart TB
    subgraph 评估层级["评估层级"]
        Smoke["Smoke 层<br/>快速反馈，验证核心路径正确性<br/>命令: pnpm eval:smoke"]
        Core["Core 层<br/>全面覆盖，验证边界条件和治理规则<br/>命令: pnpm eval:core"]
        
        Smoke --> Core
    end
```

### 评估类型

| 类型 | 说明 | 运行器 |
|------|------|--------|
| 检索评估 (Retrieval) | 验证召回结果的相关性和治理正确性 | `evals/retrieval/run.ts` |
| 摘要评估 (Summary) | 验证 AI 生成摘要的忠实度和覆盖率 | `evals/summary/run.ts` |
| 路径规划评估 (Agent Planning) | 比较 `skill-set` 与 `plan-graph-set` 的路径规划质量 | `evals/agent-planning/run.ts` |
| 标签对齐评估 (Label Alignment) | 验证标签三路召回与对齐决策效果 | `evals/label-alignment/run.ts` |
| 图提取评估 (Graph Extraction) | 验证图提取、去重和冲突评测 | `evals/graph-extraction/run.ts` |
| 摄取评估 (Ingestion) | 验证 Skill 目录摄取的正确性 | `evals/ingestion/run.ts` |
| 治理评估 (Governance) | 验证 RBAC 和安全等级过滤 | 内嵌于检索评估 |

当前 platform mirror 入口约定：

- unified aggregate runner（`pnpm eval -- smoke|core|all`）是当前唯一的 platform mirror 验证入口。
- `retrieval`、`summary`、`agent-planning` 平台事件都已从 suite 侧各自的 `lib/platform-events.ts` 导出。
- aggregate runner 只负责 adapter 选择、事件发布和 warning-only 失败处理；native TrapMap report 仍是 truth source。
- dry-run 或缺配置 warning 只能证明 mirror 通道与失败语义不漂移，不能替代真实 Langfuse 目标的 live closeout。

**Graph Extraction Eval Reporting:**
- `pnpm eval:graph-extraction` — live mode, requires chat provider config
- `pnpm eval:graph-extraction --dry-run` — runner validation only, no baseline extraction
- Treat a run as truly live only when the aggregate output shows all cases in `Live`
- If the output contains `DEGRADED`, `Unavailable`, `Error`, or `Empty`, the run is not a clean live proof
- A dry-run or unavailable run should NOT be used to evaluate LLM extraction quality

**Phase 3 Duplicate Recall Focus Runs:**
- Trap-only: run the duplicate eval and inspect the trap exact case that exercises the trap-side recall / exact-preservation lane.
- Skill-only: run the duplicate eval and inspect the real skill semantic and false-positive control cases that exercise the skill-side embedding + keyword recall path.
- Mixed: inspect trap + skill cases from the same report to confirm the merged PostgreSQL candidate list still preserves exact hits while keeping unrelated skill hits as `none`.

**Phase 4 Queue Dedupe / Trace Checks:**
- Queue dedupe: run the queue + processor + pipeline targets and confirm repeated scheduling keeps exactly one active `task_queue` row per `candidateId` while the task is `pending` or `running`.
- Retry safety: confirm a candidate can be scheduled again after the prior queue row reaches `dead` / `completed` / `failed`, and that conflict recovery does not drop the enqueue during the unique-violation race window.
- Trace persistence: inspect a processed candidate and confirm `analysisSnapshot.duplicateTrace` survives through the API / repository path with a plausible `detector` + `matchedLane` pair.

**Phase 0 Atomic Delivery / Recovery Checks:**
- 候选原子排队：提交候选后，确认 PostgreSQL 中不存在 `status='queued'` 但缺少活动 `task_queue` row 的候选。
- Stuck task reclaim：手动将 `task_queue.status='running'` 且 `lease_until` 调整到过去时间，再触发 worker dequeue；确认任务会被回收并重新 claim。
- Stuck outbox reclaim：手动将 `domain_event_outbox.status='processing'` 且 `lease_until` 调整到过去时间，再触发 outbox claim；确认事件会回到可处理状态。

**Phase 1 Operator Surface Checks:**
- Async backlog snapshot：调用 `GET /v1/operations/status/async`，确认返回 queue/outbox 的 `pending`、`dead/failed`、`stale*`、`reclaimCount` 和 workerState。
- Dead-letter visibility：制造一个 dead task 后，确认 `queue.recentDeadLetters` 返回任务摘要而不是要求人工查表。
- Requeue flow：调用 `POST /v1/operations/status/async/tasks/:taskId/requeue`，确认 dead task 回到 `pending` 且 dedupe 约束仍生效。

**Phase 2 Runtime Mode Checks:**
- `local-agent`：`pnpm dev -- local-agent`，确认 `/ready` 反映最小 gateway 能力面。
- `team-monolith`：`pnpm dev -- team-monolith`，确认 `/ready` 会同时报告 gateway 进程拥有的本地 worker runtime。
- `distributed gateway`：`pnpm dev -- gateway`，确认缺少本地 worker 不会导致 `/ready` 失败。
- `distributed task worker`：`pnpm dev -- candidate-worker` 或 `pnpm dev -- governance-worker`，确认该进程不对外监听业务 API，但其 runtime mode 仅要求对应 worker 健康。
- `distributed outbox worker`：`pnpm dev -- outbox-worker`，确认该进程只拥有 outbox runtime。

这些根脚本现在通过 `scripts/run-dev.ts` 分发到 `@trapmap/host-local` 与 `@trapmap/host-distributed`。兼容别名 `pnpm dev:local-agent`、`pnpm dev:team-monolith`、`pnpm dev:distributed:*` 仍可用。测试命令里仍然大量引用 `packages/server（Wave-10 已删除）/...`，是因为当前权威测试文件与核心实现仍主要驻留在该兼容层和既有代码面中。

**Phase 2 Store Snapshot / PG-first Freeze Checks:**
- Snapshot allowlist：运行 `packages/server（Wave-10 已删除）/src/__tests__/snapshot-usage-guard.test.ts`，确认新的 `store.snapshot()` / `store.transact()` 调用没有逃出 allowlist，并且 allowlist 仍只覆盖命名 compatibility buckets。
- PG-first compatibility：运行 `packages/server（Wave-10 已删除）/src/__tests__/pg-first-compat.test.ts`，确认 access-key / member 等 PG-first surface 在 InMemory fallback 下仍维持相同外部 contract；这证明 InMemory 当前是 compatibility/testing posture，而不是第二套 owner 语义。
- Truth freeze：运行 `pnpm check:docs-drift`，确认 remediation detail plan、truth source、packages doc、persistence doc 与 testing doc 对 `store_snapshot` / InMemory / PG-first 口径的描述一致。
- 解释边界：Phase 2 不要求把全部 compatibility path 都迁走；它要求把 remaining direct entrypoints、retention 条件、priority waves 和测试门写成显式事实。

**Phase 3 Unified Adapter Freeze Checks:**
- 最小验证矩阵:
  - `rtk pnpm check:docs-drift`
  - `rtk pnpm check:structure`
- 说明：Phase 3 只冻结边界文案与 authoritative placement，不扩张 runtime behavior。

**Phase 3 Workflow Snapshot Checks:**
- 候选处理：提交 candidate 后，调用 `GET /v1/operations/status/async` 或直接查询 `workflow_runs`，确认存在 `workflowType='candidate-processing'` 且 step/status 随处理推进。
- 失败持久化：制造 candidate 处理失败，确认 `lastError` 与 `status='failed'` 被保留。
- Rebuild workflow：触发 capsule-index rebuild，确认存在 `workflowType='capsule-index-rebuild'` 的运行快照。

**Phase 5 Shared Jobs Checks:**
- Lifecycle follow-up：在 PostgreSQL 模式下触发 knowledge approve/deactivate/update，确认不会在订阅器内同步执行重索引，而是新增 `task_queue.type='knowledge.index-follow-up'`，并能在 `workflow_runs.workflow_type='knowledge-index-follow-up'` 中观察到执行快照。
- Remediation complete：调用 `POST /v1/operations/feedback/remediation/:entryId/complete` 后，确认响应中的 additive `asyncJobId` 存在，且队列中出现 `feedback.remediation-reactivation` 任务；该任务 dead-letter 后可通过 async operator flow 重跑。
- Badcase draft：提交带 `badcase` 的 feedback 后，确认在 PostgreSQL 模式下响应返回 additive `asyncJobId`，并且 `task_queue` 中存在 `feedback.badcase-export-draft` 任务，同时 `retrieval_badcase_traces` 已先落库，draft 中携带 canonical taxonomy（`recall-miss`、`ranking-error`、`summary-hallucination`、`governance-leak`、`stale-content`）。

**Phase 6 Cache Invalidation Checks:**
- Retrieval read-model cache：连续执行两次 retrieval，第二次命中缓存后，再触发 knowledge approval/deactivation 或 remediation state change；确认后续 retrieval 结果反映最新可见性，而不是继续返回旧缓存内容。
- Suppression safety：先 warm 一次 approved trap/skill 的 retrieval，再通过 remediation suppression 写路径触发 `remediation-suppressed` invalidation；确认该 trap/skill 随后从 retrieval 结果中消失。
- Reactivation safety：在 remediation complete / reactivation follow-up 完成后，确认被压制内容在下一次 retrieval 中重新可见，且 `/v1/operations/status/async` 的 `cache` 字段可观察到 invalidation 计数增长。

**Phase 2 Contract Checks:**
- Async status contract：调用 `GET /v1/operations/status/async`，确认返回 `runtimeContract`、`idempotencyContract`、`retryResumeContract`、`freshnessContract` 和 `failureTaxonomy`。
- Runtime metrics contract：确认 `/v1/operations/status/async` 的 `runtimeMetrics` 返回统一的 timeout / retry / degraded / reclaim / queue backlog / outbox backlog / stale-worker 统计，且高基数键没有进入该汇总。
  `executions` / `degraded` / `timeouts` / `retryableFailures` / `permanentFailures` 必须表示 logical operation 终态，不得把同一次操作的中间 retry attempt 再计成额外 execution。
- Freshness contract：制造 queue backlog、outbox backlog 或 cache pending invalidation，确认 `freshnessContract.writeVisibility.projectionRefreshPending=true`，并且 `projectionLag` 计数随实际 backlog 变化。
- Resume/checkpoint contract：触发带 workflow snapshot 的 shared job 或 candidate processing，确认 checkpoint/progress 位于 `workflow_runs.stats`，而不是仅存在于日志或内存。
- Request-to-async correlation：提交带 badcase 的 feedback，并带上 `TRAPMAP_REQUEST_ID_HEADER` / `TRAPMAP_TRACE_HEADER_NAME`，确认 `task_queue.payload` 与 `/v1/operations/status/async` 的 `workflows[*].correlation` 都能看到同一组 `requestId`、`traceId`、`queryId`、`feedbackId`、`asyncJobId` 句柄。
- Focused end-to-end proof：在 PostgreSQL 模式下先走一次 retrieval 拿到真实 `queryId`，再提交 badcase feedback，消费 `feedback.badcase-export-draft` 任务并写入 `workflow_runs`，最后调用 `GET /v1/operations/badcases/:feedbackId/export`；确认 `debug.correlation`、`debug.durableTrace`、`debug.workflow` 与 queued payload / workflow snapshot 使用同一组语义，同时 `draft.request` 仍不泄露 `asyncJobId`、`workflowRunId`。
- Failure taxonomy：制造 dead-letter / failed event，确认 operator 仍通过统一 taxonomy 解释为 `permanent-failure`，而不是只输出底层 status 字符串。
- Distributed hop correlation：运行 `packages/host-distributed/src/gateway/internal-client.test.ts` 或 distributed acceptance/closeout，确认 `x-request-id`、`x-trace-id` 与既有 `x-correlation-id` 跨 hop 透传，且 `403/404/409/503/504` canonical `kind` 不因 internal client 而漂移；上游空 body 或 transport 级失败也必须被归一化成 canonical body。
- Phase 3 runtime metrics export：运行 `packages/server（Wave-10 已删除）/src/app.test.ts`，确认 `/metrics` 返回 Prometheus text，包含 `trapmap_runtime_executions_total`、`trapmap_runtime_request_duration_ms_*` 等真实样本，并且 label 中不出现 `requestId` / `traceId` 这类高基数键。
- Phase 3 span propagation：运行 `packages/host-distributed/src/gateway/routes.test.ts` 与 `packages/host-distributed/src/gateway/internal-client.test.ts`，确认 distributed write hop 继续透传 `traceparent`，并由 internal client 生成 `x-trapmap-span-id` / `x-trapmap-parent-span-id`。
- Phase 3 structured logging：运行 `packages/server（Wave-10 已删除）/src/app.test.ts` 与 `packages/server（Wave-10 已删除）/src/lib/runtime/resilience.test.ts`，确认 request / resilience 日志至少带 `eventCategory`、`eventName`、`requestId`、`traceId`、`serviceName`、必要时 `attempt`。

**Phase 7 Badcase Export / Decision Metrics Checks:**
- Operator export flow：先用 retrieval 拿到 `queryId`，提交带 badcase 的 feedback，再调用 `GET /v1/operations/badcases/:feedbackId/export`，确认返回 deterministic draft JSON。
- Script export flow：运行 `pnpm exec tsx scripts/export-badcase-to-eval.ts <feedbackId> <outputPath>`，确认输出文件与 route `draft` shape 一致，并且输出只包含 `badcaseEvalDraftSchema`；route 额外携带的 `debug` 仅用于 operator/debug 闭环，不属于 eval draft payload。
- Decision metrics：调用 `GET /v1/operations/stats/summary`，确认返回 `asyncArchitecture.queueBacklogByType`、`deadLetterByType`、`retryRateByType`、`avgHandlerLatencyMsByType`、`cacheHitRateByNamespace`、`badcaseExportCount`、`retrievalFailureDistribution` 与 `thresholds`。

**Phase 1 Instrumentation Contract Checks:**
- Contract truth：运行受影响 contracts 测试并确认 `packages/contracts/src/domain/observability.ts` 仍冻结统一 correlation key、metric namespace、failure taxonomy 与 public/internal 边界。
- Workflow correlation truth：确认 `packages/contracts/src/domain/observability.ts` 的 `workflowCorrelationSchema` 仍是 `workflow_runs.stats` -> `/v1/operations/status/async` 的唯一 correlation key allowlist，route/repository 不再各自手写另一套 key。
- Header/additive boundary：验证 request/trace header 仍由 runtime seam 负责；public response additive field 仅限 `requestId`、`traceId`、`queryId`、`feedbackId`、`asyncJobId`，不要把 `workflowRunId`、`candidateId`、`artifactId` 直接扩散到通用 client surface。
- Metric discipline：新增 runtime/async/cache/operator 指标时，确认高基数键没有进入 metrics label，而是保留在 logs、workflow snapshot 或 durable badcase trace。
- Operator vs durable trace：验证 `/v1/operations/status/async` 负责解释当前运行状态；`retrieval_badcase_traces` 负责 reproducibility；二者不互相替代。

**Phase 3 Operator / Config / Capacity Checks:**
- Operator home：调用 `GET /v1/operations/status/async`，确认返回 `operatorHome.health/status/freshness/capacity/jobControl` 五组首页摘要，而不是要求 operator 自己拼 queue/outbox/cache/workflow 字段。
- Config governance：确认 `configGovernance` 返回 `fingerprint`、`deprecatedEnvKeys`、`conflictWarnings` 与 `profileAwareCapabilitySummary`。
- Bulk/workflow drill-down：确认 `bulkOperations[*]` 返回 `checkpoint`、`resumeAllowed`、`progress` 与 `failureSample`，其来源仍然是 `workflow_runs.stats`。
- Cache capacity summary：调用 `GET /v1/operations/stats/summary`，确认 `asyncArchitecture.cacheInvalidationByNamespace` 与 `cachePendingInvalidationByNamespace` 可用。

**Backend Engineering Master Plan Phase 4 Closeout Matrix:**
- Phase 0：至少运行当前 gap / docs 相关守卫，并确认 `docs/plans/README.md`、`plan.md` 与阶段索引没有入口漂移。
- Phase 1：至少运行 `packages/server（Wave-10 已删除）/src/app.test.ts`、`packages/server（Wave-10 已删除）/src/bootstrap/startup.test.ts`、`packages/server（Wave-10 已删除）/src/config.test.ts`，并确认 `ARCHITECTURE.md`、`SYSTEM_TRUTH_SOURCES.md` 与相关 README 已回写 ownership / allowlist。
- Phase 2：至少运行 `packages/server（Wave-10 已删除）/src/routes/operations/status.test.ts` 与 async/runtime 相关测试，确认 `/v1/operations/status/async` contract、`workflow_runs.stats` checkpoint source 和 failure taxonomy 已冻结。
- Phase 2：同时确认 runtime metrics 采用“logical terminal outcome + separate retry attempts”语义，且 route/worker/internal client/operator status 的 canonical error kind 映射没有漂移。
- Phase 3：至少运行 `packages/server（Wave-10 已删除）/src/routes/operations/status.test.ts`、`packages/server（Wave-10 已删除）/src/routes/operations/stats.test.ts`、`packages/server（Wave-10 已删除）/src/config.test.ts`，确认 operatorHome / configGovernance / capacityModel / bulkOperations 以及 cache invalidation summary 已落地。
- Phase 4：至少运行本轮 closeout 相关测试与守卫，确认 truth-source 回写、active-execution 边界和 closeout 规则已固定。

**Phase 4 Adapter Env / Target Freeze Checks:**
- 最小验证矩阵：
  - `rtk pnpm check:docs-drift`
  - `rtk pnpm check:structure`
- 验证重点：Phase 4 只冻结 selector env、provider-specific env、推荐 profile/target 组合、fail-fast / fallback 规则与 optional dependency / target-pruning 文档边界，不宣称新的 runtime refactor。
- 关闭条件：只有在 remediation detail plan、`SYSTEM_TRUTH_SOURCES.md`、`PACKAGES.md`、`ENVIRONMENT.md`、`DEPLOYMENT.md`、`TESTING.md` 已同步更新，且三条 focused checks 实际通过并记录到 phase report 后，才能勾选 Wave 4A-4C。

**Phase 5 Distributed Baseline Freeze Checks:**
- 最小验证矩阵：
  - `rtk pnpm check:docs-drift`
  - `rtk pnpm check:structure`
- 验证重点：Phase 5 只冻结 distributed maturity baseline、gateway-only external access、shared PostgreSQL transitional posture、真实内部 hop 证据、compose 当前拓扑限制与 deferred platform boundary；不引入新的 runtime behavior。
- 关闭条件：只有在 remediation detail plan、`SYSTEM_TRUTH_SOURCES.md`、`PACKAGES.md`、`DEPLOYMENT.md`、`TESTING.md` 已同步更新，且三条 focused checks 实际通过并记录到 phase report 后，才能勾选 Wave 5A-5C。

**Phase 6 Mature Capability Freeze Checks:**
- 最小验证矩阵：
  - `rtk pnpm check:docs-drift`
  - `rtk pnpm check:structure`
- 验证重点：Phase 6 只冻结 mature-capability / library-replacement truth 边界，明确 `internal client + resilience`、`tracing + metrics`、`rate limiting + bulkhead / 背压`、`cache + invalidation`、`service discovery`、`DB budget / PgBouncer`、`health indicator`、`light` / `heavy` posture 与 graph runtime config 的 current-vs-deferred 边界；不引入新的 runtime behavior。
- 关闭条件：只有在 remediation detail plan、`SYSTEM_TRUTH_SOURCES.md`、`PACKAGES.md`、`ENVIRONMENT.md`、`TESTING.md` 已同步更新，且三条 focused checks 实际通过并记录到 phase report 后，才能勾选 Wave 6A-6F。

**Phase 7 Maintainability / CI-Testing Truth / Documentation Closeout Checks:**
- 最小验证矩阵：
  - `rtk pnpm check:docs-drift`
  - `rtk pnpm check:structure`
  - `rtk pnpm check:deps`
  - `rtk pnpm check:md-lint`
  - `rtk pnpm check:links`
  - `rtk pnpm check:doc-references`
  - `rtk pnpm eval:smoke`
- 验证重点：Phase 7 只冻结 current active execution surface、historical/deferred doc role、CI job truth、eval command semantics、以及 deferred landing spot wording；不引入新的 runtime behavior。
- CI/testing truth 解释：
  - `pnpm run ci` 是当前仓库聚合 CI 本地入口。
  - `pnpm eval:smoke` 是 smoke tier 的统一 eval 聚合器。
  - `pnpm eval:ci` 是 baseline-aware CI eval runner 的默认 smoke tier 入口。
  - `pnpm eval:ci:core` 是同一 CI runner 的 core tier 入口；secondary docs 不应改写为别的用户面命令。
- 关闭条件：只有在 remediation detail plan、`SYSTEM_TRUTH_SOURCES.md`、`docs/README.md`、`docs/todos/README.md`、`docs/archived/README.md`、`CI_CD.md`、必要时 `REPO_STRUCTURE.md` 已同步更新，且四条 focused checks 实际通过并记录到 phase report 后，才能勾选 Wave 7A-7C。

### 目录结构

```text
evals/
├── scripts/
│   └── eval-all.ts          # 统一运行器
├── retrieval/
│   ├── run.ts               # 检索运行器入口
│   ├── smoke.ts / core.ts   # 分层数据集导出
│   ├── datasets/            # 测试用例定义
│   ├── scenarios/           # Fixture 状态定义
│   └── lib/                 # 运行器基础设施
├── summary/
│   ├── run.ts               # 摘要运行器入口
│   ├── smoke.ts / core.ts   # 分层数据集导出
│   ├── datasets/            # 测试用例定义
│   ├── scenarios/           # Fixture 状态定义
│   └── lib/                 # 评判器和评分基础设施
├── agent-planning/
│   ├── run.ts               # 路径规划评测运行器入口
│   ├── smoke.ts / core.ts   # 分层数据集导出
│   ├── datasets/            # case 数据
│   ├── scenarios/           # task/context 场景
│   └── lib/                 # actor/judge/scoring/report 基础设施
├── label-alignment/
│   ├── run.ts               # 标签对齐评测运行器入口
│   ├── smoke.ts / core.ts   # 分层数据集导出
│   ├── fixtures/            # 标注 Skill fixture
│   └── lib/                 # recall/decision/metrics/report 基础设施
├── graph-extraction/
│   ├── run.ts               # 图提取运行器入口
│   ├── fixtures.ts          # 标注 ground truth fixtures
│   ├── dedup-eval.ts        # 去重评测
│   └── conflict-eval.ts     # 冲突评测
└── ingestion/
    ├── run.ts               # 摄取运行器入口
    ├── adapter.ts           # 摄取适配器
    ├── assertions.ts        # 摄取断言
    ├── metrics.ts           # 摄取指标
    └── fixtures/            # 摄取用例固定数据
```

---

## 运行测试

### 单元测试

```bash
# 运行所有包的测试
pnpm test

# 按包运行
pnpm --filter @trapmap/server test
pnpm --filter @trapmap/cli test
pnpm --filter @trapmap/contracts test

# 覆盖率报告
pnpm test:coverage

# 类型检查
pnpm typecheck
```

### Langfuse Observation 测试

Langfuse 相关测试覆盖三类：policy 验证、sink 工厂、NestJS service 生命周期。

```bash
# Langfuse policy 验证（contracts 层）
rtk pnpm test:file -- packages/contracts/src/domain/observability-config.test.ts

# Langfuse sink 工厂（host-local 组合边界）
rtk pnpm test:file -- packages/host-local/src/nest/observability/langfuse-sink.test.ts

# Langfuse NestJS service（host-local 生命周期）
rtk pnpm test:file -- packages/host-local/src/nest/observability/langfuse.service.test.ts

# Vendor-neutral observation wrapper（ai-providers 层）
rtk pnpm test:file -- packages/ai-providers/src/observability.test.ts

# 全部 observability closeout（包含 Langfuse）
pnpm test:observability-closeout
```

测试要点：

- Policy 验证：disabled/enabled 切换、凭证缺失、flush timeout 边界、隐私模式
- Sink 工厂：`createLangfuseSinkFromEnv()` 返回 null sink when disabled、创建 sink when enabled、client 错误处理、bounded flush timeout
- Service 生命周期：disabled mode 降级、SDK 初始化、shutdown timeout、SDK import failure、observation forwarding
- Wrapper：privacy（不泄露 raw prompts/outputs/vectors）、sink failure 降级、correlation ID 传播（含 getter 函数）、model field 使用实际 provider name

### Deployment / Runtime 最小验证矩阵

完成 deployment flexibility 相关改动后，至少运行以下命令：

### Retrieval Live Snapshot Checks

- 真实库快照导出：运行 `rtk pnpm eval:retrieval:snapshot:export --output <path> [--teamId <teamId>]`，确认输出 JSON 只包含 retrieval eval 回放所需的 knowledge/artifact/graph 文档，而不是全库转储。
- 快照场景回放：让某个 retrieval scenario 使用 `snapshot.kind='retrieval-db-snapshot'` + `snapshot.path`，确认 runner 会先恢复快照再执行 case，并且 scenario actor 可以覆盖快照自带 actor。
- 最小验证：至少运行相关 contracts 测试与 `rtk pnpm test:file -- evals/retrieval/lib/adapters.test.ts`；如果快照被接入 smoke/core 数据集，再补 `rtk pnpm eval:retrieval:smoke` 或 `rtk pnpm eval:smoke`。

### Live Retrieval Eval（真实后端）

Live eval 在真实 TrapMap 服务实例上运行检索评测，使用命名 snapshot 版本控制数据变量。

**两种恢复模式**：
- `frozen`：快照包含完整派生状态（embedding、keyword、capsule index），恢复时只导入不重算。适用于回归检测。
- `rebuild`：快照只含 source 数据，恢复时触发完整 indexing pipeline。适用于验证派生链路。

**断言稳定性**：
- `stable`：governance、outcome、shape 结构断言在任何兼容 snapshot version 上必须 pass。
- `version-sensitive`：排序、Hit@K 等断言用于版本间对比，不导致硬性失败。

**最小验证矩阵**：

| 检查项 | 命令 |
|---|---|
| Live eval contracts 测试 | `rtk pnpm test:file -- evals/retrieval-live/lib/live-eval.test.ts` |
| Snapshot fixture 加载 | `rtk pnpm test:file -- evals/retrieval-live/lib/live-eval.test.ts`（loadSnapshot 测试） |
| Snapshot 版本导出 | `rtk pnpm eval:retrieval:snapshot:export --version test-export --output /dev/null` |
| Live eval dry-run | `rtk pnpm eval:retrieval:live --snapshot-version test-smoke-baseline --base-url http://localhost:3000 --dry-run` |

**全量验证**（需要运行中的 TrapMap 服务）：

```bash
# 1. 启动服务
rtk pnpm dev

# 2. 导出 snapshot（如已有可跳过）
rtk pnpm eval:retrieval:snapshot:export --version 2026-07-baseline --teamId <teamId>

# 3. 运行 live eval
TRAPMAP_LIVE_EVAL_TOKEN=<token> rtk pnpm eval:retrieval:live:smoke \
  --snapshot-version 2026-07-baseline \
  --base-url http://localhost:3000 \
  --json --json-path ./reports/live-smoke.json

# 4. 对比两个版本
rtk pnpm eval:retrieval:live:compare \
  --baseline ./reports/live-baseline.json \
  --current ./reports/live-current.json
```

```bash
# @trapmap/host-local closeout 主链路固定为 build -> start -> observability-benchmark
pnpm --filter @trapmap/host-local build
pnpm --filter @trapmap/host-local start

# host-local observability closeout: readiness/liveness probes + request/trace/metrics/log chain
pnpm test:observability-closeout

# fixed latency/memory baseline for /health and /metrics
pnpm test:observability-benchmark -- --base-url http://127.0.0.1:4000

# service discovery closeout: consul adapter, dynamic resolver, cache, round-robin fallback
pnpm test:discovery-closeout

# distributed split acceptance: gateway forwarding, remote write delegation,
# error semantics, auth/header propagation, runtime/job ownership
pnpm test:distributed-closeout

# profile / preset / runtime / route exposure / CLI gateway-only 关键切片
pnpm test:deployment-smoke

# deployed runtime operator closeout via existing async status contract
pnpm test:runtime-closeout

# runtime metadata / readiness / ownership / startup foundations
pnpm test:runtime-foundations

# target registry-derived verification entrypoints
pnpm test:light-target
pnpm test:heavy-target

# 全局类型检查
pnpm typecheck

# 文档叙事与命令示例一致性
pnpm check:docs-drift
```

`@trapmap/host-local` closeout 主链路固定为 `build -> start -> observability-benchmark`。`dev` 仅用于开发便利，不作为 closeout 完成判据；`@trapmap/server build` 的全量清障也不在本轮范围内。

当改动涉及 `packages/host-distributed` 的 candidate/review/maintenance/decay authoritative write path、gateway auth 透传、internal client 失败语义、或 distributed job runtime ownership 时，`pnpm test:distributed-acceptance` 是必跑门，不应只用 `test:deployment-smoke` 代替。

该门当前聚合的 acceptance 证据包括：

- gateway 对 candidate resolution / manual result / review / maintenance / decay / job-runtime 路由的分布式转发
- internal client 的 `x-request-id` / `x-trace-id` 透传，以及 `404 / 403 / 409 / 503 / 504` 失败语义保持
- governance-review 对 knowledge-write 的 authoritative write 委托
- knowledge-write internal command surface 稳定性
- distributed job-runtime service config / ownership 的 focused assertions

建议的手动 smoke 步骤：

```bash
# local-agent
pnpm dev:local-agent
pnpm dev:cli -- login --access-key <key>
pnpm dev:cli -- retrieval search "postgres queue"

# distributed
pnpm dev:distributed:gateway
pnpm dev:distributed:candidate-worker
pnpm dev:distributed:governance-worker
pnpm dev:distributed:outbox-worker
pnpm dev:cli -- retrieval search "capsule recall"
```

`distributed` 手动 smoke 的判定标准是：CLI 始终只连 gateway，而不是直接访问 worker 进程。

补充判定：

- `local-agent` 裁剪掉的治理/团队/运维 API 应返回 `501 capability_unsupported`。
- `distributed` worker runtime 命中业务 API 时也应返回 `501 capability_unsupported`，表明 gateway 才是正式入口。

为了把 acceptance 级证据提升为可重复 closeout，本仓库现在把 `pnpm test:distributed-acceptance` 视为两层证据的聚合入口：

- acceptance 层：单测试进程内的真实 internal HTTP hop，证明 gateway 转发、knowledge-write 委托、error/header/auth 语义不依赖 fetch mock
- runtime closeout 层：`packages/host-distributed/src/gateway/distributed-runtime-closeout.test.ts` 会启动多个独立 Node 子进程，固定化 `gateway -> candidate-ingestion/governance-review -> knowledge-write -> job-runtime` 联调序列，并记录 queue reclaim、outbox retryable/dead-letter/stale-processing reclaim 证据

该 closeout 测试当前固定覆盖：

- candidate resolution 经 gateway 命中 candidate-ingestion，再委托 knowledge-write 完成 authoritative write
- knowledge review approve 经 gateway 命中 governance-review，再委托 knowledge-write 完成 authoritative write
- request/trace headers 在跨进程 knowledge-write hop 保持透传
- gateway auth 仅通过 identity-access 校验 session；内部服务不直接消费外部 bearer token
- 非 `2xx` body 与 `403 / 404 / 409 / 503 / 504` 失败语义在跨进程路径保持稳定
- job-runtime schedule/status/queue 与 stale-running reclaim 至少有一组 focused 恢复证据
- outbox retryable failure 会回到可恢复路径，permanent failure 会进入 operator-visible failed/dead-letter 证据，stale processing reclaim 会回到 pending

部署级 operator closeout 使用单独入口：

```bash
pnpm test:runtime-closeout
```

它要求运行中的 gateway 支持现有 `/v1/auth/login` 与 `/v1/operations/status/async`，并验证：

- `deploymentProfile === "distributed"`
- gateway 仍是对外唯一入口，operator 通过 async status contract 观察 queue/outbox
- `queue.reclaimCount`、`queue.recentDeadLetters`、`outbox.staleProcessing`、`outbox.reclaimCount`、`outbox.recentFailures` 对 operator 可见
- retry / dead-letter policy 继续以 `retryResumeContract` 为唯一事实源

真实 Compose distributed 验收使用：

```bash
rtk pnpm test:runtime-closeout:compose
```

该脚本只拉起 PostgreSQL、gateway 和六个内部服务，生成一次性管理员密钥与空闲 gateway 端口。它在重启一个 `knowledge-write` 容器时要求 gateway `/health` 和经认证的 `/v1/operations/status/async` 持续成功，并测量 gateway → governance-review → knowledge-write 的恢复时间（必须少于 60 秒）。失败时输出 gateway、knowledge-write、governance-worker、outbox-worker 日志，所有路径都会执行 `docker compose down --volumes --remove-orphans`。该验收证明本地故障隔离，不是生产 SLO 或 Level 3 声明。

### Phase 4 验证归属矩阵

Phase 4 把验证矩阵固定为两类部署形态，不再依赖隐式经验解释成功路径。当前默认本地入口已经是 `packages/host-local/src/nest/**`；distributed 主线仍由 `host-distributed` 承担。

#### Backend target commands

| Target | Profile | Host owner | Build | Verification |
|---|---|---|---|---|
| `light` | `local-agent`、`team-monolith` | `@trapmap/host-local` | `pnpm build:light` | `pnpm test:light-target`（deployment smoke、runtime foundations） |
| `heavy` | `distributed` | `@trapmap/host-distributed` | `pnpm build:heavy` | `pnpm test:heavy-target`（light checks 加 discovery、distributed、runtime closeout） |

The registry at `scripts/backend-target-registry.ts` is the command mapping owner.
`heavy` proves the current transitional distributed topology only; it does not prove
physical database isolation, Kubernetes, mTLS, an independent control plane, or
capability parity with `light`.

#### 单体验证（`host-local` 默认轻宿主）

| 验证层 | 命令 | 说明 |
|---|---|---|
| 包级最小测试 | `pnpm --filter @trapmap/<pkg> test --run <path>` | 各包独立测试；`host-local`、`backend-core`、`service-*`、`contracts` |
| 类型检查 | `pnpm typecheck` | 全 workspace 类型检查 |
| Observability closeout | `pnpm test:observability-closeout` | health/readiness probes + request/trace/metrics/log 关联链路 |
| Deployment smoke | `pnpm test:deployment-smoke` | profile / preset / runtime / route exposure / CLI gateway-only 关键切片 |
| Runtime foundations | `pnpm test:runtime-foundations` | runtime metadata / readiness / ownership / startup foundations |
| 文档守卫 | `pnpm check:docs-drift` + `pnpm check:structure` | 文档叙事与命令示例一致性、目录规则 |
| Eval smoke | `pnpm eval:smoke` | **仅在**检索/摘要/治理/feedback/eval runner 相关改动时纳入 |

`packages/host-local/src/nest/**` 若有改动，应额外运行其包级测试或 focused Nest 相关测试；但它当前不是 root `dev:local-agent` / `dev:team-monolith` 的默认入口。

#### 分布式验证（`host-distributed` 主线）

| 验证层 | 命令 | 说明 |
|---|---|---|
| Discovery closeout | `pnpm test:discovery-closeout` | consul adapter、dynamic resolver、TTL cache、round-robin fallback |
| Distributed acceptance | `pnpm test:distributed-closeout` | gateway 转发、remote write 委托、error/header/auth 语义、job ownership |
| Runtime closeout | `pnpm test:runtime-closeout` | 部署级 operator closeout，async status contract，queue/outbox reclaim |
| 全部单体验证层 | （同上） | 分布式验证不替代单体验证，两层独立运行 |

根计划最终关闭补充说明：

- 仅当本轮变更停留在文档、守卫和计划关闭时，不需要再把实现型 `deployment-smoke` / `runtime-foundations` / `distributed-acceptance` 重新当作必跑门。
- 这种纯收尾审计仍必须保留 contracts、badcase export 和 distributed closeout 的 focused proof，以防旧口径把 `debug` / `draft` 边界、传播证据或 deferred seam 写回旧描述。

#### Owner Service 验证归属

| Owner Service | 包级测试 | 分布式 acceptance | 说明 |
|---|---|---|---|
| `gateway` | `host-local` / `host-distributed` | gateway forwarding, auth propagation | 不拥有业务真相 |
| `identity-access` | `service-identity-access` | auth/session 校验 | 基础 owner service |
| `knowledge-read` | `service-knowledge-read` | retrieval projection freshness | 只解释读侧 |
| `knowledge-write` | `service-knowledge-write` | knowledge-write internal command surface | 写侧真相 owner |
| `governance-review` | `service-governance-review` | governance-review → knowledge-write 委托 | 治理命令 owner |
| `candidate-ingestion` | `service-candidate-ingestion` | candidate resolution → knowledge-write 委托 | 候选 owner |
| `job-runtime` | `service-job-runtime` | job-runtime schedule/status/queue, reclaim | 只拥有 runtime substrate |

#### Phase 4 Closeout 必跑门

若本轮改动涉及 runtime、host、distributed hop、operator surface 或实现行为收尾，Phase 4 implementation closeout 前以下验证必须全部通过：

1. 受影响包最小测试集合
2. `pnpm typecheck`
3. `pnpm test:deployment-smoke`
4. `pnpm test:runtime-foundations`
5. `pnpm test:discovery-closeout`
6. `pnpm test:distributed-closeout`（含 runtime closeout 层）
7. `pnpm check:docs-drift` + `pnpm check:structure`
8. `pnpm eval:smoke`（仅在检索/摘要/治理/feedback/eval runner 相关改动时）

Phase 4 最小真实落地补充：

- distributed 资源治理当前真实可测的默认值只到 DB pool budget env seam：`TRAPMAP_SERVICE_POOL_SIZE` 与 `TRAPMAP_<SERVICE>_POOL_SIZE`
- focused proof 先看 `packages/host-distributed/src/job-runtime/ownership-acceptance.test.ts`，确认 shared default 与 per-service override 都能进入 `loadServiceConfig()`
- operator runbook 当前仍以现有 `/health`、`/ready`、`/metrics`、`/v1/operations/status/async` 为入口，不新增第二套 runtime control plane
- dashboard/alert/SLO 当前已冻结为首批 operator 文档面：task queue、internal hop latency、error rate 三组指标必须有 dashboard/alert/SLO 说明，但仍不要求新增 checked-in Grafana/Prometheus asset
- root-plan closeout 的最小文档证据应能回答 operator runbook、dashboard/alert/SLO、以及 active-vs-archived 索引状态三件事

若本轮只是根计划 Phase 4 的最终收口审计，且未改 runtime/API/operator 实现面，则使用更小的 root-plan closeout 集合：

1. `pnpm test:file -- packages/contracts/src/domain/operations.test.ts`
2. `pnpm test:file -- packages/server（Wave-10 已删除）/src/routes/operations/badcases.test.ts`
3. `pnpm test:observability-closeout`
4. `pnpm test:discovery-closeout`
5. `pnpm test:file -- packages/host-distributed/src/gateway/distributed-runtime-closeout.test.ts`
6. `pnpm typecheck`
7. `pnpm check:docs-drift` + `pnpm check:structure`
8. `pnpm eval:smoke`

### 评测（Eval）

#### 本地运行

```bash
# Smoke 层（快速，~10s）
pnpm eval:smoke

# Core 层（完整，~60s）
pnpm eval:core

# 仅检索评估
pnpm eval:retrieval:smoke
pnpm eval:retrieval:core

# 仅摘要评估
pnpm eval:summary:smoke
pnpm eval:summary:core

# 仅路径规划评估
pnpm eval:agent-planning:smoke
pnpm eval:agent-planning:core

**`--runner native|promptfoo` 双轨选项（agent-planning 参考实现）**

- 默认 `native`，语义不变。`promptfoo` 走 SuiteBridge 执行引擎（确定性 fallback 下与 native 逐 case 判定一致）。
- `--runner` 现支持 agent-planning、graph-extraction、ingestion 三个 suite（其余 suite 为 strict parseArgs，暂不转发）。
- 验证命令：
  - `rtk pnpm eval -- agent-planning --tier smoke --dry-run --runner promptfoo`
  - `rtk pnpm test:file -- evals/promptfoo/parity-agent-planning.test.ts`
  - `rtk pnpm test:file -- scripts/__tests__/run-eval.test.ts`
  - `rtk pnpm eval:graph-extraction --dry-run --runner promptfoo`
  - `rtk pnpm eval:ingestion --tier smoke --dry-run --runner promptfoo`（注意用 `--tier smoke`，run-eval 不接受 `--smoke`）
  - `rtk pnpm test:file -- evals/promptfoo/parity-graph-extraction.test.ts`
  - `rtk pnpm test:file -- evals/promptfoo/parity-ingestion.test.ts`

# 仅标签对齐评估
pnpm eval:label-alignment:smoke
pnpm eval:label-alignment:core

# 仅图提取评估
pnpm eval:graph-extraction:smoke

# 仅摄取评估
pnpm eval:ingestion:smoke

# 详细输出（逐用例结果）
pnpm eval:smoke -- --verbose

# Dry-run（验证用例格式，不执行）
pnpm exec tsx evals/scripts/eval-all.ts --tier smoke --dry-run --allow-empty
```

### 模拟 CI 运行

```bash
# 模拟 CI smoke
pnpm eval:ci

# 模拟 CI core
pnpm eval:ci:core

# 查看 JSON 报告
cat reports/eval-report.json
```

### PostgreSQL 全量评测（Docker 环境）

当需要在 Docker + PostgreSQL 环境下验证检索/摘要/图提取/摄取的端到端行为时，使用以下命令集。
需要 `.env` 中配置 `TRAPMAP_DATABASE_URL` 或 `DATABASE_URL`，且 `trapmap-postgres` 容器正在运行。
如果在 Codex 中执行，按仓库约定为这些命令加上 `rtk` 前缀。

```bash
# 确保 .env 已加载（eval runner 不自动读取 .env）
set -a && source .env && set +a

# 检索 core 评测（PG-backed，JSON 报告）
pnpm eval:retrieval --tier core --json --json-path reports/eval/retrieval-core-postgres.json

# 摘要 core 评测（fallback provider，JSON 报告）
pnpm eval:summary --tier core --provider fallback --json --json-path reports/eval/summary-core-postgres.json

# 图提取 smoke（捕获 live/fallback 文本证据）
pnpm eval:graph-extraction --smoke | tee reports/eval/graph-extraction-smoke-live.txt

# Duplicate eval（Phase 3 trap+skill duplicate recall）
pnpm eval:dedup --dry-run | rg 'real-trap-exact-rmrf-quill'
pnpm eval:dedup --dry-run | rg 'real-semantic-handoff-vs-doccoauthoring|real-none-postgres-tuning-vs-backup'
pnpm eval:dedup --dry-run | rg 'real-trap-exact-rmrf-quill|real-semantic-handoff-vs-doccoauthoring|real-none-postgres-tuning-vs-backup'

# Queue dedupe + duplicate trace（Phase 4）
pnpm exec vitest run \
  packages/server（Wave-10 已删除）/src/lib/queue/task-queue.test.ts \
  packages/server（Wave-10 已删除）/src/lib/candidates/processor.test.ts \
  packages/server（Wave-10 已删除）/src/__tests__/candidate-pipeline.test.ts

pnpm exec vitest run \
  packages/contracts/src/domain/candidates.test.ts \
  packages/server（Wave-10 已删除）/src/lib/candidates/detector.test.ts \
  packages/server（Wave-10 已删除）/src/lib/candidates/pg-detector.test.ts \
  packages/server（Wave-10 已删除）/src/lib/candidates/pg-repository.test.ts \
  packages/server（Wave-10 已删除）/src/lib/persistence/__tests__/schema-candidates.test.ts

# 摄取 smoke（捕获文本证据）
pnpm eval:ingestion:smoke | tee reports/eval/ingestion-smoke-postgres.txt
```

**注意：** eval runner 通过 `loadAiProviderConfig()` 读取环境变量，不会自动加载 `.env` 文件。
如不 source `.env`，retrieval、summary、graph extraction、ingestion 都可能读取不到 PostgreSQL 或 AI provider 配置，导致结果失真或直接回退。
图提取日志中如果出现 `WARNING: Chat provider not configured` 或 `DEGRADED`，该次运行只能记为 degraded。
摘要 multi-fact 用例需要真实 embedding provider（如 Google GenAI），fallback embedding 可能无法召回该用例的 capsule。
`eval:dedup` 当前不会按 fixture id 过滤执行，因此上面的 `rg` 命令用于从完整报告中聚焦 Phase 3 的 trap-only、skill-only 与 mixed case 行。
Phase 4 的 queue-dedupe 验证不需要额外环境变量；只要 PostgreSQL schema 已应用到包含 `task_queue_dedupe_pending_idx` 与 `candidate_analyses.duplicate_trace` 的最新 migration 即可。

### 持久化评测证据

评测产出的报告文件存储在 `reports/eval/` 下：

| 文件 | 内容 |
|------|------|
| `retrieval-core-postgres.json` | 检索 core 层全量 JSON 结果 |
| `summary-core-postgres.json` | 摘要 core 层全量 JSON 结果 |
| `graph-extraction-smoke-live.txt` | 图提取 smoke 文本输出；必须检查 `Mode Breakdown` 和 `DEGRADED`/unavailable/error/empty 提示 |
| `ingestion-smoke-postgres.txt` | 摄取 smoke 文本输出 |

### 文档漂移与复杂度守卫

每次结构重构后应运行以下守卫，确保文档与代码一致且热点文件未超出行数预算：

```bash
# 检查关键文档是否包含/排除预期短语（规则见 scripts/complexity-budgets.json docRules）
pnpm check:docs-drift

# 检查所有 Markdown 中的 Mermaid 图语法是否可解析
pnpm check:mermaid

# 检查热点文件是否在行数预算内（规则见 scripts/complexity-budgets.json lineBudgets）
pnpm check:complexity
```

CI 中由 `doc-guardrails` job 自动执行。本地开发时可在改动 Mermaid 图、热点文件或架构文档后手动运行。

push CI 还会运行全仓 `fallow` 质量门：

```bash
pnpm check:fallow
```

它要求未使用导出/文件、重复代码、循环依赖和复杂度问题为零，不替代 `pnpm check:complexity`。

### Runtime Foundations Verification

当改动 request context、health/readiness、shared resilience、queue/outbox worker 可靠性时，至少运行以下验证矩阵：

```bash
# Runtime surface
pnpm test -- --run \
  packages/server（Wave-10 已删除）/src/app.test.ts \
  packages/server（Wave-10 已删除）/src/lib/runtime/runtime-metadata.test.ts \
  packages/server（Wave-10 已删除）/src/config.test.ts

# Shared resilience primitives
pnpm test -- --run \
  packages/server（Wave-10 已删除）/src/lib/runtime/resilience.test.ts \
  packages/server（Wave-10 已删除）/src/lib/runtime/metrics.test.ts \
  packages/server（Wave-10 已删除）/src/lib/candidates/processor.test.ts \
  packages/server（Wave-10 已删除）/src/bootstrap/startup.test.ts \
  packages/server（Wave-10 已删除）/src/lib/indexing/graph-lite/llm-extract.test.ts

# Async reliability
pnpm test -- --run \
  packages/server（Wave-10 已删除）/src/lib/queue/task-queue.test.ts \
  packages/server（Wave-10 已删除）/src/lib/lifecycle/outbox.test.ts \
  packages/server（Wave-10 已删除）/src/__tests__/candidate-pipeline.test.ts \
  packages/server（Wave-10 已删除）/src/lib/lifecycle/subscribers/subscribers-integration.test.ts \
  packages/server（Wave-10 已删除）/src/routes/candidates.test.ts

# Docs and guardrails
pnpm check:docs-drift
pnpm check:deps
pnpm check:md-lint
pnpm check:links
```

说明：

- 共享 runtime metrics 当前是内部/test-visible snapshot，不要求稳定对外 endpoint 验证
- `/ready` 在 `readiness === "not-ready"` 时应返回 HTTP `503`
- PostgreSQL 模式下，`queueWorker` 和 `outboxWorker` 都应纳入 readiness 解释
- 如果更改了 runtime doc contract，需要同步更新 `SYSTEM_TRUTH_SOURCES.md` 与 `scripts/complexity-budgets.json` 中对应的 docRules
- 如果更改了统一 instrumentation contract，需要同步更新 `SYSTEM_TRUTH_SOURCES.md`、`docs/archived/archived-plans/instrumentation-observability-plan.md` 和相关 architecture/reference 文档；其中 `observability.ts` 必须继续作为 correlation key / workflow correlation / failure taxonomy / public-internal 边界的唯一共享入口

### 按变更类型的验证矩阵

| 变更类型 | 必须运行的验证 |
|----------|--------------|
| 文档修改 | `pnpm check:docs-drift` + `pnpm check:mermaid` + `pnpm check:deps` + `pnpm check:md-lint` |
| 命令范围变更 | `pnpm check:docs-drift` + smoke 测试（验证包级 DB 命令和 JSON 回退路径） |
| 环境默认值变更 | `pnpm check:docs-drift` + smoke 测试（验证 ENVIRONMENT.md 中的默认值正确） |
| 深层架构文档变更 | `pnpm check:docs-drift` + smoke 测试（验证 ARCHITECTURE.md / PERSISTENCE.md 中的运行时默认值和表计数） |
| Schema 变更 (retrieval/artifact/eval) | `pnpm test` + `pnpm --filter @trapmap/contracts typecheck` + `pnpm eval:smoke` + `pnpm check:docs-drift` + 更新 `DATABASE_SCHEMA.md` 表计数 |

### 后端工程化总控阶段最小验证矩阵

| 阶段 | 最小验证 |
|---|---|
| `Phase 0` | `pnpm check:docs-drift` + `pnpm check:structure` |
| `Phase 1` | `pnpm test -- --run packages/server（Wave-10 已删除）/src/app.test.ts packages/server（Wave-10 已删除）/src/bootstrap/startup.test.ts packages/server（Wave-10 已删除）/src/config.test.ts` + `pnpm check:docs-drift` + `pnpm check:structure` |
| `Phase 2` | `pnpm test -- --run packages/server（Wave-10 已删除）/src/routes/operations/status.test.ts packages/server（Wave-10 已删除）/src/lib/runtime/runtime-metadata.test.ts packages/server（Wave-10 已删除）/src/config.test.ts` + `pnpm check:docs-drift` + `pnpm check:structure` |
| `Phase 3` | `rtk pnpm check:docs-drift` + `rtk pnpm check:structure` |
| `Phase 4` | 本轮相关测试 + `pnpm check:docs-drift` + `pnpm check:structure`；只有在 truth-source、计划边界和 closeout 规则回写完成后才能勾选根 `plan.md` |
| CI 配置变更 | `pnpm check:docs-drift` + 更新 `CI_CD.md` |
| 架构变更 | `pnpm check:docs-drift` + `pnpm check:mermaid` + `pnpm check:complexity` + `pnpm eval:smoke` |
| 脚本/守卫变更 | `pnpm test -- --run scripts/__tests__/check-doc-drift.test.ts` + `pnpm check:docs-drift` |
| 摘要生成变更 (`summary.ts`) | `rtk pnpm test -- --run packages/server（Wave-10 已删除）/src/lib/retrieval/response/summary.test.ts evals/summary/__tests__/runner-api.test.ts` + `pnpm eval:summary:smoke` |
| 评测命令变更 | `pnpm check:docs-drift` + smoke 测试（验证 EVALUATION.md / TESTING.md 中的 eval 命令正确） |
| 贡献指南变更 | `pnpm check:docs-drift` + smoke 测试（验证 CONTRIBUTING.md 中的 DB 命令格式） |

### 文档维护工作流

当修改某个权威源（truth source）时：

1. 更新权威源文件本身
2. 查阅 [`DOCS_TRUTH_MATRIX.md`](../reference/DOCS_TRUTH_MATRIX.md) 找到所有二级文档
3. 更新所有二级文档
4. 运行 `pnpm check:docs-drift` 确认无漂移
5. 如添加了新的漂移类别，在 `scripts/complexity-budgets.json` 中添加对应的 `docRules`

### CI 自动触发

| 触发条件 | 层级 | 说明 |
|----------|------|------|
| PR 到 main（修改 evals/、server/、contracts/） | Smoke | 快速回归检测 |
| 每周一 06:00 UTC | Core | 全面质量检查 |
| GitHub Actions 手动触发 | Smoke/Core | 可选层级 |

CI 配置位于 `.github/workflows/eval.yml`。

---

## 检索评估指标

| 指标 | 含义 | 目标值 |
|------|------|--------|
| Hit@1 | 首条结果即为相关条目 | > 0.8 |
| Hit@5 | 前 5 条包含相关条目 | > 0.9 |
| MRR | 相关条目排名倒数均值 | > 0.7 |
| nDCG | 归一化折损累积增益 | > 0.7 |

### Pass/Fail 与排名指标

检索用例的 `passed` 状态基于 outcome 和 governance 断言，不依赖排名指标：

- **Pass 条件**: 用例的 `outcome`（空/非空）和 `governance`（无禁止 ID 泄漏）断言均通过
- **排名指标独立**: `Hit@1`、`MRR`、`nDCG` 可能在用例仍为绿色时发生回归
- **基线比较**: 使用 `eval-ci` 的基线比较功能检测排名漂移，不要仅依赖 pass/fail 状态
- **建议流程**: smoke 绿色后，对 core 层运行基线比较以确认排名稳定性

### 治理检查

治理检查与相关性指标分开追踪，确保高相关性不能掩盖权限泄漏：

| 失败类型 | 含义 | 排查方向 |
|----------|------|----------|
| `forbidden-hit` | 返回了应被过滤的条目 | 检查 RBAC、安全等级、生命周期状态 |
| `unexpected-empty` | 应有结果但为空 | 可能过度过滤 |
| `unexpected-non-empty` | 应为空但有结果 | 可能过滤不足 |
| `shape-mismatch` | 响应结构不符合契约 | 检查端点版本 |

### 标签过滤回归要求

任何检索过滤 bugfix 都必须在 smoke 层添加标签过滤回归用例，确保问题可在 `eval:smoke` 中被捕获，而不仅在 `eval:core` 中：

- **检索层**: 在 `evals/retrieval/datasets/smoke/` 中添加带 `filters.labels` 的 v2 用例
- **摘要层**: 在 `evals/summary/datasets/smoke/` 中添加带 `filters.labels` 和 `forbiddenClaims` 的摘要用例
- **场景层**: 在对应的 scenarios 文件中添加包含多标签 artifact 的 fixture

### Skill Lookup 检索评测边界

`/v1/retrieval/skills/search-by-content` 现在纳入 retrieval eval 合同边界，不再只依赖独立 route/helper 测试：

- **Smoke**: `v1-skill-lookup-positive-smoke` 验证 artifact-first 正向命中
- **Core**: `v1-skill-lookup-governance-core` 验证 artifact-first 返回在 mixed-visibility 场景下仍遵守治理边界
- **断言形状**: 该端点不使用 v1 bucket 或 v2 capsule 断言，而是通过 `expected.shape.expectedArtifactIds` 断言 artifact-first 返回集合
- **执行适配**: 评测 runner 保持统一 `request.seed` 数据集字段，执行时再映射到 live route 的 `text` 请求体

最小验证命令：

```bash
rtk pnpm test -- --run \
  evals/retrieval/lib/normalize.test.ts \
  evals/retrieval/lib/assertions.test.ts \
  evals/retrieval/lib/report.test.ts \
  evals/retrieval/datasets/retrieval-datasets.test.ts \
  evals/retrieval/runner.test.ts
```

---

## 摘要评估指标

| 维度 | 含义 | 检查方法 |
|------|------|----------|
| Groundedness | 摘要内容基于检索上下文 | 事实提取 + 交叉验证 |
| Coverage | 覆盖预期关键信息 | 关键点匹配率 |
| Hallucination | 不含源内容之外的声明 | 禁止声明检测 |

---

## 添加测试用例

### 添加检索用例

1. 在 `evals/retrieval/datasets/` 的合适文件中定义用例：

```typescript
import { retrievalEvalCaseSchema, type RetrievalEvalCase } from '@trapmap/contracts';

export const myCase = retrievalEvalCaseSchema.parse({
  schemaVersion: 1,
  caseId: 'my-case-id',
  tier: 'smoke',           // 'smoke' 或 'core'
  endpoint: '/v1/retrieval/search',
  request: {
    seed: '查询文本',
    mode: 'semantic',       // 'semantic' | 'hybrid' | 'graph-assisted'
    maxResults: 10,
  },
  scenarioId: 'my-scenario',
  expected: {
    outcome: 'non-empty',  // 'non-empty' 或 'empty'
    relevance: {
      relevantIds: ['entry_1', 'entry_2'],
      idealOrder: ['entry_1', 'entry_2'],  // 可选
    },
    governance: {
      forbiddenIds: [],
      forbiddenReasons: [],
    },
  },
}) as RetrievalEvalCase;
```

2. 在对应的层级文件（`smoke.ts` 或 `core.ts`）中导出：

```typescript
export const cases = [...existingCases, myCase];
```

3. 如需 Fixture 数据，在 `evals/retrieval/scenarios/` 中创建场景 JSON。

### 多路召回测试覆盖（v2 Multi-Recall Phase 2）

Phase 0-2 为 v2 多路召回管线补充了以下目标用例切片，用于验证 keyword/semantic/graph/heuristic 通道的召回收益：

**Core 层**:

| 切片 | 用例 ID | 说明 |
|------|---------|------|
| keyword-dominant | `v2-keyword-dominant-core` | 精确标签/术语命中（pnpm lockfile） |
| keyword-dominant | `v2-keyword-error-text-core` | 错误文本/文件路径召回（ENOENT nginx.conf） |
| semantic-dominant | `v2-semantic-paraphrase-core` | 同义改写查询 vs 技术术语（orchestration -> "running services together"） |
| semantic-dominant | `v2-semantic-debug-core` | 口语化查询 vs 专业术语（observability -> "figure out why broken"） |
| mixed-channel | `v2-mixed-channel-core` | 关键字+语义双通道命中/去重（TypeScript CI build） |

**Smoke 层** (Phase 2-3 新增):

| 切片 | 用例 ID | 说明 |
|------|---------|------|
| keyword-dominant | `v2-keyword-dominant-smoke` | 精确错误文本召回（ModuleNotFoundError） |
| keyword-dominant | `v2-keyword-regex-smoke` | 技术术语召回（regex pattern parsing） |
| semantic-dominant | `v2-semantic-dominant-smoke` | 口语化改写查询 vs 技术术语（"types going wrong" → type checking） |
| semantic-dominant | `v2-semantic-paraphrase-smoke` | 语义改写查询 vs 服务编排术语 |

这些用例使用独立的 scenario fixture（`core-keyword-dominant`、`core-semantic-paraphrase`、`core-mixed-channel`、`smoke-keyword-dominant`），不依赖生产数据。

**Phase 2 状态**: heuristic + keyword 双通道已激活。keyword 通道提供独立词法召回，字段权重: labels(3.0) > problem(2.5) > goal(2.0) > situation/contextualPrefix(1.5) > content(1.0)。

**Phase 3 状态**: heuristic + keyword + semantic 三通道已激活。semantic 通道通过 embedding 余弦相似度提供语义补召回，解决同义不同词问题。smoke 层新增 2 个 semantic-dominant 用例（paraphrase/rewording）。

**Phase 4 状态**: merge/rerank 两阶段正式落地。Coordinator 改为"channel recall → merge → rerank"三阶段管线：
1. 各通道独立召回 → `CapsuleRecallCandidate[][]`
2. Merge 层按 capsuleId RRF 去重融合 → `MergedCapsuleCandidate[]`
3. Rerank 层复用 v2 intent-aware 特征精排 → `CapsuleCandidate[]`

Trace 新增字段：`channelsPlanned`、`channelsUsed`、`mergeStats`（totalChannelCandidates / preMergeCount / postMergeCount）。Reason 格式升级为 "Matched via <channels>; ..." 以区分通道来源。

**测试覆盖**:
- 新增 `scoring/merge.test.ts` (9 tests): RRF 去重、preRerankScore 计算、空/单/多通道、自定义 k 值
- 新增 `scoring/rerank.test.ts` (8 tests): CapsuleCandidate 形状、maxResults、排序、多通道 reason、缺失 capsule 数据
- 新增 `scoring/reasons.test.ts` (9 tests): 通道名包含、特征百分比、阈值过滤、boost 显示、fallback
- 原有 retrieval 测试 (120 tests) 全通过，无回归

**Phase 4 merge/rerank 专项检查建议**:
- mixed-channel: 验证同一 capsule 被多通道命中时 RRF 合理融合
- top1 stability: baseline Hit@1 不因 merge/rerank 引入漂移（已确认：core v2 Hit@1=0.83 与 Phase 0 baseline 一致）
- regression safety: 当前 v2 baseline 核心 case 无退化
- channel trace: smoke/core 执行后确认 channelsPlanned/channelsUsed 正确记录

**Phase 5 状态**: `capsule-graph` 通道已接入。graph 通道通过 skill graph 做结构化扩召回，采用 `artifact-level graph hit → capsule 映射` 策略。使用工厂函数 `createCapsuleGraphChannel(graphIndexRepo)` 实现，注册于 heuristic/keyword/semantic 之后作为补召回通道。

Graph 通道工作机制：
1. 从 query 归一化图标签关键词（不再复用规则引擎）
2. 按 `sourceType: 'skill'` 过滤 graph 文档，构建图运行时快照
3. 通过 `expandSourcesOneHop()` 做实体匹配 + 邻居展开，获取候选 artifact ID
4. artifact ID → governed capsule 映射（仅返回治理交集内的 capsules）
5. `graphEvidence` 字段承载 query entity 列表用于审计追踪

**测试覆盖**:
- 新增 `capsule-graph-channel.test.ts` (19 tests): CapsuleRecallChannel 接口实现、graph 实体匹配、graph expansion、artifact-capsule 映射、governance 过滤、trap 文档过滤、空结果/边界/排序/形状验证
- 新增 evals:
  - Smoke: `v2-graph-assisted-co-occurs-smoke` (co-occurs 图边命中), `v2-graph-assisted-governance-smoke` (governance 安全)
  - Core: `v2-graph-assisted-co-occurs-core` (docker→kubernetes 扩展), `v2-graph-assisted-reverse-core` (kubernetes→docker 反向扩展)

**Phase 5 graph 通道专项检查建议**:
- graph-only recall: 验证图通道可独立召回 artifact 并映射到 capsule
- artifact-to-capsule mapping: 确认 artifact hit 后 capsule 召回准确，不遗漏
- non-dominance: 图结果进入 merge 层平等竞争，不独占最终排序
- governance safety: 图通道返回结果与治理 artifacts 取交集，不引入泄漏
- trap doc filtering: 仅使用 `sourceType: 'skill'` 的 graph 文档，trap 文档不参与 capsule 召回
- channel trace: 确认 `channelsPlanned` / `channelsUsed` 中 `capsule-graph` 通道正确记录

### Phase 4 Graph DB 验证矩阵

Phase 4 的重点不是让 Neo4j 改变召回哲学，而是验证同一 mixed retrieval 语义在不同 backend 模式下保持一致：

- vector-only baseline: `v2-graph-assisted-vector-only-smoke`
  - fixture: `smoke-graph-assisted-v2-no-graph`
  - 预期: 只返回 direct vitest capsule，用于对比“没有结构化补召回”时的 baseline。
- graph DB disabled baseline: `v2-graph-assisted-disabled-backend-smoke`
  - 环境: 不设置 `TRAPMAP_GRAPH_DB_ENABLED`
  - 预期: 结果与 graph hit case 一致，但 `routingTrace.graphRetrieval.backendMode` 应为 `disabled`。
- graph-enabled local hit: `v2-graph-assisted-co-occurs-smoke`
  - 环境: graph docs 存在；可用 backend 为 `memory` 或 healthy `neo4j`
  - 预期: `vitest` query 通过 local-neighborhood expansion 补召回 `jest` capsule。
- governance regression: `v2-graph-assisted-governance-smoke`
  - 预期: mixed recall 的最终结果仍然只来自治理允许集合。
- fail-open fallback: `v2-graph-assisted-fail-open-smoke`
  - 环境: `TRAPMAP_GRAPH_DB_ENABLED=true` 且 Neo4j 不可达，同时 `TRAPMAP_GRAPH_DB_FAIL_OPEN=true`
  - 预期: 结果与 local graph hit 一致，`routingTrace.graphRetrieval.backendMode` 应为 `enabled-fallback`。

建议最小执行顺序：

```bash
# 1. 默认 memory / disabled baseline
pnpm eval:smoke

# 2. healthy neo4j enabled
TRAPMAP_GRAPH_DB_ENABLED=true \
TRAPMAP_GRAPH_DB_PROVIDER=neo4j \
TRAPMAP_GRAPH_DB_URI=bolt://127.0.0.1:7687 \
TRAPMAP_GRAPH_DB_USERNAME=neo4j \
TRAPMAP_GRAPH_DB_PASSWORD=neo4j \
pnpm eval:smoke

# 3. fail-open fallback
TRAPMAP_GRAPH_DB_ENABLED=true \
TRAPMAP_GRAPH_DB_PROVIDER=neo4j \
TRAPMAP_GRAPH_DB_URI=bolt://127.0.0.1:65535 \
TRAPMAP_GRAPH_DB_USERNAME=neo4j \
TRAPMAP_GRAPH_DB_PASSWORD=neo4j \
TRAPMAP_GRAPH_DB_FAIL_OPEN=true \
pnpm eval:smoke
```

检查点：

- `v2-graph-assisted-vector-only-smoke` 与 `v2-graph-assisted-co-occurs-smoke` 的差异，证明 mixed recall 确实带来结构化补召回。
- `v2-graph-assisted-disabled-backend-smoke` 与 `v2-graph-assisted-fail-open-smoke` 的 `routingTrace.graphRetrieval.backendMode`，证明 disabled / fallback 路径都可观测。
- `v2-graph-assisted-governance-smoke` 持续通过，证明 mixed recall 仍先与 governance-eligible 集合求交。

**Phase 6 状态**: 索引同步与运维补齐已完成。

索引同步能力：
- `createCapsuleIndexSync()`: capsule → keyword tokens + embedding vectors 同步，幂等 upsert（capsuleId + contentHash + revisionNo）
- `syncArtifactCapsules()`: 按 artifact 同步所有 capsules 到两张索引表
- `removeCapsuleIndex()` / `getSyncStatus()`: 索引条目清理和状态查询

重建与运维工具：
- `rebuildAllCapsuleIndexes()`: 批量重建（清空 + 遍历所有 artifact + 重新同步），支持 onProgress 回调
- `rebuildCapsuleIndexForArtifact()`: 按 artifact ID 定点重建
- `verifyCapsuleIndexHealth()`: 健康对账（只读，返回 missing/failed/orphan 统计）
- `cleanupOrphanCapsuleIndexes()`: 孤立索引行清理
- 稳定内部运维路由：`POST /v1/operations/capsule-index/rebuild`、`GET /v1/operations/capsule-index/health`、`POST /v1/operations/capsule-index/cleanup-orphans`

通道故障隔离：
- `CapsuleRecallCoordinator.execute()`: 每个通道单独 try/catch，单通道失败记录到 `channelsFailed` / `channelErrors`，不阻断检索
- 失败信息通过 RAG log metadata 追踪

PG → Memory fallback:
- keyword 通道: `capsuleKeywordRecall()` (memory) 始终作为 fallback
- semantic 通道: `capsuleSemanticRecall()` (memory) 始终作为 fallback
- PG recall 函数通过 `featureFlag` 控制，禁用时自动走 memory

**测试覆盖**:
- 新增 `capsule-index-sync.test.ts` (8 tests): 同步成功/空 capsules/多 capsules/feature flag/错误处理/删除/状态查询
- 新增 `capsule-index-rebuild.test.ts` (11 tests): 重建/空 artifacts/progress/定点重建/不存在 ID/健康对账/缺失检测/孤立检测/失败检测/清理
- 新增 `phase6-index-schema.test.ts` (18 tests): keyword 表列存在性(12 columns)、embedding 表列存在性(10 columns)、跨表一致性验证
- Coordinator 新增 3 个 tests: 通道故障隔离/失败记录/工作通道结果保留

**Phase 6 专项检查建议**:
- PG sync: 设置 featureFlag 后验证 capsules 正确写入 keyword 和 embedding 索引表
- idempotency: 同一 capsule 重复 sync 不产生重复行（ON CONFLICT DO UPDATE）
- health reconcile: 运行 `verifyCapsuleIndexHealth()` 后确认 source 与 index 一致
- channel isolation: 模拟某通道异常后验证其他通道继续工作，且 channelsFailed 正确记录
- PG fallback: PG 不可用时 keyword/semantic 通道自动回退到 memory 路径

**Phase 7 状态**: 多路召回全线落地，直接替换旧流程为默认路径。无 feature flag 灰度体系，`searchKnowledgeV2()` 直接以四通道 coordinator 为唯一检索路径。

最终回归结果：

| 命令 | 结果 |
|------|------|
| `rtk pnpm typecheck` | No errors found |
| `rtk pnpm lint` | Checked 629 files, no fixes |
| `rtk pnpm test` | 检索层 185 tests + route 78 tests 全通过 |
| `rtk pnpm eval:retrieval:smoke` | 32/32 (100%), v2 Hit@1=0.82 |
| `rtk pnpm eval:retrieval:core` | v2 Hit@1=0.86, Hit@5=0.93, MRR=0.89, nDCG=0.91 |

**Phase 7 Baseline 对比** (v2 Core):

| 指标 | Phase 0 | Phase 7 | 变化 |
|------|---------|---------|------|
| Hit@1 | 0.86 | 0.86 | 持平 |
| Hit@5 | 0.86 | 0.93 | +8.1% |
| MRR | 0.86 | 0.89 | +3.5% |
| nDCG | 0.86 | 0.91 | +5.8% |
| Recall@10 | 0.86 | 0.93 | +8.1% |

v2 Smoke Hit@1 从 0.60 提升至 0.82 (+36.7%)。

**Phase 7 专项检查建议**:
- baseline regression: 确认 core v2 Hit@1 不退化（已确认：0.86 持平）
- governance safety: 确认无新增治理泄漏（已确认：仅 2 个预存 failure）
- channel trace: 确认 channelsPlanned/channelsUsed 在所有 eval 正确记录
- multi-channel complement: keyword/semantic/graph 通道各自贡献独立召回增益

### 添加摘要用例

1. 在 `evals/summary/datasets/` 中定义：

```typescript
import { summaryEvalCaseSchema, type SummaryEvalCase } from '@trapmap/contracts';

export const mySummaryCase = summaryEvalCaseSchema.parse({
  schemaVersion: 1,
  caseId: 'my-summary-case',
  tier: 'smoke',
  endpoint: '/v2/retrieval/search',
  request: {
    seed: '查询文本',
    maxResults: 10,
  },
  scenarioId: 'my-scenario',
  expected: {
    requiredFacts: ['必须出现的事实'],
    forbiddenClaims: ['不得出现的声明'],
    minGroundedness: 0.8,
    minCoverage: 0.7,
    expectSummary: true,
  },
}) as SummaryEvalCase;
```

2. 在对应的层级文件中导出。

---

## Schema 定义位置

所有评估 Schema 集中在 `packages/contracts/src/domain/evals/`：

| 文件 | 内容 |
|------|------|
| `retrieval.ts` | 检索用例和请求 Schema |
| `summary.ts` | 摘要用例和预期结果 Schema |
| `report.ts` | 报告结构 Schema |

---

## 单元测试

项目使用 Vitest 运行单元测试：

```bash
# 运行所有单元测试
pnpm test

# 意图解析器测试（正则 + LLM）
pnpm test -- --run packages/server（Wave-10 已删除）/src/lib/retrieval/capsules/intent.test.ts

# 意图缓存测试
pnpm test -- --run packages/server（Wave-10 已删除）/src/lib/retrieval/capsules/intent-cache.test.ts

# 运行特定文件
pnpm vitest run evals/retrieval/runner.test.ts

# 从仓库根可靠运行单个测试文件
pnpm test:file -- packages/server（Wave-10 已删除）/src/lib/runtime/metrics.test.ts
```

测试文件遵循 `*.test.ts` 命名约定，放置在对应模块目录下。

#### 单文件测试注意事项

根 [vitest.config.ts](../../vitest.config.ts) 使用多 `project` 配置。直接在仓库根执行 basename 或过短路径过滤（例如 `pnpm test -- --run metrics.test.ts`）时，Vitest 会把它当作 workspace 级过滤条件，可能同时命中多个 project 中的同名文件。

推荐做法：

- 从仓库根运行单文件时使用 `pnpm test:file -- <repo-root-relative-test-path>`
- 或者在包目录内运行包级脚本，例如 `pnpm --filter @trapmap/server test --run src/lib/runtime/metrics.test.ts`

`test:file` 会先把文件路径映射到唯一 project，再执行 `vitest run --project <name> <project-local-path>`，避免跨 project 误命中。

### Live PG Eval Parity

检索评测 harness 在 PG 模式下必须与 JSON 模式产生相同的 auth/graph 设置语义。Phase 0 修复了以下问题：

- **Session subject type**：`createActorSession()` 在 PG 模式下删除旧 session 并创建新 session，确保 `subjectType` 和 `activeTeamId` 正确（不再隐式使用 system-admin）。
- **Active team**：actor 的 `activeTeamId` 通过新 session 正确传递，governance 过滤基于实际 team membership。
- **Graph repository visibility**：graph 文档通过 `repos.graphIndex.upsert()` 播种，确保 `repos.graphIndex.listAll()` 可见。
- **Capsule data hydration**：PG `listByFilter()` 返回 lightweight records（`derived: null`），导致 capsule recall 通道无法读取 capsule 数据。修复：`listForRetrieval()` 方法批量加载 revision + capsule 数据，`buildRetrievalReadModel()` 使用该方法。

回归测试位于 `evals/retrieval/lib/adapters.test.ts`。

### PostgreSQL 集成测试

部分模块包含需要真实 PostgreSQL 连接的集成测试。这些测试通过 `TRAPMAP_DATABASE_URL` 或 `DATABASE_URL` 环境变量控制，未设置时自动跳过。新宿主入口同样接受这两种变量名。

```bash
# 运行 PG 集成测试（需要数据库）
TRAPMAP_DATABASE_URL=postgresql://user:pass@localhost:5432/trapmap pnpm --filter @trapmap/server test
```

CI 中通过 `postgres-integration` job 运行真实 PostgreSQL/pgvector 校验链路，包括任务队列、outbox worker 和 lifecycle subscriber 的集成测试。本地开发也可以使用 Docker 快速启动 pgvector：

```bash
docker run -d --name trapmap-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=trapmap -p 5432:5432 pgvector/pgvector:pg16
```

`pnpm test:runtime-foundations` 和 `pnpm test:deployment-smoke` 默认各自启动临时 Docker pgvector coordinator。Docker 不可用、但已有专用 pgvector 管理库时，可显式提供 `TRAPMAP_POSTGRES_COORDINATOR_URL`：该 URL 必须指向可创建和删除数据库的管理库（通常为 `postgres`），runner 仍会创建唯一临时数据库、执行六个 owner migration、验证 `vector` 扩展，并在结束时删除该数据库。不要把应用运行时的 `TRAPMAP_DATABASE_URL` 用作该变量。

```bash
TRAPMAP_POSTGRES_COORDINATOR_URL=postgresql://trapmap:test@localhost:5432/postgres \
  pnpm test:runtime-foundations
```

包含 PG 集成测试的模块：

| 模块 | 测试文件 | 说明 |
|------|----------|------|
| Feedback | `packages/service-governance-review/src/pg-ports.test.ts` | 反馈 CRUD、过滤、约束验证 |
| Governance Review | `packages/service-governance-review/src/routes.test.ts` | 治理审核路由集成测试 |
| Candidates | `packages/service-candidate-ingestion/src/` | 候选提交、分析、判重 |
| Knowledge Write | `packages/service-knowledge-write/src/` | 知识条目 CRUD、标签过滤、约束验证 |
| Task Queue | `packages/contracts/src/domain/task-queue.test.ts` | 持久化任务队列：入队、出队、重试、死信队列 |
| Lifecycle | `packages/host-local/src/nest/lifecycle/lifecycle-manager.service.test.ts` | 生命周期管理器集成测试 |

---

## Feedback Remediation 最小验证

当同一 `trap` 或 `skill` 的未解决 feedback 数达到 `10` 时，系统当前会：

- 在 `/v1/operations/feedback/remediation` 中暴露该条目
- 在检索阶段对该条目做硬过滤
- 在 `skill edit` 后把状态推进到 `in-remediation`
- 在 `trap review approve` / `skill review approve` 后把状态推进到 `ready-to-reindex`
- 在 `POST /v1/operations/feedback/remediation/:entryId/complete` 后批量 resolve 当前未解决 feedback

建议至少运行以下验证：

```bash
rtk pnpm test -- --run \
  packages/server（Wave-10 已删除）/src/routes/feedback.test.ts \
  packages/server（Wave-10 已删除）/src/routes/retrieval.test.ts \
  packages/server（Wave-10 已删除）/src/routes/review.test.ts \
  packages/server（Wave-10 已删除）/src/routes/operations/skill-edit.test.ts \
  packages/server（Wave-10 已删除）/src/routes/operations/skill-review.test.ts
```

手动检查建议：

1. 提交或注入同一条目的 10 条 `new/triaged` feedback。
2. 确认 `/v1/operations/feedback/remediation` 中出现该 trap/skill。
3. 确认该 trap/skill 不再出现在相应 retrieval 结果中。
4. 对 skill 执行 edit，确认 remediation 状态推进到 `in-remediation`。
5. 对 trap 或 skill 执行 approve，确认 remediation 状态推进到 `ready-to-reindex`。
6. 调用 remediation complete 端点，确认会先触发现有 trap/skill 索引刷新路径，再批量 resolve 当前未解决 feedback。

---

## Phase 2 跨模式认证/成员回归测试清单

以下测试用例必须在 JSON 和 PG 两种存储模式下均通过：

| 测试文件 | 覆盖场景 |
|----------|----------|
| `routes/access-keys.test.ts` | 创建访问密钥、issue → login 往返、权限校验 |
| `routes/auth.test.ts` | 系统管理员登录、访问密钥登录、会话状态、登出 |
| `routes/members.test.ts` | 创建成员（含 caller-provided `securityLevel`）、更新成员、handle 唯一性 |
| `__tests__/pg-first-compat.test.ts` | 端到端：issue key → login → session 验证、`securityLevel` 持久化 |

运行命令：

```bash
pnpm test -- --run packages/server（Wave-10 已删除）/src/routes/access-keys.test.ts packages/server（Wave-10 已删除）/src/routes/auth.test.ts packages/server（Wave-10 已删除）/src/routes/members.test.ts packages/server（Wave-10 已删除）/src/__tests__/pg-first-compat.test.ts
```

---

## 结构回归守卫：`store.snapshot()` / `store.transact()` 用法限制

PG-first 收敛完成后，核心业务路由必须通过 `repos.*` 读写数据。`store.snapshot()` / `store.transact()` 仅允许在以下模块中使用：

| 类别 | 文件模式 | 说明 |
|------|----------|------|
| 仓库实现 | `lib/*/repository.ts` | 内部包装 store 作为兼容层 |
| 迁移/回填脚本 | `lib/persistence/migrate-*.ts`、`backfill-*.ts` | 一次性数据迁移 |
| 启动引导 | `bootstrap/*.ts` | 启动接线和恢复 |
| 生命周期订阅者 | `lib/lifecycle/subscribers/*.ts` | 事件驱动副作用 |
| 候选处理管线 | `lib/candidates/processor.ts`、`lib/candidates/services/*.ts` | 管线变更 |
| 运维/管理路由 | `routes/operations/*.ts`、`routes/admin-*.ts` 等 | 诊断和迁移 HTTP 工具 |

守卫测试位于 `packages/server（Wave-10 已删除）/src/__tests__/snapshot-usage-guard.test.ts`，扫描所有非测试 `.ts` 文件。新增不允许列表中的 `store.snapshot()` / `store.transact()` 调用会导致测试失败。

运行守卫测试：

```bash
pnpm test -- --run packages/server（Wave-10 已删除）/src/__tests__/snapshot-usage-guard.test.ts
```

### 跨模式一致性验证

以下命令组合验证 JSON 和 PG 两种存储模式下的行为一致性：

```bash
# 类型检查
pnpm typecheck

# 全量测试
pnpm test

# Smoke 评估
pnpm eval:smoke

# 结构守卫
pnpm test -- --run packages/server（Wave-10 已删除）/src/__tests__/snapshot-usage-guard.test.ts
```

---

## 边界条件检查清单

编写或修改格式化、路径验证和 falsy 检查相关代码时，确认以下边界条件：

- [ ] **Falsy 值保留**：`''`、`0`、`false` 不应被条件检查误删，使用 `!= null` 替代 truthy 检查
- [ ] **空数组 join**：`[].join(', ')` 返回 `''` 而非 `null`，需要显式检查 `length > 0`
- [ ] **路径遍历**：`file..txt` 中的 `..` 不是路径段，不应被拒绝；按 `sep` 分割后检查段
- [ ] **Base64 无填充**：合法 base64 可以没有 `=` 填充，不要强制 `length % 4 === 0`
- [ ] **截断边界**：`maxLength <= 3` 时 `slice(0, maxLength - 3)` 产生负数索引
- [ ] **大小写敏感**：文件系统可能使用 `skill.md`、`SKILL.md`、`Skill.md` 等变体
- [ ] **null vs undefined 语义**：`null` 表示"已知为空"，`undefined` 表示"未设置"，格式化时应区分

---

## 输入清理检查清单

编写或修改 CLI 格式化输出时，确认用户可控字段已经过清理：

- [ ] **换行注入**：用户提供的 `title`、`reason`、`candidateId` 等字段在拼接多行输出时使用 `stripNewlines()` 清理
- [ ] **ANSI 注入**：从服务端返回的字段在直接输出到终端前使用 `stripAnsi()` 清理
- [ ] **组合清理**：需要同时去除换行和 ANSI 码时使用 `sanitizeForDisplay()`
- [ ] **JSON 输出**：`JSON.stringify` 使用紧凑格式（无缩进）以减少 token 消耗
- [ ] **非有限数**：`JSON.stringify` 序列化包含 `Infinity`/`NaN` 的对象时使用 replacer 函数

---

## Server Raw Report Revalidation

fm-agent 针对 `packages/server（Wave-10 已删除）` 生成了 391 个已确认的原始发现（原始快照）。当前 HEAD 已显著领先原始快照（buildServer、capsule-native 检索等均已落地）。2026-05-29 审计回写后，matrix 中已无 current-live finding；完整分类矩阵见 `docs/plans/fm-agent-scan/server-live-gap-matrix.md`。

### 回归冻结测试

以下测试文件来自原始报告 triage 阶段，现已作为 **回归冻结测试** 保留。它们带有 `fm-agent:` 前缀，用于证明此前的 live gap 已被当前 HEAD 吸收，或明确落为环境边界：

| 测试文件 | 覆盖的活跃问题 |
|---|---|
| `packages/server（Wave-10 已删除）/src/app.test.ts` | 已修复：onClose await worker stop、startup 后冻结 `skillShareer` |
| `packages/server（Wave-10 已删除）/src/bootstrap/startup.test.ts` | 已修复 / 已文档化边界：生命周期审计订阅补齐；JSON store recovery 不重入 PG queue |
| `packages/server（Wave-10 已删除）/src/lib/ai/dynamic/context-resolver.test.ts` | 已文档化边界：MCP 状态当前显式为 `unavailable` |
| `packages/server（Wave-10 已删除）/src/lib/ai/provider-config.test.ts` | 已修复：provider-specific key 优先级 |

### 运行激活测试

```bash
# 仅运行 fm-agent 回归冻结测试
rtk pnpm --filter @trapmap/server test -- \
  --run packages/server（Wave-10 已删除）/src/app.test.ts \
  packages/server（Wave-10 已删除）/src/bootstrap/startup.test.ts \
  packages/server（Wave-10 已删除）/src/lib/ai/dynamic/context-resolver.test.ts \
  packages/server（Wave-10 已删除）/src/lib/ai/provider-config.test.ts

# 重新验证源文档和分类矩阵是否存在
rtk pnpm check:docs-drift
```

### 过时热点桶（HEAD 已解决）

大量原始发现（~381/391）来自 `lib/retrieval/capsules`、`lib/persistence/schema`、`lib/retrieval/recall`、`lib/artifacts/pg-repository`、`lib/indexing/graph-lite`——这些是当时未完成的工作。HEAD 已将胶囊原生检索、PG 关键词+语义召回、graph-lite 索引、适配器注册表全部落地。源文件对照清单见 `docs/plans/fm-agent-scan/server-source-pack.md`。

---

## Label Backfill and Repair Commands

### Legacy snapshot retirement evidence

`store_snapshot` 的一次性 source-to-target backfill 已在 2026-07-23 以独立 PostgreSQL source 与已迁移的 six-owner target 完成验收。提前加入 identity-access baseline 的 destructive migration 会破坏仍在运行的 compatibility server，已撤回；只有 Wave-10 删除全部 runtime consumer 后，才可在同一 cutover 中重新引入该 migration。用于该演练的命令、wiring 与 acceptance test 已删除，仓库不再提供可执行的 legacy snapshot backfill 命令。

该证据及 source/target readback、idempotency 与 conflict-rejection 结果记录在 active compatibility-shell retirement detail。外部历史数据库的迁移须经运维变更流程执行，不得依赖已从本仓库移除的 compatibility runtime。

### backfill:labels

从历史数据（`knowledge_labels`、artifact `labels`、`graph_index_documents`）中回填规范标签目录。

```bash
# 运行回填
pnpm backfill:labels

# 预览模式（不写入数据库）
pnpm backfill:labels -- --dry-run
```

要求：`DATABASE_URL` 环境变量已设置。

### label-merge:repair

标签合并后修复图文档中的节点 ID 和边端点。

```bash
# 运行修复
pnpm label-merge:repair

# 预览模式（不写入数据库）
pnpm label-merge:repair -- --dry-run
```

要求：`DATABASE_URL` 环境变量已设置。

### 标签对齐评估

标签对齐的质量通过 `label_alignment_events` 表审计。运维人员可查询该表检查：
- `decision = 'unsure'` 的事件（需要人工审查）
- `confidence < 0.5` 的事件（低置信度决策）
- `source_context = 'backfill'` 的事件（回填期间的决策）

```sql
-- 查看待审查的 unsure 事件
SELECT raw_label, raw_evidence, confidence, reasoning, created_at
FROM label_alignment_events
WHERE decision = 'unsure'
ORDER BY created_at DESC;

-- 查看低置信度决策
SELECT raw_label, decision, confidence, reasoning
FROM label_alignment_events
WHERE confidence < 0.5
ORDER BY confidence ASC;
```

---

## 运维验证序列 Phase 5 Operations

Phase 5 为运维操作员暴露了 capsule-index CLI 命令，以下验证序列覆盖核心运维路径。

### 前提条件

- PostgreSQL 已启动且 schema 已应用
- 至少有 1 个 approved artifact
- CLI 已登录（`trapmap login`）

### 验证步骤

```bash
# 1. 健康检查 — 确认索引状态
trapmap operations capsule-index health

# 2. 编辑后的 artifact 仍可正确派生
#    (编辑 → approve → 验证 health 无新增 missing)
trapmap operations edit <artifact-id> --labels "test-label"
# approve 通过 review-queue 或 API
trapmap operations capsule-index health
# 预期: 无新增 missingKeywords / missingEmbeddings

# 3. approved artifact 索引正确
trapmap operations capsule-index rebuild --mode artifact --artifact-id <artifact-id>
# 预期: keywordSynced / embeddingSynced > 0, keywordFailed / embeddingFailed = 0

# 4. 全量重建
trapmap operations capsule-index rebuild
# 预期: succeeded = totalArtifacts, failed = 0

# 5. 孤立清理
trapmap operations capsule-index cleanup-orphans
# 预期: removed = 0（正常状态下无孤立行）

# 6. JSON 输出验证
trapmap operations capsule-index health --json | jq .report
trapmap operations capsule-index rebuild --json | jq .stats
trapmap operations capsule-index cleanup-orphans --json | jq .removed
```

### 故障排查流程

当 `health` 报告问题时：

| 症状 | 原因 | 修复 |
|------|------|------|
| `missingKeywords > 0` | 索引未同步 | `rebuild --mode artifact --artifact-id <id>` |
| `failedKeywords > 0` | 同步出错 | 查看 `lastError` 字段，修复后 `rebuild` |
| `orphanKeywords > 0` | artifact 已删除但索引未清理 | `cleanup-orphans` |
| 全量缺失 | 索引表为空 | `rebuild`（全量重建） |

---

## 相关文档

## Distributed acceptance closeout

运行 `rtk pnpm test:distributed-acceptance` 验证真实 HTTP owner hop、correlation、错误分类、deadline/retry 与 idempotent replay；运行 `rtk pnpm test:distributed-closeout` 验证 multi-process recovery，包括 `knowledge-write` 局部重启后 gateway delegation 恢复且 job-runtime 状态面独立可用。该证据仅支持 `Level 2 / transitional-microservice`，不宣称 Level 3。

- [模块详解](../architecture/MODULES.md) — 系统模块架构和设计
- [API 参考 — 候选重复检索](../architecture/API.md#-candidate-deduplication-retrieval) — 检索算法和模式
- [安全指南](SECURITY.md) — RBAC 和安全等级
- [环境变量参考](ENVIRONMENT.md) — 测试相关环境变量
