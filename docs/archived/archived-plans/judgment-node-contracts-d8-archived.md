# 判断类节点契约（D8）收编主线

**状态：** active（2026-08-16 由用户直接要求启动：「直接由你来完成 判断类节点契约（D8）」）
**设计输入：** [《TrapMap 统一优雅组装中心设计》](../../superpowers/specs/2026-08-16-unified-assembly-center-design.md) D8（契约优先，R7）与 D2 节点映射表
**前置主线：** assembly Phase 1-4 全部完成并归档（[unified-assembly-center-phase4-archived.md](./unified-assembly-center-phase4-archived.md)），其中判断类节点契约（D8）明确 deferred 到本独立主线

## 背景

设计 D8 原则：**先立契约，再谈实现；契约冻结后实现可插拔替换。判断类能力节点是一批（意图识别只是示例），按统一契约体系逐个收编。**

全仓已盘点一批内嵌判断（D8.3 节点清单）：intent-recognition / dedup-strategy / conflict-trigger / artifact-derivation / label-alignment / channel-merge。共同特征（D8.4 判定标准）：有输入/输出边界、有多个候选实现或已知演进方向、被至少一个执行体消费、可独立测试。

assembly 内核（Phase 1）已具备契约校验能力：`defineNode` 支持 `implements`（契约 id）+ `configSchema`；`createAssembly({ contracts })` 在 `build()` 时经 `startupChecks` 校验 `UNKNOWN_CONTRACT` / `CONTRACT_VIOLATION` / 重复 id / inject 环等。本主线把判断类能力接入该体系。

## 范围

**纳入（本主线完成）：**

1. **契约三件套**（D8.1，每个能力节点）：
   - 端口接口（TS interface）：落 `packages/backend-core/src/ports/`（框架无关、零宿主依赖）；
   - 配置 schema（Zod）：落 `packages/contracts/src/domain/judgment.ts`（被 host 装配与多包消费，入 contracts）；
   - 数据契约：输入输出类型，复用 contracts 现有域组织（candidates / conflict / label-repository / retrieval / artifact-ports），缺口类型随端口文件定义。
2. **契约单测**：每个节点固定样例 → 合法结果（rule 实现同一断言集；llm/hybrid 变体如有则共享同一断言集）；config schema 合法性测试。
3. **实现（rule 默认 = 现状逻辑迁出，行为不变）**：6 个节点各至少一个 rule 实现，放对应 service 包（实现落点固定，fallow zone 表达边界）：
   - `intent-recognition` → `packages/service-knowledge-read/src/intent-recognition/`
   - `dedup-strategy` → `packages/service-candidate-ingestion/src/dedup-strategy/`（现状逻辑 `createCandidateDuplicateDetector` 在 backend-core，薄包装）
   - `conflict-trigger` → `packages/service-governance-review/src/conflict-trigger/`（现状 `createGovernanceConflictWorkflow`，薄包装）
   - `artifact-derivation` → `packages/service-knowledge-write/src/artifact-derivation/`（现状 `deriveFromPayloads` 从 @eval-only 提升为生产导出——收编后获得契约消费者）
   - `label-alignment` → `packages/service-knowledge-write/src/label-alignment/`（rule 新实现 + llm 变体包装现有 `alignLabel` LLM 判定）
   - `channel-merge` → `packages/service-knowledge-read/src/channel-merge/`（现状 `mergeCandidatesWithGraph` 在 backend-core，薄包装）
4. **装配接线**：
   - host-local：新增 `judgment-nodes.ts`（6 个 defineNode：implements 契约 id + configSchema + topology embedded + provides 服务名）与 `judgment-contracts.ts`（6 个 ContractDescriptor 注册表）；`composePilotProfile` 挂载判断类节点并注册契约 registry；
   - host-distributed：`distributedAssembly` 在对应服务进程挂载判断类节点（knowledge-read → intent-recognition + channel-merge；candidate-ingestion → dedup-strategy；governance-review → conflict-trigger；knowledge-write → artifact-derivation + label-alignment）；
   - `startupChecks` 契约校验生效：节点 implements 注册契约 → build() 通过；未注册契约 → UNKNOWN_CONTRACT。
5. **文档 closeout**：plan.md 激活本主线；docs/todos/README.md 索引；open-debt-and-compromises.md 更新 D8 状态；SYSTEM_TRUTH_SOURCES 术语映射；BOUNDARIES 节点契约落点；完成后归档细则。

**不纳入（登记后续落点，避免过度设计 R7）：**

- **调用点迁移**：service 包内嵌调用（`searchKnowledge` 的 `infra.routing.selectStrategy`、`processCandidate` 的 `createCandidateDuplicateDetector`、`createGovernanceConflictWorkflow`、`alignLabel`、`deriveFromPayloads`、`mergeCandidatesWithGraph`）改为经节点 port 消费——逐节点独立评审（每个收编独立评审，行为不变 diff 核验），不在本主线一次全迁。
- **llm/hybrid 变体生产收编**：本主线只提供 rule 默认实现 + 生产已有 LLM 逻辑的薄包装（label-alignment llm、conflict-trigger chat）；intent llm（seed 分类）、dedup llm（现仅 @eval-only `llm-dedup.ts`）、artifact llm、channel-merge 替换策略为契约扩展点，登记不实现。
- 不新增 yml/json 装配文件；不引入 cordis loader/patch 层；不改 `packages/assembly` 内核 API（现有 `implements`/`configSchema`/contracts registry 能力已够）。

## 任务分解

### T1 契约层

- [x] `packages/backend-core/src/ports/intent-ports.ts`：`IntentRecognitionInput`（query / requestedMode / knownModes / seed）、`IntentRecognitionResult`（mode / confidence 0..1 / reason / trace?）、`IntentRecognitionPort.recognize(input) → Promise<Result>`
- [x] `packages/backend-core/src/ports/dedup-ports.ts`：`DedupStrategyInput`（candidate / normalized / corpus）、`DedupStrategyResult`（duplicateCase / analysisSnapshot / strategy）、`DedupStrategyPort.detect(input) → Promise<Result>`（复用 contracts `CandidateSubmission`、backend-core `NormalizedDuplicateInput`/`DuplicateCase`/`AnalysisSnapshot`）
- [x] `packages/backend-core/src/ports/conflict-ports.ts`：`ConflictTriggerInput`（entryId）、`ConflictTriggerResult`（detectedCount / triggered / reason?）、`ConflictTriggerPort.detectConflicts(input) → Promise<Result>`
- [x] `packages/backend-core/src/ports/artifact-derivation-ports.ts`：`ArtifactDerivationInput`（payloads / context）、`ArtifactDerivationPort.derive(input) → Promise<DerivedArtifactOutputs>`
- [x] `packages/backend-core/src/ports/label-alignment-ports.ts`：`LabelAlignmentPort.align(input) → Promise<LabelAlignmentResult>`（复用 contracts `LabelAlignmentInput`/`LabelAlignmentDecision`/`LabelAlignmentCandidate`）
- [x] `packages/backend-core/src/ports/channel-merge-ports.ts`：`ChannelMergeInput<E>`（hybridCandidates / graphCandidates）、`ChannelMergePort.merge(input) → Promise<MergedCandidateLike<E>[]>`（复用 backend-core ranking 类型）
- [x] `packages/contracts/src/domain/judgment.ts`：`judgmentModeSchema`（rule/llm/hybrid）+ 6 个节点 config schema（各含 `mode` 默认 `'rule'` + 节点专属字段）+ `index.ts` 聚合导出
- [x] `packages/contracts/src/domain/judgment.test.ts`：config schema 固定样例解析断言
- [x] `packages/backend-core/src/ports/judgment-ports.test.ts`：端口接口结构 + 固定样例形状断言（类型层编译即校验）
- [x] 共享断言集：`packages/backend-core/src/testing/judgment-fixtures.ts`（每个节点固定输入样例 + 期望输出约束，rule/llm/hybrid 多实现共享）

### T2 实现层（rule 默认 = 现状逻辑，行为不变）

- [x] `service-knowledge-read/src/intent-recognition/rule-intent-recognition.ts`：`createRuleIntentRecognition()` → `IntentRecognitionPort`；recognize = 现状 `selectStrategy`/`dispatchByMode` 语义（requestedMode 直通 + knownModes 校验 + 默认 semantic）
- [x] `service-candidate-ingestion/src/dedup-strategy/rule-dedup-strategy.ts`：`createRuleDedupStrategy({ now, createId })` → `DedupStrategyPort`；detect = 现状 `createCandidateDuplicateDetector`（backend-core）
- [x] `service-governance-review/src/conflict-trigger/rule-conflict-trigger.ts`：`createRuleConflictTrigger(deps)` → `ConflictTriggerPort`；detectConflicts = 现状 `createGovernanceConflictWorkflow` 语义（rule overlap + 可选 chat judge）
- [x] `service-knowledge-write/src/artifact-derivation/rule-artifact-derivation.ts`：`createRuleArtifactDerivation()` → `ArtifactDerivationPort`；derive = 现状 `deriveFromPayloads`（移除 @eval-only 标记并包导出）
- [x] `service-knowledge-write/src/label-alignment/rule-label-alignment.ts`：`createRuleLabelAlignment()` → `LabelAlignmentPort`；规则实现（精确候选 → existing / 无候选 → new / 否则 unsure）
- [x] `service-knowledge-write/src/label-alignment/llm-label-alignment.ts`：`createLlmLabelAlignment({ chat })` → `LabelAlignmentPort`；复用现有 `alignLabel` LLM 判定（行为不变）
- [x] `service-knowledge-read/src/channel-merge/rule-channel-merge.ts`：`createRuleChannelMerge()` → `ChannelMergePort`；merge = 现状 `mergeCandidatesWithGraph`（backend-core）
- [x] 各实现单测：固定样例经共享断言集（judgment-fixtures）断言合法结果

### T3 装配层

- [x] host-local `judgment-nodes.ts`：6 个 defineNode（implements + configSchema + topology embedded + provides）
- [x] host-local `judgment-contracts.ts`（最终落点：`packages/assembly/src/contracts/judgment-contracts.ts`，两宿主共享）：6 个 ContractDescriptor（id / description / provides / configSchema / verify）
- [x] `composePilotProfile` 挂载判断类节点 + `createAssembly({ contracts: judgmentContracts })`
- [x] host-distributed `distributed.ts`：对应服务进程挂载判断类节点
- [x] 装配测试：节点描述符断言 + `startupChecks` 契约校验集成测试（注册契约 → build() 通过；未知契约 → UNKNOWN_CONTRACT）

### T4 文档与门禁 closeout

- [x] plan.md 激活本主线；docs/todos/README.md 索引同步
- [ ] open-debt-and-compromises.md：assembly 条目更新 D8 状态 + 调用点迁移后续落点登记
- [x] SYSTEM_TRUTH_SOURCES 术语映射（判断类节点契约落点）；BOUNDARIES 节点契约落点
- [ ] 门禁全绿：typecheck；contracts / backend-core / service-knowledge-read / service-candidate-ingestion / service-governance-review / service-knowledge-write / host-local / assembly 包测试；check:imports / asserts / docs / structure；fallow audit --base main；eval:smoke（涉检索/标签/治理面）
- [ ] 归档细则（git mv 至 docs/archived/archived-plans/）+ archived README 归档表更新

## 验证门禁

- 每任务：相关包 focused tests + `pnpm typecheck`
- 跨包导入/边界变化：`pnpm exec fallow audit --base main`
- 文档变化：`pnpm check:docs`、`pnpm check:structure`
- 检索/标签/治理面变更：`pnpm eval:smoke`
- 无新增断言豁免；`pnpm check:asserts` 全绿

## 验收边界

- 6 个判断类节点契约三件套全部落位（ports 接口 + contracts config schema + 数据契约），契约单测全绿（固定样例 → 合法结果，rule/llm 共享同一断言集）。
- 每个节点 rule 实现存在且默认=现状逻辑（diff 核验：包装层无业务改动）；label-alignment 另提供 llm 变体。
- host-local 与 host-distributed assembly 均挂载判断类节点；`build()` 经 startupChecks 契约校验通过；未注册契约报 UNKNOWN_CONTRACT（有测试证据）。
- 行为不变：除新增包装/导出外无业务逻辑改动；eval:smoke 与 golden 门禁全绿。
- 文档守卫全绿；细则归档且 plan.md 状态口径更新。

## Closeout 记录（2026-08-16）

- **T1 契约层：** 6 个端口接口（`packages/backend-core/src/ports/` 下六个 `<node>-ports.ts` 文件）+ `contracts/src/domain/judgment.ts`（judgmentModeSchema + 6 节点 config schema）+ 共享固定样例断言集 `backend-core/src/testing/judgment-fixtures.ts`；契约单测全绿（contracts 846 / backend-core 203）。
- **T2 实现层：** 6 个 rule 实现（默认=现状逻辑，行为不变；包装层 diff 核验无业务改动）：`service-knowledge-read`（intent-recognition / channel-merge）、`service-candidate-ingestion`（dedup-strategy）、`service-governance-review`（conflict-trigger）、`service-knowledge-write`（artifact-derivation + label-alignment rule + llm 变体）；label-alignment llm 变体复用现状 `callLlmAlignment`（仅加 export）；`deriveFromPayloads` 从 @eval-only 提升为生产导出（收编后获得契约消费者）。实现测试共享同一断言集（fixtures）全绿。
- **T3 装配层：** 契约注册表落 `packages/assembly/src/contracts/judgment-contracts.ts`（assembly 内核保持零业务依赖，verify 检查 provide/configSchema/topology）；host-local `judgment-nodes.ts` 挂载 6 节点（composePilotProfile 在 service 节点后追加）；host-distributed `judgment-nodes.ts` 按服务进程挂载（knowledge-read→intent+channel-merge、candidate-ingestion→dedup、governance-review→conflict-trigger（分布式 read + pg projection）、knowledge-write→artifact+label）；`createAssembly({ contracts: judgmentContracts })` 经 startupChecks 校验；UNKNOWN_CONTRACT / CONTRACT_VIOLATION 有测试证据。
- **T4 文档与门禁：** plan.md 激活并回写状态口径；todos/README 索引；open-debt assembly 条目更新（D8 状态 + 后续落点）；SYSTEM_TRUTH_SOURCES 术语映射；BOUNDARIES 节点契约落点；归档本细则。
- **门禁证据：** `pnpm typecheck` 全绿；contracts 846 / backend-core 203 / assembly 48 / host-local 237 / host-distributed 181 / service-knowledge-read 88 / service-candidate-ingestion 41 / service-governance-review 53 / service-knowledge-write 116；`test:runtime-foundations` 139 / `test:deployment-smoke` 388；`eval:smoke` 54/81（与 main 基线一致，27 项失败为环境既有 LLM/fixture 问题，非回归）；check:imports / asserts / docs / structure 全绿；fallow audit --base af1527e4 PASS（0 issue，1 项 inherited 排除：alignLabel 既有复杂度）。
- **偏差与后续落点（登记于 open-debt）：** ① 消费方内嵌调用点迁移（searchKnowledge selectStrategy、processCandidate detector、createGovernanceConflictWorkflow、alignLabel、deriveFromPayloads、mergeCandidatesWithGraph 改经节点 port 消费）逐节点独立评审（行为不变 diff 核验）；② llm/hybrid 生产收编（intent llm / dedup llm / artifact llm / channel-merge 替换策略）登记不实现；③ 宿主判断节点描述符跨 host 重复为 fallow 边界下结构性重复（host zone 不能互导、assembly zone 不能导入 service 工厂），以 fallow-ignore-file code-duplication 注明先例。
