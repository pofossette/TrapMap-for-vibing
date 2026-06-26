# NestJS 成熟服务样板：Knowledge-Write + Governance-Review

## 角色

- 状态：`proposed`
- 目标：把 `knowledge-write + governance-review` 收口成第一批成熟服务样板，为后续 `candidate-ingestion`、`identity-access`、`knowledge-read` 提供可复用模板

## 执行子文档

- 实施前检查表：[`docs/todos/nestjs-service-evolution-knowledge-write-governance-review-preflight-checklist.md`](docs/todos/nestjs-service-evolution-knowledge-write-governance-review-preflight-checklist.md)
- 代码迁移任务列表：[`docs/todos/nestjs-service-evolution-knowledge-write-governance-review-migration-tasklist.md`](docs/todos/nestjs-service-evolution-knowledge-write-governance-review-migration-tasklist.md)

## 为什么先做这组

- [ ] 当前仓库已经有明确 owner 叙事：`governance-review` 负责治理命令，`knowledge-write` 负责最终聚合写入
- [ ] 当前仓库已经有真实跨服务委托路径，不需要从零发明服务边界
- [ ] 这组能最直接验证“命令 owner 不直接改最终聚合”的成熟服务原则
- [ ] 这组覆盖 review、feedback、maintenance、decay 等高风险路径，收益高于先做边缘服务

## 样板目标

- [ ] `governance-review` 成为治理命令 owner
- [ ] `knowledge-write` 成为知识写模型与最终聚合 owner
- [ ] 两者之间的 command contract、错误语义、超时、幂等、审计语义冻结
- [ ] 两个服务都具备可解释的 runtime/owner/capacity/故障观测面
- [ ] 这组服务在单体与 distributed 形态下共享同一业务真相

## Owner 边界

### `governance-review`

- [ ] 拥有 review decision、feedback、maintenance、decay 等治理命令入口
- [ ] 拥有治理资格校验、治理命令审计、治理流程状态解释
- [ ] 不直接写知识最终聚合
- [ ] 最终状态变更必须通过 `KnowledgeWritePort`

### `knowledge-write`

- [ ] 拥有 knowledge/trap/evidence 写模型真相
- [ ] 拥有最终聚合写入与生命周期规则
- [ ] 拥有来自治理命令的最终 apply 语义
- [ ] 不承担治理命令流程判断本身

### `gateway`

- [ ] 只做对外入口、鉴权、协议适配、错误映射
- [ ] 不持有这条链路的业务真相

## 数据与存储边界

### `governance-review`

- [ ] 只拥有治理命令、治理流程、feedback、审计所需主数据
- [ ] 如需读取知识摘要，只允许通过明确的 query seam 或只读 projection
- [ ] 不允许把知识主聚合表当作本服务默认写面

### `knowledge-write`

- [ ] 拥有知识写模型、生命周期变更和最终聚合更新主路径
- [ ] 明确哪些表/仓库由写服务主导
- [ ] 对外暴露的是 command contract，不是“大家都能查/写内部表”

### 共享 PostgreSQL 过渡策略

- [ ] 允许继续共享 PostgreSQL 实例
- [ ] 但必须明确 schema/table owner，而不是默认所有服务都可直读直写
- [ ] 若保留跨服务直读例外，必须命名、文档化，并有关闭条件

## Contract 冻结面

### 同步 command contract

- [ ] review approve -> knowledge-write apply approve
- [ ] review reject -> knowledge-write apply reject
- [ ] maintenance decision -> knowledge-write apply maintenance
- [ ] decay decision -> knowledge-write apply decay

### 错误与失败语义

- [ ] `403 / 404 / 409 / 503 / 504` 语义跨服务保持稳定
- [ ] timeout / unavailable / conflict / validation 等 taxonomy 不得在中间层重新发明
- [ ] gateway、governance-review、knowledge-write 的日志与返回错误能串起同一 request/trace

### 幂等与重试

- [ ] 同一治理命令的重复提交有一致幂等语义
- [ ] 失败重试不会造成最终聚合重复写入
- [ ] 与 outbox/shared job 相关的 follow-up 能按 workflow 或 task 观测

## 运行时与观测要求

### `governance-review`

- [ ] 独立 health/readiness/ownership 语义
- [ ] 可观测治理命令流量、失败、重试和 backlog
- [ ] 能解释“命令已接收但最终写入未完成”的状态

### `knowledge-write`

- [ ] 独立 health/readiness/ownership 语义
- [ ] 可观测最终写入、失败、冲突、延迟和 follow-up queue 状态
- [ ] 能解释写侧 apply 完成与后续异步任务的边界

## 实施顺序

### Step 1 边界冻结

- [ ] 冻结 `governance-review` 与 `knowledge-write` 的 owner 描述
- [ ] 冻结暂时允许的例外读取和兼容路径
- [ ] 回写 `SYSTEM_TRUTH_SOURCES.md`、`ARCHITECTURE.md`、相关 README
  对应检查表：`nestjs-service-evolution-knowledge-write-governance-review-preflight-checklist.md`

### Step 2 Contract 与 adapter 收口

- [ ] 收口 `KnowledgeWritePort` 的治理命令调用面
- [ ] 明确 `in-process` / `remote` 双 adapter
- [ ] 保证单体与 distributed 使用同一 contract
  对应任务列表：`nestjs-service-evolution-knowledge-write-governance-review-migration-tasklist.md`

### Step 3 数据与 repository 收口

- [ ] 收口知识最终聚合写路径到 `knowledge-write`
- [ ] 收口治理命令路径到 `governance-review`
- [ ] 关闭未命名的跨服务数据直读/直写

### Step 4 观测与故障治理

- [ ] 为两边补齐 runtime owner、failure taxonomy、capacity / backlog 观测
- [ ] 把 follow-up queue / outbox / workflow 证据纳入服务 owner 语义

### Step 5 Closeout

- [ ] 确认这组服务已经满足成熟服务最小标准
- [ ] 把该样板的共性规则回写到分布式成熟度评估和 Phase 3/4 文档

## 最小验证

- [ ] `pnpm test:deployment-smoke`
- [ ] `pnpm test:distributed-acceptance`
- [ ] 受影响包最小测试集合
- [ ] `pnpm typecheck`
- [ ] 若影响治理/反馈/eval runner，补 `pnpm eval:smoke`
- [ ] `pnpm check:docs-drift`
- [ ] `pnpm check:structure`

## 文档回写

- [ ] `plan.md`
- [ ] `docs/architecture/ARCHITECTURE.md`
- [ ] `docs/architecture/DEPLOYMENT.md`
- [ ] `docs/reference/SYSTEM_TRUTH_SOURCES.md`
- [ ] `docs/reference/api-surface.md`
- [ ] `docs/operations/TESTING.md`
- [ ] 受影响 package README

## 暂不在本样板内解决

- [ ] `knowledge-read` 的最终成熟化
- [ ] `candidate-ingestion` 的完整成熟化
- [ ] `identity-access` 的独立成熟服务 closeout
- [ ] `job-runtime` 作为横切运行时 owner 的最终硬化

## 完成定义

- `knowledge-write + governance-review` 已成为仓库内第一组成熟服务样板。
- 后续服务不再需要重新摸索 owner / contract / runtime / closeout 模式。
- 这组服务的成熟化不以“拆成独立进程”自居，而以明确边界、明确 owner、明确观测面为完成判据。
