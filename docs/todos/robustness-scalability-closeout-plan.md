# TrapMap 健壮性与可扩展性收尾细则计划

> 当前角色：围绕已发现问题、残余风险、trace/metrics/debug 语义漂移与测试证据缺口的执行细则。对应根索引：[`../../plan.md`](../../plan.md)

## 1. 计划定位

- 本文档承接根 `plan.md`，负责维护执行细节、复选框、落点建议、测试要求、文档回写和关闭条件
- 目标不是继续铺新功能，而是把已暴露的问题修实，把系统关键 contract、测试证据与扩展缝隙收口为长期可维护基础
- 本文档默认覆盖：
  - observability / failure taxonomy / correlation keys 的 truth source 收敛
  - runtime / async metrics 语义和 resilience correctness 修复
  - request / trace / query / feedback / async propagation 证据补强
  - retrieval / governance / feedback / badcase / operator / eval 的最小 debug 闭环
- 本文档默认不覆盖：
  - 新监控平台选型
  - 大范围 client UI 扩张
  - 新部署形态、新队列产品化或新的业务状态机

## 2. 关闭规则

- 任一任务或阶段勾选为完成前，必须同时满足：
  - [ ] 实现已落地，或冻结为明确结论并写清 deferred 理由
  - [ ] 受影响最小测试已执行
  - [ ] 受影响文档已回写
  - [ ] `rtk pnpm check:docs-drift` 已通过
  - [ ] `rtk pnpm check:structure` 已通过
- 若改动涉及 retrieval、summary、governance、feedback、fixtures、eval runner：
  - [ ] 补跑 `rtk pnpm eval:smoke`

## 3. 文档与测试回写总表

### 文档

- [ ] `plan.md`：只保留当前阶段、勾选状态、总体要求和细则入口
- [ ] `docs/README.md`：更新当前根计划主线与细则入口描述
- [ ] `docs/todos/README.md`：更新本细则主题和当前活跃主线说明
- [ ] `docs/archived/README.md`：补记旧根计划归档记录
- [ ] `docs/reference/SYSTEM_TRUTH_SOURCES.md`：回写 contract truth、metrics/debug/trace surface 权威入口
- [ ] `docs/operations/ENVIRONMENT.md`：回写 runtime / trace / operator / resilience 相关语义
- [ ] `docs/operations/TESTING.md`：回写最小验证矩阵、传播证据、operator/debug 验证方法
- [ ] `docs/architecture/*`：仅在 owner、链路、debug surface 或 operator semantics 变化时更新
- [ ] `docs/PACKAGES.md` 与必要 `packages/*/README.md`：仅在包职责或可见性边界变化时更新

### 测试

- [ ] 文档-only 变更：`rtk pnpm check:docs-drift`
- [ ] 文档-only 变更：`rtk pnpm check:structure`
- [ ] contract / 类型 / client-server shape 变化：`rtk pnpm typecheck`
- [ ] runtime / resilience / operator / correctness 变化：`rtk pnpm test:runtime-foundations`
- [ ] deployment / host / internal-client / distributed hop 变化：`rtk pnpm test:deployment-smoke`
- [ ] retrieval / governance / feedback / badcase / eval 相关变化：`rtk pnpm eval:smoke`
- [ ] 受影响包最小测试：优先使用 `rtk pnpm test:file -- <path>` 或包级 `--filter` 测试

## 4. 分阶段执行

### Phase 0 问题清单冻结与边界校准

**目标：** 先把当前已确认问题、残余风险、越界点和证据缺口收拢成单一问题池，避免实现过程中又扩成第二轮散点修补。

**建议读取入口：**

- `packages/contracts/src/domain/observability.ts`
- `packages/contracts/src/domain/operations.ts`
- `packages/server/src/lib/runtime/metrics.ts`
- `packages/server/src/lib/runtime/resilience.ts`
- `packages/server/src/routes/operations/status.ts`
- `packages/server/src/routes/feedback.ts`
- `packages/server/src/routes/operations/badcases.ts`
- `docs/operations/ENVIRONMENT.md`
- `docs/operations/TESTING.md`
- `docs/reference/SYSTEM_TRUTH_SOURCES.md`
- 历史细则：`docs/todos/instrumentation-observability-plan.md`

**检查清单：**

- [x] 列出 correctness 问题：统计口径不一致、双计数、局部语义漂移、错误映射不一致
- [x] 列出 contract 问题：重复 schema、重复 taxonomy、重复 correlation key、public/internal 边界不清
- [x] 列出测试问题：mock 替代真实链路、证据不闭环、计划声称强于测试事实
- [x] 列出治理问题：根计划阶段越界、细则与当前实现不一致、文档主线未及时切换
- [x] 明确本轮“必须修 / 应该修 / 可延后”分层
- [x] 明确非目标，避免扩到大范围 UI、平台替换、产品能力新增

**冻结后的后续阶段顺序：**

1. Phase 1：先消除 truth source / contract 重复定义。
2. Phase 2：再修 runtime / async correctness。
3. Phase 3：最后补传播证据与 debug 闭环。

**阶段越界约束：**

- Phase 1 不提前做 runtime 行为修复，只处理 truth source、共享 contract、命名、taxonomy、public/internal 边界。
- Phase 2 不借机扩张新 debug/UI surface，只修 correctness、统计口径、错误映射和执行语义。
- Phase 3 只补最小可复用 debug contract，不做大范围 client UI 或新的 operator panel。

**非目标与 deferred 边界：**

- 新监控平台：deferred
- 新部署形态：deferred
- MQ 产品化：deferred
- 大范围 web/CLI debug UI：deferred
- 新业务状态机：deferred

**Phase 0 关闭条件：**

- [x] 本页补全问题池与优先级
- [x] 根 `plan.md` 与 docs 索引已切换到新主线
- [x] 旧根计划已归档并在 `docs/archived/README.md` 记账

### Phase 1 Truth Source 与 Contract 收敛

**目标：** 把共享命名、failure taxonomy、correlation key、public/internal visibility 拉回单一事实源，保证后续扩展不靠复制粘贴。

**补齐清单：**

- [ ] 审核 `operations.ts`、feedback/badcase/operator/debug 相关 schema 是否直接复用 `observability.ts`
- [x] 审核 `operations.ts`、feedback/badcase/operator/debug 相关 schema 是否直接复用 `observability.ts`
- [x] 收敛 workflow correlation keys，只允许使用冻结过的共享 key
- [x] 收敛 failure taxonomy 引用，避免 runtime/operator/feedback 各自维护近似语义
- [x] 明确哪些字段允许作为 public additive，哪些只能停留在 internal/operator/durable trace
- [x] 需要时补 contract 测试，证明 drift guard 存在

**Phase 1 关闭条件：**

- [x] 共享 contract 不再维护第二套 key/taxonomy 定义
- [x] `SYSTEM_TRUTH_SOURCES.md`、相关 reference/operations 文档已回写
- [x] 受影响 contract/server tests 与 `typecheck` 已通过

### Phase 2 Runtime / Async Correctness 修复

**目标：** 修掉当前 runtime / resilience / operator 路径里真正会误导 operator 或让系统难以扩展的 correctness 问题。

**补齐清单：**

- [x] 修正 resilience 中 throw / unsuccessful-result / fail-open fallback 的统一统计语义
- [x] 冻结 `executions`、`retries`、`degraded`、`timeouts`、`retryableFailures`、`permanentFailures` 的计数口径
- [x] 收敛 route、worker、internal client、operator status 对 canonical error 的映射
- [x] 避免 runtime metrics 对同一 logical operation 重复或缺失计数
- [x] 把必要语义回写到 `ENVIRONMENT.md` 与 `TESTING.md`

**Phase 2 关闭条件：**

- [x] correctness 缺陷已修或明确 deferred 原因
- [x] runtime/operator 相关 focused tests 已覆盖修复点
- [x] 文档中的指标语义与实现一致

### Phase 3 传播证据与 Debug 闭环加固

**目标：** 让 request/trace/query/feedback/async/badcase/operator/eval 之间的关系既有 contract，也有真实测试证据。

**补齐清单：**

- [ ] 用真实链路测试补足 `requestId` / `traceId` / `queryId` / `feedbackId` / `asyncJobId` 传播证据
- [ ] 明确 retrieval trace、durable badcase trace、operator drill-down、eval draft/export 的边界与关系
- [ ] 为高频排障链路提供最小可复用 debug contract，而不是 route-local 临时字段或临时日志
- [ ] 清理只靠手工插库伪造状态的测试盲点，至少让关键路径存在一条 end-to-end focused proof
- [x] 用真实链路测试补足 `requestId` / `traceId` / `queryId` / `feedbackId` / `asyncJobId` 传播证据
- [x] 明确 retrieval trace、durable badcase trace、operator drill-down、eval draft/export 的边界与关系
- [x] 为高频排障链路提供最小可复用 debug contract，而不是 route-local 临时字段或临时日志
- [x] 清理只靠手工插库伪造状态的测试盲点，至少让关键路径存在一条 end-to-end focused proof
- [x] 如果新增或收敛 trace 字段，同步更新 export script、eval 文档和 testing 文档

**Phase 3 关闭条件：**

- [ ] retrieval / governance / feedback / badcase / operator / eval 之间使用同一套关键字段语义
- [ ] 关键传播证据存在 focused test 或 acceptance proof
- [ ] `rtk pnpm eval:smoke` 已通过

### Phase 4 守卫、文档与扩展缝隙收尾

**目标：** 把这轮修复变成可持续的工程资产，而不是一次性清理。

**补齐清单：**

- [ ] 根据复发风险决定是否新增 docs drift / structure / contract focused guard
- [ ] 清理 docs 索引中的旧主线描述和过期阶段表述
- [ ] 在相关文档中标记本轮 deferred risk 与后续扩展 seam
- [ ] 关闭根计划与本细则中的所有未决项

**Phase 4 关闭条件：**

- [ ] 文档入口、细则入口、归档入口一致
- [ ] 必要守卫已补齐
- [ ] 所有 deferred 项都已明确落点，不留模糊口头债务

## 5. 冻结后的单一问题池

### correctness

- [x] runtime / resilience 指标语义在 throw、unsuccessful-result、fail-open fallback 路径间不一致
  - 当前落点：`packages/server/src/lib/runtime/metrics.ts`、`packages/server/src/lib/runtime/resilience.ts`、`packages/server/src/routes/operations/status.ts`
  - 影响面：operator status、runtime metrics snapshot、错误排障口径、后续扩展指标
  - 建议归属 phase：Phase 2
  - 优先级：`必须修`
- [x] 同一 logical operation 存在 attempt 级与 operation 级双计数或漏计数风险
  - 当前落点：`packages/server/src/lib/runtime/metrics.ts`、相关 runtime tests、operator async status surface
  - 影响面：`executions` / `retries` / `degraded` / `timeouts` / failure counters 语义稳定性
  - 建议归属 phase：Phase 2
  - 优先级：`必须修`
- [x] route、worker、internal client、operator status 之间的 canonical error 映射不完全一致
  - 当前落点：`packages/server/src/routes/operations/status.ts`、runtime/internal-client 相关实现与测试
  - 影响面：operator 判断、异步失败归因、debug replay 可解释性
  - 建议归属 phase：Phase 2
  - 优先级：`必须修`

### contract truth

- [x] observability schema、taxonomy、visibility contract 仍有 route-local 或 doc-local 第二套近义定义风险
  - 当前落点：`packages/contracts/src/domain/observability.ts`、`packages/contracts/src/domain/operations.ts`、`docs/operations/ENVIRONMENT.md`、`docs/operations/TESTING.md`
  - 影响面：shared contract 漂移、public/internal boundary 扩散、后续 schema 演化成本
  - 建议归属 phase：Phase 1
  - 优先级：`必须修`
- [x] workflow correlation key、query/feedback/async 关联句柄存在重复命名或语义边界不清风险
  - 当前落点：feedback、badcase export、operator status、distributed trace propagation 相关 contract 与 route
  - 影响面：cross-hop trace、badcase/export/eval 对齐、debug contract 可复用性
  - 建议归属 phase：Phase 1
  - 优先级：`必须修`
- [x] public additive 与 internal/operator/durable trace 字段边界仍可能在局部 surface 漂移
  - 当前落点：`packages/contracts/src/domain/operations.ts`、`docs/reference/api-surface.md`、feedback/badcase/operator route surface
  - 影响面：API surface 稳定性、客户端误耦合、后续去兼容成本
  - 建议归属 phase：Phase 1
  - 优先级：`应该修`

### test evidence

- [ ] propagation 证据仍可能依赖 mock 或局部 helper，而不是 request-to-async / cross-hop 真实链路
  - 当前落点：distributed internal client tests、feedback/badcase 相关测试、operator acceptance 路径
  - 影响面：trace/request/query/feedback/async 传播可信度、回归防线
  - 建议归属 phase：Phase 3
  - 优先级：`必须修`
- [ ] 部分测试仍通过手工插库或伪造状态验证 operator/debug surface，缺少 focused end-to-end proof
  - 当前落点：badcase export、operator drill-down、async status 相关测试与 fixtures
  - 影响面：debug contract 的真实可用性、实施结论可信度
  - 建议归属 phase：Phase 3
  - 优先级：`应该修`
- [ ] 计划与文档对测试覆盖强度的表述强于当前真实测试证据
  - 当前落点：`docs/operations/TESTING.md`、历史 observability 细则、当前 closeout 细则
  - 影响面：阶段关闭判断、审计可复核性、后续执行者误判
  - 建议归属 phase：Phase 3
  - 优先级：`应该修`

### governance/docs

- [ ] 根计划、细则与 docs 索引曾存在主线切换不完整和阶段边界不一致
  - 当前落点：`plan.md`、`docs/README.md`、`docs/todos/README.md`、`docs/archived/README.md`
  - 影响面：执行入口混乱、旧主线误引用、关闭条件误判
  - 建议归属 phase：Phase 0
  - 优先级：`必须修`
- [ ] 历史 observability 主线与当前健壮性收尾主线关系不够显式，容易把历史细则误当当前执行索引
  - 当前落点：`docs/reference/SYSTEM_TRUTH_SOURCES.md`、`docs/README.md`、`docs/todos/README.md`
  - 影响面：truth source 误判、执行顺序越界、文档回写漂移
  - 建议归属 phase：Phase 0
  - 优先级：`必须修`
- [ ] backend engineering / service evolution 等长期问题池与本轮 closeout 边界需要明确切断，避免“顺手优化”越界
  - 当前落点：`docs/todos/backend-engineering-optimization-plan.md`、Nest service evolution 系列细则、当前 closeout 细则
  - 影响面：阶段膨胀、审计范围失焦、交付不可关闭
  - 建议归属 phase：Phase 0
  - 优先级：`应该修`

## 6. 历史主线关系与执行边界

- `docs/todos/instrumentation-observability-plan.md` 是上一轮 observability 主线细则，只保留为当前问题池和 truth source 漂移的历史输入，不再承担当前阶段索引职责。
- `docs/todos/backend-engineering-optimization-plan.md` 继续承载 MQ、平台化、监控平台、长期服务化等 deferred 问题池，不得在本轮 closeout 中以“顺手工程化”形式带入。
- `docs/todos/nestjs-service-evolution-*.md` 保留宿主、owner matrix、service boundary 的历史与现状参考；除非当前问题直接关联 truth source 或测试闭环，否则不在本轮扩展其实施面。
- 本轮执行入口只有 `plan.md` 与本文档；历史细则只能作为证据输入，不能反向覆盖当前阶段顺序和非目标边界。

## 7. 完成定义

- [ ] 已确认问题、残余风险和越界点被处理或明确 deferred
- [ ] runtime / async / retrieval / feedback / operator 关键 contract 具备单一 truth source
- [ ] 指标语义、传播证据、错误映射和 debug contract 具备可验证、可维护、可扩展基础
- [ ] 根计划、细则、文档索引、归档入口和测试矩阵与当前实现一致
