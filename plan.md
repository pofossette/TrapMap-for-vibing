# TrapMap 架构整改计划索引

## 状态

- 状态：`完成`
- 日期：`2026-06-28`
- 本文件角色：根级执行索引，只保留目标、总体要求、阶段复选框与细则入口
- 当前活跃细则：[`docs/todos/trapmap-architecture-remediation-plan.md`](docs/todos/trapmap-architecture-remediation-plan.md)
- 刚归档的上一份根计划：[`docs/archived/archived-plans/plan-2026-06-28-robustness-scalability-closeout-index-archived.md`](docs/archived/archived-plans/plan-2026-06-28-robustness-scalability-closeout-index-archived.md)

## 目标

- 作为当前架构整改主线的唯一根级索引，统一指向单一问题池、阶段推进和活跃细则入口
- 收口 30 个架构问题，避免继续在多份计划里并行定义当前状态、目标状态和 deferred 入口
- 把后续整改所需的文档回写要求、最小测试矩阵和关闭条件稳定到单一执行面

## 总体要求

- 根 `plan.md` 只做索引；具体问题池、关闭条件、文档矩阵和测试矩阵统一写在 [`docs/todos/trapmap-architecture-remediation-plan.md`](docs/todos/trapmap-architecture-remediation-plan.md)
- 每个阶段勾选完成前，必须同时完成：结构结论或代码整改、受影响测试、相关文档回写、`rtk pnpm check:docs-drift`、`rtk pnpm check:structure`
- 不允许再新增平行根计划描述同一架构整改主题；新增专题必须被当前细则直接引用，或转入明确的 deferred 独立计划
- 文档不得把未来态写成当前态；若整改尚未落地，必须明确写成“现状 / 目标 / 过渡态”
- 统一适配器必须满足：接口集中定义、适配器集中实现、宿主按环境变量选择、构建可按 target 摇树裁剪
- 涉及 retrieval、governance、feedback、fixtures、eval runner 的改动，至少补 `rtk pnpm eval:smoke`

## 当前关键路径

- 当前主线阶段：`Phase 0-7 全部完成`
- 当前状态：
  - [x] 归并 30 个问题到单一问题池并冻结优先级
  - [x] 明确 `server`、`backend-core`、`service-*`、`host-*` 的当前事实与目标边界
  - [x] 明确 `store_snapshot`、InMemory、`PG-first` 的测试与运行口径
  - [x] 冻结统一适配器的范围、目录与接口边界
  - [x] 冻结统一适配器的环境变量矩阵与 target 裁剪策略
  - [x] 写清 distributed 当前过渡态成熟度基线与 deferred 范围
  - [x] 收口历史计划、索引和 truth source，避免继续双轨叙述
  - [x] 对齐 CI/testing truth、deferred 落点与文档守卫，完成可维护性收口

## 阶段索引

### Phase 0 问题池冻结与入口归并

- [x] Wave 0A：把 30 个问题映射为 5 个治理主题并冻结优先级
- [x] Wave 0B：明确本轮非目标、deferred 入口与代码整改 / 文档冻结的关闭方式分类
- [x] Wave 0C：收口当前唯一根索引与唯一活跃细则，并明确历史输入角色
- [x] Wave 0D：把“统一适配器”写成本轮正式目标，而不是 `store_snapshot` 迁移的隐含副产物
- 细则：[`docs/todos/trapmap-architecture-remediation-plan.md`](docs/todos/trapmap-architecture-remediation-plan.md)

### Phase 1 Server / Backend-Core 边界整改

- [x] Wave 1A：收口 `server` 的 compatibility shell 定位
- [x] Wave 1B：冻结 `backend-core`、`service-*`、schema、repository` 的目标归属
- [x] Wave 1C：冻结 AI adapter 与基础设施 owner 边界
- [x] Wave 1D：补齐对应文档真相与最小测试入口
- [x] Wave 1E：核查 Nest `light` 主线与 Fastify compatibility shell 的 startup lifecycle 等价性，明确 worker/outbox/candidate recovery/graph reconciliation 的 owner、启动入口和测试证据
- [x] Wave 1F：移除或封装 `host-local` 顶层 runtime 初始化副作用，冻结 Nest provider factory / lifecycle hook 的目标形态
- [x] Wave 1G：拆分 `packages/server/src/app.ts` 的 route gating、service composition、runtime metadata、startup/shutdown 组合职责，降低 compatibility shell 退役成本
- 细则：[`docs/todos/trapmap-architecture-remediation-plan.md`](docs/todos/trapmap-architecture-remediation-plan.md)

### Phase 2 Store Snapshot 现状盘点与迁移口径冻结

- [x] Wave 2A：收口 `store_snapshot`、InMemory、PG 双轨的角色和退役/保留条件
- [x] Wave 2B：明确直接操作 God Object 的入口与整改优先级
- [x] Wave 2C：冻结迁移波次、双写语义与兼容层 / 生产路径测试口径
- 细则：[`docs/todos/trapmap-architecture-remediation-plan.md`](docs/todos/trapmap-architecture-remediation-plan.md)

### Phase 3 统一适配器范围、目录与接口冻结

- [x] Wave 3A：冻结统一适配器覆盖范围与 provider taxonomy
- [x] Wave 3B：建立统一适配器接口层与集中 provider 实现目录
- [x] Wave 3C：冻结 repository / adapter / host 装配边界
- [x] Wave 3D：明确 `packages/server`、`host-*`、`service-*` 的 provider 消费规则
- [x] Wave 3E：冻结 distributed gateway contract adapter 方向，避免在 gateway route 中继续手写 validation / forward / canonical error mapping
- [x] Wave 3F：明确 `client-core` 的运行时响应校验策略，区分 `apiRequest<T>` 编译期类型提示与 contracts schema parse 的边界
- 细则：[`docs/todos/trapmap-architecture-remediation-plan.md`](docs/todos/trapmap-architecture-remediation-plan.md)

### Phase 4 统一适配器环境变量与构建裁剪冻结

- [x] Wave 4A：冻结 selector env 与 provider-specific env
- [x] Wave 4B：冻结 profile 推荐组合与 fail-fast / fallback 规则
- [x] Wave 4C：明确 `light` / `heavy` target 的 tree-shaking / optional dependency 约束
- 细则：[`docs/todos/trapmap-architecture-remediation-plan.md`](docs/todos/trapmap-architecture-remediation-plan.md)

### Phase 5 Distributed 基线与运行隔离冻结

- [x] Wave 5A：明确 shared PG、同步 RPC、无熔断、无 tracing、compose 编排限制的真实状态
- [x] Wave 5B：收口 distributed 当前基线与未来成熟态的边界
- [x] Wave 5C：让 distributed 形态复用统一适配器装配，不再私有拼接数据库、队列、缓存和图接入
- [x] Wave 5D：对齐 `docker-compose.yml` 的 distributed 服务清单与 gateway internal URL 拓扑，明确当前阶段是完整七服务拓扑还是受限 phase-1 worker 拓扑
- [x] Wave 5E：冻结 compose 默认 `team-monolith` 启动语义，避免 `docker compose up -d`、profile、README 和部署文档互相漂移
- 细则：[`docs/todos/trapmap-architecture-remediation-plan.md`](docs/todos/trapmap-architecture-remediation-plan.md)

### Phase 6 分布式成熟能力与成熟库替换矩阵冻结

- [x] Wave 6A：冻结 `internal client + resilience` 与 `tracing + metrics` 的实施顺序
- [x] Wave 6B：冻结 `rate limiting + bulkhead / 背压` 的实施顺序
- [x] Wave 6C：冻结 `cache + invalidation`、`service discovery`、`DB budget / PgBouncer`、`health indicator` 的引入条件
- [x] Wave 6D：冻结“优先引成熟库 / 条件成熟后引入 / 暂不替换”的矩阵
- [x] Wave 6E：明确 `light` / `heavy` 下的不同默认策略
- [x] Wave 6F：统一 graph runtime 配置入口，明确 `server` compatibility shell、`host-local` 和 distributed 下 graph provider / readiness / fail-open 行为是否一致
- 细则：[`docs/todos/trapmap-architecture-remediation-plan.md`](docs/todos/trapmap-architecture-remediation-plan.md)

### Phase 7 可维护性、配置复杂度与文档真相收口

- [x] Wave 7A：收口文档/代码状态漂移、contracts 膨胀、历史计划过多和测试路径依赖
- [x] Wave 7B：明确 Dockerfile / config 复杂度问题的处理方向
- [x] Wave 7C：收口成熟库替换边界、暂缓原因与 deferred 问题池
- [x] Wave 7D：补齐部署、运行、testing、architecture 文档
- [x] Wave 7E：关闭本轮未决复选框或明确 deferred
- [x] Wave 7F：统一 `eval:smoke`、`eval:ci`、`eval:ci:core` 的覆盖语义、baseline 策略和文档表述
- [x] Wave 7G：对齐 GitHub CI、`pnpm run ci`、`docs/operations/CI_CD.md` 与 `docs/operations/TESTING.md` 的真实命令、Node 版本、job 覆盖和质量门边界
- [x] Wave 7H：增强 doc-drift / structure / complexity 守卫，覆盖当前唯一活跃细则、历史 todo 状态、plan/todos 索引一致性和本轮热点文件预算
- 细则：[`docs/todos/trapmap-architecture-remediation-plan.md`](docs/todos/trapmap-architecture-remediation-plan.md)

## 文档回写要求

- 每完成一个阶段或子项，同步更新 [`docs/todos/trapmap-architecture-remediation-plan.md`](docs/todos/trapmap-architecture-remediation-plan.md) 中对应复选框、问题池状态和关闭条件
- 根计划切换、待办索引、归档入口变化：更新 `docs/README.md`、`docs/todos/README.md`、`docs/archived/README.md`
- 架构事实、目录归属、包职责变化：更新 `docs/reference/SYSTEM_TRUTH_SOURCES.md`、`docs/reference/REPO_STRUCTURE.md`、`docs/PACKAGES.md`
- distributed、部署、环境、测试口径变化：更新 `docs/architecture/*`、`docs/operations/ENVIRONMENT.md`、`docs/operations/TESTING.md`
- 统一适配器目录、provider 组合、环境变量矩阵、target 裁剪规则变化：更新相关 package README 与 host/build 细则
- 根 `plan.md` 不承载实现细节，只保留索引职责

## 测试回写要求

- 仅调整计划/索引文档：至少运行 `rtk pnpm check:docs-drift` 与 `rtk pnpm check:structure`
- 涉及 contracts、共享类型、导出边界：补 `rtk pnpm typecheck` 与受影响包最小测试
- 涉及统一适配器接口、provider registry 或 host 装配：补 focused tests，必要时补 target-specific smoke
- 涉及 `server`、`backend-core`、`service-*`、`host-*`、runtime 或 distributed 边界：补受影响包 focused tests，必要时补 `rtk pnpm test:runtime-foundations` 与 `rtk pnpm test:deployment-smoke`
- 涉及 retrieval、governance、feedback、fixtures、eval runner：相关包测试外，至少补 `rtk pnpm eval:smoke`
- 任一阶段勾选完成前，至少确认“结构结论或代码整改 + focused tests + 文档回写 + `check:docs-drift` + `check:structure`”同时完成

## 完成定义

- [x] 根 `plan.md` 只保留当前“架构整改”主线的索引职责
- [x] [`docs/todos/trapmap-architecture-remediation-plan.md`](docs/todos/trapmap-architecture-remediation-plan.md) 成为当前唯一活跃细则入口
- [x] 30 个问题都被归类为“已关闭 / 进行中且有 owner / 明确 deferred”
- [x] 统一适配器的接口、provider、环境变量和构建策略已冻结并进入权威文档
- [x] 文档入口、truth source、测试矩阵与当前实现一致，不再把未来态误写为现状
