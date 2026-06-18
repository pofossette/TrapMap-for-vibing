# TrapMap Runtime Recomposition Plan

## 状态

- 状态：`active`
- 目标日期：`2026-06-18`
- 本文件角色：根级总计划与索引，只描述背景、总要求、阶段边界与子计划入口

## 背景

TrapMap 当前已经完成了两条关键演进：

- CLI 已经收敛为 `gateway-only` 接入模型，`packages/cli/src/lib/http.ts` 代表了一层可进一步抽离的通用网络访问能力。
- Server 已经具备 `local-agent`、`team-monolith`、`distributed` 三种 deployment profile，以及 `runtimeMode`、`serviceUnit`、`task transport` 等运行时语义。

下一阶段不是继续把所有能力堆进 `packages/cli` 和 `packages/server`，而是做一次面向长期复用和宿主装配的重构：

1. 把 CLI 中已经去掉 Node 专属依赖的网络层和可复用通用逻辑上提为 monorepo 新包，给未来 Web 面板、其他客户端和轻宿主共用。
2. 把后端从“单包内支持多种运行模式”推进到“公共核心内核 + 轻量本地宿主 + 细粒度重型微服务宿主”的可装配架构。
3. 明确 `gateway / identity-access / knowledge-read / knowledge-write / candidate-ingestion / governance-review / job-runtime` 等服务边界，让轻后端与重后端不是两套平行产品，而是同一核心内核的两种组装方式。

## 这轮计划的总目标

- 建立一个新的共享客户端核心包，承载 CLI 当前可复用的 HTTP gateway 访问层与后续面板通用逻辑。
- 建立一个新的后端核心内核层，沉淀 contracts 之上的应用编排、端口定义、运行时能力模型与宿主无关逻辑。
- 建立轻量本地宿主，服务 `local-agent` / `team-monolith` 等低运维形态。
- 建立更细粒度的重型微服务宿主，服务 `distributed` 以及未来更彻底的读写拆分、治理拆分和独立扩缩容。
- 在不破坏 gateway-only CLI 接入模型的前提下完成迁移。

## 总体要求

### 1. 架构要求

- 新增共享包不能只是“把文件挪位置”，必须先冻结公开接口、依赖边界和宿主责任。
- 轻宿主和重宿主都必须复用同一个核心内核，禁止复制一份“轻版本业务逻辑”和一份“重版本业务逻辑”。
- 读路径和写路径拆分后，gateway 仍然是外部唯一稳定入口；CLI 和未来 Web 面板不直接感知微服务内部拓扑。
- 微服务边界要按 authoritative ownership、读写语义和故障域划分，而不是按技术层随意拆文件。
- 重后端必须预留内部同步调用的 `RPC seam`，但首期不做 `RPC-first` 架构；先冻结服务接口与调用语义，再决定具体传输协议。
- 分布式形态首期继续共享 `packages/contracts`、共享 PostgreSQL、共享 queue/outbox 语义。

### 2. 工程要求

- 迁移要允许分阶段落地，不能要求一次性切换全部命令、全部路由、全部 worker。
- 每一阶段都要保留最小可运行形态，至少保证 `local-agent` 或 `team-monolith` 有一条稳定开发入口。
- 新包命名、目录位置、导出面、测试入口和 README 必须在计划阶段冻结。

### 3. 非目标

- 本轮不让 CLI 直连多个后端服务。
- 本轮不把 PostgreSQL 按服务拆库。
- 本轮不把 Kafka / NATS / Redis Streams 变成默认基础设施。
- 本轮不把 gRPC / Connect / tRPC 等 RPC 基础设施作为首期必须项。
- 本轮不引入第二套与现有 contracts 平行的数据契约系统。
- 本轮不优先做 UI 设计或 Web 面板具体页面实现；这里只为其共享层打基础。

## 建议交付顺序

1. 先冻结边界和术语，避免“拆包”和“微服务化”在不同文档里指代不同事情。
2. 先抽共享客户端核心包，让 CLI 与未来 Web 面板先在网络访问层达成复用。
3. 再抽后端公共核心内核，把当前 `packages/server` 内的宿主相关和业务编排相关逻辑拆开。
4. 在核心内核稳定后分别实现轻宿主和更细粒度的重宿主服务单元。
5. 最后推进增量迁移、验证矩阵和文档回写。

## 子计划目录

### A. 总边界与目标蓝图

- [00-baseline-and-target-architecture.md](docs/plans/runtime-recomposition/00-baseline-and-target-architecture.md)
  作用：冻结术语、边界、目标拓扑、包布局和非目标，给后续子计划提供统一前提。

### B. 共享客户端核心包

- [01-shared-client-core-extraction.md](docs/plans/runtime-recomposition/01-shared-client-core-extraction.md)
  作用：规划从 `packages/cli/src/lib/http.ts` 和通用逻辑中抽出新包，定义 Web 面板与 CLI 的共享 API。

### C. 后端公共核心内核

- [02-backend-core-kernel-extraction.md](docs/plans/runtime-recomposition/02-backend-core-kernel-extraction.md)
  作用：规划把 `packages/server` 中与宿主无关的应用编排、端口、能力模型、以及更细粒度服务单元边界上提为核心内核。

### D. 轻量本地宿主

- [03-light-host-assembly.md](docs/plans/runtime-recomposition/03-light-host-assembly.md)
  作用：规划本地/单实例轻宿主，服务 `local-agent` 与 `team-monolith` 的最小装配方案。

### E. 重型微服务宿主

- [04-heavy-microservice-assembly.md](docs/plans/runtime-recomposition/04-heavy-microservice-assembly.md)
  作用：规划 `gateway / identity-access / knowledge-read / knowledge-write / candidate-ingestion / governance-review / job-runtime` 的重型装配方式和服务边界。

### F. 迁移、验证与回写

- [05-migration-validation-and-doc-rollout.md](docs/plans/runtime-recomposition/05-migration-validation-and-doc-rollout.md)
  作用：规划分阶段迁移、兼容策略、测试矩阵、文档与脚本回写。

## 阶段依赖

- `00` 是所有后续子计划的前置。
- `01` 与 `02` 可以并行设计，但实施上优先完成 `01`，避免 Web 共享层继续绑死在 CLI 包内。
- `03`、`04` 都依赖 `02` 的核心内核边界冻结。
- `05` 依赖 `01` 到 `04` 的接口与目录方案基本稳定后再统一收口。

## 关键决策原则

- 优先抽“稳定边界”，再抽“实现文件”。
- 优先让轻宿主可运行，再让重宿主可扩展。
- 微服务化是运行时装配策略，不是复制代码和复制契约。
- 优先定义逻辑服务边界，再决定物理进程如何合并部署。
- 优先定义 internal port 和调用语义，再决定是否升级为正式 RPC。
- 所有客户端只面向 gateway，所有宿主都面向核心内核。

## 完成定义

当以下条件全部满足时，可认为这轮大计划完成：

- Monorepo 中新增了共享客户端核心包，并被 CLI 消费。
- Monorepo 中新增了后端核心内核层，并由轻宿主和重宿主共同复用。
- `local-agent`、`team-monolith`、`distributed` 的叙事被重新统一为“同一内核，不同宿主装配”。
- 更细粒度的重型部署拓扑有清晰的逻辑服务边界、运行入口、验证矩阵和文档事实源。
