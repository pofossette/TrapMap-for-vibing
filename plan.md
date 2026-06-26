# TrapMap NestJS And Service Evolution Plan Index

## 状态

- 状态：`Phase 4 审计回写中`
- 日期：`2026-06-26`
- 本文件角色：根级执行计划索引，只保留目标、约束、阶段顺序、进度勾选和细则入口
- 已归档的历史阶段详细描述：[`docs/archived/archived-plans/plan-2026-06-26-nestjs-phase0-to-phase3-archived.md`](docs/archived/archived-plans/plan-2026-06-26-nestjs-phase0-to-phase3-archived.md)
- 上一份已归档根计划：[`docs/archived/archived-plans/plan-2026-06-26-enum-and-export-cleanup-archived.md`](docs/archived/archived-plans/plan-2026-06-26-enum-and-export-cleanup-archived.md)

## 目标

- 用 NestJS 重建后端宿主、HTTP transport、配置装配和进程内 DI，逐步替换大量手搓宿主代码。
- 保留领域内核的框架无关性，把 `backend-core` 收敛为真正可被单体和微服务共用的业务内核。
- 建立"轻后端优先"的嵌入式宿主形态，让后端可以像客户端一样低负担运行，并作为默认开发与单机部署主线。
- 先建立 `Nest modular monolith`，再按既有 bounded context 逐步物理拆分服务，而不是直接平行重写第二套系统。
- 统一外部 SDK、内部调用 contract、事件 contract 和测试/文档回写规则，避免 CLI、web、gateway、internal client 再次分叉。

## 总体要求

- 根 `plan.md` 只做索引；所有阶段细则写入 `docs/todos/`，并从这里相对路径链接。
- 完成某个阶段复选框前，必须同时完成：代码或 contract 落地、最小测试、事实文档回写、`pnpm check:docs-drift`、`pnpm check:structure`。
- 任何阶段如果改动 API、事件、共享类型、运行时 profile、部署默认值、目录结构，必须同步更新对应 `README`、`docs/reference/*`、`docs/guides/*`、`docs/operations/*`。
- 微服务化默认以"共享 contract + 明确 owner + 可单进程运行"为前提；没有通过 modular-monolith 收口的边界，不允许直接物理拆分。
- 默认开发入口仍需保留轻量本地模式；不能为了分布式目标破坏 `local-agent` 类似的低负担开发体验。
- 轻后端必须优先支持 `in-process` 调用、单端口、单进程 worker/outbox、最小外部依赖；远端调用、MQ、多进程协调只作为 `distributed` profile 的可选展开。

## 计划使用方式

- 根计划维护四类信息：阶段目标、阶段切换门槛、当前关键路径、细则入口；实现细节、测试记录、遗留债务只写入 `docs/todos/` 子计划。
- 允许为后续阶段提前做调研或预埋，但不得跳过前一阶段的退出门槛就宣告后续阶段"完成"或切换仓库默认主线。
- 每个阶段至少要回答四个问题后才能打勾：默认入口是否变化、`in-process` 是否仍成立、共享 contract 是否唯一、旧实现是否已降级为兼容壳或明确例外。

## 当前关键路径

- 当前主线阶段：`Phase 4 数据、运维与退役收尾`
- 当前先做：
  - [x] 冻结仓库级 owner matrix、shared DB 例外和 operations owner 规则回写
  - [ ] 回写默认入口、默认测试矩阵、默认部署入口的真实现状：`host-local` 默认仍是 Fastify bootstrap，Nest modular-monolith 仍为 opt-in 迁移轨道
  - [ ] 回写 `packages/server` candidate/review legacy 写路径仍未退役的迁移窗口例外
  - [ ] 删除或封存旧宿主、重复 transport、重复 SDK/internal client 维护路径
  - [x] 完成 truth source、目录索引、测试矩阵、归档记录回写
  - [x] 声明长期 Nest 目标主线，并关闭 compatibility shell 新增功能通道的文档灰区
- 完成以上关键路径后，根 `plan.md` 退回纯索引职责。

## 阶段索引

### Phase 0 决策与目标架构冻结 [已完成]

- [x] 冻结长期目标、运行模型、contract 主线、服务样板优先级
- [x] 冻结轻后端形态：`embedded/local-agent -> team-monolith -> distributed` 三档运行模型
- [x] 完成 distributed 形态成熟度评估，冻结"过渡态分布式"基线
- 细则：[`docs/todos/nestjs-service-evolution-00-target-architecture.md`](docs/todos/nestjs-service-evolution-00-target-architecture.md)
- 成熟度评估：[`docs/todos/nestjs-service-evolution-distributed-maturity-assessment.md`](docs/todos/nestjs-service-evolution-distributed-maturity-assessment.md)

### Phase 1 宿主与 contract 基础收口 [已完成]

- [x] 建立首个 Nest 宿主主线，验证可装配 `backend-core`
- [x] 收敛配置、异常映射、HTTP SDK、internal client 重复实现
- [x] 冻结 contract-first 主线；`in-process` / `remote` 双 adapter 策略落地
- 细则：[`docs/todos/nestjs-service-evolution-01-host-and-contract-foundation.md`](docs/todos/nestjs-service-evolution-01-host-and-contract-foundation.md)

### Phase 2 模块化单体切换 [边界已完成，默认入口切换未完成]

- [x] 六个 bounded context 收口到独立 domain/application 模块
- [ ] 默认开发形态切到 Nest modular monolith
- [x] 旧 `server/host-*` 进入兼容层或迁移窗口
- 细则：[`docs/todos/nestjs-service-evolution-02-modular-monolith-cutover.md`](docs/todos/nestjs-service-evolution-02-modular-monolith-cutover.md)

### Phase 3 服务拆分与异步化 [已完成]

- [x] 按业务 ownership 抽出独立服务，建立双形态验证矩阵
- [x] `knowledge-write + governance-review` 完成第一批成熟服务样板 closeout
- 细则：[`docs/todos/nestjs-service-evolution-03-service-extraction-and-async.md`](docs/todos/nestjs-service-evolution-03-service-extraction-and-async.md)
- 成熟度评估：[`docs/todos/nestjs-service-evolution-distributed-maturity-assessment.md`](docs/todos/nestjs-service-evolution-distributed-maturity-assessment.md)

### Phase 4 数据、运维与退役收尾 [进行中]

- [x] 收敛读写模型 owner、读侧投影、容量与故障语义
- [ ] 退役旧宿主与冗余 transport 层
- [x] 完成文档、测试、索引与归档收尾
- [ ] 完成"成熟服务" closeout，补齐剩余数据 owner 与运维治理要求
- [x] 冻结仓库级 owner matrix 与迁移窗口关闭条件
- [x] 点名可正式退役的 compatibility shell 与继续保留的部署层
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
  - [x] 包级测试或 `pnpm test:file -- <path>`
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
