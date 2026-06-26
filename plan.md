# TrapMap NestJS And Service Evolution Plan Index

## 状态

- 状态：`in_progress`
- 日期：`2026-06-26`
- 本文件角色：根级执行计划索引，只保留目标、约束、阶段顺序、进度勾选和细则入口
- 已归档的上一份根计划：[`docs/archived/archived-plans/plan-2026-06-26-enum-and-export-cleanup-archived.md`](docs/archived/archived-plans/plan-2026-06-26-enum-and-export-cleanup-archived.md)

## 目标

- 用 NestJS 重建后端宿主、HTTP transport、配置装配和进程内 DI，逐步替换大量手搓宿主代码。
- 保留领域内核的框架无关性，把 `backend-core` 收敛为真正可被单体和微服务共用的业务内核。
- 建立“轻后端优先”的嵌入式宿主形态，让后端可以像客户端一样低负担运行，并作为默认开发与单机部署主线。
- 先建立 `Nest modular monolith`，再按既有 bounded context 逐步物理拆分服务，而不是直接平行重写第二套系统。
- 统一外部 SDK、内部调用 contract、事件 contract 和测试/文档回写规则，避免 CLI、web、gateway、internal client 再次分叉。

## 总体要求

- 根 `plan.md` 只做索引；所有阶段细则写入 `docs/todos/`，并从这里相对路径链接。
- 完成某个阶段复选框前，必须同时完成：代码或 contract 落地、最小测试、事实文档回写、`pnpm check:docs-drift`、`pnpm check:structure`。
- 任何阶段如果改动 API、事件、共享类型、运行时 profile、部署默认值、目录结构，必须同步更新对应 `README`、`docs/reference/*`、`docs/guides/*`、`docs/operations/*`。
- 微服务化默认以“共享 contract + 明确 owner + 可单进程运行”为前提；没有通过 modular-monolith 收口的边界，不允许直接物理拆分。
- 默认开发入口仍需保留轻量本地模式；不能为了分布式目标破坏 `local-agent` 类似的低负担开发体验。
- 轻后端必须优先支持 `in-process` 调用、单端口、单进程 worker/outbox、最小外部依赖；远端调用、MQ、多进程协调只作为 `distributed` profile 的可选展开。

## 计划使用方式

- 根计划维护四类信息：阶段目标、阶段切换门槛、当前关键路径、细则入口；实现细节、测试记录、遗留债务只写入 `docs/todos/` 子计划。
- 允许为后续阶段提前做调研或预埋，但不得跳过前一阶段的退出门槛就宣告后续阶段“完成”或切换仓库默认主线。
- 每个阶段至少要回答四个问题后才能打勾：默认入口是否变化、`in-process` 是否仍成立、共享 contract 是否唯一、旧实现是否已降级为兼容壳或明确例外。

## 当前关键路径

- 当前主线阶段：`Phase 1 宿主与 contract 基础收口`
- 当前先做：
  - [ ] 冻结首个 Nest 试点切面：`gateway + knowledge-read`；`identity-access` 因 auth contract drift 延后
  - [ ] 建立可跑通一条真实链路的 Nest 宿主主入口，验证现有 `backend-core` 可装配
  - [ ] 收口统一配置、异常映射、认证上下文、日志/trace、validation pipeline
  - [ ] 冻结 `contracts` Zod-first / route-manifest-first 主线；OpenAPI 只作派生产物
  - [ ] 为首批 internal port 接入 `in-process` / `remote` 双 adapter，并让轻后端默认仍走 `in-process`
- 未完成以上关键路径前，不进入 `Phase 2` 的默认主线切换。

## 阶段切换门槛

### `Phase 0 -> Phase 1`

- [x] 长期目标、运行模型、contract 主线、服务样板优先级已冻结
- [x] 当前 distributed 成熟度基线已定为 `Level 2 / transitional-microservice`

### `Phase 1 -> Phase 2`

- [ ] 至少一个真实开发链路已经跑在 Nest 宿主上，而不是只完成脚手架
- [ ] 配置、异常、鉴权上下文、生命周期钩子已有统一装配面
- [ ] 至少一组 internal port 已经证明 `in-process` / `remote` 双 adapter 可共用同一 contract
- [ ] 旧 `host-local` / `packages/server` / `service-*` 的兼容窗口和例外路径已写清

### `Phase 2 -> Phase 3`

- [ ] `team-monolith` 或等价默认开发主线已切到新的 modular monolith
- [ ] `embedded/local-agent` 与 `team-monolith` 已共用同一主实现面，只在 capability 和依赖上裁剪
- [ ] 主要 bounded context 已按 owner 收口成清晰 module boundary，而不是继续靠 route/目录命名假分层
- [ ] 旧宿主只保留兼容职责，不再承接新的 authoritative orchestration

### `Phase 3 -> Phase 4`

- [ ] `knowledge-write + governance-review` 已完成第一批成熟服务样板 closeout
- [ ] distributed 至少具备 `Level 3` 所需的大部分 owner/观测/故障语义证据
- [ ] 单体与 distributed 的双形态验证矩阵已稳定，不再依赖隐含共享状态解释成功路径

### `Phase 4` 关闭门槛

- [ ] 新主线已成为默认开发、测试、部署与文档入口
- [ ] 旧宿主、重复 transport、重复 client 已退役或只保留有限迁移窗口
- [ ] 数据 owner、projection owner、runtime owner 和运维判据已经闭环
- [ ] 根计划只保留索引职责，剩余历史信息已转入归档或对应子计划

## 阶段索引

### Phase 0 决策与目标架构冻结

- [x] 冻结长期目标：`Nest host + framework-free domain core + gradual service extraction`
- [x] 明确哪些现有包保留、拆分、重命名、退役
- [x] 冻结 HTTP contract、internal contract、event contract 的主线方案
- [x] 冻结轻后端形态：`embedded/local-agent -> team-monolith -> distributed` 三档运行模型
- [x] 完成当前 distributed 形态成熟度评估，冻结“过渡态分布式”基线判断
- 细则：[`docs/todos/nestjs-service-evolution-00-target-architecture.md`](docs/todos/nestjs-service-evolution-00-target-architecture.md)
  成熟度评估：[`docs/todos/nestjs-service-evolution-distributed-maturity-assessment.md`](docs/todos/nestjs-service-evolution-distributed-maturity-assessment.md)

### Phase 1 宿主与 contract 基础收口

- [ ] 建立首个 Nest 宿主主线，并验证可装配现有 `backend-core`
- [ ] 收敛配置、异常映射、HTTP SDK、internal client 的重复实现
- [ ] 冻结 contract-first 主线；OpenAPI 仅作为共享 contract 的派生导出
- [ ] 建立 `in-process` / `remote` 双 adapter 策略，让轻后端不依赖跨进程 hop
- [ ] 完成以下索引级检查点后，才允许进入默认主线切换：
  - [ ] 选定首个试点：`gateway + knowledge-read`，并标注 `identity-access` 延后的 auth contract 原因
  - [ ] Nest bootstrap、module graph、生命周期和配置入口已能装配一条真实链路
  - [ ] 认证上下文、异常过滤、validation、日志/trace 中间件已统一到新宿主装配面
  - [ ] 外部 SDK 与 internal client 的事实源和维护方式已冻结，不再允许 route-local shadow type 继续扩散
  - [ ] 轻后端默认走 `in-process`，只有 `distributed` profile 才要求跨进程 hop
  - [ ] 旧宿主兼容窗口、回退路径、文档入口已经写清
- 细则：[`docs/todos/nestjs-service-evolution-01-host-and-contract-foundation.md`](docs/todos/nestjs-service-evolution-01-host-and-contract-foundation.md)

### Phase 2 模块化单体切换

- [ ] 把核心 bounded context 收口到独立 domain/application 模块
- [ ] 让默认开发形态切到 Nest modular monolith
- [ ] 让旧 `server/host-*` 进入兼容层或迁移窗口
- [ ] 让 `embedded/local-agent` 成为第一等入口，而不是裁剪过多的特例模式
- [ ] 以以下顺序推进并记录完成状态：
  - [ ] `gateway` 宿主外壳与共用 app assembly 稳定
  - [ ] `identity-access`、`knowledge-read` 先完成基础模块化，支撑鉴权与查询主链路
  - [ ] `knowledge-write`、`governance-review` 收口为后续成熟服务样板的单体基线
  - [ ] `candidate-ingestion`、`job-runtime` 最后接入，共享同一 modular-monolith 主实现面
  - [ ] 本地启动命令、profile、README、testing 入口全部切到新主线
  - [ ] 旧宿主降级为兼容层后，不再继续接纳新的主实现逻辑
- 细则：[`docs/todos/nestjs-service-evolution-02-modular-monolith-cutover.md`](docs/todos/nestjs-service-evolution-02-modular-monolith-cutover.md)

### Phase 3 服务拆分与异步化

- [ ] 按既有业务 ownership 抽出独立服务
- [ ] 让同步/异步边界、队列、outbox、事件投影进入明确 owner
- [ ] 建立单体与分布式双形态验证矩阵
- [ ] 保证服务拆分只是部署展开，不反向强迫轻后端承担微服务负载
- [ ] 至少把一组过渡态服务提升到“成熟服务最小标准”
- [ ] 第一批成熟服务样板固定为 `knowledge-write + governance-review`
- [ ] 服务拆分执行顺序固定为：
  - [ ] 先完成 `knowledge-write + governance-review` 的 preflight、contract 冻结和 owner closeout
  - [ ] 再补齐 outbox、queue、重试、幂等、死信、投影 lag 的服务级语义与观测
  - [ ] 然后验证单体/分布式双形态共用同一 contract 与业务真相
  - [ ] 最后才推进第二批 `candidate-ingestion + knowledge-write`
  - [ ] `knowledge-read`、`identity-access`、`job-runtime` 继续按“暂缓成熟化、允许配合演进”的口径推进
  - [ ] 任一拆分若提升了部署复杂度却没有带来 owner/隔离/观测收益，视为未完成
- 细则：[`docs/todos/nestjs-service-evolution-03-service-extraction-and-async.md`](docs/todos/nestjs-service-evolution-03-service-extraction-and-async.md)
  成熟度评估：[`docs/todos/nestjs-service-evolution-distributed-maturity-assessment.md`](docs/todos/nestjs-service-evolution-distributed-maturity-assessment.md)

### Phase 4 数据、运维与退役收尾

- [ ] 收敛读写模型 owner、读侧投影、容量与故障语义
- [ ] 退役旧宿主与冗余 transport 层
- [ ] 完成文档、测试、索引与归档收尾
- [ ] 完成“成熟服务” closeout，补齐剩余数据 owner 与运维治理要求
- [ ] 收尾顺序固定为：
  - [ ] 先冻结剩余 shared DB 例外、projection owner、runtime owner 和迁移窗口关闭条件
  - [ ] 再删除或封存旧宿主、重复 transport、重复 SDK/internal client 维护路径
  - [ ] 再完成 truth source、目录索引、测试矩阵、归档记录回写
  - [ ] 最后声明新的默认入口、关闭兼容壳新增功能通道，并把未做项转成后续独立计划
- 细则：[`docs/todos/nestjs-service-evolution-04-data-runtime-and-cutover.md`](docs/todos/nestjs-service-evolution-04-data-runtime-and-cutover.md)

## 文档回写要求

- 架构边界变化：更新 `docs/architecture/ARCHITECTURE.md`、必要的 component docs、`docs/PACKAGES.md`
- 目录/包角色变化：更新 `docs/reference/REPO_STRUCTURE.md`、`docs/README.md`、相关 package README
- 启动命令、profile、环境变量、部署方式变化：更新 `README.md`、`docs/architecture/DEPLOYMENT.md`、`docs/operations/ENVIRONMENT.md`
- API、internal route、事件、共享 contract 变化：更新 `docs/reference/api-surface.md`、`docs/reference/SYSTEM_TRUTH_SOURCES.md`、相关 contract 文档
- 测试与验证矩阵变化：更新 `docs/operations/TESTING.md`

## 测试与关闭要求

- 文档/索引改动至少运行：
  - [x] `pnpm check:docs-drift`
  - [x] `pnpm check:structure`
- 任一阶段的代码改动必须补最小验证，并在对应细则里记录：
  - [ ] 包级测试或 `pnpm test:file -- <path>`
  - [ ] 受影响包 `pnpm typecheck`
  - [ ] 若影响 runtime/deployment，补 `pnpm test:deployment-smoke`
  - [ ] 若影响检索/摘要/治理/feedback/eval runner，补 `pnpm eval:smoke`

## 完成定义

- 默认开发体验已切到新的 Nest 主线，且不比当前本地模式更重。
- 轻后端可以像客户端一样低负担启动，并且默认不依赖微服务基础设施。
- 领域内核保持框架无关，可被单进程和分布式宿主复用。
- internal client、外部 SDK、共享 contract 与文档入口不再多头维护。
- 旧 `server/host-*` 的兼容层只保留明确迁移窗口，最终可退役。
- 根 `plan.md` 只保留索引职责，细则、测试记录和剩余债务都留在 `docs/todos/` 对应子计划。
