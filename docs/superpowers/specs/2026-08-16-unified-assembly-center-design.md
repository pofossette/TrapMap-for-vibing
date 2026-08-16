# TrapMap 统一优雅组装中心设计（TS Code-First Assembly Kernel + 能力节点 + 契约优先）

> **状态：** deferred design input（用户直接请求的设计文档；在根 `plan.md` 显式激活前不构成执行授权，对应 debt register 条目的「设计输入」）
> **日期：** 2026-08-16（v4：在 v3「能力节点化 + worker 云原生化 + 集群化」基础上，按用户预期效果补充**契约优先（Contract-First）**：判断类能力批量节点化——意图识别只是示例，这样的节点不止一个；节点内部可修改、尽早订立契约、包边界清晰）
> **来源：** 用户需求（① 统一优雅组装中心 + 功能模块，多部署形态不可舍弃；② 装配只考虑 TS；③ 能力节点化 + worker 云原生化 + 子服务（nginx 类比）+ 微服务/分布式/集群化；④ **预期效果：云原生友好 + 高度模块化和可配置 + 包边界清晰；类似检索时的意图识别这类内容抽离为单独节点（不止一个），节点内部可修改，尽早订立契约**）+ 架构审查 + cordis 与 DeepSeek Harness 装配模型调研
> **定位：** future-state 蓝图。本文给出「TS 统一组装中心 + 能力节点拓扑 + 契约优先」的目标架构与分阶段迁移路线；落地窗口与进入条件以 `docs/todos/open-debt-and-compromises.md` 相应条目为准。

## 需求清单（v4 合并）

| # | 需求 | 设计落点 |
|---|---|---|
| R1 | 宿主双样板收敛为统一优雅组装中心 + 功能模块 | D1/D2/D4 |
| R2 | 多部署形态不可舍弃（local-agent / team-monolith / distributed） | D3 |
| R3 | 装配只考虑 TS，不引入 json/yml 装配层 | 全局约束，D1/D3 |
| R4 | 检索与入库处理逻辑分离并以「节点式装配中心」挂载为能力 | D7（能力节点） |
| R5 | worker 面向云原生：可选独立成服务，服务下设子服务（类似 nginx） | D7（worker 容器节点 + 子 worker） |
| R6 | 灵活性提高 + 微服务/分布式/集群化优化 | D7（副本/伸缩/发现/预算）+ D3 |
| R7 | **云原生友好 + 高度模块化和可配置 + 包边界清晰；判断类能力批量节点化（检索意图识别只是示例，节点不止一个），节点内部可修改、尽早订立契约** | D8（契约优先）+ D2（节点映射表） |

## 问题背景

### 问题 1：宿主双样板——同一份装配逻辑写了两遍

**证据：**

- `packages/host-local/src/`（约 5.1K src LOC）与 `packages/host-distributed/src/`（约 6.1K src LOC）各自独立实现 runtime composition、observability（OTel/metrics/Loki/Sentry 接线）、service discovery（Consul）、worker wiring。
- distributed 的 8 个 `start<X>Service()` 逐份重复「`loadServiceConfig → createServiceDatabase → createIdentityAccessPgDeps → createServicePorts → create<X>Deps → create<X>Server → attachRuntimeTelemetry`」样板；`--service` 分发是手写 switch（`packages/host-distributed/src/index.ts:20-55`）。
- OTel / Consul 双份接线已登记 debt。

### 问题 2：bootstrap 顺序手写、依赖关系无显式图

**证据：** `app.module.ts` 手写注册六 context module；`createHostLocalRuntime()`（`host-runtime.ts:80`）手写「config → services → queuePorts → retrievalQuery」；启动序列（repos → candidate recovery → workers → graph → lifecycle）散在 `bootstrap-*`；`KNOWLEDGE_WRITE_MODULE = { name, owns, dependsOn: [] }`（`module.ts`）——`dependsOn` 恒空，无 DI 解析、无生命周期管理。

### 问题 3：同一语义双实现（优雅头号障碍）

**证据（均已登记 debt）：** Queue/Outbox 简化版（`shared/ports.ts`）vs 完整版（`async-runtime.ts`）；检索 ILIKE（`shared/ports.ts:109-146`）vs 完整管线（`service-knowledge-read`）；OTel/Consul 双份接线。

### 问题 4：部署形态语义分散，无单一组合表达

**证据：** profile/preset/runtimeMode/serviceUnit 词汇在文档，实现分散在 `scripts/backend-target-registry.ts`、根 `dev:*` 别名、`docker-compose.yml`、双宿主 config；「进程 = 哪些模块 + 哪些 transport + 哪些 infra」没有可读、可校验的清单。

### 问题 5（背景）：契约包偏胖 / 规模失衡 / 叙事漂移

- `contracts` src 约 9.8K LOC（51 文件）仍偏胖；knowledge-write（~5.5K）与 knowledge-read（~4K）是 identity-access（~1K）/job-runtime（~0.9K）的 4–6 倍；「六个 bounded context」vs 实际 7 个 service 包的叙事漂移（cron 定位已补文档）。

### 问题 6：能力拓扑表达缺失——「检索/入库处理/worker」的部署维度没有第一等建模

**证据：** 检索与入库处理逻辑已分离（`service-knowledge-read` / `service-candidate-ingestion` / `service-governance-review`），但「该能力内嵌还是独立、几个副本、与谁同进程」只能从 compose + `--service` switch 人工推断；worker 部署形态是硬编码矩阵（compose 固定 4 个 worker 进程 + host-local 内嵌 `ownsWork` 布尔）；集群化基础（SKIP LOCKED + 租约）已存在但无装配层表达。

### 问题 7（v4 新增）：内嵌判断逻辑无契约边界——判断类能力成批不可替换、不可独立演化

**证据：**

- 检索管线的「模式/意图路由」目前是 knowledge-read 包内的内部函数：`server-retrieval-seam.ts` 注册 semantic/hybrid/graph-assisted 三个 strategy、`retrieval-recall-coordinator.ts` 的 `dispatchByMode`/`buildUnknownModeMessage`、`getRetrievalInfra(...).routing.selectStrategy`。查询该走哪个检索通道、何时 fallback、如何判定 unknown mode——这些判断逻辑与检索执行体耦合在同一包内，**没有端口接口**，外部无法替换实现。
- 同类内嵌判断**不止意图识别一个**，全仓已有批量候选（证据见 D8 节点清单表）：候选去重策略选择（`service-candidate-ingestion/src/llm-dedup.ts` 与规则去重 `createCandidateDuplicateDetector` 的编排）、治理冲突检测触发（`service-governance-review/src/conflict-workflow.ts`）、artifact 派生策略（`service-knowledge-write/src/artifact-derive/**`）、label 对齐策略（`labels/llm-align.ts`）、检索通道合并策略（`mergeCandidatesWithGraph`）等。
- 这类判断的共同特征：**有输入/输出边界、有多个候选实现或演进方向、被至少一个执行体消费**——正是「节点契约化」的判定标准（D8.4），意图识别只是第一个样例。

## 调研：cordis 与 DeepSeek Harness 的装配模型（取编程式组合，弃配置文件层）

### 2.1 cordis（Koishi 生态四年 + DeepSeek Harness 生产内核）

来源：[github.com/cordiverse/cordis](https://github.com/cordiverse/cordis)、[npm @deepseek-ai/cordis 4.0.1](https://www.npmjs.com/package/@deepseek-ai/cordis)、[Cordis — The Plugin Kernel Behind DeepSeek Harness](https://floatboat.ai/blog/cordis-plugin-framework)、[DeepSeek Harness developer preview](https://deepseek.com/harness/en)。

核心机制（本地核验 `node_modules/@deepseek-ai/cordis/lib/types/*.d.ts`）：

| 机制 | API | 对 TrapMap 的意义 |
|---|---|---|
| 根容器 | `new Context()` | 统一组装中心入口，替代「每个宿主自建 runtime」 |
| 插件装载（编程式） | `ctx.plugin(plugin, config)` 返回 Fiber | 每个能力/transport/infra 成为 TS 插件 |
| 依赖图 | `inject: ['serviceName']` | bootstrap 顺序自动推导、停止反向、失败不激活 |
| 服务注册 | `class X extends Service` / `ctx.service()` | port 实现成为可替换服务 |
| 可逆副作用 | `ctx.effect` | 生命周期清理自动回收 |
| 服务隔离/拦截 | `ctx.isolate(name)` / `ctx.intercept(name, config)` | 测试最小组合；配置按层合并（内存中，非文件） |

**关键取舍：** 只采用**编程式装配**（`new Context()` + `ctx.plugin()`）；loader/patch 文件层（`cordis.patch.yml`、`dsh.profile.bundles` 配置清单）**明确不引入**。

### 2.2 DeepSeek Harness（dsh）：编程式组合的工程纪律

来源：[deepseek.com/harness/en](https://deepseek.com/harness/en)、[github.com/deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)、本机 `@deepseek-ai/dsh`（lib/profile-boot-*.js）。

- **一切皆插件**：models/tools/skills/sessions/sandboxes/storage/loops/scheduling/UI 全部可替换重组；能力通过组合选择/替换/扩展，不改内核。
- **多运行时模式 = 同一内核不同组合**：standard/code/minimal/creator 是组合差——「多部署形态」的现成答案。
- **工程纪律可移植**：fail-loud、bounded shutdown（5s 分级退出）、依赖缺失即报错。
- 只借鉴「有序 bundles + 后层覆盖」语义，落为 TS 组合器 `.add()` 顺序语义。

### 2.3 对 TrapMap 的启示（结论）

1. **引入成熟实现**：采用 `@deepseek-ai/cordis` 作为装配内核，不自研 DI 图（Koishi 四年 + DSH 生产；TrapMap 现有工厂原样保留为节点内部实现）。
2. **装配 = TS 组合，不是配置**：部署形态 = TS builder。
3. **能力 = 节点（R4）**：检索、入库处理、治理、worker、cron、auth 每个能力是一个能力节点，拓扑（embedded/standalone/cluster）由装配声明决定。
4. **判断类能力 = 契约节点群（R7）**：意图识别、去重策略、冲突触发、派生策略等**一批**内嵌判断逻辑抽离为独立节点；节点对外只暴露契约（端口接口 + 配置 schema + 数据契约），内部实现可插拔（规则版/LLM 版/混合版）。
5. **worker = 云原生节点（R5）**：可选独立成服务，服务下设子 worker（nginx 类比），整体/拆分部署可切换。
6. **宿主收敛为 transport 插件**：Nest/Fastify adapter 保留，宿主样板全部下沉到装配内核与 infra 插件。

## 目标架构

### 3.1 分层模型（目标态，含能力节点拓扑与节点契约）

```text
apps/*（thin assembly：调用对应形态 builder → boot；禁止业务）
  → packages/assembly（统一组装中心：cordis Context 封装 + 能力节点注册表 + TS 组合器 +
     生命周期/退出控制 + startupChecks + 拓扑解析 + 契约校验）
      ├── 形态 builders（TS 组合）: localAgentAssembly() / teamMonolithAssembly() /
      │                           distributedAssembly(serviceName)
      ├── 能力节点（领域外壳，契约 + 实现可替换）:
      │     identity-access · knowledge-write · knowledge-read(检索)
      │     · candidate-ingestion(入库处理) · governance-review(治理)
      │     · job-runtime(worker 容器) · cron
      │     └─ 判断类能力节点群（R7，示例一批，可扩展）:
      │          intent-recognition(检索意图/模式路由) · dedup-strategy(去重策略选择)
      │          · conflict-trigger(冲突检测触发) · artifact-derivation(派生策略)
      │          · label-alignment(标签对齐策略) · channel-merge(检索通道合并)
      │     └─ 子 worker 节点: candidate-processing · governance-feedback ·
      │                        badcase-export · conflict-detection · outbox-dispatch
      ├── transport 插件: nest-transport / fastify-transport / gateway-transport / worker-transport
      └── infra 插件: pg / task-transport(postgres|rabbitmq) / retrieval-engine(完整管线) /
                      otel / consul / audit
  → backend-core（domain/ports/invocation 不变；节点契约的端口接口落点）
  → contracts（节点契约的 Zod schema/类型落点）/ persistence-schema / lib（不变）
```

不变项（硬约束）：

- `backend-core/src/<context>/domain/` 纯规则层、`ports`、`invocation`、RouteDef 契约与双 adapter 全部原样保留。
- `contracts` / `persistence-schema` / `lib` 不因装配中心化而改变（节点契约按现有规则落位，见 D8）。
- 对外 API 面（RouteDef `/v1`、`/internal`、health/ready/metrics）行为不变。
- 多部署形态：local-agent、team-monolith、distributed **全部保留**，表达为 TS 组合差异。
- **零配置文件**：不新增 yml/json 装配文件、不引入 loader。

### 3.2 关键机制

1. **服务注册表**：`ctx.service('knowledgeWrite')` 等；现有 `create<X>Module(deps)` 工厂改为能力节点 `apply(ctx)`（内部仍调工厂，deps 从 ctx 服务解析）。
2. **依赖图驱动 bootstrap**：`inject` 自动推导启动/停止顺序；未满足 inject、循环依赖、重复节点 id 一律 fail-loud。
3. **TS 组合器**：`createAssembly()` → `.add(node, config?)` → `.build()` → `.boot()`。
4. **能力节点拓扑（R4/R5/R6）**：节点声明 `topology: 'embedded' | 'standalone' | 'cluster'` 与 `children?`；装配中心把节点树解析为进程拓扑；worker 容器节点可挂子 worker（nginx 类比）；集群 = `cluster: { replicas: n }` 声明 + SKIP LOCKED/租约/幂等 handler 安全底座 + 连接预算校验。
5. **节点契约（R7）**：每个能力节点 = 契约 + 实现；契约三件套——① 端口接口（TS interface，落 `backend-core/src/ports/` 或节点声明文件）② 配置 schema（Zod，落 `contracts` 或节点文件）③ 数据/事件契约（已有 contracts 域）。**契约冻结后实现可独立替换**；装配时校验实现满足契约（结构类型 + 启动期断言）。
6. **transport 可插拔**：in-process adapter 与 HTTP remote 各为插件，组合选择；同一 port 语义不变。
7. **生命周期统一**：`ctx.effect` + Fiber dispose 替代手写 shutdown 控制器。

## 分项设计

### D1：`packages/assembly` 落点与 cordis 引入

- 新包 `packages/assembly`（`@trapmap/assembly`）：依赖 `@deepseek-ai/cordis`（^4.0.1）、`@trapmap/contracts`、`@trapmap/backend-core`（ports 类型）、`@trapmap/lib`。
- 导出面：`createAssembly()` → `AssemblyBuilder`（`.add(node, config?) / .build() / .boot()`）；`defineNode({ id, contract, apply, inject, configSchema, provides, topology?, children?, implements? })`（`contract` 引用契约 id，`implements` 声明实现）；`startupChecks(assembly)`（inject 无环、重复 id、拓扑合法性、**契约实现校验**）；`createShutdownController(dispose)`。
- 形态 builders 落在 `packages/assembly/src/profiles/`，由 apps/* 消费。
- fallow zone：`assembly` 独立 zone（allow: backend-core/contracts/lib；被 host-*/apps 消费），写入 BOUNDARIES.md。
- 评估替代方案：塞进 backend-core（否决，纯净性）；自研微型内核（否决，重复造轮子）；cordis loader/yml（否决，用户只要 TS）。

### D2：能力节点映射表（含契约）

| 现有包 | 节点 id | 提供服务 | 契约（端口/配置） | inject | 默认拓扑 |
|---|---|---|---|---|---|
| `service-identity-access` | `identity-access` | `identity` | 现有 auth/session ports + config | `pg`, `audit` | embedded / standalone |
| `service-knowledge-write` | `knowledge-write` | `knowledgeWrite` | `KnowledgeWritePort` | `knowledgeOwner`, `audit` | embedded / standalone |
| `service-knowledge-read`（检索） | `knowledge-read` | `knowledgeRead` | `KnowledgeReadPort` | `knowledgeRepo`, `retrievalEngine`, `intentRecognition` | embedded / standalone |
| `service-candidate-ingestion`（入库处理） | `candidate-ingestion` | `candidateIngestion` | `CandidateIngestionPort` | `taskQueue`, `knowledgeWritePort`, `dedupStrategy`, `pg` | embedded / standalone |
| `service-governance-review`（治理） | `governance-review` | `governanceReview` | `ReviewPort` | `taskQueue`, `knowledgeWritePort`, `conflictTrigger`, `pg` | embedded / standalone |
| `service-job-runtime`（worker 容器） | `job-runtime` | `jobRuntime` | `JobRuntimePort` | `taskQueue`, `outbox` | embedded / standalone |
| 子 worker（R5） | `candidate-processing` 等 5 个 | —（消费方） | typed handler 契约（现有 handlers） | `taskQueue` / `outbox` | 挂在 job-runtime 或独立 |
| `service-cron` | `cron` | `cronRegistry` | `CronRegistryPort` | `taskQueue`, `pg` | embedded / standalone |
| **判断类能力节点群（R7，新契约）** | `intent-recognition` | `intentRecognition` | **`IntentRecognitionPort`** | `aiProviders?`（LLM 实现时） | embedded（默认），可 standalone |
| 同上 | `dedup-strategy` | `dedupStrategy` | `DedupStrategyPort`（收编规则/LLM 去重选择） | `aiProviders?` | embedded |
| 同上 | `conflict-trigger` | `conflictTrigger` | `ConflictTriggerPort`（收编冲突检测触发） | `aiProviders?` | embedded |
| 同上 | `artifact-derivation` | `artifactDerivation` | `ArtifactDerivationPort`（收编派生策略） | `aiProviders?` | embedded |
| 同上 | `label-alignment` | `labelAlignment` | `LabelAlignmentPort`（收编 `labels/llm-align.ts` 策略） | `aiProviders?` | embedded |
| 同上 | `channel-merge` | `channelMerge` | `ChannelMergePort`（收编 `mergeCandidatesWithGraph` 合并策略） | — | embedded |
| transport | `nest-transport` / `gateway-transport` / `fastify-transport` / `worker-transport` | `httpSurface` | 现有 RouteDef 契约 | `routes` 等 | 终端 |
| infra | `pg`, `task-transport`, `outbox`, `retrieval-engine`, `otel`, `consul`, `audit` | 对应 port 实现 | 现有 ports | 依实现 | embedded |

要点：

- 每个 service 包**新增** `src/node.ts`（`defineNode(...)` 包装现有工厂），**不删除**现有工厂（双轨期 host-* 继续直连）。
- `routes` 聚合服务收集各节点 RouteDef 供 transport 消费；依赖方向不变（节点只依赖 backend-core ports + contracts，fallow 规则继续生效）。
- 子 worker 复用现有 typed handlers；判断类能力节点**先立契约、实现后迁**（见 D8）。

### D3：部署形态 = TS 组合器（无配置文件）

```ts
// local-agent / team-monolith：全部节点 embedded（in-process）
export function localAgentAssembly(options: { host?: string; port?: number }) {
  return createAssembly()
    .add(pg({ required: false }))
    .add(identityAccess()).add(knowledgeWrite()).add(knowledgeRead())
    .add(intentRecognition({ mode: 'rule' }))          // R7：判断类节点（规则实现）
    .add(dedupStrategy({ mode: 'rule' }))              // R7：判断类节点（不止一个）
    .add(conflictTrigger({ mode: 'rule' }))
    .add(candidateIngestion()).add(governanceReview())
    .add(jobRuntime({ children: ['candidate-processing', 'governance-feedback', 'outbox-dispatch'] }))
    .add(cron())
    .add(nestTransport(options));
}

// 替换实现 = 换节点实现（契约不变）
export function teamMonolithAssembly(options: TeamMonolithOptions) {
  return createAssembly()
    .add(pg({ required: true }))
    // ...同上...
    .add(intentRecognition({ mode: 'llm', provider: options.llmProvider }))  // LLM 实现
    // ...
}

// distributed：节点按需独立成服务，worker 下设子服务
export function distributedAssembly(service: DistributedServiceName) {
  switch (service) {
    case 'gateway':      return createAssembly().add(identityRemote()).add(gatewayTransport());
    case 'knowledge-read':
      return createAssembly().add(pg()).add(retrievalEngine()).add(intentRecognition({ mode: 'hybrid' }))
        .add(knowledgeRead()).add(fastifyTransport());                          // 检索独立成服务
    case 'candidate-ingestion':
      return createAssembly().add(pg()).add(taskTransport()).add(dedupStrategy({ mode: 'hybrid' }))
        .add(candidateIngestion()).add(fastifyTransport());                     // 入库处理独立成服务
    case 'job-runtime':   // worker 容器整体承载多个子 worker（nginx master/worker 类比）
      return createAssembly().add(pg())
        .add(jobRuntime({ children: ['candidate-processing', 'governance-feedback', 'conflict-detection', 'outbox-dispatch'] }))
        .add(fastifyTransport());
    case 'candidate-worker':  // 或子 worker 拆分独立成进程
      return createAssembly().add(pg()).add(taskTransport()).add(subWorker('candidate-processing')).add(workerTransport());
    // governance-worker / outbox-worker / cron-scheduler / knowledge-write / identity-access / governance-review 同理
  }
}
```

- 组合语义：`.add()` 顺序 = 有序 bundles；拓扑由节点声明与形态 builder 共同决定；无 yml/json。
- 集群化（R6）：`cluster: { replicas: n }` 声明 + 编排层拉起（compose replicas/k8s deferred）；装配层保证安全语义（SKIP LOCKED/租约/幂等 + 连接预算聚合校验）。
- `scripts/backend-target-registry.ts` 与根 `dev:*` 别名收敛为「形态 builder 名 → 命令」薄映射；组合即文档，断言写进单测。

### D4：Transport 插件化

- in-process：`backend-core-adapters.ts` 的 in-process/remote 选择逻辑迁移为 `InProcessTransportPlugin`。
- HTTP remote：`internal-client.ts` + `internal-knowledge-write-client.ts` 迁移为 `HttpTransportPlugin`（错误归一化与 trace header 传播原样保留）。
- Nest/Fastify adapter 不动；standalone 节点多副本经 Consul 轮询负载均衡（`dynamic-discovery.ts` 已有）。

### D5：双实现收敛路径（借插件选择消灭双实现）

- **taskQueue/outbox**：完整实现（`async-runtime.ts`）为唯一 `task-transport` 插件；`shared/ports.ts` 简化版退役。
- **检索**：完整管线为唯一 `retrieval-engine` 插件；ILIKE 删除（节点化后与 monolith 行为一致）。
- **OTel/Consul**：单一 `otel`/`consul` 插件。

### D6：迁移路线（双轨，行为不变为硬约束）

- **Phase 1（地基）**：`packages/assembly` 建包 + cordis 引入 + `createAssembly`/`defineNode`/`startupChecks`/`createShutdownController` + 单测；现有宿主零改动。
- **Phase 2（试点）**：host-local 改由 assembly boot（`localAgentAssembly()`/`teamMonolithAssembly()` → `boot()`），Nest 以 transport 插件接入。
- **Phase 3（收敛）**：host-distributed 收敛——gateway 与各服务进程改为 `distributedAssembly(name)`；删除 `start<X>Service` 样板；`shared/ports.ts` 简化版退役；worker 子节点整体/拆分形态打通。
- **Phase 4（收尾）**：双实现收敛（D5）、direct-run seam 退役、别名对齐、集群化验证（compose replicas=2 + ownership 断言）、文档回写。

### D7：能力节点拓扑（R4/R5/R6 落地细节）

- 节点声明：`defineNode({ id, contract, implements, apply, inject, configSchema, provides, topology, children, cluster? })`。
- 拓扑解析：`startupChecks` 校验——standalone 节点必须独立满足 inject（跨进程依赖必须走 transport 服务）；cluster 节点不得为 embedded；子 worker 只能挂在 job-runtime 下或独立 + workerTransport；每个 distributed 子组合必须含 pg + 对应 transport。
- `ownsWork` 语义由拓扑解析统一注入（替代 `processing.ts`/`outbox-worker.ts`/`scheduler.ts` 散落布尔）。

### D8：契约优先（Contract-First）——R7 落地细节

**原则：先立契约，再谈实现；契约冻结后实现可插拔替换。判断类能力节点是一批（意图识别只是示例），按统一契约体系逐个收编。**

1. **契约三件套**（每个能力节点）：
   - **端口接口**（TS interface）：落 `backend-core/src/ports/`（框架无关，零依赖）——如 `IntentRecognitionPort`；
   - **配置 schema**（Zod）：节点配置的运行时校验，落 `contracts/src/domain/` 或节点包内（被多包消费则入 contracts）；
   - **数据/事件契约**：输入输出类型与领域事件，沿用 `contracts` 现有域组织。
2. **契约定义流程**：先写端口接口 + schema + 语义文档（含单测契约：输入样例 → 期望输出），实现节点后补；契约变更必须走 contracts/ports 的文档守卫（`check:docs`、`SYSTEM_TRUTH_SOURCES.md` 术语映射）。
3. **判断类节点清单（示例一批，非全部）**：

| 节点 id | 现状证据 | 契约要点 | 候选实现 |
|---|---|---|---|
| `intent-recognition`（检索意图/模式路由） | `server-retrieval-seam.ts` strategy 注册；`retrieval-recall-coordinator.ts` `dispatchByMode`/`buildUnknownModeMessage`；`getRetrievalInfra(...).routing.selectStrategy` | `recognize({ query, context }) → { mode, confidence, reason, trace }`；config: `mode: 'rule' | 'llm' | 'hybrid'` | rule（现状逻辑迁出）/ llm（ai-providers 分类）/ hybrid（规则优先 + LLM 兜底） |
| `dedup-strategy`（候选去重策略选择） | `service-candidate-ingestion/src/llm-dedup.ts` 与 `createCandidateDuplicateDetector` 编排 | 输入候选 + corpus，输出 duplicateCase/analysis；config: 策略选择 | rule（现状）/ llm / hybrid |
| `conflict-trigger`（治理冲突检测触发） | `service-governance-review/src/conflict-workflow.ts` | 输入治理命令流，输出是否触发 conflict 检测 | rule（现状）/ llm / hybrid |
| `artifact-derivation`（派生策略） | `service-knowledge-write/src/artifact-derive/**`（contextual-enrichment 等） | 输入 artifact + payloads，输出派生结果；config: 派生模式 | 现状策略迁出 / 后续可替换 |
| `label-alignment`（标签对齐策略） | `service-knowledge-write/src/labels/llm-align.ts` | 输入条目 + 标签候选，输出对齐决策 | 现状（llm）/ 规则版 |
| `channel-merge`（检索通道合并） | `backend-core` `mergeCandidatesWithGraph`/`computeScore` | 输入多通道候选，输出合并排序 | 现状（混合）/ 可替换 |

   **后续扩展**：任何满足 D8.4 判定标准的内嵌判断按同一流程收编；本文档只立契约体系与首批示例，不承诺一次收编全部。
4. **节点盘点判定标准**（一个内嵌判断是否应成为契约节点）：
   - 有明确的输入/输出边界（可写成独立接口）；
   - 存在多个候选实现或已知演进方向（规则 → LLM → 混合，或不同供应商策略）；
   - 被至少一个执行体消费（有真实调用方）；
   - 可独立测试（不需要宿主/框架上下文）。
   满足 2 条以上即候选；**单一实现且无替换预期的逻辑不强行立契约**（避免过度设计，R7 风险）。
5. **包边界清晰**：契约落点固定（ports/contracts），实现落点固定（service 包或 assembly 子目录），fallow zone 表达节点边界；「契约变更」与「实现变更」在代码评审中可区分（契约文件路径即边界）。
6. **校验**：`startupChecks` 检查节点 `implements` 声明的契约存在且结构兼容（TS 结构类型 + 启动期 smoke 断言：如 `intentRecognition` 对固定样例返回合法 mode）。

## 影响面

- **新增**：`packages/assembly`（含 cordis 依赖）；`profiles/{local-agent,team-monolith,distributed}.ts`；`backend-core/src/ports/` 下判断类契约（`intent-ports.ts`、`dedup-ports.ts`、`conflict-ports.ts` 等，Phase 2+ 按 D8 逐个立）；节点契约单测。
- **改造**：`packages/service-*` 各加 `src/node.ts`；host-* 收敛为 transport 插件；判断类能力从内嵌迁为契约节点（**行为不变：默认实现即现状逻辑**）；`docker-compose.yml` 对齐节点拓扑；`backend-target-registry.ts`、`dev:*` 别名。
- **不动**：`backend-core` domain/RouteDef 双 adapter、`contracts`（新增契约按现有规则落位）、`persistence-schema`、`lib`、对外 API 面。
- **明确不做**：yml/json 装配文件、cordis loader、patch 层；k8s 编排实现（compose replicas 即验证）；判断类能力的一次性全量重写（按 D8 逐个收编，每个收编独立评审）。
- **文档**：ARCHITECTURE/BOUNDARIES（+assembly zone + 节点契约落点）/DEPLOYMENT（节点拓扑）/TESTING/REPO_STRUCTURE/SYSTEM_TRUTH_SOURCES（术语映射）。
- **CI**：build/test/fallow 不变；契约单测 + 拓扑断言常驻。

## 风险与缓解

- **R1 — cordis 引入的依赖风险**：先建空壳验证 Node engines/锁文件；cordis 4.0.1 为 DSH 同源生产版本。
- **R2 — 双轨期间两套装配并存漂移**：每阶段 closeout 强制删除被替代路径。
- **R3 — TS 组合与既有词汇冲突**：SYSTEM_TRUTH_SOURCES 术语映射（节点拓扑=部署表达；preset/runtimeMode/serviceUnit=运行时语义）。
- **R4 — 行为不变约束被破坏**：每阶段 golden 测试门禁；判断类节点收编时默认实现=现状逻辑，diff 核验。
- **R5 — 范围过大**：四阶段独立进入条件；集群化只做语义声明 + compose 验证；判断类能力按 D8 逐个收编、独立评审。
- **R6 — 检索行为升级争议**（ILIKE → 完整管线）：既有 debt 收敛方向，Phase 3 单独评审。
- **R7 — 契约先行的过度设计风险**：缓解——判定标准（D8.4）只对「已有替换需求或已识别多实现可能」的判断立契约；单一实现且无替换预期的节点只保留现有 ports，不强加新契约。
- **R8 — 子 worker 拆分部署的重复消费/空转风险**：dedupe_key + SKIP LOCKED 已保证；`ownsWork` 由拓扑解析统一注入。

## 验证方式

- `pnpm typecheck`、`pnpm test`（assembly 单测：组合语义 / inject 无环 / 拓扑合法性 / 子 worker 挂载与拆分 / **契约校验（implements 契约存在 + 结构兼容）** / dispose / 退出控制 / 三形态断言）。
- 契约单测：每个判断类节点（intent-recognition 等）对固定样例返回合法结果（rule/llm/hybrid 多实现同一断言集）。
- `pnpm test:deployment-smoke`、`test:runtime-foundations`、`test:distributed-closeout`、`test:observability-closeout`、`test:discovery-closeout`（每阶段门禁）。
- 集群化验证（Phase 4）：compose replicas=2 起 candidate-worker + outbox-worker，跑 ownership/重复消费断言。
- `pnpm check:fallow`（+assembly zone）、`check:imports`、`check:docs`、`check:structure`。
- 结构性断言：host-* 无 `start<X>Service` 样板；`shared/ports.ts` 无三件简化实现；每个 service 包有 `node.ts` 且业务文件零改动 diff；全仓无新增 yml/json 装配文件。

**debt 关联标注**：本文档对应已登记条目「统一优雅组装中心（assembly）主线」（2026-08-16 登记，v4 修订：契约优先——判断类能力**批量**节点化，意图识别为示例、节点不止一个；先立契约、实现可插拔）；承接既有 debt：OTel/Consul 双份收敛、host-distributed shared/ports.ts 业务下沉、internal-client 双组合并、apps workspace direct-run seam、contracts 包瘦身。不替代 EvalSeedPort 收窄等独立条目。
