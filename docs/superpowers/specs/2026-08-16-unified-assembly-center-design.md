# TrapMap 统一优雅组装中心设计（TS Code-First Assembly Kernel + 能力节点 + 云原生拓扑）

> **状态：** deferred design input（用户直接请求的设计文档；在根 `plan.md` 显式激活前不构成执行授权，对应 debt register 条目的「设计输入」）
> **日期：** 2026-08-16（v3：在 v2「TS code-first」基础上，按用户新增需求补充**能力节点化 / worker 云原生化 / 微服务分布式集群化**）
> **来源：** 用户需求（① 宿主双样板收敛为统一优雅组装中心 + 功能模块，多部署形态不可舍弃；② 装配只考虑 TS，不引入 json/yml；③ **检索与入库处理等能力以节点式装配中心挂载；worker 面向云原生可选独立成服务、下设子服务（类似 nginx）；总目标为灵活性提高 + 微服务/分布式/集群化优化**）+ 架构审查 + cordis 与 DeepSeek Harness 装配模型调研
> **定位：** future-state 蓝图。本文给出「TS 统一组装中心 + 能力节点拓扑」的目标架构、功能模块映射、部署形态的 TS 组合表达与分阶段迁移路线；落地窗口与进入条件以 `docs/todos/open-debt-and-compromises.md` 相应条目为准。

## 需求清单（v3 合并）

| # | 需求 | 设计落点 |
|---|---|---|
| R1 | 宿主双样板收敛为统一优雅组装中心 + 功能模块 | D1/D2/D4 |
| R2 | 多部署形态不可舍弃（local-agent / team-monolith / distributed） | D3 |
| R3 | 装配只考虑 TS，不引入 json/yml 装配层 | 全局约束，D1/D3 |
| R4 | **检索与入库处理逻辑分离（现状已分离）并以「节点式装配中心」挂载为能力** | D7（能力节点） |
| R5 | **worker 面向云原生：可选独立成服务，服务下设子服务（类似 nginx）** | D7（worker 容器节点 + 子 worker） |
| R6 | **灵活性提高 + 微服务/分布式/集群化优化** | D7（副本/伸缩/发现/预算）+ D3 |

## 问题背景

### 问题 1：宿主双样板——同一份装配逻辑写了两遍

**证据：**

- `packages/host-local/src/`（约 5.1K src LOC）与 `packages/host-distributed/src/`（约 6.1K src LOC）各自独立实现 runtime composition、observability（OTel/metrics/Loki/Sentry 接线）、service discovery（Consul）、worker wiring。
- distributed 的 8 个 `start<X>Service()`（`packages/host-distributed/src/{identity-access,knowledge-read,knowledge-write,candidate-ingestion,governance-review,job-runtime,cron-scheduler,gateway}/index.ts`）逐份重复「`loadServiceConfig → createServiceDatabase → createIdentityAccessPgDeps → createServicePorts → create<X>Deps → create<X>Server → attachRuntimeTelemetry`」样板；`--service` 分发是手写 switch（`packages/host-distributed/src/index.ts:20-55`）。
- OTel / Consul 双份接线已登记 debt（`open-debt-and-compromises.md`：OTel/Consul 双份实现并行）。

### 问题 2：bootstrap 顺序手写、依赖关系无显式图

**证据：**

- `packages/host-local/src/nest/app.module.ts` 手写注册六个 bounded-context Nest module + gateway + cron + observability；`createHostLocalRuntime()`（`packages/host-local/src/nest/runtime/host-runtime.ts:80`）手写「config → services → queuePorts → retrievalQuery」顺序。
- 启动序列（repos → candidate recovery → workers → graph reconciliation → lifecycle）散在 `packages/host-local/src/bootstrap/**` 与 `runtime/**`，靠注释和人工纪律维持顺序，没有可验证的依赖图。
- `backend-core` 已有模块描述符雏形但无引擎：`KNOWLEDGE_WRITE_MODULE = { name, owns, dependsOn: [] }`（`packages/backend-core/src/knowledge-write/application/module.ts`）——`dependsOn` 恒为空，无 DI 解析、无生命周期管理。

### 问题 3：同一语义双实现（优雅头号障碍）

**证据（均已登记 debt）：**

- Queue/Outbox：`packages/host-distributed/src/shared/ports.ts` 简化版（lease 硬编码 30s、stale 恒 0、无 reclaim）vs `packages/service-job-runtime/src/async-runtime.ts` 完整版（SKIP LOCKED、可配置 lease、真实 stale 计数、dedupe、指数退避）。
- 检索：distributed 形态降级为 ILIKE 双实现（`shared/ports.ts:109-146`，无打分无 mode）vs `service-knowledge-read` 完整管线（semantic/hybrid/graph）。
- 宿主层手写 SQL 与 service 包 pg-ports 并存（debt「host-distributed shared/ports.ts 业务下沉」）。

### 问题 4：部署形态语义分散，无单一组合表达

**证据：**

- deployment profile/preset/runtimeMode/serviceUnit/task transport 词汇定义在文档（`architecture.md`、`SYSTEM_TRUTH_SOURCES.md`），实现分散在：`scripts/backend-target-registry.ts`（light/heavy build target）、根 `package.json` 的 `dev:local-agent|team-monolith|distributed:*` 别名、`docker-compose.yml`、两个宿主的配置加载（`host-local/src/nest/config/config.ts` vs `host-distributed/src/config/service-config.ts`）。
- 同一部署形态的「进程 = 哪些模块 + 哪些 transport + 哪些 infra 实现」没有一份可读、可校验的清单；`assertDistributedConnectionBudget`（`service-config.ts:249-255`）之类的约束是代码内硬编码。

### 问题 5（背景）：契约包偏胖 / 规模失衡 / 叙事漂移

- `contracts` src 约 9.8K LOC（51 文件）仍偏胖；knowledge-write（~5.5K）与 knowledge-read（~4K）是 identity-access（~1K）/job-runtime（~0.9K）的 4–6 倍；「六个 bounded context」vs 实际 7 个 service 包的叙事漂移（cron 定位 2026-08-16 已补文档）。装配中心化后 service 包获得统一「模块外壳」，规模差异将更容易度量与治理。

### 问题 6（v3 新增）：能力拓扑表达缺失——「检索/入库处理/worker」的部署维度没有第一等建模

**证据：**

- 检索与入库处理逻辑已经分离（`service-knowledge-read` 检索 vs `service-candidate-ingestion` 入库处理 vs `service-governance-review` 治理），但「这个能力当前内嵌还是独立、几个副本、与谁同进程」只能从 compose 服务列表 + `--service` switch 里人工推断，没有代码内的一等表达。
- worker 的部署形态是硬编码矩阵：`docker-compose.yml` 固定 candidate-worker / governance-worker / outbox-worker / cron-scheduler 四个独立进程；host-local 内嵌时又是另一套 `ownsWork` 布尔开关（`candidate-ingestion/processing.ts`、`outbox-worker.ts`、`scheduler.ts`）。「同一个 worker 能力，内嵌 or 独立 or 带子 worker 分组」不能通过装配声明切换。
- 集群化基础已存在但散落：task_queue/outbox 的 `FOR UPDATE SKIP LOCKED` + 租约天然支持多消费者（`async-runtime.ts:197`、`processing-task-queue.ts`），但「同一能力跑 N 副本」没有装配层表达；连接预算（`service-config.ts:249-255`）是唯一硬约束。

## 调研：cordis 与 DeepSeek Harness 的装配模型（取编程式组合，弃配置文件层）

### 2.1 cordis（Koishi 生态四年 + DeepSeek Harness 生产内核）

来源：[github.com/cordiverse/cordis](https://github.com/cordiverse/cordis)、[npm @deepseek-ai/cordis 4.0.1](https://www.npmjs.com/package/@deepseek-ai/cordis)、[Cordis — The Plugin Kernel Behind DeepSeek Harness](https://floatboat.ai/blog/cordis-plugin-framework)、[DeepSeek Harness developer preview](https://deepseek.com/harness/en)。

核心机制（本地核验 `node_modules/@deepseek-ai/cordis/lib/types/*.d.ts`）：

| 机制 | API | 对 TrapMap 的意义 |
|---|---|---|
| 根容器 | `new Context()` | 统一组装中心的入口，替代「每个宿主自建 runtime」 |
| 插件装载（编程式） | `ctx.plugin(plugin, config)` 返回 Fiber | 每个能力/transport/infra 成为 TS 插件；`root.plugin(a); root.plugin(b)` 即装配 |
| 依赖图 | `inject: ['serviceName']` | 插件 B 在 A 提供服务后才加载、A 停止前卸载、A 失败则 B 不激活——**bootstrap 顺序自动推导** |
| 服务注册 | `class X extends Service` / `ctx.service()` | port 实现（knowledgeOwner、taskQueue、outbox…）成为可替换服务 |
| 可逆副作用 | `ctx.effect` | 生命周期清理自动回收，替代手写 shutdown 控制器 |
| 服务隔离/拦截 | `ctx.isolate(name)` / `ctx.intercept(name, config)` | 测试可用最小组合；配置按层合并（运行时内存中，非文件） |

**关键取舍：** cordis 生态同时提供 loader（YAML/JSON 配置树 + include/group/hmr）与**编程式装配**（`new Context()` + `ctx.plugin()`）。本项目**只采用编程式**：`ctx.plugin()` 是普通 TS 调用，组合逻辑就是 TS 模块；loader/patch 文件层（`cordis.patch.yml`、`dsh.profile.bundles` 配置清单）**明确不引入**——与用户「只考虑 TS」的要求一致，也避免「配置文件与代码双源」这一新的漂移面。

### 2.2 DeepSeek Harness（dsh）：编程式组合的工程纪律

来源：[deepseek.com/harness/en](https://deepseek.com/harness/en)（「Everything is a plugin」）、[github.com/deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)、本机安装包 `@deepseek-ai/dsh`（lib/profile-boot-*.js）。

- **一切皆插件**：models、tools、skills、sessions、sandboxes、storage、loops、scheduling、UI 全部是可替换/可重组的插件；能力通过组合选择/替换/扩展，不改内核源码。
- **多运行时模式 = 同一内核不同组合**：standard / code / minimal / creator 是同一内核的插件组合差。**这正是「多部署形态不可舍弃」的答案**：形态是 TS 组合的差，不是代码分支的差。
- **工程纪律可移植**：fail-loud（插件加载失败即进程失败，不静默跳过）、bounded shutdown（5s 宽限分级退出）、依赖缺失即报错（`inject` 未满足时启动失败而非运行期 NPE）。
- dsh 的 profile 目录/patch 文件层是**部署产品形态**，与本项目需求（代码内多形态组合）不同——只借鉴其「有序 bundles + 后层覆盖」的语义，落为 TS 组合器的 `.add()` 顺序语义。

### 2.3 对 TrapMap 的启示（结论）

1. **引入成熟实现**：采用 `@deepseek-ai/cordis`（或上游 `cordis`）作为装配内核，不自研 DI 图。理由：Koishi 生态四年验证 + DSH 生产使用；仓库规则「优先复用成熟库」；TrapMap 现有 `create<X>Deps` 工厂可原样保留为插件内部实现，迁移风险低。
2. **装配 = TS 组合，不是配置**：部署形态 = TS builder（`.add()` 顺序 = 有序 bundles 语义）。
3. **能力 = 节点（R4）**：检索、入库处理、治理、job-runtime、cron、auth 等每个能力是一个「能力节点」——同一节点可选择 内嵌 / 独立服务 / 集群副本 三种拓扑，由装配声明决定，而不是由宿主代码决定。
4. **worker = 云原生节点（R5）**：worker 能力节点可选独立成服务；一个服务可下设子 worker 节点（类似 nginx 的 master 进程下挂 worker processes，或 server 块的层次），整体部署与拆分部署可切换。
5. **宿主收敛为 transport 插件**：Nest/Fastify adapter 细节保留（`createNestAdapter`/`createFastifyAdapter` 直接复用），宿主样板全部下沉到装配内核与 infra 插件。

## 目标架构

### 3.1 分层模型（目标态，含能力节点拓扑）

```text
apps/*（thin assembly：调用对应形态 builder → boot；禁止业务）
  → packages/assembly（统一组装中心：cordis Context 封装 + 能力节点注册表 + TS 组合器 +
     生命周期/退出控制 + startupChecks + 拓扑解析）
      ├── 形态 builders（TS 组合）: localAgentAssembly() / teamMonolithAssembly() /
      │                           distributedAssembly(serviceName)
      ├── 能力节点（领域外壳，每个节点带拓扑声明）:
      │     identity-access · knowledge-write · knowledge-read(检索) · candidate-ingestion(入库处理)
      │     governance-review(治理) · job-runtime(worker 容器) · cron
      │     └─ 子 worker 节点: candidate-processing · governance-feedback ·
      │                        badcase-export · conflict-detection · outbox-dispatch
      │           （可选独立成进程，或挂在 job-runtime 容器下——类似 nginx master/worker）
      ├── transport 插件: nest-transport / fastify-transport / gateway-transport / worker-transport
      │                   （in-process port adapter vs HTTP remote adapter 由组合选择）
      └── infra 插件: pg / task-transport(postgres|rabbitmq) / retrieval-engine(完整管线) /
                      otel / consul / audit
  → backend-core（domain/ports/invocation 不变）/ contracts / persistence-schema（不变）
```

不变项（硬约束）：

- `backend-core/src/<context>/domain/` 纯规则层、`ports`、`invocation`、RouteDef 契约与双 adapter 全部原样保留。
- `contracts` / `persistence-schema` / `lib` 不因装配中心化而改变。
- 对外 API 面（RouteDef `/v1`、`/internal`、health/ready/metrics）行为不变。
- 多部署形态：local-agent、team-monolith、distributed **全部保留**，且表达为 TS 组合差异。
- **零配置文件**：不新增 yml/json 装配文件、不引入 loader；运行期参数（端口、DB URL、模式）仍走现有 env/config 读取，只是「组合什么、节点如何拓扑」由 TS 决定。

### 3.2 关键机制

1. **服务注册表**：`ctx.service('knowledgeWrite')`、`ctx.service('taskQueue')` 等；现有 `create<X>Module(deps)` 工厂改为能力节点 `apply(ctx)`（内部仍调工厂，deps 从 ctx 服务解析）。
2. **依赖图驱动 bootstrap**：`inject` 自动推导启动/停止顺序；启动期校验：未满足的 inject、循环依赖、重复节点 id 一律 fail-loud。
3. **TS 组合器**：`createAssembly()` → `.add(node, config?)` 按序登记（后 add 同名服务配置按 intercept 语义叠加/覆盖）；`.build()` 返回不可变描述；`.boot()` 执行装载。
4. **能力节点拓扑（R4/R5/R6，v3 核心）**：节点声明 `topology: 'embedded' | 'standalone' | 'cluster'` 与 `children?: Node[]`（子节点）；装配中心把「节点树」解析为进程拓扑：
   - 同一节点在 local-agent/team-monolith 中 `embedded`（in-process）；
   - 在 distributed 中 `standalone`（独立进程，`distributedAssembly('knowledge-read')` 即检索节点独立）；
   - 任意节点可 `cluster: { replicas: n }`——同构副本由编排层（compose/k8s）拉起，装配层只保证「多消费者安全」（task_queue/outbox 的 SKIP LOCKED + 租约已具备）；
   - **worker 容器节点**（job-runtime）可挂子 worker 节点，整体部署（一个进程承载多个子 worker）或拆分部署（每个子 worker 独立进程）可切换。
5. **transport 可插拔**：in-process adapter 与 HTTP remote（`internal-client.ts`）各为插件，组合选择；同一 `KnowledgeWritePort` 语义不变。
6. **生命周期统一**：`ctx.effect` + Fiber dispose 替代手写 shutdown 控制器。

## 分项设计

### D1：`packages/assembly` 落点与 cordis 引入

- 新包 `packages/assembly`（`@trapmap/assembly`）：依赖 `@deepseek-ai/cordis`（^4.0.1）、`@trapmap/contracts`、`@trapmap/backend-core`（ports 类型）、`@trapmap/lib`。
- 导出面：`createAssembly()` → `AssemblyBuilder`（`.add(node, config?) / .build() / .boot()`）；`defineNode({ id, apply, inject, configSchema, provides, topology?, children? })`；`startupChecks(assembly)`（inject 无环、重复 id、拓扑合法性——如 standalone 子节点必须能独立满足 inject、cluster 节点不得为 embedded）；`createShutdownController(dispose)`（5s 分级退出）。
- 形态 builders 落在 `packages/assembly/src/profiles/`（`local-agent.ts` / `team-monolith.ts` / `distributed.ts`），由 apps/* 消费。
- fallow zone：`assembly` 独立 zone（allow: backend-core/contracts/lib；被 host-*/apps 消费），写入 BOUNDARIES.md。
- 评估替代方案：塞进 `backend-core` ——否决（framework-free 内核纯净性）；自研微型内核 ——否决（重复造 DI 图）；引入 cordis loader/yml 配置面 ——否决（用户明确只要 TS）。

### D2：能力节点映射表

| 现有包 | 节点 id | 提供服务 | inject | 默认拓扑 |
|---|---|---|---|---|
| `service-identity-access` | `identity-access` | `identity` | `pg`, `audit` | embedded / standalone |
| `service-knowledge-write` | `knowledge-write` | `knowledgeWrite` | `knowledgeOwner`, `audit` | embedded / standalone |
| `service-knowledge-read`（检索） | `knowledge-read` | `knowledgeRead`（`KnowledgeReadPort`） | `knowledgeRepo`, `retrievalEngine` | embedded / standalone |
| `service-candidate-ingestion`（入库处理） | `candidate-ingestion` | `candidateIngestion` | `taskQueue`, `knowledgeWritePort`, `pg` | embedded / standalone |
| `service-governance-review`（治理） | `governance-review` | `governanceReview` | `taskQueue`, `knowledgeWritePort`, `pg` | embedded / standalone |
| `service-job-runtime`（worker 容器） | `job-runtime` | `jobRuntime` | `taskQueue`, `outbox` | embedded / standalone |
| 子 worker（R5） | `candidate-processing` / `governance-feedback` / `badcase-export` / `conflict-detection` / `outbox-dispatch` | —（消费方） | `taskQueue` / `outbox` | 挂在 job-runtime 下或独立 |
| `service-cron` | `cron` | `cronRegistry` | `taskQueue`, `pg` | embedded / standalone |
| `host-local` Nest | `nest-transport` | `httpSurface` | `routes` | 终端 |
| `host-distributed` gateway | `gateway-transport` | `httpSurface` | `internalClient`, `routes` | 终端 |
| 服务进程 | `fastify-transport` | `httpSurface`（`/internal`） | `routes`（子集） | 终端 |
| infra | `pg`, `task-transport`, `outbox`, `retrieval-engine`, `otel`, `consul`, `audit` | 对应 port 实现 | 依实现 | embedded |

要点：

- 每个 service 包**新增** `src/node.ts`（`defineNode(...)`：包装现有 `create<X>Deps` + `create<X>RouteDefs`），**不删除**现有工厂（双轨期 host-* 继续直连）。
- `routes` 聚合服务：收集各节点注册的 RouteDef 列表，供 transport 插件消费。
- 依赖方向不变：节点只依赖 `@trapmap/backend-core` ports 类型 + `@trapmap/contracts`（fallow 现有规则继续生效）。
- 子 worker 节点复用现有 typed handlers（`service-job-runtime/src/handlers/**`）与 `createCandidateProcessingHandler`（`service-candidate-ingestion/src/processing.ts`）——节点化只加拓扑声明，不重写处理逻辑。

### D3：部署形态 = TS 组合器（无配置文件）

```ts
// local-agent / team-monolith：全部节点 embedded（in-process）
export function localAgentAssembly(options: { host?: string; port?: number }) {
  return createAssembly()
    .add(pg({ required: false }))
    .add(identityAccess()).add(knowledgeWrite()).add(knowledgeRead())   // 检索内嵌
    .add(candidateIngestion()).add(governanceReview())                  // 入库处理内嵌
    .add(jobRuntime({ children: ['candidate-processing', 'governance-feedback', 'outbox-dispatch'] })) // worker 整体内嵌
    .add(cron())
    .add(nestTransport(options));
}

// distributed：节点按需独立成服务（standalone），worker 可下设子服务
export function distributedAssembly(service: DistributedServiceName) {
  switch (service) {
    case 'gateway':
      return createAssembly().add(identityRemote()).add(gatewayTransport());
    case 'knowledge-read':            // 检索独立成服务（R4）
      return createAssembly().add(pg()).add(retrievalEngine()).add(knowledgeRead()).add(fastifyTransport());
    case 'candidate-ingestion':       // 入库处理独立成服务（R4）
      return createAssembly().add(pg()).add(taskTransport()).add(candidateIngestion()).add(fastifyTransport());
    case 'job-runtime':               // worker 容器：整体承载多个子 worker（R5，类似 nginx master 挂多 worker）
      return createAssembly().add(pg())
        .add(jobRuntime({ children: ['candidate-processing', 'governance-feedback', 'conflict-detection', 'outbox-dispatch'] }))
        .add(fastifyTransport());
    case 'candidate-worker':          // 或者：子 worker 独立成进程（拆分部署，nginx worker process 类比）
      return createAssembly().add(pg()).add(taskTransport()).add(subWorker('candidate-processing')).add(workerTransport());
    case 'governance-worker':
      return createAssembly().add(pg()).add(taskTransport())
        .add(subWorker('governance-feedback')).add(subWorker('badcase-export')).add(workerTransport());
    // outbox-worker / cron-scheduler / knowledge-write / identity-access / governance-review 同理
  }
}
```

- 组合语义：`.add()` 顺序 = 有序 bundles；拓扑（embedded / standalone / cluster / 子 worker）由节点声明与形态 builder 共同决定；无任何 yml/json/patch 文件。
- **集群化（R6）**：`cluster: { replicas: n }` 声明只表达「该节点可安全多副本」；副本拉起由编排层负责（docker-compose `deploy.replicas` / k8s），装配层保证安全语义：task_queue/outbox 的 SKIP LOCKED + 租约（已有）、幂等 handler（已有）、连接预算校验（`startupChecks` 聚合所有副本 poolSize ≤ budget）。
- `scripts/backend-target-registry.ts` 与根 `dev:*` 别名收敛为「形态 builder 名 → 命令」的薄映射；build target 与运行时组合解耦。
- 组合即文档：形态 builder 的调用序列是权威清单；「distributed 子组合必须含 pg + 对应 transport」「子 worker 只能挂在 job-runtime 或独立 + workerTransport」等断言写进单测。

### D4：Transport 插件化

- in-process：现有 `backend-core-adapters.ts` 的 `in-process vs remote` 选择逻辑迁移为 `InProcessTransportPlugin`。
- HTTP remote：现有 `internal-client.ts` + `internal-knowledge-write-client.ts` 迁移为 `HttpTransportPlugin`（gateway 与分布式服务进程用），错误归一化与 trace header 传播原样保留。
- Nest/Fastify adapter（`backend-core/src/http/adapters/{nest,fastify}.ts`）不动，transport 插件只负责把它们挂到 ctx 生命周期上。
- 集群化场景（R6）：standalone 节点的 HTTP 面天然支持负载均衡（多个副本注册到 Consul，gateway 经 discovery 轮询——`dynamic-discovery.ts` round-robin 已存在）。

### D5：双实现收敛路径（借插件选择消灭双实现）

- **taskQueue/outbox**：完整实现（`service-job-runtime/src/async-runtime.ts`）为唯一 `task-transport` 插件；`host-distributed/src/shared/ports.ts` 简化版退役（debt「host-distributed shared/ports.ts 业务下沉」）。
- **检索**：完整管线（`service-knowledge-read`）为唯一 `retrieval-engine` 插件；ILIKE 双实现删除，distributed 检索节点直接装配完整管线（R4 节点化后行为与 monolith 一致）。
- **OTel/Consul**：单一 `otel`/`consul` 插件（debt「OTel/Consul 双份收敛」）。

### D6：迁移路线（双轨，行为不变为硬约束）

- **Phase 1（地基）**：`packages/assembly` 建包 + cordis 引入 + `createAssembly`/`defineNode`/`startupChecks`/`createShutdownController` + 单测（组合语义、inject 无环、拓扑合法性、dispose 顺序、退出控制）；现有宿主零改动。
- **Phase 2（试点）**：host-local 改由 assembly boot（`apps/light` 调 `localAgentAssembly()`/`teamMonolithAssembly()` → `boot()`），Nest 以 transport 插件接入；`createHostLocalRuntime` 保留为节点内部实现。
- **Phase 3（收敛）**：host-distributed 收敛——gateway 与各服务进程改为「同一内核 + `distributedAssembly(name)`」；删除 `start<X>Service` 样板与 `--service` switch；`shared/ports.ts` 简化版退役；**worker 子节点拆分/合并两种形态同时打通**（job-runtime 整体承载 与 candidate-worker/governance-worker 拆分）。
- **Phase 4（收尾）**：双实现收敛（D5）、direct-run seam 退役、backend-target-registry/dev:* 别名对齐、**集群化文档与验证**（compose replicas + 连接预算 + discovery 轮询验证）、BOUNDARIES/DEPLOYMENT/TESTING 文档回写。

## 影响面

- **新增**：`packages/assembly`（含 cordis 依赖，`pnpm-lock.yaml` 更新）；`packages/assembly/src/profiles/{local-agent,team-monolith,distributed}.ts`；`defineNode` 节点声明与拓扑/集群单测。
- **改造**：`packages/service-*` 各加 `src/node.ts`（薄包装）；`packages/host-local`/`host-distributed` 收敛为 transport 插件目录；子 worker 从 `handlers/**` 提升为可挂载节点（处理逻辑不动）；`docker-compose.yml` 对齐节点拓扑（新增 replicas 场景可选）；`scripts/backend-target-registry.ts`、根 `dev:*` 别名。
- **不动**：`backend-core` domain/ports/invocation/RouteDef、`contracts`、`persistence-schema`、`lib`、对外 API 面。
- **明确不做**：不引入 yml/json 装配文件、cordis loader、patch 层；本轮不引入 k8s 编排实现（compose 可表达 replicas 即满足验证），编排平台化保持 deferred。
- **文档**：`docs/architecture/ARCHITECTURE.md`、`BOUNDARIES.md`（+assembly zone）、`DEPLOYMENT.md`（节点拓扑 + 集群化）、`docs/operations/TESTING.md`、`docs/reference/REPO_STRUCTURE.md`、`SYSTEM_TRUTH_SOURCES.md`。
- **CI**：build/test/fallow 不变；拓扑断言作为 assembly 单测常驻。

## 风险与缓解

- **R1 — cordis 引入的依赖风险**：缓解——先建空壳验证 Node engines（CI Node 24 满足）、锁文件更新、`pnpm install --frozen-lockfile` 一致性由 CI 自证；cordis 4.0.1 为 DSH 同源生产版本。
- **R2 — 双轨期间两套装配并存漂移**：缓解——每阶段 closeout 强制删除被替代路径，不留无限双轨。
- **R3 — TS 组合与既有词汇冲突**（preset/runtimeMode/serviceUnit）：缓解——`SYSTEM_TRUTH_SOURCES.md` 术语映射表：能力节点拓扑是「部署表达」，preset/runtimeMode/serviceUnit 是「运行时语义」，分层不冲突。
- **R4 — 行为不变约束被破坏**：缓解——每阶段 golden 测试（deployment-smoke/runtime-foundations/distributed-closeout/observability-closeout）作为放行门禁。
- **R5 — 范围过大**：缓解——四阶段独立进入条件；集群化（replicas）只做语义声明 + compose 验证，不做编排平台化。
- **R6 — 检索行为升级争议**（distributed ILIKE → 完整管线）：缓解——既有 debt 收敛方向，Phase 3 单独评审放行。
- **R7 — 只做 TS 组合导致「组合即代码」可读性争议**：缓解——形态 builder 单文件 ≤ 60 行、禁止分支业务逻辑；组合顺序与拓扑由 startupChecks 与单测锁定；未来若出现非开发者改形态的需求再评估配置面。
- **R8 — 子 worker 拆分部署的重复消费/空转风险**（同一 task_queue 多消费者）：缓解——任务去重键（dedupe_key）+ SKIP LOCKED 认领已保证不重复执行；子 worker 独立进程时 `ownsWork` 语义由拓扑解析统一注入（替代散落的布尔开关）。

## 验证方式

- `pnpm typecheck`、`pnpm test`（assembly 单测：builder 组合 / inject 无环 / 拓扑合法性（standalone 必须独立满足 inject、cluster 不得 embedded）/ 子 worker 挂载与拆分形态 / dispose 顺序 / 退出控制 / 三形态组合断言）。
- `pnpm test:deployment-smoke`、`pnpm test:runtime-foundations`、`pnpm test:distributed-closeout`、`pnpm test:observability-closeout`、`pnpm test:discovery-closeout`（每阶段对应门禁）。
- 集群化验证（Phase 4）：compose 以 replicas=2 起 candidate-worker + outbox-worker，跑 distributed-closeout 的 ownership/重复消费断言（`ownership-acceptance.test.ts` 已有基础）。
- `pnpm check:fallow`（+assembly zone）、`pnpm check:imports`、`pnpm check:docs`、`pnpm check:structure`。
- 结构性断言：host-* 无 `start<X>Service` 样板残留；`shared/ports.ts` 无 `createPgTaskQueue`/`createPgOutbox`/`createPgRetrievalQuery`；每个 service 包有 `node.ts` 且业务文件零改动 diff；全仓无新增 yml/json 装配文件。

**debt 关联标注**：本文档对应已登记条目「统一优雅组装中心（assembly）主线」（2026-08-16 登记，v3 修订：能力节点化 + worker 云原生化 + 集群化语义）；承接既有 debt：OTel/Consul 双份收敛、host-distributed shared/ports.ts 业务下沉、internal-client review/governanceReview 双组合并、apps workspace 组装中心迁移遗留（direct-run seam）、contracts 包瘦身。不替代 EvalSeedPort 收窄等独立条目。
