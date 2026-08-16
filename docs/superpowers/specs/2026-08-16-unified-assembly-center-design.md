# TrapMap 统一优雅组装中心设计（TS Code-First Assembly Kernel + 功能模块）

> **状态：** deferred design input（用户直接请求的设计文档；在根 `plan.md` 显式激活前不构成执行授权，对应 debt register 条目的「设计输入」）
> **日期：** 2026-08-16（v2：按用户澄清修订——**不走 JSON/YAML 配置装配，只考虑 TypeScript code-first 组合**；装配方式的优化是核心）
> **来源：** 用户需求「处理架构优雅性缺陷，宿主双样板收敛为统一优雅组装中心 + 功能模块，多部署形态不可舍弃；装配只考虑 TS，不引入 json/yml 装配层」+ 架构审查（宿主双样板/双实现/契约包偏胖/规模失衡/叙事漂移）+ cordis 与 DeepSeek Harness 装配模型调研
> **定位：** future-state 蓝图。本文给出「TS 统一组装中心」的目标架构、功能模块映射、部署形态的 TS 组合表达与分阶段迁移路线；落地窗口与进入条件以 `docs/todos/open-debt-and-compromises.md` 相应条目为准。

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

## 调研：cordis 与 DeepSeek Harness 的装配模型（取编程式组合，弃配置文件层）

### 2.1 cordis（Koishi 生态四年 + DeepSeek Harness 生产内核）

来源：[github.com/cordiverse/cordis](https://github.com/cordiverse/cordis)、[npm @deepseek-ai/cordis 4.0.1](https://www.npmjs.com/package/@deepseek-ai/cordis)、[Cordis — The Plugin Kernel Behind DeepSeek Harness](https://floatboat.ai/blog/cordis-plugin-framework)、[DeepSeek Harness developer preview](https://deepseek.com/harness/en)。

核心机制（本地核验 `node_modules/@deepseek-ai/cordis/lib/types/*.d.ts`）：

| 机制 | API | 对 TrapMap 的意义 |
|---|---|---|
| 根容器 | `new Context()` | 统一组装中心的入口，替代「每个宿主自建 runtime」 |
| 插件装载（编程式） | `ctx.plugin(plugin, config)` 返回 Fiber | 每个 service 包/transport/infra 成为 TS 插件；`root.plugin(a); root.plugin(b)` 即装配 |
| 依赖图 | `inject: ['serviceName']` | 插件 B 在 A 提供服务后才加载、A 停止前卸载、A 失败则 B 不激活——**bootstrap 顺序自动推导** |
| 服务注册 | `class X extends Service` / `ctx.service()` | port 实现（knowledgeOwner、taskQueue、outbox…）成为可替换服务 |
| 可逆副作用 | `ctx.effect` | 生命周期清理自动回收，替代手写 shutdown 控制器 |
| 服务隔离/拦截 | `ctx.isolate(name)` / `ctx.intercept(name, config)` | 测试可用最小组合；配置按层合并（运行时内存中，非文件） |

**关键取舍：** cordis 生态同时提供 loader（YAML/JSON 配置树 + include/group/hmr）与**编程式装配**（`new Context()` + `ctx.plugin()`）。本项目**只采用编程式**：`ctx.plugin()` 是普通 TS 调用，组合逻辑就是 TS 模块；loader/patch 文件层（`cordis.patch.yml`、`dsh.profile.bundles` 配置清单）**明确不引入**——与用户「只考虑 TS」的要求一致，也避免「配置文件与代码双源」这一新的漂移面。

### 2.2 DeepSeek Harness（dsh）：编程式组合的工程纪律

来源：[deepseek.com/harness/en](https://deepseek.com/harness/en)（「Everything is a plugin」）、[github.com/deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)、本机安装包 `@deepseek-ai/dsh`（lib/profile-boot-*.js）。

- **一切皆插件**：models、tools、skills、sessions、sandboxes、storage、loops、scheduling、UI 全部是可替换/可重组的插件；能力通过组合选择/替换/扩展，不改内核源码。
- **多运行时模式 = 同一内核不同组合**：standard / code / minimal / creator 是同一内核的插件组合差。**这正是「多部署形态不可舍弃」的答案**：形态是 TS 组合的差，不是代码分支的差。
- **工程纪律可移植**：fail-loud（插件加载失败即进程失败，不静默跳过）、bounded shutdown（5s 宽限分级退出）、依赖缺失即报错（`inject` 未满足时启动失败而非运行期 NPE）。这些与「配置文件是否存在」无关，是内核行为，TS 组合同样继承。
- dsh 的 profile 目录/patch 文件层（`dsh.profile.bundles` + `cordis.patch.yml`）是**部署产品形态**，与本项目需求（代码内多形态组合）不同——只借鉴其「有序 bundles + 后层覆盖」的语义，落为 TS 组合器的 `add()` 顺序语义（后 add 覆盖/叠加同名服务配置）。

### 2.3 对 TrapMap 的启示（结论）

1. **引入成熟实现**：采用 `@deepseek-ai/cordis`（或上游 `cordis`）作为装配内核，不自研 DI 图。理由：Koishi 生态四年验证 + DSH 生产使用；仓库规则「优先复用成熟库」；TrapMap 现有 `create<X>Deps` 工厂可原样保留为插件内部实现，迁移风险低。
2. **装配 = TS 组合，不是配置**：三种部署形态 = 三个 TS builder（`localAgentAssembly()` / `teamMonolithAssembly()` / `distributedAssembly(name)`），进程入口只调对应 builder；不引入任何 yml/json manifest、patch 文件或 loader。
3. **功能模块 = 现有 service 包 + 现有 RouteDef/domain 的插件外壳**：不重写业务，只加一层「`apply(ctx)` + `inject`」包装。
4. **宿主收敛为 transport 插件**：Nest/Fastify adapter 细节保留（`createNestAdapter`/`createFastifyAdapter` 直接复用），宿主样板（runtime composition、observability、discovery、worker wiring）全部下沉到装配内核与 infra 插件，双样板消失。

## 目标架构

### 3.1 分层模型（目标态）

```text
apps/*（thin assembly：调用对应形态 builder → boot；禁止业务）
  → packages/assembly（统一组装中心：cordis Context 封装 + TrapMap 插件注册表 + TS 组合器 +
     生命周期/退出控制 + 启动期校验）
      ├── 形态 builders（TS 组合）: localAgentAssembly() / teamMonolithAssembly() /
      │                           distributedAssembly(serviceName)
      ├── 功能模块插件（领域外壳）: identity-access / knowledge-write / knowledge-read /
      │                           candidate-ingestion / governance-review / job-runtime / cron
      │                           （内部复用现有 create<X>Deps/create<X>Module/create<X>RouteDefs）
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
- 多部署形态：local-agent（in-process、json-store 可选）、team-monolith（in-process + postgres + 内嵌 worker）、distributed（gateway + 独立服务进程 + HTTP transport）**全部保留**，且表达为 TS 组合差异。
- **零配置文件**：不新增 yml/json 装配文件、不引入 loader；运行期参数（端口、DB URL、模式）仍走现有 env/config 读取，只是「组合什么」由 TS 决定。

### 3.2 关键机制

1. **服务注册表**：`ctx.service('knowledgeWrite')`、`ctx.service('taskQueue')` 等；现有 `create<X>Module(deps)` 工厂改为插件 `apply(ctx)`（内部仍调工厂，deps 从 ctx 服务解析）。`KNOWLEDGE_WRITE_MODULE.dependsOn` 从空数组变成真实依赖声明（或直接用 `inject`）。
2. **依赖图驱动 bootstrap**：`inject` 自动推导启动/停止顺序，替代手写 `createHostLocalRuntime` 顺序与 `bootstrap-*` 手工纪律；启动序列（repos → candidate recovery → workers → graph → lifecycle）变成依赖边（`candidateIngestionPlugin inject ['taskQueue','knowledgeWritePort']` 等）。启动期校验：未满足的 inject、循环依赖、重复服务 id 一律 fail-loud。
3. **TS 组合器**：`createAssembly()` 返回 builder，`.add(plugin, config?)` 按序登记（后 add 的同名服务配置按 intercept 语义叠加/覆盖）；`.build()` 返回不可变 Assembly 描述（插件表 + 依赖边），`.boot()` 执行装载与生命周期。形态 builder 就是普通 TS 函数：`export const localAgentAssembly = () => createAssembly().add(pg({required:false})).add(identityAccess())...`——**类型安全、可单测、可 tree-shake**。
4. **transport 可插拔**：in-process adapter（现 `host-local/src/nest/runtime/backend-core-adapters.ts` 的选择逻辑）与 HTTP remote（现 `host-distributed/src/gateway/internal-client.ts`）各为插件，组合选择；同一 `KnowledgeWritePort` 语义不变。
5. **生命周期统一**：`ctx.effect` + Fiber dispose 替代手写 shutdown 控制器（`profile-boot` 的 5s 分级退出模式可移植为 assembly 的退出控制器）。

## 分项设计

### D1：`packages/assembly` 落点与 cordis 引入

- 新包 `packages/assembly`（`@trapmap/assembly`）：依赖 `@deepseek-ai/cordis`（^4.0.1）、`@trapmap/contracts`、`@trapmap/backend-core`（ports 类型）、`@trapmap/lib`。cordis 是框架依赖，按仓库规则在包内声明（不经 lib 转发——lib 只承载通用工具函数）。
- 导出面：
  - `createAssembly()` → `AssemblyBuilder`（`.add(plugin, config?) / .build() / .boot()`）；
  - `registerPlugin(id, { apply, inject, configSchema, provides })`（插件声明，供 builder 类型推导）；
  - `startupChecks(assembly)`（inject 无环、服务重复、fail-loud 校验，boot 前执行）；
  - `createShutdownController(dispose)`（5s 分级退出，移植 dsh 语义）。
- 形态 builders 落在 `packages/assembly/src/profiles/`（`local-agent.ts` / `team-monolith.ts` / `distributed.ts`），由 apps/* 消费；apps 仍只做 thin assembly（读 env → 调 builder → boot）。
- fallow zone：`assembly` 独立 zone（allow: backend-core/contracts/lib；被 host-*/apps 消费），写入 BOUNDARIES.md。
- 评估替代方案：直接塞进 `backend-core` ——否决（backend-core 是 framework-free 内核，引入 DI 框架会污染其纯净性）；自研微型内核 ——否决（重复造 DI 图，违背「优先复用成熟库」）；引入 cordis loader/yml 配置面 ——否决（用户明确只要 TS）。

### D2：功能模块化映射表

| 现有包 | 插件 id | 提供服务 | inject（依赖服务） |
|---|---|---|---|
| `service-identity-access` | `identity-access` | `identity`（auth/session/team/member/access-key） | `pg`, `audit` |
| `service-knowledge-write` | `knowledge-write` | `knowledgeWrite`（`KnowledgeWritePort`） | `knowledgeOwner`, `audit` |
| `service-knowledge-read` | `knowledge-read` | `knowledgeRead`（`KnowledgeReadPort`） | `knowledgeRepo`, `retrievalEngine` |
| `service-candidate-ingestion` | `candidate-ingestion` | `candidateIngestion` | `taskQueue`, `knowledgeWritePort`, `pg` |
| `service-governance-review` | `governance-review` | `governanceReview`（`ReviewPort`） | `taskQueue`, `knowledgeWritePort`, `pg` |
| `service-job-runtime` | `job-runtime` | `jobRuntime`（queue/outbox consumer） | `taskQueue`, `outbox` |
| `service-cron` | `cron` | `cronRegistry`（`cron_jobs` owner） | `taskQueue`, `pg` |
| `host-local` Nest | `nest-transport` | `httpSurface`（`/v1` + `/internal`） | `routes`（全部 RouteDef 插件） |
| `host-distributed` gateway | `gateway-transport` | `httpSurface`（网关转发） | `internalClient`, `routes` |
| `host-distributed` 服务进程 | `fastify-transport` | `httpSurface`（`/internal`） | `routes`（子集） |
| infra | `pg`, `task-transport`, `outbox`, `retrieval-engine`, `otel`, `consul`, `audit` | 对应 port 实现 | 依实现 |

要点：

- 每个 service 包**新增** `src/plugin.ts`（`create<X>Plugin()`：包装现有 `create<X>Deps` + `create<X>RouteDefs`），**不删除**现有工厂（双轨期 host-* 继续直连）。
- `routes` 聚合服务：收集各插件注册的 RouteDef 列表，供 transport 插件消费（复用现有 `registerFastifyRoutes`/Nest adapter）。
- 依赖方向不变：插件只依赖 `@trapmap/backend-core` ports 类型 + `@trapmap/contracts`，不产生 service 间实现级 import（fallow 现有规则继续生效）。

### D3：部署形态 = TS 组合器（无配置文件）

三种形态是 `packages/assembly/src/profiles/` 下的普通 TS 函数，全部类型安全：

```ts
// packages/assembly/src/profiles/local-agent.ts
export function localAgentAssembly(options: { host?: string; port?: number }) {
  return createAssembly()
    .add(pg({ required: false }))          // json-store fallback 保留现有语义
    .add(identityAccess())
    .add(knowledgeWrite())
    .add(knowledgeRead())
    .add(candidateIngestion())
    .add(governanceReview())
    .add(jobRuntime())
    .add(cron())
    .add(nestTransport(options));
}

// packages/assembly/src/profiles/distributed.ts
export function distributedAssembly(service: DistributedServiceName) {
  switch (service) {
    case 'gateway':
      return createAssembly().add(identityRemote()).add(gatewayTransport());
    case 'knowledge-write':
      return createAssembly().add(pg()).add(knowledgeWrite()).add(fastifyTransport());
    case 'candidate-worker':
      return createAssembly().add(pg()).add(taskTransport()).add(candidateIngestion())
        .add(workerTransport());
    // governance-worker / outbox-worker / cron-scheduler / knowledge-read / identity-access 同理
  }
}
```

- 组合语义：`.add()` 顺序 = 有序 bundles（后 add 的 transport/config 通过 `ctx.intercept` 叠加/覆盖同名服务配置）；无任何 yml/json/patch 文件。
- 连接预算（`assertDistributedConnectionBudget`）从代码硬编码变为 `distributedAssembly` 的启动期校验（每个 distributed 子组合的 poolSize 总和 ≤ budget，`startupChecks` 内执行）。
- `scripts/backend-target-registry.ts` 与根 `dev:*` 别名收敛为「形态 builder 名 → 命令」的薄映射（light=local-agent|team-monolith，heavy=distributed），消除三层语义分散；build target 与运行时组合解耦。
- 组合即文档：`localAgentAssembly()` 的调用序列本身就是该形态的权威清单，可被 `pnpm check:structure` 类守卫静态检查（如「distributed 子组合必须含 pg + fastify-transport」等断言写在单测里）。

### D4：Transport 插件化

- in-process：现有 `host-local/src/nest/runtime/backend-core-adapters.ts` 的 `in-process vs remote` 选择逻辑迁移为 `InProcessTransportPlugin`（提供 port 语义的本地实现）。
- HTTP remote：现有 `internal-client.ts` + `internal-knowledge-write-client.ts` 迁移为 `HttpTransportPlugin`（gateway 与分布式服务进程用），错误归一化与 trace header 传播逻辑原样保留。
- Nest/Fastify adapter（`backend-core/src/http/adapters/{nest,fastify}.ts`）不动，transport 插件只负责把它们挂到 ctx 生命周期上。

### D5：双实现收敛路径（借插件选择消灭双实现）

- **taskQueue/outbox**：完整实现（`service-job-runtime/src/async-runtime.ts`）为唯一 `task-transport` 插件；`host-distributed/src/shared/ports.ts` 的 `createPgTaskQueue`/`createPgOutbox` 简化版退役（对应 debt「host-distributed shared/ports.ts 业务下沉」进入条件：assembly 落地后）。
- **检索**：完整管线（`service-knowledge-read`）为唯一 `retrieval-engine` 插件；distributed 的 ILIKE 双实现删除，distributed 进程直接装配 `retrieval-engine`（行为升级为与 monolith 一致，属既定收敛方向）。
- **OTel/Consul**：单一 `otel`/`consul` 插件（对应 debt「OTel/Consul 双份收敛」）。

### D6：迁移路线（双轨，行为不变为硬约束）

- **Phase 1（地基）**：`packages/assembly` 建包 + cordis 引入 + `createAssembly`/`registerPlugin`/`startupChecks`/`createShutdownController` + 单元测试（builder 组合语义、inject 图无环、dispose 顺序、退出控制）；现有宿主零改动。放行：typecheck + assembly 单测 + fallow audit。
- **Phase 2（试点）**：host-local 改由 assembly boot（`apps/light` 调 `localAgentAssembly()`/`teamMonolithAssembly()` → `boot()`），Nest 以 transport 插件接入；`createHostLocalRuntime` 保留为插件内部实现。放行：`test:deployment-smoke`、`test:runtime-foundations`、observability-closeout 全绿。
- **Phase 3（收敛）**：host-distributed 收敛——gateway 与 8 个服务进程全部改为「同一内核 + `distributedAssembly(name)` 子组合」；删除 `start<X>Service` 样板与 `--service` 手写 switch；`shared/ports.ts` 简化版退役。放行：`test:distributed-closeout`、compose 冒烟。
- **Phase 4（收尾）**：双实现收敛（D5）、direct-run seam 退役（apps workspace 遗留 debt）、backend-target-registry/dev:* 别名对齐、BOUNDARIES/DEPLOYMENT/TESTING 文档回写。放行：全量 typecheck/test + fallow + check:docs/structure。

## 影响面

- **新增**：`packages/assembly`（含 cordis 依赖，`pnpm-lock.yaml` 更新）；`packages/assembly/src/profiles/{local-agent,team-monolith,distributed}.ts`；`startupChecks` 与形态断言单测。
- **改造**：`packages/service-*` 各加 `src/plugin.ts`（薄包装，不改业务）；`packages/host-local`/`host-distributed` 收敛为 transport 插件目录（大幅瘦身）；`scripts/backend-target-registry.ts`、根 `dev:*` 别名、`docker-compose.yml` 对齐形态 builder。
- **不动**：`backend-core` domain/ports/invocation/RouteDef、`contracts`、`persistence-schema`、`lib`、对外 API 面。
- **明确不做**：不引入 yml/json 装配文件、cordis loader、patch 层、配置驱动插件树（与用户要求一致）。
- **文档**：`docs/architecture/ARCHITECTURE.md`、`BOUNDARIES.md`（+assembly zone）、`DEPLOYMENT.md`、`docs/operations/TESTING.md`、`docs/reference/REPO_STRUCTURE.md`、`SYSTEM_TRUTH_SOURCES.md`（形态 builder 术语映射）。
- **CI**：build/test/fallow 不变；形态断言作为 assembly 单测常驻，无需新文件守卫。

## 风险与缓解

- **R1 — cordis 引入的依赖风险**（版本、ESM/Node 版本、锁文件）：缓解——先建 `packages/assembly` 空壳验证 Node engines（CI Node 24 满足）、锁文件更新、`pnpm install --frozen-lockfile` 一致性由 CI 自证；cordis 4.0.1 为 DSH 同源生产版本。
- **R2 — 双轨期间两套装配并存漂移**：缓解——每阶段 closeout 强制删除被替代路径（Phase 3 删除 `start<X>Service` 样板），不留无限双轨。
- **R3 — TS 组合与既有词汇冲突**（preset/runtimeMode/serviceUnit）：缓解——`SYSTEM_TRUTH_SOURCES.md` 建术语映射表：形态 builder 是「组合表达」，preset/runtimeMode/serviceUnit 是「运行时语义」，二者分层不冲突。
- **R4 — 行为不变约束被破坏**：缓解——每阶段 golden 测试（deployment-smoke/runtime-foundations/distributed-closeout/observability-closeout）作为放行门禁；纯搬移 diff 人工核验。
- **R5 — 范围过大**：缓解——四阶段独立进入条件，每阶段可独立合并；不达标的阶段不得进入下一阶段。
- **R6 — 检索行为升级争议**（distributed ILIKE → 完整管线）：缓解——这是既有 debt 的收敛方向（distributed 检索质量与 monolith 不一致属缺陷），Phase 3 单独评审放行。
- **R7 — 只做 TS 组合导致「组合即代码」可读性争议**：缓解——形态 builder 单文件 ≤ 60 行、禁止分支业务逻辑；组合顺序与依赖由 `startupChecks` 和单测锁定；后续若出现「非开发者也想改形态」的需求，再评估配置面（当前无此需求，不提前引入）。

## 验证方式

- `pnpm typecheck`、`pnpm test`（assembly 单测：builder 组合语义 / inject 图无环 / 重复服务检测 / dispose 顺序 / 退出控制 / 三形态组合断言——如 distributed 子组合必须含 pg 与对应 transport）。
- `pnpm test:deployment-smoke`、`pnpm test:runtime-foundations`、`pnpm test:distributed-closeout`、`pnpm test:observability-closeout`、`pnpm test:discovery-closeout`（每阶段对应门禁）。
- `pnpm check:fallow`（+assembly zone）、`pnpm check:imports`、`pnpm check:docs`、`pnpm check:structure`。
- 结构性断言：host-* 无 `start<X>Service` 样板残留；`shared/ports.ts` 无 `createPgTaskQueue`/`createPgOutbox`/`createPgRetrievalQuery`；每个 service 包有 `plugin.ts` 且业务文件零改动 diff；全仓无新增 yml/json 装配文件。

**debt 关联标注**：本文档对应已登记条目「统一优雅组装中心（assembly）主线」（2026-08-16 登记，设计输入 v2 修订：code-first TS 组合，无配置文件装配层）；承接既有 debt：OTel/Consul 双份收敛、host-distributed shared/ports.ts 业务下沉、internal-client review/governanceReview 双组合并、apps workspace 组装中心迁移遗留（direct-run seam）、contracts 包瘦身（eval 契约已迁出，剩余为 observability/operations 域）。不替代 EvalSeedPort 收窄等独立条目。
