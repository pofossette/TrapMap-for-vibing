# 当前收口与后续整合

**状态：** 收口中  
**角色：** 当前唯一活跃细则；承接 2026-07-03 对 `docs/todos/` 的集中审计结果  
**配套 debt register：** [`open-debt-and-compromises.md`](./open-debt-and-compromises.md)

---

## 1. 审计结论（2026-07-03）

本轮对旧 `docs/todos/` 的判断原则是：

- 已被代码、测试、权威文档或最新执行证据兑现的内容，归档为历史参考
- 只剩少量真实 blocker 的旧计划，不再保留并行 checklist，统一抽到本文档
- 仅属于未来候选方向、且当前没有执行 owner 的方案，转为 deferred 参考，不再占用活跃面

已确认并完成归档的内容：

- 服务发现与可观测性主线的大部分 phase 资产已经落地；剩余项只保留最终 closeout
- `light` / `heavy` 术语、`backendTarget` 配置和 compose/build-target 基线已落地
- 六边形架构清理已完成其“前置护栏”职责，不再作为活跃计划
- 若干 eval / WebUI / 技术选型方案当前都属于 future proposal，而不是正在执行的主线

审计时复核到的当前代码事实：

- `backendTarget` 已在 `packages/cli/src/lib/config.ts`、`packages/cli/README.md`、`docs/architecture/components/CLIENT.md` 落地
- Consul discovery、Prometheus `/metrics`、`traceparent` / `x-request-id` 透传、Promtail/Loki/Tempo/Grafana 资产已落地到代码和运维文档
- `@trapmap/server` 依赖收口、host-local/shared seam 脱钩、若干静态分析问题仍有收尾；`cockatiel` 替换已完成

---

## 2. 当前活跃工作流

### A. 服务发现与可观测性最终 closeout

- [ ] 补齐 Grafana UI 人工点击验收，不只停留在 datasource / API 口径
- [ ] 在目标环境重复执行 Consul / Prometheus / Tempo / Loki / benchmark 验收，不能只引用本地 full-docker 结果
- [ ] 完成后把服务发现与可观测性主线标记为真正 closeout，并只保留归档入口

2026-07-06 closeout 进展：

- [x] 本地 Docker daemon 已恢复可用，`docker compose -f docker-compose.observability.yml up -d` 可成功拉起 `consul`、`prometheus`、`tempo`、`loki`、`promtail`、`grafana`
- [x] 自动化 closeout 已通过：`pnpm test:observability-closeout`、`pnpm test:discovery-closeout`、`pnpm test:distributed-closeout`、`pnpm test:observability-benchmark -- --base-url http://127.0.0.1:4000`
- [ ] 当前 live Consul catalog 仍未收口：`curl --noproxy '*' http://127.0.0.1:8500/v1/catalog/services` 只返回 `{"consul":[]}`，`/v1/health/checks/gateway` 为空，说明现有 gateway 进程未完成服务注册
- [ ] Grafana datasource 已通过 API 确认 provisioned；Prometheus / Loki health API 为 `OK`，Tempo 容器 `/ready` 为 `ready`，但人工 UI 点击验收仍未补齐

证据入口：

- `docker-compose.observability.yml`
- `config/prometheus.yml`
- `config/promtail.yml`
- `docs/operations/OBSERVABILITY-VERIFICATION.md`
- [`../archived/local-deployment-observability-checklist.md`](../archived/local-deployment-observability-checklist.md)
- [`../archived/archived-plans/service-discovery-and-observability-plan.md`](../archived/archived-plans/service-discovery-and-observability-plan.md)

### B. `host-local` / `packages/server` 边界收口

- [x] `host-local` 受测 runtime 文件已把共享基础设施收口到命名 seam：`@trapmap/runtime-infra` + `@trapmap/service-knowledge-read`，`import-boundary` 禁止名单里的 `@trapmap/server/lib/*` 深导入未再出现
- [x] `service-knowledge-read` 第一批轻量 seam 已落地：`context.ts`、`retrieval-types.ts`、`store.ts`、`rag-log.ts` 不再转接 `@trapmap/server/lib/{context,retrieval/types,store,ids,log-rotation}`，`search-knowledge.ts` 也已移除 `@trapmap/server/lib/store.js`
- [ ] 继续压缩 `service-knowledge-read` 对 `@trapmap/server` 的深层导入
- [x] `packages/host-local/src/nest/gateway/gateway.schemas.ts` 已改为直接复用 `packages/contracts/src/domain/retrieval.ts` 导出的 `retrievalSearchBodySchema`，保留 `query` / `teamId` / `limit` 兼容面
- [ ] 收敛 `packages/server` 的最终身份，只保留被明确命名的 compatibility / shared runtime seam

证据入口：

- `packages/contracts/src/domain/retrieval.ts`
- `packages/host-local/src/nest/runtime/import-boundary.test.ts`
- `packages/service-knowledge-read/src/import-boundary.test.ts`
- `packages/host-local/src/nest/gateway/gateway.schemas.ts`
- `packages/host-local/src/nest/gateway/gateway.schemas.test.ts`
- [`../archived/archived-plans/backend-build-targets-plan.md`](../archived/archived-plans/backend-build-targets-plan.md)
- [`../archived/archived-plans/nestjs-service-evolution-residual-tasks.md`](../archived/archived-plans/nestjs-service-evolution-residual-tasks.md)

### C. 静态分析与占位实现清理

- [ ] 清理已确认未注册或无人引用的迁移脚本、barrel、codemod 与旧 application-service
- [x] 收口 host-local queue/outbox stub、CLI entry fallback、versioned decay placeholder 等显式占位实现
- [ ] 继续裁剪 contracts / server 内的死导出与无效兼容面

2026-07-06 已完成：

- `packages/host-local/src/nest/runtime/backend-core-adapters.ts` 在缺少 `asyncTransport` 时已改为 fail-fast，不再返回 `job_local_stub` / `evt_local_stub`
- `packages/cli/src/lib/markdown-formatter.ts` 已补齐 entry fallback 的真实 markdown 渲染
- `packages/server/src/lib/decay/freshness.ts` 已支持“提供 version context 时按 `matchMultiplier` / `mismatchMultiplier` 执行 step decay；未提供时保持兼容返回 1.0”
- 已删除高置信未引用文件：`packages/web-panel/src/shared/hooks/use-debounced-value.ts`、`packages/server/src/lib/artifacts/derive/index.ts`

证据入口：

- `packages/host-local/src/nest/runtime/backend-core-adapters.ts`
- `packages/cli/src/lib/markdown-formatter.ts`
- `packages/server/src/lib/decay/freshness.ts`
- [`../archived/archived-plans/static-analysis-audit-2026-06-29.md`](../archived/archived-plans/static-analysis-audit-2026-06-29.md)

### D. Resilience 与 LLM 调用硬化

- [x] 把手搓 `executeWithResilience` 迁到 `cockatiel` 方案，补齐 `AbortController` 超时取消、retry/backoff 与可选 circuit breaker，并保持 `ResiliencePolicy` / `ResilienceResult` 兼容面
- [x] 保持“手动 parse + Zod 校验”的现有结论，但抽出共享的 parse-retry 包装，避免各模块重复实现 retry 循环
- [ ] 若未来满足单 provider + 明显 parse failure 的触发条件，再重新评估 `.withStructuredOutput()`

2026-07-06 已落地：

- `packages/server/src/lib/ai/parse.ts` 新增共享 `invokeWithParseRetry` / `parseJsonWithSchema`
- `graph-lite` 的 extraction / planning、`labels/llm-align.ts`、`boundary-extract.ts` 已迁到共享 parse-retry 包装
- 现阶段仍明确不引入 `.withStructuredOutput()`，也不改变现有输出 schema / 错误语义

证据入口：

- `packages/server/src/lib/runtime/resilience-v2.ts`
- `packages/server/src/lib/runtime/resilience.ts`
- `packages/server/src/lib/ai/parse.ts`
- `packages/server/src/lib/indexing/graph-lite/llm-extract.ts`
- [`../archived/archived-plans/library-replacement-evaluation.md`](../archived/archived-plans/library-replacement-evaluation.md)
- [`open-debt-and-compromises.md`](./open-debt-and-compromises.md)

---

## 3. Deferred 提案入口

以下主题当前没有活跃 owner，不再保留为并行 todo；需要重启时，直接从归档文档拉出新计划：

- Agent planning eval：[`../archived/archived-plans/agent-planning-eval-benchmark-plan.md`](../archived/archived-plans/agent-planning-eval-benchmark-plan.md)
- Label alignment eval：[`../archived/archived-plans/label-alignment-eval-benchmark-plan.md`](../archived/archived-plans/label-alignment-eval-benchmark-plan.md)
- Skill capsule live eval：[`../archived/archived-plans/eval-skill-capsule-live-eval-plan.md`](../archived/archived-plans/eval-skill-capsule-live-eval-plan.md)
- Skill capsule vs bare skill：[`../archived/archived-plans/eval-skill-capsule-vs-bare-skill.md`](../archived/archived-plans/eval-skill-capsule-vs-bare-skill.md)
- WebUI layout 重构：[`../archived/webui-layout-refactor-guide.md`](../archived/webui-layout-refactor-guide.md)

---

## 4. 归档触发条件

满足以下条件后，本文档可以再次归档，只保留 debt register：

- 服务发现 / 可观测性 closeout 完成，且根 `plan.md` 不再需要阶段级跟踪
- 当前 active checklist 只剩长期 deferred，不再存在本轮明确 owner 的未完成项
- 对应事实与入口已回写到 `README.md`、`docs/README.md`、`docs/reference/*`、`docs/operations/*`
