# TrapMap 数据埋点增强计划索引

## 状态

- 状态：`进行中（已从根计划归档）`
- 日期：`2026-06-28`
- 本文件角色：历史根级执行计划索引，保留当时的数据埋点增强阶段定义与关闭条件，供后续参考
- 原活跃细则：[`../../todos/instrumentation-observability-plan.md`](../../todos/instrumentation-observability-plan.md)
- 归档原因：根 `plan.md` 已切换为“健壮性与可扩展性收尾”主线；后续问题清理、风险收敛、truth source 修复与测试证据补强不再由本根索引跟踪

## 目标

- 为整个 TrapMap 项目补齐统一、可关联、可排障的数据埋点
- 让 request、async job、worker、retrieval、governance、feedback、client 配置与关键状态切面具备可观测性
- 把“监控运行情况、追踪链路、定位故障、解释行为”从零散日志提升为明确 contract、指标、trace 和 operator 可见面
- 在不制造第二套业务真相的前提下，统一埋点字段、事件语义、指标口径与文档/测试要求

## 总体要求

- 根 `plan.md` 只做索引；执行细节、落点清单、阶段关闭条件、最小验证和文档回写统一写入 [`../../docs/todos/instrumentation-observability-plan.md`](../../docs/todos/instrumentation-observability-plan.md)
- 每个阶段勾选前，必须同时完成：实现或冻结结论、聚焦测试、相关文档回写、`rtk pnpm check:docs-drift`、`rtk pnpm check:structure`
- 数据埋点必须服务于现有 truth source 和 owner 边界，不得借“观测”名义引入第二套状态机、第二套业务分类或第二套部署语义
- 埋点字段命名、trace 关联键、metric 维度、日志事件名必须先收敛再扩散，禁止各包各写一套近似语义
- public API 的返回面只增加确有必要的可观测字段；更细的内部 trace、debug envelope、operator 视图应优先放在内部 contract、持久化 trace 或 operations surface
- 任何新增埋点如果可能引起文档漂移、评测漂移或 badcase 回放失真，必须同时更新对应文档、测试或 eval smoke 要求

## 当前关键路径

- 当时主线阶段：`Phase 2`
- 当时先做：
  - [x] 冻结“埋点增强”覆盖范围、优先级和非目标
  - [x] 盘点现有 requestId / trace / queryId / async metrics / operator status / badcase trace 的真实落点
  - [x] 收敛统一的 trace 关联键、事件分类、指标命名和 owner 分层
  - [x] 明确哪些埋点属于 contracts、backend-core port、host/runtime、server compatibility seam、client surface、eval/badcase
  - [x] 冻结文档回写矩阵和最小验证矩阵

## 阶段索引

### Phase 0 基线盘点与范围冻结 [进行中]

- [x] 盘点现有 metrics、trace、queryId、badcase、operator status、request context 的真实实现和缺口
- [x] 冻结本轮优先覆盖的埋点对象、关联键、operator 面和非目标
- [x] 明确埋点不改变业务真相、部署语义和 owner 边界的约束
- [x] 写清与现有 `docs/todos/backend-engineering-optimization-plan.md`、Nest/service 演进细则的关系，避免重复开题
- 细则：[`../../docs/todos/instrumentation-observability-plan.md`](../../docs/todos/instrumentation-observability-plan.md)

### Phase 1 埋点模型与 contract 收敛 [进行中]

- [x] 冻结统一的 trace correlation key、事件 taxonomy、metric namespace、日志字段规范
- [x] 明确 contracts、backend-core ports、runtime seam、client surface 各自承载什么埋点语义
- [x] 冻结 additive public field 与 internal-only surface 的边界
- [x] 回写 truth source、testing 和相关 architecture/reference 文档
- 细则：[`../../docs/todos/instrumentation-observability-plan.md`](../../docs/todos/instrumentation-observability-plan.md)

### Phase 2 运行时与异步链路埋点补齐 [已完成]

- [x] 补齐 request -> route -> application -> async job / worker 的关联埋点
- [x] 补齐超时、重试、失败分类、degraded mode、queue/backlog 的统一指标和 trace
- [x] 补齐跨 host / distributed hop 的 request/trace 传播验证
- [x] 让 operator/status 或相关 operations surface 能解释关键运行状态
- [x] 补齐 route、worker、internal client 之间关键错误映射一致性
- 细则：[`../../docs/todos/instrumentation-observability-plan.md`](../../docs/todos/instrumentation-observability-plan.md)

### Phase 3 检索、治理、feedback 与 debug 面增强 [未开始]

- [ ] 补齐 retrieval / governance / feedback / badcase export 的关键追踪字段和 debug surface
- [ ] 明确 query trace、badcase trace、operator summary、eval/badcase 回放之间的关系
- [ ] 为高频排障路径提供可复用的最小 debug contract，而不是临时日志
- [ ] 补齐对应测试与必要的 `rtk pnpm eval:smoke`
- 细则：[`../../docs/todos/instrumentation-observability-plan.md`](../../docs/todos/instrumentation-observability-plan.md)

### Phase 4 客户端、文档与守卫收尾 [未开始]

- [ ] 冻结 CLI / client-core / web-panel 可见的埋点与 debug 语义
- [ ] 回写 README、docs 索引、reference、operations、architecture 与必要 package README
- [ ] 必要时补 docs drift / structure / truth smoke / focused test guard，避免旧口径回流
- [ ] 关闭本轮索引与细则中的所有未决项
- 细则：[`../../docs/todos/instrumentation-observability-plan.md`](../../docs/todos/instrumentation-observability-plan.md)

## 文档回写要求

- 埋点术语、命名约束、truth source、阶段关闭规则变化：更新 `docs/reference/SYSTEM_TRUTH_SOURCES.md`、必要时更新 `docs/reference/GLOSSARY.md`
- 目录落点、计划入口、归档切换变化：更新 `docs/reference/REPO_STRUCTURE.md`、`docs/README.md`、`docs/todos/README.md`、`docs/archived/README.md`
- runtime / metrics / trace header / operator surface / testing 规则变化：更新 `docs/operations/ENVIRONMENT.md`、`docs/operations/TESTING.md`
- 组件 owner、链路追踪、debug surface、client 行为变化：更新相关 `docs/architecture/*`、`docs/PACKAGES.md`、必要 package `README.md`
- 根计划切换或细则入口变化：同步更新会把 `plan.md` 作为当前主线说明的入口文档

## 测试回写要求

- 仅调整计划/索引文档：至少运行 `rtk pnpm check:docs-drift` 与 `rtk pnpm check:structure`
- 涉及 contracts、共享类型或 client/server surface：补 `rtk pnpm typecheck` 与受影响包最小测试
- 涉及 runtime metrics、request/trace 传播、operator status、deployment surface：补 `rtk pnpm test:runtime-foundations` 或 `rtk pnpm test:deployment-smoke`
- 涉及 retrieval、summary、governance、feedback、badcase export、eval runner：相关包测试外，至少补 `rtk pnpm eval:smoke`
- 涉及 distributed hop、worker、queue、failure taxonomy：补对应 host/service acceptance 或包级最小测试，确保链路级断言存在

## 完成定义

- 根 `plan.md` 只保留当前“数据埋点增强”主线的索引职责
- [`../../docs/todos/instrumentation-observability-plan.md`](../../docs/todos/instrumentation-observability-plan.md) 成为唯一活跃细则入口
- 统一的埋点命名、trace 关联键、指标口径、debug surface 边界和 owner 分层已冻结
- 运行时、异步链路、retrieval/governance/feedback 排障面具备最小可用的观测与追踪能力
- 文档入口、truth source、测试矩阵和守卫与当前实现一致
