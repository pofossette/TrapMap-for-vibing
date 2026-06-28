# TrapMap 健壮性与可扩展性收尾计划索引

## 状态

- 状态：`已完成（Phase 4 已完成）`
- 日期：`2026-06-28`
- 本文件角色：根级执行计划索引，只保留目标、总体要求、阶段勾选和细则入口
- 当前活跃细则：[`docs/todos/robustness-scalability-closeout-plan.md`](../../todos/robustness-scalability-closeout-plan.md)
- 刚归档的上一份根计划：[`docs/archived/archived-plans/plan-2026-06-28-instrumentation-observability-index-archived.md`](plan-2026-06-28-instrumentation-observability-index-archived.md)

## 目标

- 清理本轮审计与实施过程中已经确认的问题、口径漂移和测试证据缺口
- 把 runtime、async、retrieval、governance、feedback、operator surface 的关键 contract 收敛为更健壮且可扩展的系统基础
- 让“指标语义、trace 传播、错误映射、operator/debug surface、文档/测试矩阵”具备长期可维护性，而不是靠局部实现或临时约定维持
- 在不制造第二套 truth source 的前提下，为后续持续演进预留清晰扩展点

## 总体要求

- 根 `plan.md` 只做索引；执行细节、落点清单、关闭条件、最小验证和文档回写统一写入 [`docs/todos/robustness-scalability-closeout-plan.md`](../../todos/robustness-scalability-closeout-plan.md)
- 每个阶段勾选前，必须同时完成：实现或冻结结论、聚焦测试、相关文档回写、`rtk pnpm check:docs-drift`、`rtk pnpm check:structure`
- 本轮主线目标是健壮性与可扩展性，不得借修复名义新增第二套状态机、第二套 taxonomy、第二套 debug surface 或第二套部署语义
- 共享命名、taxonomy、public/internal 边界、operator/debug 语义与 metrics 口径，必须优先复用既有 truth source，不允许局部复制再演化
- 文档、计划、测试和代码必须同步收口；任何“代码已改但 contract/test/doc 仍是旧口径”的状态都不能勾选完成
- 涉及 retrieval、governance、feedback、badcase、eval runner 的改动，最少补 `rtk pnpm eval:smoke`

## 当前关键路径

- 当前主线阶段：`Phase 4（已关闭）`
- 当前先做：
  - [x] 冻结本轮要清理的已知问题、残余风险与非目标
  - [x] 明确哪些问题属于 contract truth、runtime seam、operator surface、测试证据、文档治理
  - [x] 收敛后续阶段的固定执行顺序与越界约束
  - [x] 冻结本轮文档回写矩阵与最小验证矩阵
  - [x] 完成 Phase 1 的 truth source / contract 收敛主项
  - [x] 进入 Phase 2，修正 runtime / async correctness 的统计与错误映射漂移
  - [x] 在不扩张 debug surface 的前提下关闭当前已发现的 correctness 问题池
  - [x] 完成 Phase 3，收口 badcase/debug/eval draft 边界与传播证据
  - [x] 进入 Phase 4，完成守卫、文档与扩展缝隙收尾

## 阶段索引

### Phase 0 问题清单冻结与边界校准 [进行中]

- [x] 把当前已确认问题、残余风险、越界点和证据缺口整理为单一问题池
- [x] 冻结本轮“必须修 / 应该修 / 可延后”的优先级
- [x] 明确非目标，避免把新功能、UI 扩张或平台替换混入本轮
- [x] 写清与历史 observability / backend engineering / service evolution 细则的关系
- 细则：[`docs/todos/robustness-scalability-closeout-plan.md`](../../todos/robustness-scalability-closeout-plan.md)

### Phase 1 Truth Source 与 Contract 收敛 [已完成]

- [x] 消除共享 observability / failure taxonomy / correlation key 的重复定义
- [x] 明确 runtime metrics、workflow correlation、operator status、durable trace 的单一语义来源
- [x] 收敛 public/internal 边界，避免局部 surface 继续扩散内部字段
- [x] 回写 truth source、reference 与 contract 相关文档
- 细则：[`docs/todos/robustness-scalability-closeout-plan.md`](../../todos/robustness-scalability-closeout-plan.md)

### Phase 2 Runtime / Async Correctness 修复 [进行中]

- [x] 修正 timeout、retry、degraded、failure classification、execution semantics 的统计一致性
- [x] 清理 route、worker、internal client、operator status 之间的错误映射漂移
- [x] 冻结“attempt 级”与“logical operation 级”指标语义
- [x] 补齐受影响测试与必要文档
- 细则：[`docs/todos/robustness-scalability-closeout-plan.md`](../../todos/robustness-scalability-closeout-plan.md)

### Phase 3 传播证据与 Debug 闭环加固 [进行中]

- [x] 把 request/trace/query/feedback/async 关联句柄的真实传播证据补齐到 focused tests / acceptance
- [x] 让 retrieval、feedback、badcase export、operator drill-down、eval replay 使用同一套关键字段语义
- [x] 为高频排障路径提供稳定、可复用的最小 debug contract
- [x] 补齐对应测试与必要的 `rtk pnpm eval:smoke`
- 细则：[`docs/todos/robustness-scalability-closeout-plan.md`](../../todos/robustness-scalability-closeout-plan.md)

### Phase 4 守卫、文档与扩展缝隙收尾 [已完成]

- [x] 回写 README、docs 索引、reference、operations、architecture 与必要 package README
- [x] 必要时补 docs drift / structure / focused test guard，防止旧口径回流
- [x] 标记 deferred risk、扩展 seam 与后续问题池，不在根计划里保留模糊未决项
- [x] 关闭本轮索引与细则中的所有未决复选框
- 细则：[`docs/todos/robustness-scalability-closeout-plan.md`](../../todos/robustness-scalability-closeout-plan.md)

## 文档回写要求

- 每完成一个阶段或子项，都同步更新 [`docs/todos/robustness-scalability-closeout-plan.md`](../../todos/robustness-scalability-closeout-plan.md) 中对应复选框、关闭条件与问题池状态
- 健壮性收尾主线、阶段关闭规则、truth source 变化：更新 `docs/reference/SYSTEM_TRUTH_SOURCES.md`
- 根计划切换、当前主线入口和索引变化：更新 `docs/README.md`、`docs/todos/README.md`、`docs/archived/README.md`
- runtime / operator / trace / testing 规则变化：更新 `docs/operations/ENVIRONMENT.md`、`docs/operations/TESTING.md`
- contract、debug surface、operator drill-down、async/retrieval 语义变化：更新相关 `docs/architecture/*`、`docs/PACKAGES.md`、必要 package `README.md`
- 根 `plan.md` 只保留当前主线索引职责，不承载实现细节

## 测试回写要求

- 仅调整计划/索引文档：至少运行 `rtk pnpm check:docs-drift` 与 `rtk pnpm check:structure`
- 涉及 contracts、共享类型或 client/server surface：补 `rtk pnpm typecheck` 与受影响包最小测试
- 涉及 runtime metrics、request/trace 传播、operator status、错误映射或 async correctness：补 `rtk pnpm test:runtime-foundations`、必要时补包级 focused tests
- 涉及 distributed hop、gateway/internal client、service 间传播与 canonical error semantics：补相关 distributed focused tests，必要时补 `rtk pnpm test:deployment-smoke`
- 涉及 retrieval、governance、feedback、badcase export、eval runner：相关包测试外，至少补 `rtk pnpm eval:smoke`
- 任一阶段勾选完成前，至少确认“代码/contract + focused tests + 文档回写 + `check:docs-drift` + `check:structure`”同时完成

## 完成定义

- 根 `plan.md` 只保留当前“健壮性与可扩展性收尾”主线的索引职责
- [`docs/todos/robustness-scalability-closeout-plan.md`](../../todos/robustness-scalability-closeout-plan.md) 成为唯一活跃细则入口
- 已确认问题、残余风险、语义漂移与证据缺口被收敛到单一问题池并按优先级处理或明确 deferred
- runtime / async / retrieval / feedback / operator / debug 相关关键 contract、trace 和测试证据具备稳定且可扩展的演进基础
- 文档入口、truth source、测试矩阵和守卫与当前实现一致
- 后续新增 operator/debug 能力、平台化/MQ、部署形态扩张或更深 drill-down，必须转入独立审计或独立计划，不在本根计划内续写
