# TrapMap 轻重后端构建目标计划

## 状态

- 状态：`进行中`
- 对应根索引：[`../../plan.md`](../../plan.md)
- 主题：在不引入第二套业务真相的前提下，收敛成更优雅、更易管理的两种后端构建目标，并为客户端补一个显式配置项区分轻/重后端

## 目标

- 将当前后端运行叙事收敛为两种可维护的构建目标：`light` 与 `heavy`
- 继续复用同一套 `contracts + backend-core + bounded-context/service assembly`，不维护第二套业务实现
- 把轻重差异收敛到 host/bootstrap/connector/deployment wiring，而不是散落到 route 和 use case
- 为客户端增加一个显式配置项，用于区分目标后端形态，但继续保持“只对统一 gateway 编程”的接入模型
- 在不误删真实宿主实现的前提下，尽可能清除仍停留在仓库里的 compatibility shell / facade / 过渡入口

## 非目标

- 不把客户端改成直连内部 service
- 不新增第三种长期构建目标
- 不在本计划里重新设计六个 bounded context owner matrix
- 不为了“看起来干净”而提前删除当前默认轻宿主仍依赖的真实运行时职责

## 冻结原则

- `light` 与 `heavy` 描述的是后端构建/部署目标，不是新的业务 profile 术语替代品；具体映射关系必须写清
- 客户端配置项只表达“目标后端形态偏好/声明”，不得长出第二套 URL、第二套认证模型或内部服务发现逻辑
- 共享实现只能放在 `packages/contracts`、`packages/backend-core`、相关 `service-*` 主实现和 host-agnostic seam；transport/connector 继续由宿主维护
- 轻量路径允许进程内 connector，重型路径允许 remote connector，但两者必须消费同一组 port contract
- “彻底替换兼容壳”不等于“直接删文件”；它的标准是：旧壳层承担的职责都被更成熟、更稳定、owner 清晰的真实实现接管，且默认入口不再依赖旧壳

## Phase 0 冻结结论

### A. 正式术语表

| 术语 | 正式中文 | 适用范围 | 正式映射 |
|---|---|---|---|
| `light` | 轻量后端构建目标 | 只描述 build/deployment target，不改写 profile/capability 模型 | `local-agent` -> `light`；`team-monolith` -> `light` |
| `heavy` | 重型后端构建目标 | 只描述 build/deployment target，不改写 profile/capability 模型 | `distributed` -> `heavy` |
| `deployment profile` | 部署 profile | 产品/部署形态真相 | 继续固定为 `local-agent`、`team-monolith`、`distributed` |
| `embedded` | 嵌入式本地产品语义 | 只是 `local-agent` 的产品语义别名，不是第四种 profile | `embedded` 属于 `local-agent`，因此映射到 `light` |
| `gateway only` | 仅网关接入模型 | 客户端接入真相，不属于 build target 词汇 | `light` 与 `heavy` 都只暴露单一 gateway URL |

映射总表：

| profile / 语义 | build target | 客户端接入模型 |
|---|---|---|
| `embedded` | `light` | `gateway only` |
| `local-agent` | `light` | `gateway only` |
| `team-monolith` | `light` | `gateway only` |
| `distributed` | `heavy` | `gateway only` |

冻结补充：

- `light` / `heavy` 只允许作为“后端构建目标”术语出现，不得替换 `deployment profile`、`capability`、`runtimeMode`、`serviceUnit`。
- `packages/backend-core` 的正式共享关系是：`local-agent` 与 `team-monolith` 共同属于 `light`，`distributed` 属于 `heavy`；`packages/backend-core/README.md` 中把 `team-monolith` 归入 heavy-host 的旧表述必须视为已关闭冲突。

### B. Compatibility 词族判定标准 checklist

#### `compatibility shell`

- [x] 该对象直接暴露可执行或可挂载的进程/HTTP 入口。
- [x] 它保留的是 legacy 路由、legacy 宿主或迁移期外观，而不是冻结后的默认主入口。
- [x] 它可以调用共享内核或真实宿主实现，但自身不得继续长出新的 authoritative orchestration。
- [x] 只有在调用方和 rollback path 都切走后才能删除。

#### `compatibility facade`

- [x] 该对象不拥有 bootstrap、config、transport 或进程生命周期。
- [x] 它只提供 re-export、import-path shim 或极薄委托。
- [x] 删除动作只需要迁移 import/call site，不需要做流量切换。

#### `compatibility layer`

- [x] 该对象承担旧 contract / 旧配置 / 旧运行时语义到新 seam 的翻译。
- [x] 它不是默认可执行入口。
- [x] 它可以有 glue code，但不能拥有 profile 级业务真相或长期宿主 owner 决策。

#### `migration window`

- [x] 至少还有一个受支持调用方、默认链路或 rollback path 依赖该兼容对象。
- [x] 关闭条件已在计划或 truth source 中命名。
- [x] 在窗口关闭前，只允许收缩或迁移，不允许继续向其添加新的长期业务职责。

#### `rollback path`

- [x] 它是显式保留的非默认回退入口，用于切换失败时恢复旧行为。
- [x] 文档不得再把它描述为默认主入口。
- [x] 它的关闭条件必须同时包含：调用方切换、文档回写、最小测试与 smoke 验证完成。

#### `real host implementation`

- [x] 它直接拥有受支持 build target 或 service process 的 bootstrap、transport、依赖装配与 runtime capability 暴露。
- [x] 它可以直接解释目标部署形态，而不把默认 owner 委托给 compatibility shell。
- [x] 它允许依赖 `backend-core`、`contracts`、`service-*` 或共享 seam，但这些依赖不改变其宿主 owner 身份。

分类冻结：

| 对象 | 冻结归类 | 说明 |
|---|---|---|
| `packages/server` | `compatibility shell` | 非默认 Fastify 兼容壳与 shared runtime/status seam |
| `packages/host-local/src/bootstrap/**`、`src/http/**`、`src/runtime/**` | `retired implementation` | 旧 Fastify 轻宿主路径，已删除 |
| `packages/backend-core/src/modules/*.ts` | `compatibility facade` | 只保留 re-export/import-path 兼容面 |
| `packages/host-local/src/nest/**` | `real host implementation` | `light` 默认主入口终局 |
| `packages/host-distributed` | `real host implementation` | `heavy` 的真实重宿主实现，成熟度冻结为 `Level 2 / transitional-microservice` |
| `packages/service-*` | `real host implementation` | thin assembly，但属于真实 service process 装配，不是兼容层 |

Round 2 closeout note:

- `docker-compose.yml` 默认 `server` service 已切到 `packages/host-local/Dockerfile`，因此 compose 默认入口不再经 `packages/server` 启动默认 `light` 主线。
- `docker-compose.yml` 的 `gateway` / `candidate-worker` / `governance-worker` / `outbox-worker` 也已切到 `packages/host-distributed/Dockerfile`，`packages/server` 不再充当 distributed compose bootstrap owner。
- 仍未关闭的债是：默认 `light` 宿主已把 `host-services.ts` 收敛为 host-local service composition，并把 retrieval assembly / compat bridge / shared infra 拆到 `packages/host-local/src/nest/runtime/{retrieval-assembly,service-compat,shared-infra}.ts`；但这些 seam 仍暂时复用 `@trapmap/server` 的 shared infrastructure（store/repo/retrieval/async wiring），这属于 shared seam 收口问题，而不是默认 compose owner 仍在 `packages/server`。

### C. `packages/server` 三类职责归属表

统一描述句：

`packages/server` 是非默认 Fastify compatibility shell：只保留 legacy compatibility 与 shared runtime/status seam，不再承担默认 light 宿主职责，也不再提供本地宿主 rollback 入口。`

| 当前职责类别 | 冻结归属 | 处理结论 |
|---|---|---|
| shared runtime/status seam：runtime deployment 解析、runtime metadata、status/readiness payload helper、request/trace context glue | 共享 seam 保留 | 长期可继续存在，但应迁到共享 seam 或宿主内明确模块，不继续以 `packages/server` 的“默认宿主”名义存在 |
| Fastify app 聚合、默认启动入口、host-local config bridge、gateway route registration、in-process adapter 选择 | 迁到 `host-local` 或共享 seam 后删除 | 这些是宿主 owner 职责，不属于长期共享壳层 |
| maintenance/decay legacy 写入口、candidate apply-resolution legacy 写入口、knowledge review legacy 写入口、只为旧链路保留的 route pack | compatibility-only，优先删除 | 已删除 |

### D. `light` 默认主入口终局与旧宿主关闭条件

终局选择：

- `light` 默认主入口冻结为 `packages/host-local/src/nest/**`。

不选 `host-local` owned Fastify 作为终局默认的原因：

- 旧 Fastify 路径仍依赖 `packages/server` compatibility shell，继续选择它会把 rollback path 固化成长期默认事实。
- `packages/host-local/src/nest/**` 已被确认不是 compatibility shell，而是 owner 清晰的真实宿主实现。
- 这能把 `packages/server` 的身份稳定收缩为“兼容壳 + shared runtime/status seam”，关闭默认入口双轨叙事。

旧 Fastify 轻宿主关闭条件：

- `local-agent` 与 `team-monolith` 的默认启动脚本切到 `packages/host-local/src/nest/**`。
- candidate apply-resolution 与 knowledge review 不再经过 `packages/server` legacy 写入口。
- `rtk pnpm test:deployment-smoke` 与 `@trapmap/host-local` 最小测试覆盖 Nest 默认路径。
- `README.md`、`docs/README.md`、`docs/PACKAGES.md`、`docs/reference/SYSTEM_TRUTH_SOURCES.md`、`docs/reference/REPO_STRUCTURE.md` 不再把 Fastify 路径描述为默认主入口或可用 rollback 入口。

### E. 客户端后端形态配置项定义

| 字段 | 值域 | 默认值 | 语义 | 兼容迁移 |
|---|---|---|---|---|
| `backendTarget` | `'light' \| 'heavy'` | `'light'` | 只表达客户端期望连接的后端构建目标偏好，用于提示、诊断和默认行为选择 | 旧配置缺省该字段时按 `'light'` 解释；未知值回退到 `'light'`；不派生第二套 URL、认证模型或服务发现 |

约束：

- `backendTarget` 不能改变 `gatewayUrl` 的单 URL 事实。
- `backendTarget` 不能让 CLI 或 `client-core` 直连内部 service。
- `client-core` 不解释该字段；它只继续消费单一 gateway URL + session contract。

## 目标替换架构（冻结方向）

### 1. `light` 的成熟实现目标

- 默认入口应收敛到 `packages/host-local` 的单一宿主实现，而不是继续通过 `@trapmap/server` 这个混合包间接起整个系统
- 该宿主实现应直接拥有：
  - HTTP server bootstrap
  - config bridge / runtime deployment 解析
  - in-process adapter 选择
  - health / readiness / status surface 的本地版本
- 业务实现继续来自：
  - `packages/backend-core`
  - `packages/contracts`
  - 必要的 `packages/service-*` thin assembly 或明确的 host-local module wiring
- 推荐长期形态：`host-local/src/nest/**` 成为默认 `light` 主入口；若短期不切默认，也必须把默认 Fastify 入口改造成 `host-local` 自己拥有，而不是借 `@trapmap/server` 兜底

### 2. `heavy` 的成熟实现目标

- 默认入口保持 `packages/host-distributed`
- `host-distributed` 负责：
  - gateway process bootstrap
  - remote adapter / internal client
  - service registration
  - runtime ownership 与 process split
- `packages/service-*` 继续作为成熟的内部 service assembly 存在，而不是兼容层
- `heavy` 不允许回落到“共享一个 server 大包 + 用 profile 假装分布式”的叙事

### 3. `@trapmap/server` 的替换目标

`@trapmap/server` 不是长期目标包形态。它当前混合了四类职责，后续要拆到明确归属：

| 当前职责 | 长期归属 |
|---|---|
| Fastify app 聚合与默认启动入口 | `packages/host-local` 的真实宿主入口 |
| runtime/config/deployment 解析 | `packages/host-local` 或共享 runtime seam |
| compatibility-only route / rollback path | 删除 |
| 仍有复用价值的 route/status/runtime helper | 迁到共享 seam 或宿主内的明确模块 |

冻结结论：

- `@trapmap/server` 不应继续作为 `light` 默认主入口长期存在
- 若保留该包，只能保留为很薄的共享基础设施集合，不能再同时承担“默认宿主 + compatibility shell + legacy route pack”三种身份

## 替换策略总则

### Replace, Then Delete

- [ ] 先把 runtime/config/bootstrap/status 的 owner 迁清楚，再删除旧入口
- [ ] 先让默认调用方切到新实现，再删除 compatibility route / facade
- [ ] 先补服务级测试和 deployment smoke，再删除旧测试夹具

### No More Mixed Packages

- [ ] 不再允许单个包同时承担“默认入口 + 兼容壳 + 业务实现面”
- [ ] 不再允许 `packages/server` 继续吸纳新的 host concern、route concern 或 compatibility concern
- [ ] 不再允许 `host-local` 和 `host-distributed` 共享一段只能通过 `if profile` 才看得懂的业务编排

### Prefer Mature Building Blocks

- [ ] `light` 优先收敛到 Nest module graph + host-owned adapter composition，而不是继续维护手搓过渡壳
- [ ] `heavy` 优先收敛到 service assembly + remote adapter + explicit runtime ownership，而不是 profile 分支堆叠
- [ ] connector 只保留两套实现：`in-process` 与 `remote`；不再接受第三套 legacy transport glue

## 交付物

- 根 `plan.md`：只保留索引、阶段勾选、文档/测试回写要求
- 本细则：记录设计冻结、阶段任务、验证矩阵、完成定义
- 文档回写：`README.md`、`docs/README.md`、`docs/PACKAGES.md`、`docs/reference/SYSTEM_TRUTH_SOURCES.md`、`docs/reference/REPO_STRUCTURE.md`、`docs/architecture/components/CLIENT.md`、必要的 host/client README
- 测试回写：轻重目标映射、客户端配置读写、gateway-only 接入边界、对应宿主/分布式 smoke
- 兼容壳清理交付：ASCII 依赖图、壳层分类表、删除顺序、阻力说明、对应的文档与最小测试清单

## 宏观技术债地图

### A. 架构债

#### A1. `@trapmap/server` 混合包债

现象：

- `packages/server` 同时承担默认轻宿主入口、runtime/config 解析、legacy route pack、compatibility shell
- 这是当前最大的结构性债，直接阻碍“彻底替换兼容壳”

影响：

- `light` 无法声明成熟实现
- host ownership 不清，任何入口切换都容易牵动大面积回归

处理原则：

- [ ] 本计划必须收口
- [ ] 属于 P0 级别主线债，而不是可选优化

#### A2. `light` 默认入口 owner 不清

现象：

- `host-local` 是名义主入口，但默认实现仍通过 `@trapmap/server` 间接完成关键装配
- `Nest default` 与 `host-local owned Fastify` 终局尚未冻结

影响：

- 入口叙事不稳定
- 文档、测试、实现会继续双轨漂移

处理原则：

- [ ] 本计划必须冻结
- [ ] 若不冻结，后续所有兼容壳删除都没有可靠关闭条件

#### A3. distributed 成熟度债

现象：

- `host-distributed` 已形成独立目录和 service assembly，但仍存在 internal client、health/readiness/backlog 语义未完全统一的问题

影响：

- `heavy` 容易退化成“结构上分了目录，实际上还是靠约定维持”

处理原则：

- [ ] 本计划顺带收口与 connector / ownership 直接相关的部分
- [ ] 其余更深的运维硬化继续由 `docs/todos/nestjs-service-evolution-distributed-maturity-assessment.md` 跟踪

### B. 实现债

#### B1. compatibility facade / barrel 债

现象：

- `backend-core/src/modules/*.ts` 这类 facade 仍在
- 还存在一批无价值的 barrel、legacy helper、shadow export

现状：

- [x] 已删除 `packages/host-local/src/http/index.ts`
- [x] 已删除 `packages/host-distributed/src/shared/index.ts`
- [x] 已修正 `packages/backend-core/README.md` 的过时模块导入示例

处理原则：

- [ ] 本计划持续顺手清理
- [ ] 只删“确认无调用方”或“只制造过时导入面”的低风险对象

#### B2. host-local stub / runtime scaffold 债

证据：

- `packages/host-local/src/bootstrap/stubs.ts`
- `packages/host-local/src/runtime/worker.ts`
- `packages/host-local/src/runtime/outbox.ts`

现象：

- 这些模块仍带有明确 stub / deferred 属性
- 说明 `light` 侧异步运行时和无依赖启动路径还存在 scaffold 债

影响：

- 即使切走 compatibility shell，`light` 也可能只是“更换宿主外壳”，而不是真正成熟

处理原则：

- [ ] 本计划记录为 P1 债
- [ ] 仅当其直接阻碍默认入口替换时才纳入本轮实现
- [ ] 更深的 runtime productization 继续参考 `docs/todos/backend-engineering-optimization-plan.md`

#### B3. 读侧 / route hotspot 债

来自本轮 `fallow health` 的高风险热点：

- `packages/server/src/app.ts`
- `packages/server/src/routes/knowledge.ts`
- `packages/server/src/routes/feedback-admin.ts`
- `packages/server/src/routes/operations/knowledge-legacy.ts`
- `packages/server/src/config.ts`
- `packages/server/src/lib/knowledge/repository.ts`
- `packages/server/src/lib/knowledge/pg-repository.ts`
- `packages/server/src/lib/candidates/detector.ts`
- `packages/server/src/lib/candidates/processor.ts`
- `packages/server/src/lib/retrieval/orchestration/orchestrator.ts`
- `packages/server/src/lib/retrieval/graph-plan/plan-compiler.ts`
- `packages/server/src/lib/retrieval/recall/semantic.ts`

结论：

- 大量高变更 + 高复杂度热点仍集中在 `packages/server`
- 这进一步证明 `server` 混合包不是单纯的命名问题，而是复杂度真正尚未被迁出

处理原则：

- [ ] 本计划只处理与入口替换、compatibility shell 删除直接耦合的 hotspot
- [ ] 纯 retrieval / graph-plan 深层重构不并入本轮，避免主线失焦

### C. 测试债

#### C1. 包级测试入口不稳定

本轮暴露事实：

- `pnpm --filter @trapmap/host-local test --run ...` 未按预期命中测试文件
- `pnpm --filter @trapmap/host-distributed test --run ...` 未按预期命中测试文件

影响：

- 计划里可以写最小测试，但执行时会因为入口行为不一致而降低可操作性

处理原则：

- [ ] 本计划必须顺带收口
- [ ] 至少保证 `host-local`、`host-distributed`、`service-*` 的包级最小测试命令可直接复用

#### C2. 大量重复测试夹具 / 断言模板

本轮 `fallow dupes` 显示：

- CLI 命令测试里有高重复的 JSON 输出断言模板
- server route 测试里有高重复的 session/setup 模板
- operations route 测试里有高重复的 `buildServer()/ready()/close()` harness

影响：

- 测试维护成本高
- 兼容壳替换时，重复夹具会放大改动面

处理原则：

- [ ] 本计划顺带收口与主线路径直接相关的 shared test harness
- [ ] 不要求本轮消灭全部重复，但要把最常复用的 setup 抽出

### D. 文档与工具债

#### D1. truth source 仍含迁移窗口表述

现象：

- 多份 truth source / package doc 仍保留“migration window”“compatibility facade”等表述
- 部分表述是事实，部分只是历史残留

处理原则：

- [ ] 本计划必须收口
- [ ] 默认主路径一旦切换完成，文档中必须区分“历史 debt”和“当前实现”

#### D2. workspace / tooling 噪音债

本轮 `fallow` 诊断：

- `packages/skills` 命中 workspace glob 但没有 `package.json`

影响：

- 工具报告里持续出现噪音
- 不影响运行，但会降低静态分析信噪比

处理原则：

- [ ] 记为 P3 工具债
- [ ] 不阻塞本轮主线，但建议在 closeout 前决定是补 package manifest 还是显式 ignore

## 宏观优先级结论

### P0 本计划必须关闭

- [ ] `@trapmap/server` 混合包债
- [ ] `light` 默认入口 owner 不清
- [ ] compatibility facade / legacy route 直接阻碍入口切换的部分
- [ ] host-local / host-distributed 包级测试入口不稳定

### P1 本计划应顺带收口

- [ ] distributed connector / ownership 一致性
- [ ] 与兼容壳替换直接耦合的 test harness 去重
- [ ] host-local runtime scaffold 中会阻碍默认入口声明为成熟实现的部分

### P2 观察并留档，不强并入本轮

- [ ] `packages/server` 内 retrieval / graph-plan 深层复杂度热点
- [ ] 更广义的 repository / route 大文件拆分
- [ ] badcase 分类统一

### P3 工具与环境噪音

- [ ] `packages/skills` workspace 诊断噪音
- [ ] 其他不阻塞主线的 unused export / clone 清理

## 当前模块依赖关系（ASCII）

```text
                     +-------------------+
                     |   packages/cli    |
                     +---------+---------+
                               |
                     +---------v---------+
                     | packages/client-  |
                     |       core        |
                     +---------+---------+
                               |
                +--------------v--------------+
                | gateway surface / single URL|
                +--------------+--------------+
                               |
          +--------------------+--------------------+
          |                                         |
 +--------v---------+                      +--------v---------+
 | packages/host-   |                      | packages/host-   |
 | local            |                      | distributed      |
 | light host       |                      | heavy host       |
 +--------+---------+                      +--------+---------+
          |                                         |
   current default path                      internal HTTP / service
          |                                  registration / process split
 +--------v---------+                      +--------v---------+
 | @trapmap/server  |                      | packages/service-*|
 | config/runtime/  |                      | thin assemblies   |
 | legacy routes    |                      +--------+---------+
 +--------+---------+                               |
          |                              +----------v----------+
          +------------+---------------->| packages/backend-   |
                       |                 | core                |
                       |                 | ports + contexts    |
                       |                 +----------+----------+
                       |                            |
                       |                 +----------v----------+
                       +---------------->| packages/contracts  |
                                         +---------------------+
```

结论：

- `packages/backend-core`、`packages/contracts`、`packages/service-*`、`packages/host-distributed` 不是 compatibility shell。
- `packages/server` 当前是“部分兼容壳 + 部分仍被默认轻宿主依赖的真实实现”混合体，不能一刀切直接删包。
- `packages/host-local/src/bootstrap/**` / `src/http/**` / `src/runtime/**` 当前仍是默认 `light` 入口的一部分；在默认入口切到 Nest 或其他新宿主之前，它们不是“可直接删除的纯壳”。

## 兼容壳现状与可清理性冻结

### A. 可以直接纳入优先清理的壳层

- [x] `packages/backend-core/src/modules/*.ts` compatibility re-export facade
- [x] `packages/server` 中只返回 `501 capability_unsupported` 的 compatibility route
- [ ] 已无调用方的旧 transport 专用 helper、shadow DTO、shadow schema、重复 internal client 文档

> **Wave 1 清理结论（Tasks 1–9）**：
> - `compatibility-shell.ts` 已删除；501 响应已内联到 maintenance.ts 和 decay.ts，随后这些 handler 和对应 batch write 测试也一并删除（Tasks 1, 8）。
> - `backend-core/src/modules/` facade 已删除（Task 2）。
> - `operations/**` 路由经审计全部为真实功能，无 501 桩（Task 9）。

> **调查结论**：
> - **config.ts 归属**（Task 3）：`config.ts` 留在 `packages/server`，暂不迁移。
> - **buildServer() 渐进拆分**（Task 4）：`buildServer()` 应拆解为可组合模块后逐步迁入 `host-local`。
> - **host-local 健康/就绪**（Task 5）：`host-local` 已通过 `http/health.ts` 拥有 health/readiness 端点。
> - **review.ts / candidates/resolution.ts 迁移**（Tasks 6–7）：两者可迁入现有 Nest modules/ports。
> - **operations/**（Task 9）：零 501 桩，全部真实功能。

判据：

- [ ] 不再承载默认入口
- [ ] 不再拥有唯一的运行时配置、状态或健康检查语义
- [ ] 删除后只需要 import/route/caller 切换，不需要补第二套业务实现

### B. 必须先替换真实职责再删除的壳层

- [ ] `packages/server` 的 `buildServer()` 聚合入口
- [ ] `packages/server` 中仍被 `packages/host-local/src/bootstrap/server.ts` 依赖的 config / runtime / status / route registration
- [x] `packages/server` 中 candidate apply-resolution 与 knowledge review 的 legacy authoritative write 入口已从默认主线退役

阻力：

- [x] 当前 `@trapmap/host-local` 默认轻宿主不再通过 `@trapmap/server` 启动 Fastify 主入口
- [ ] `packages/server/src/index.ts` 仍承载启动脚本与 runtime deployment 解析
- [ ] 若不先把这些职责迁到 `host-local` 新宿主或共享 seam，直接删壳会导致 `light` 默认入口失效

替换要求：

- [ ] `buildServer()` 的宿主职责必须下沉到 `packages/host-local`
- [ ] route registration 若仍需共享，只能保留为明确的 host-owned composition helper，不能继续是“server 包兜底”
- [ ] `runtime deployment` 解析若被 `light` 与 `heavy` 共用，应抽成共享 seam；若只服务 `light`，应回归 `host-local`
- [x] candidate apply-resolution / knowledge review 已有等价的新默认路径；旧 Fastify authoritative write 入口已退役为 rollback-only compat surface

### C. 不应再叫“兼容壳”、而应视为真实实现保留的层

- [ ] `packages/host-distributed`
- [ ] `packages/service-*`
- [ ] `packages/host-local/src/nest/**`
- [ ] 默认轻宿主切换完成之前的 `packages/host-local` 当前启动入口

要求：

- [ ] 这些层允许长期存在，但必须去掉“只是临时壳”的叙事
- [ ] 若继续保留，就要补齐 owner、测试和文档，而不是继续享受迁移期豁免

## 兼容壳替换路线图

### Track A. 先清纯壳与 facade

- [x] 删除 `packages/backend-core/src/modules/*.ts` compatibility re-export facade
- [x] 删除 `packages/server` 中 maintenance / decay 这类已退化为 `501` 的 compatibility route
- [ ] 删除已无调用方的 shadow DTO、shadow schema、legacy helper、重复 internal client 文档

完成标志：

- [ ] 仓库内主消费方只走真实 context 目录或正式 connector
- [ ] docs / truth source / README 中不再出现旧 facade 作为推荐入口

### Track B. 把 `light` 默认入口从 `@trapmap/server` 脱钩

- [x] 冻结 `host-local` 默认主入口终局：`Nest default`
- [ ] 把 `buildServer()` 里仍属于宿主的职责列成迁移清单：config、runtime mode、status、readiness、route mounting、worker boot 协调
- [ ] 把这些职责迁到 `host-local` 自己拥有的目录后，再让 `dev:local-agent` / `dev:team-monolith` 默认走新入口
- [ ] 默认入口切换完成后，把 `packages/server` 降级为仅保留共享基础设施或继续拆薄

完成标志：

- [ ] `@trapmap/host-local` 默认启动不再 import `@trapmap/server` 的顶层 `buildServer()`
- [x] `docs/README.md`、`README.md`、`docs/PACKAGES.md` 对默认轻宿主的描述不再经过 `server`
- [ ] `deployment-smoke` 覆盖新的默认 `light` 启动路径

### Track C. 替换 legacy authoritative write 路径

- [x] 为 candidate apply-resolution 建立明确的新 host-owned 或 service-owned 默认写路径
- [x] 为 knowledge review 建立明确的新 host-owned 或 service-owned 默认写路径
- [ ] 切换 CLI / tests / docs / closeout 入口后，删除旧 Fastify authoritative write 路径

完成标志：

- [ ] `packages/server` 不再承载默认 authoritative write 行为
- [ ] 旧 route 只剩删除，不再有“暂时继续挂着”的理由
- [x] `packages/host-local/src/nest/gateway/candidate-review.controller.ts` 默认将 apply-resolution 委托给 `candidate-ingestion` owner port，并由 `KnowledgeWritePort` 完成最终 aggregate mutation

### Track D. 让 `heavy` 成为真正的成熟实现，而不是对 `server` 的绕行

- [ ] `host-distributed` 继续只消费 `backend-core + service-* + remote adapter`
- [ ] 清掉手拼 internal HTTP 调用，统一走 `in-process` / `remote` adapter abstraction
- [ ] 每个 owner service 都有清晰的 health / readiness / ownership / backlog 语义

完成标志：

- [ ] `heavy` 可以独立自洽解释 gateway、service、job-runtime 的职责边界
- [ ] 文档里不再需要用 `server` 包解释分布式架构

## 阶段计划

### Phase 0 术语与映射冻结

- [ ] 冻结“轻/重后端构建目标”的正式命名、适用范围和对外叙事
- [ ] 写清它们与既有 `local-agent`、`team-monolith`、`distributed`、`gateway only` 的映射关系
- [ ] 明确 `light`/`heavy` 是 build target / deployment target 视角，不重写 runtime capability 模型
- [ ] 明确哪些事实仍以现有 profile/capability/source-of-truth 为准，避免双重真相
- [ ] 冻结“compatibility shell / facade / real host implementation”的判定标准，后续删除动作都按这套标准执行

文档要求：

- [ ] 更新 `README.md` 的架构概览与快速开始表述
- [ ] 更新 `docs/reference/SYSTEM_TRUTH_SOURCES.md` 中与 root execution plan、startup/deployment 相关的二级说明引用
- [ ] 必要时更新 `docs/PACKAGES.md` 和 `docs/README.md` 的术语说明
- [ ] 在本页和 `docs/todos/nestjs-service-evolution-04-data-runtime-and-cutover.md` 对齐兼容壳分类口径

测试要求：

- [ ] 若实现引入新的配置解析/映射 helper，为其补单测
- [ ] 至少回归 `pnpm check:docs-drift`
- [ ] 至少回归 `pnpm check:structure`

### Phase 1 后端构建目标收敛

- [ ] 定义 `light` 构建目标的正式边界：统一 gateway、轻宿主装配、进程内 connector、允许兼容壳存在但不外溢
- [ ] 定义 `heavy` 构建目标的正式边界：统一 gateway、重宿主部署展开、remote connector、显式 async/runtime ownership
- [ ] 冻结两种目标共享的核心实现面：`contracts`、`backend-core`、`service-*` 主实现
- [ ] 冻结两种目标差异化的宿主实现面：`host-local`、`host-distributed`、bootstrap、transport、deployment wiring
- [ ] 明确是否需要新的 root/build script、包脚本或文档入口；若新增必须同步 truth source
- [x] 冻结 `light` 默认入口终局为 `host-local/src/nest/**`
- [ ] 给出 `@trapmap/server` 从“混合包”拆成“共享 runtime seam + 可删除 legacy route”的目标落点
- [x] 冻结 `light` 的真实成熟实现以 `Nest default` 为终局

文档要求：

- [ ] 更新 `docs/reference/REPO_STRUCTURE.md` 中 `host-local` / `host-distributed` 的职责说明
- [ ] 更新 `docs/PACKAGES.md` 的 package ownership 和术语表述
- [ ] 更新必要的 `packages/host-local/README.md`、`packages/host-distributed/README.md`
- [ ] 若默认轻宿主仍暂留 Fastify，实现原因和退出条件必须写入 `packages/server/README.md`

测试要求：

- [ ] 为新的构建目标映射 helper 或 host selector 补单测
- [ ] 受影响时补跑 `pnpm test:deployment-smoke`
- [ ] 受影响时补跑 `pnpm test:runtime-foundations`

### Phase 2 connector、装配边界与兼容壳清理

- [ ] 盘点当前轻重路径里重复或漂移的 connector / invocation / transport glue
- [ ] 将可复用逻辑收敛到 host-agnostic seam，不再在 local/distributed 两边复制业务编排
- [ ] 保留“本地 connector”与“远端 connector”两套 adapter，但统一依赖同一组 port
- [ ] 明确失败语义、超时、重试、幂等、trace/header 传播在哪一层负责，不允许藏进“万能 client”
- [ ] 明确 gateway 只做外部入口，不成为 build target 切换时的业务分叉点
- [x] 优先删除 `packages/backend-core/src/modules/*.ts` 这类纯 facade 兼容层
- [x] 删除已经只剩 compatibility 提示语义的 route / helper / shadow schema
- [ ] 将 `packages/server` 中仍属真实职责的 config / runtime / status / route wiring 迁到明确宿主或共享 seam
- [x] 在默认轻宿主不再依赖后，`packages/server` 中 candidate apply-resolution / knowledge review legacy authoritative write 入口已退役为 rollback-only compat surface
- [ ] 若 `host-local` 选择 Nest default，明确 Fastify 只保留 rollback window 的关闭日期或触发条件
- [ ] 若 `host-local` 不切 Nest default，明确为什么“host-local owned Fastify”属于成熟实现而非继续保留兼容壳

细化检查清单：

- [ ] 不允许在 `packages/server` 新增主实现逻辑来“方便过渡”
- [ ] 不允许在 `host-local` 和 `host-distributed` 两边各自长出不同的业务规则分支
- [ ] 任何兼容壳删除都必须先删调用方，再删入口，再删文档，再删测试夹具
- [ ] 清理完成后，文档中不再把纯 facade 或旧 Fastify 默认路径描述成 authoritative orchestration
- [ ] 清理完成后，任何“兼容壳”一词都只用于历史或明确剩余 debt，不能再描述默认主路径

文档要求：

- [ ] 更新 `docs/architecture/ARCHITECTURE.md` 或对应组件文档中的 connector / host 叙事
- [ ] 若新增边界约束，更新 `docs/reference/SYSTEM_TRUTH_SOURCES.md`
- [ ] 更新 `docs/todos/nestjs-service-evolution-04-data-runtime-and-cutover.md` 中 compatibility shell 关闭条件
- [ ] 更新 `docs/PACKAGES.md` 对 `packages/server`、`packages/host-local` 的职责描述

测试要求：

- [ ] 为 connector / invocation seam 补最小单测或集成测试
- [ ] 分布式 remote hop 受影响时补跑对应 acceptance / closeout 测试
- [ ] facade 删除后补受影响包最小测试，防止旧 import 路径静默回流
- [ ] 文档与结构守卫继续保持通过

### Phase 3 客户端后端形态配置项

- [ ] 在客户端状态中新增一个显式配置项，用于区分目标后端形态，命名和值域冻结后再实施
- [ ] 明确该配置项只影响客户端提示、默认行为选择或诊断展示，不改变“单一 gateway URL”事实
- [ ] CLI 配置读写、默认值、兼容旧配置文件的迁移规则写清
- [ ] 如 `client-core` 需要暴露该形态信息，必须保持它仍是 transport-agnostic，不持有宿主内网知识
- [ ] 评估 web-panel 是否需要相同配置语义，若不需要则写清原因

文档要求：

- [ ] 更新 `packages/cli/README.md` 的配置说明
- [ ] 更新 `docs/architecture/components/CLIENT.md` 的 `CliState` / client config 结构
- [ ] 必要时更新 `packages/client-core/README.md`

测试要求：

- [ ] `packages/cli/src/lib/config.ts` 配置读写与兼容迁移单测
- [ ] 受影响的 CLI 命令或展示逻辑单测
- [ ] 如 client-core contract 变化，补对应测试

### Phase 4 closeout 与守卫

- [ ] 冻结“轻/重构建目标 + 客户端形态配置项”的最终术语
- [ ] 回写所有入口文档与 truth source，避免继续同时使用多套不一致叙事
- [ ] 如该漂移容易复发，补 `docs-drift` 规则或 smoke 约束
- [ ] 确认根 `plan.md` 只保留索引职责，本细则承担执行细节

文档要求：

- [ ] 更新 `docs/archived/README.md` 与 `docs/todos/README.md` 的计划索引
- [ ] 必要时在 `scripts/complexity-budgets.json` 中增加 doc drift 规则

测试要求：

- [ ] `pnpm check:docs-drift`
- [ ] `pnpm check:structure`
- [ ] 受影响的最小测试集合全部通过后才能勾选 closeout

## 最小验证矩阵

- 仅改计划/文档索引：`pnpm check:docs-drift`、`pnpm check:structure`
- 改 CLI 配置：`pnpm --filter @trapmap/cli test --run <config-related-test>`
- 改 client-core contract：`pnpm --filter @trapmap/client-core test --run <affected-test>` 或对应 workspace 最小测试
- 改 deployment/build target 映射、host 选择、runtime surface：`pnpm test:deployment-smoke`
- 改 runtime/bootstrap/connector foundations：`pnpm test:runtime-foundations`
- 改 `host-local` 默认入口或 `@trapmap/server` 拆分：`pnpm --filter @trapmap/host-local test --run <affected-test>` + `pnpm --filter @trapmap/server test --run <affected-test>`
- 改 distributed connector / internal client：`pnpm --filter @trapmap/host-distributed test --run <affected-test>` 或 `packages/host-distributed` acceptance 最小集

## 按包 / 文件拆分的执行任务表

### Wave 0. 低风险债务清理与入口对齐

#### Task 0.1 `packages/backend-core` facade 退役准备

目标：

- 把 `@trapmap/backend-core/modules` 的剩余引用全部改到真实 context 目录或主入口
- 为删除 `src/modules/*.ts` compatibility facade 清理最后的文档和示例依赖

文件：

- 修改：`packages/backend-core/README.md`
- 修改：`docs/PACKAGES.md`
- 修改：`docs/README.md`
- 后续候删：`packages/backend-core/src/modules/index.ts`

检查：

- [x] `packages/backend-core/README.md` 已移除 `@trapmap/backend-core/modules` 示例导入
- [x] 不再有其他 README / 文档示例使用 `@trapmap/backend-core/modules`
- [ ] 代码消费方全部走 `@trapmap/backend-core` 或 `@trapmap/backend-core/<context>`

最小测试：

- `pnpm --filter @trapmap/backend-core test --run src/modules/boundary-import-guard.test.ts src/modules/boundary-ownership.test.ts src/modules/knowledge-read.test.ts`
- `pnpm check:docs-drift`

#### Task 0.2 清理确认无人引用的 barrel / index 债务

目标：

- 删除只制造额外导出面、但仓库内没有调用方的 barrel 文件
- 不触碰默认入口、公共 CLI、service start API

候选文件：

- [x] 已删：`packages/host-local/src/http/index.ts`
- [x] 已删：`packages/host-distributed/src/shared/index.ts`

保留但暂不删除：

- `packages/host-local/src/bootstrap/stubs.ts`
  原因：`host-local/src/nest/app.module.ts` 仍依赖 stub factory。
- `packages/host-local/src/bootstrap/middleware.ts`
  原因：虽然当前未接线，但它代表 host-local 自有 middleware 候选实现，先不在本轮冒进删除。

最小测试：

- `pnpm --filter @trapmap/host-local test --run src/bootstrap/server.test.ts src/runtime/runtime.test.ts src/nest/app.test.ts`
- `pnpm --filter @trapmap/host-distributed test --run src/gateway/routes.test.ts src/gateway/internal-client.test.ts`

### Wave 1. `light` 默认入口脱离 `@trapmap/server`

#### Task 1.1 已冻结默认主入口形态

目标：

- 保持 Phase 0 已冻结结论：`host-local` 的默认主入口终局是 `Nest default`

文件：

- 修改：`plan.md`
- 修改：`docs/todos/backend-build-targets-plan.md`
- 修改：`docs/todos/nestjs-service-evolution-04-data-runtime-and-cutover.md`
- 修改：`packages/host-local/README.md`
- 修改：`packages/server/README.md`

决策输出：

- [x] 选定默认主入口
- [x] 写清不选另一条路的原因
- [x] 写清 rollback window 和关闭条件

最小测试：

- `pnpm check:docs-drift`
- `pnpm check:structure`

#### Task 1.2 迁移 `server` 的 runtime / config owner

目标：

- 把 `packages/server` 中仍属于宿主的启动职责迁到 `host-local`

重点文件：

- 现状源：`packages/server/src/index.ts`
- 现状源：`packages/server/src/app.ts`
- 现状源：`packages/server/src/config.ts`
- 现状源：`packages/server/src/lib/runtime/deployment-profile.ts`
- 目标落点：`packages/host-local/src/index.ts`
- 目标落点：`packages/host-local/src/bootstrap/server.ts`
- 目标落点：`packages/host-local/src/nest/config/config-bridge.ts`
- 目标落点：`packages/host-local/src/http/health.ts`
- 目标落点：`packages/host-local/src/http/gateway.ts`

迁移顺序：

- [ ] 先把 `runtime deployment` 解析 owner 定下来
- [ ] 再把 health / readiness / route mounting owner 定到 `host-local`
- [ ] 最后移除 `host-local` 对 `buildServer()` 顶层聚合的依赖

> **当前状态**：默认 `light` 入口与根开发脚本已切到 `packages/host-local/src/nest/**`；candidate manual-result / apply-resolution / review 默认写链路也已切到 host-owned owner-port 路径。`config.ts` 与部分 runtime/shared infrastructure 暂留 `packages/server`，旧 Fastify 轻宿主路径已删除。`buildServer()` 的剩余价值后续继续拆到明确 owner。

最小测试：

- `pnpm --filter @trapmap/host-local test --run src/bootstrap/server.test.ts src/runtime/runtime.test.ts src/nest/app.test.ts src/nest/runtime/request-context.test.ts src/nest/runtime/exception-filter.test.ts`
- `pnpm --filter @trapmap/server test --run src/config.test.ts src/app.test.ts src/bootstrap/startup.test.ts`
- `pnpm test:deployment-smoke`
- `pnpm test:runtime-foundations`

#### Task 1.3 切换根开发脚本与文档默认入口

目标：

- 让根级开发入口完全以 `host-local` / `host-distributed` 为准
- `dev:server*` 降级为显式兼容脚本，而不是默认路径

文件：

- 修改：`package.json`
- 修改：`README.md`
- 修改：`docs/README.md`
- 修改：`docs/guides/MIGRATION_GUIDE.md`
- 修改：`docs/operations/ENVIRONMENT.md`
- 修改：`docs/architecture/DEPLOYMENT.md`
- 修改：`packages/server/src/__tests__/docs-truth-smoke.test.ts`

最小测试：

- `pnpm --filter @trapmap/server test --run src/__tests__/docs-truth-smoke.test.ts`
- `pnpm check:docs-drift`
- `pnpm check:structure`

### Wave 2. 替换 `packages/server` legacy authoritative write 路径

#### Task 2.1 candidate apply-resolution 路径切换

目标：

- 用 host-owned 或 service-owned 默认写路径替换 `packages/server` 里的 legacy candidate resolution route

重点文件：

- 现状源：`packages/server/src/routes/candidates.ts`
- 现状源：`packages/server/src/routes/candidates/resolution.ts`
- 现状源：`packages/server/src/routes/candidates.test.ts`
- 候选落点：`packages/host-local/src/nest/candidate-ingestion/candidate-ingestion.module.ts`
- 候选落点：`packages/service-candidate-ingestion/src/routes.ts`
- 候选落点：`packages/host-distributed/src/candidate-ingestion/server.ts`

最小测试：

- `pnpm --filter @trapmap/service-candidate-ingestion test --run src/routes.test.ts`
- `pnpm --filter @trapmap/host-distributed test --run src/candidate-ingestion/routes.test.ts`
- `pnpm --filter @trapmap/server test --run src/routes/candidates.test.ts`
- `pnpm test:runtime-foundations`

#### Task 2.2 knowledge review 路径切换

目标：

- 用 host-owned 或 service-owned 默认写路径替换 `packages/server/src/routes/review.ts`

重点文件：

- 现状源：`packages/server/src/routes/review.ts`
- 现状源：`packages/server/src/routes/review.test.ts`
- 候选落点：`packages/host-local/src/nest/governance-review/governance-review.module.ts`
- 候选落点：`packages/service-governance-review/src/routes.ts`
- 候选落点：`packages/host-distributed/src/governance-review/server.ts`

最小测试：

- `pnpm --filter @trapmap/service-governance-review test --run src/routes.test.ts`
- `pnpm --filter @trapmap/host-distributed test --run src/governance-review/routes.test.ts src/governance-review/delegation-acceptance.test.ts`
- `pnpm --filter @trapmap/server test --run src/routes/review.test.ts`
- `pnpm test:deployment-smoke`

#### Task 2.3 删除只剩 501 语义的 compatibility route

目标：

- 删除 maintenance / decay compatibility route 和对应 helper

重点文件：

- 候删：`packages/server/src/routes/compatibility-shell.ts`
- 候删：`packages/server/src/routes/maintenance.ts`
- 候删：`packages/server/src/routes/decay.ts`
- 修改：`packages/server/src/routes/maintenance.test.ts`
- 修改：`packages/server/src/routes/decay.test.ts`
- 修改：相关 docs / truth source

前提：

- [x] 调用方、文档、operator flow 不再依赖这些 route

> **清理结论**：`compatibility-shell.ts` 已删除；501 响应已内联后 handler 整体移除；batch write 测试已从 decay.test.ts 和 maintenance.test.ts 中删除。

最小测试：

- `pnpm --filter @trapmap/server test --run src/routes/maintenance.test.ts src/routes/decay.test.ts src/routes/operations/status.test.ts`
- `pnpm check:docs-drift`

### Wave 3. `heavy` connector 与 internal client 收敛

#### Task 3.1 distributed shared port / database 入口收敛

目标：

- 让 `host-distributed` 的所有 service 都只从明确子路径导入 shared infra
- 删除无价值的 shared barrel

文件：

- 修改：`packages/host-distributed/src/knowledge-read/index.ts`
- 修改：`packages/host-distributed/src/knowledge-write/index.ts`
- 修改：`packages/host-distributed/src/identity-access/index.ts`
- 修改：`packages/host-distributed/src/candidate-ingestion/index.ts`
- 修改：`packages/host-distributed/src/governance-review/index.ts`
- 修改：`packages/host-distributed/src/job-runtime/index.ts`
- 候删：`packages/host-distributed/src/shared/index.ts`

最小测试：

- `pnpm --filter @trapmap/host-distributed test --run src/gateway/routes.test.ts src/gateway/internal-client.test.ts src/identity-access/routes.test.ts src/knowledge-write/routes.test.ts src/governance-review/routes.test.ts src/job-runtime/ownership-acceptance.test.ts`

#### Task 3.2 gateway internal client / remote adapter 统一

目标：

- 清理手拼 internal HTTP 调用
- 统一 gateway 到 service 的调用面

重点文件：

- `packages/host-distributed/src/gateway/internal-client.ts`
- `packages/host-distributed/src/gateway/server.ts`
- `packages/host-distributed/src/gateway/routes.ts`
- `packages/host-distributed/src/shared/internal-knowledge-write-client.ts`
- `packages/host-local/src/nest/adapters/adapter-factory.ts`
- `packages/host-local/src/nest/adapters/in-process.adapter.ts`
- `packages/host-local/src/nest/adapters/remote.adapter.ts`

最小测试：

- `pnpm --filter @trapmap/host-distributed test --run src/gateway/internal-client.test.ts src/gateway/distributed-acceptance.test.ts src/gateway/distributed-runtime-closeout.test.ts`
- `pnpm --filter @trapmap/host-local test --run src/nest/adapters/adapter-factory.test.ts`

### Wave 4. 客户端后端形态配置项

#### Task 4.1 client-core contract 对齐

文件：

- 修改：`packages/client-core/src/index.ts`
- 修改：`packages/client-core/src/http/api-request.ts`
- 修改：`packages/client-core/src/session/session-provider.ts`
- 修改：`packages/client-core/src/http/api-request.test.ts`

最小测试：

- `pnpm --filter @trapmap/client-core test --run src/http/api-request.test.ts`

#### Task 4.2 CLI 配置与展示对齐

文件：

- 修改：`packages/cli/src/lib/config.ts`
- 修改：`packages/cli/src/lib/config.test.ts`
- 修改：`packages/cli/src/lib/client-core-adapter.ts`
- 修改：`packages/cli/src/commands/operations/status.ts`
- 修改：`packages/cli/src/commands/operations.test.ts`

最小测试：

- `pnpm --filter @trapmap/cli test --run src/lib/config.test.ts src/commands/operations.test.ts src/commands/auth.test.ts src/commands/retrieval.test.ts`

### Wave 5. 文档与守卫 closeout

#### Task 5.1 truth source 与包职责收口

文件：

- 修改：`docs/reference/SYSTEM_TRUTH_SOURCES.md`
- 修改：`docs/reference/REPO_STRUCTURE.md`
- 修改：`docs/PACKAGES.md`
- 修改：`docs/README.md`
- 修改：`packages/server/README.md`
- 修改：`packages/host-local/README.md`
- 修改：`packages/host-distributed/README.md`

最小测试：

- `pnpm check:docs-drift`
- `pnpm check:structure`

#### Task 5.2 closeout 验证

最小测试矩阵：

- `pnpm test:deployment-smoke`
- `pnpm test:runtime-foundations`
- `pnpm test:distributed-acceptance`
- `pnpm typecheck`
- 若触及 retrieval / governance / feedback：`pnpm eval:smoke`

## 完成定义

- 根 `plan.md` 已切换为当前主线索引，并链接本细则
- 两种后端构建目标的正式命名、映射关系和边界已冻结
- 轻重差异被限制在宿主/connector/deployment wiring，不再让业务实现分叉
- 兼容壳已按“直接删除 / 替换后删除 / 真实实现保留”三类完成冻结，并尽可能清除可删部分
- `light` 与 `heavy` 都由成熟实现承担默认入口，不再依赖兼容壳解释系统主路径
- `@trapmap/server` 不再是混合包；要么被显著拆薄为共享基础设施集合，要么退出默认入口链路
- 客户端新增的后端形态配置项已落地并有兼容迁移与最小测试
- 入口文档、truth source、结构索引和测试守卫与实现一致
