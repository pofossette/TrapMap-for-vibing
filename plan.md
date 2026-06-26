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
- [ ] 冻结 contract-first 或 OpenAPI 生成路线
- [ ] 建立 `in-process` / `remote` 双 adapter 策略，让轻后端不依赖跨进程 hop
- 细则：[`docs/todos/nestjs-service-evolution-01-host-and-contract-foundation.md`](docs/todos/nestjs-service-evolution-01-host-and-contract-foundation.md)

### Phase 2 模块化单体切换

- [ ] 把核心 bounded context 收口到独立 domain/application 模块
- [ ] 让默认开发形态切到 Nest modular monolith
- [ ] 让旧 `server/host-*` 进入兼容层或迁移窗口
- [ ] 让 `embedded/local-agent` 成为第一等入口，而不是裁剪过多的特例模式
- 细则：[`docs/todos/nestjs-service-evolution-02-modular-monolith-cutover.md`](docs/todos/nestjs-service-evolution-02-modular-monolith-cutover.md)

### Phase 3 服务拆分与异步化

- [ ] 按既有业务 ownership 抽出独立服务
- [ ] 让同步/异步边界、队列、outbox、事件投影进入明确 owner
- [ ] 建立单体与分布式双形态验证矩阵
- [ ] 保证服务拆分只是部署展开，不反向强迫轻后端承担微服务负载
- [ ] 至少把一组过渡态服务提升到“成熟服务最小标准”
- [ ] 第一批成熟服务样板固定为 `knowledge-write + governance-review`
- 细则：[`docs/todos/nestjs-service-evolution-03-service-extraction-and-async.md`](docs/todos/nestjs-service-evolution-03-service-extraction-and-async.md)
  成熟度评估：[`docs/todos/nestjs-service-evolution-distributed-maturity-assessment.md`](docs/todos/nestjs-service-evolution-distributed-maturity-assessment.md)

### Phase 4 数据、运维与退役收尾

- [ ] 收敛读写模型 owner、读侧投影、容量与故障语义
- [ ] 退役旧宿主与冗余 transport 层
- [ ] 完成文档、测试、索引与归档收尾
- [ ] 完成“成熟服务” closeout，补齐剩余数据 owner 与运维治理要求
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
