# @trapmap/backend-core

TrapMap 的后端核心内核。本包提供与宿主无关的应用逻辑、端口接口、运行时能力模型以及六个限界上下文的稳定入口。

## 用途

`backend-core` 是轻量宿主（`local-agent`、`team-monolith`）和重量宿主（`distributed`）共享的基础层，包含：

- **运行时能力模型**：部署 profile、运行时模式、服务单元、拓扑与路由表面
- **端口接口**：仓库、队列、检索、认证、审计、服务发现、遥测、生命周期等抽象契约
- **用例模式**：命令处理、审查流程、检索编排、任务调度
- **限界上下文入口**：`identity-access`、`knowledge-read`、`knowledge-write`、`candidate-ingestion`、`governance-review`、`job-runtime`
- **调用模型**：与传输无关的同步/异步契约与错误分类
- **调用配置**：内部服务路由策略（in-process / rpc / event-driven）
- **发现助手**：带缓存的服务发现包装与轮询实例选择器
- **迁移验证**：Owner 迁移集完整性断言
- **测试工具**：所有端口的桩实现，用于模块级单元测试

## 本包不包含的内容

- 不依赖 Fastify、Nest 或其他 HTTP 框架
- 不负责进程启动或服务器引导
- 不包含 PostgreSQL、RabbitMQ、Neo4j 等具体基础设施实现
- 不负责环境变量读取、部署配置加载或 exporter 组装

## 目录结构

```text
src/
  index.ts                        主桶导出
  identity-access/                身份访问上下文（domain / application / module）
  knowledge-read/                 读侧检索上下文（domain / application / module）
  knowledge-write/                写侧知识上下文（domain / application / module）
  candidate-ingestion/            候选摄取上下文（domain / application / module）
  governance-review/              治理审查上下文（domain / application / module）
  job-runtime/                    作业运行时上下文（domain / application / module）
  runtime/
    capability-model.ts           部署 profile、运行时模式、服务单元、能力解析
    dynamic-discovery.ts          动态服务发现包装与 owner-hint 解析
    route-surface.ts              路由族、不支持路由、表面摘要
    status.ts                     运行时依赖状态与服务状态构建
    topology.ts                   服务拓扑描述符与快照
  ports/
    actor-ports.ts                会话查找、团队查找、权限检查端口
    actor-lookup-port.ts          批量身份查找端口
    audit-ports.ts                审计日志与指标端口
    discovery-ports.ts            服务发现端口接口
    internal-ports.ts             内部服务调用端口（IdentityAccess / KnowledgeRead / KnowledgeWrite / CandidateIngestion / Review / JobRuntime）
    lifecycle-ports.ts            生命周期钩子与健康检查端口
    queue-ports.ts                任务队列、outbox 与工作流引擎端口
    repo-ports.ts                 仓库端口接口（知识、候选、会话、团队、成员、用户、反馈、审计）
    retrieval-ports.ts            检索查询与读模型端口
    telemetry-ports.ts            遥测端口（指标、分布式追踪、结构化日志）
  discovery/
    cached-discovery.ts           带 TTL 缓存的 DiscoveryPort 包装（stale-while-error）
    round-robin-selector.ts       轮询实例选择器
  use-cases/
    command-handling.ts           命令模式与 CommandResult 类型
    review-flows.ts               审查决策与队列编排
    retrieval-orchestration.ts    检索搜索编排
    job-scheduling.ts             异步任务调度模式
  invocation/
    invocation-model.ts           同步/异步调用契约、InvocationError 错误分类
    invocation-config.ts          内部服务路由配置（in-process / rpc / event-driven）
  testing/
    test-utils.ts                 所有端口的桩实现
  migrations/
    owner-migration-set.ts        Owner 迁移集完整性断言
```

六个上下文目录都遵循同一模式：

- `domain/`：术语、规则和领域对象（能力声明、上下文常量）
- `application/`：用例编排与模块装配（模块工厂、依赖接口、模块描述符）
- `module.ts` / `index.ts`：稳定的上下文入口

宿主包应消费这些稳定入口，而不是直接依赖上下文内部文件。

## 安装

```bash
npm install @trapmap/backend-core
```

本包是 monorepo 内部包，版本由 workspace 协议管理。唯一运行时依赖为 `@trapmap/contracts`。

## 子路径导出

本包通过 `package.json` exports 字段暴露以下子路径：

| 子路径 | 说明 |
|---|---|
| `@trapmap/backend-core` | 主桶导出（所有公共 API） |
| `@trapmap/backend-core/runtime` | 运行时能力模型 |
| `@trapmap/backend-core/ports` | 端口接口 |
| `@trapmap/backend-core/use-cases` | 用例模式 |
| `@trapmap/backend-core/modules` | 模块描述符 |
| `@trapmap/backend-core/identity-access` | 身份访问上下文 |
| `@trapmap/backend-core/knowledge-read` | 读侧检索上下文 |
| `@trapmap/backend-core/knowledge-write` | 写侧知识上下文 |
| `@trapmap/backend-core/candidate-ingestion` | 候选摄取上下文 |
| `@trapmap/backend-core/governance-review` | 治理审查上下文 |
| `@trapmap/backend-core/job-runtime` | 作业运行时上下文 |
| `@trapmap/backend-core/invocation` | 调用模型与错误分类 |
| `@trapmap/backend-core/testing` | 测试桩工具 |

每个子路径均支持 `./<name>.js` 和 `./<name>/*` 模式以访问内部文件。

## 使用

### 从主入口导入

```typescript
import {
  resolveRuntimeDeployment,
  type ResolvedRuntimeDeployment,
  type KnowledgeRepositoryPort,
  createStubRepositoryPorts,
} from '@trapmap/backend-core';
```

### 从子路径导入

```typescript
import { resolveRuntimeDeployment } from '@trapmap/backend-core/runtime';
import type { KnowledgeRepositoryPort } from '@trapmap/backend-core/ports';
import type { Command } from '@trapmap/backend-core/use-cases';
import { createKnowledgeWriteModule } from '@trapmap/backend-core/knowledge-write';
import { InvocationError } from '@trapmap/backend-core/invocation';
import { createStubRepositoryPorts } from '@trapmap/backend-core/testing';
```

### 解析部署配置

```typescript
import { resolveRuntimeDeployment } from '@trapmap/backend-core/runtime';

const deployment = resolveRuntimeDeployment({
  profile: 'team-monolith',
  preset: 'monolith',
});

// deployment.capabilities.supportsReviewGovernance === true
// deployment.capabilities.routeSurface === 'gateway-core'
// deployment.capabilities.requiresPostgres === true
// deployment.capabilities.allowsSingleProcess === true
```

可用的部署 profile：`local-agent`、`team-monolith`、`distributed`。
可用的 preset：`monolith`、`api`、`candidate-worker`、`governance-worker`、`outbox-worker`。

### 组装模块

每个限界上下文通过模块工厂函数创建，工厂接收端口依赖并返回内部端口实现。

```typescript
import { createKnowledgeWriteModule } from '@trapmap/backend-core/knowledge-write';
import type { KnowledgeWriteDeps } from '@trapmap/backend-core/knowledge-write';

const deps: KnowledgeWriteDeps = {
  knowledgeOwner: myKnowledgeOwnerPort,
  auditLog: myAuditLogPort,
};

const knowledgeWrite = createKnowledgeWriteModule(deps);

const { entryId } = await knowledgeWrite.submit({
  content: 'test content',
  actorId: 'user-1',
  teamId: 'team-1',
});
```

可用的模块工厂：

| 工厂函数 | 返回类型 | 依赖接口 |
|---|---|---|
| `createIdentityAccessModule(deps)` | `IdentityAccessPort` | `IdentityAccessDeps` |
| `createKnowledgeReadModule(deps)` | `KnowledgeReadPort` | `KnowledgeReadDeps` |
| `createKnowledgeWriteModule(deps)` | `KnowledgeWritePort` | `KnowledgeWriteDeps` |
| `createCandidateIngestionModule(deps)` | `CandidateIngestionPort` | `CandidateIngestionDeps` |
| `createGovernanceReviewModule(deps)` | `ReviewPort` | `GovernanceReviewDeps` |
| `createJobRuntimeModule(deps)` | `JobRuntimePort` | `JobRuntimeDeps` |

### 使用桩实现进行测试

```typescript
import {
  createStubAuditLog,
  createStubKnowledgeRepository,
  createStubRepositoryPorts,
  createStubTaskQueue,
  createStubOutbox,
  createStubSessionLookup,
  createStubPermissionCheck,
  createStubMetrics,
} from '@trapmap/backend-core/testing';
import { createKnowledgeWriteModule } from '@trapmap/backend-core/knowledge-write';

const module = createKnowledgeWriteModule({
  knowledgeOwner: createStubKnowledgeRepository(),
  auditLog: createStubAuditLog(),
});

const { entryId } = await module.submit({
  content: 'test content',
  actorId: 'user-1',
});
```

可用的桩工厂：

| 工厂函数 | 返回类型 |
|---|---|
| `createStubRepositoryPorts()` | `RepositoryPorts`（完整仓库桩集合） |
| `createStubKnowledgeRepository()` | `KnowledgeRepositoryPort` |
| `createStubCandidateRepository()` | `CandidateRepositoryPort` |
| `createStubSessionRepository()` | `SessionRepositoryPort` |
| `createStubAccessKeyRepository()` | `AccessKeyRepositoryPort` |
| `createStubTeamRepository()` | `TeamRepositoryPort` |
| `createStubMembershipRepository()` | `MembershipRepositoryPort` |
| `createStubUserRepository()` | `UserRepositoryPort` |
| `createStubFeedbackRepository()` | `FeedbackRepositoryPort` |
| `createStubAuditRepository()` | `AuditRepositoryPort` |
| `createStubAuditLog()` | `AuditLogPort` |
| `createStubMetrics()` | `AuditMetricsPort`（含 `getCounters`/`getDurations`/`getGauges` 观察方法） |
| `createStubSessionLookup()` | `SessionLookupPort` |
| `createStubTeamLookup()` | `TeamLookupPort` |
| `createStubPermissionCheck()` | `PermissionCheckPort` |
| `createStubTaskQueue()` | `TaskQueuePort` |
| `createStubOutbox()` | `OutboxPort` |

### 调用错误处理

```typescript
import { InvocationError, toInvocationErrorResponse } from '@trapmap/backend-core/invocation';

try {
  await someOperation();
} catch (error) {
  if (error instanceof InvocationError) {
    // error.kind: 'validation' | 'unauthorized' | 'not-found' | 'conflict'
    //             | 'forbidden' | 'timeout' | 'unavailable' | 'internal'
    const response = toInvocationErrorResponse(error);
    // response.status: 400 | 401 | 404 | 409 | 403 | 504 | 503 | 500
  }
}
```

### 构建调用配置

```typescript
import { buildInProcessConfig, DEFAULT_IN_PROCESS_CONFIG } from '@trapmap/backend-core/invocation';

// 默认全 in-process 配置
const config = DEFAULT_IN_PROCESS_CONFIG;

// 为指定端口构建 in-process 配置
const custom = buildInProcessConfig(['identity-access', 'knowledge-write']);
```

### 服务发现助手

```typescript
import { CachedDiscovery, RoundRobinSelector, DynamicDiscovery } from '@trapmap/backend-core';

// CachedDiscovery: 带 TTL 缓存的服务发现包装
const cached = new CachedDiscovery(myDiscoveryPort, { ttlMs: 15_000, maxEntries: 128 });
const instances = await cached.discover('knowledge-service');
console.log(cached.stats); // { hits, misses, staleRecoveries }

// RoundRobinSelector: 轮询实例选择
const selector = new RoundRobinSelector();
const instance = selector.select('knowledge-service', instances, unhealthyIds);

// DynamicDiscovery: 组合缓存与轮询
const discovery = new DynamicDiscovery(myDiscoveryPort, { cacheTTLMs: 30_000 });
const address = await discovery.getServiceAddress('knowledge-service');
```

### 运行时状态快照

```typescript
import { buildRuntimeStatusSnapshot } from '@trapmap/backend-core/runtime';

const snapshot = buildRuntimeStatusSnapshot({
  config: { runtime: { requestIdHeader: 'x-request-id', traceHeaderName: 'x-trace-id' } },
  graphQuery: { mode: 'disabled', backendKind: 'none', failOpen: false },
  database: 'postgres',
  runtimeMode: 'combined',
  serviceUnit: 'full-platform',
  runtimeDeployment: resolvedDeployment,
  serviceUnitProfile: resolvedDeployment.serviceUnit,
  queueWorkerState: 'running',
  outboxWorkerState: 'running',
});

// snapshot.readiness: 'ready' | 'degraded' | 'not-ready'
// snapshot.topology: ServiceTopologySnapshot
// snapshot.memory: { rssMb, heapUsedMb, heapTotalMb }
```

### 迁移验证

```typescript
import { assertOwnerMigrationSet } from '@trapmap/backend-core';

await assertOwnerMigrationSet(
  'service-identity-access',
  '/path/to/migrations',
  ['0001_init', '0002_add_sessions'],
);
```

## 限界上下文详解

### identity-access

负责认证、会话、权限、团队成员和访问密钥管理。

- 模块工厂：`createIdentityAccessModule(deps: IdentityAccessDeps) -> IdentityAccessPort`
- 拥有能力：`auth`、`session`、`permissions`、`team-membership`、`access-keys`
- 主要操作：`login`、`logout`、`validateSession`、`selectTeam`、`createTeam`、`addMember`、`provisionAccessKey`

### knowledge-read

只读上下文，负责检索查询和读模型访问。

- 模块工厂：`createKnowledgeReadModule(deps: KnowledgeReadDeps) -> KnowledgeReadPort`
- 拥有能力：`knowledge-queries`、`retrieval-search`、`read-model`
- 主要操作：`getById`、`listMine`、`search`、`getProjectionStatus`、`rebuildProjection`

### knowledge-write

写侧知识上下文，负责知识条目和 trap 的创建、更新、生命周期变更。

- 模块工厂：`createKnowledgeWriteModule(deps: KnowledgeWriteDeps) -> KnowledgeWritePort`
- 拥有能力：`knowledge-commands`、`trap-commands`、`knowledge-lifecycle`
- 主要操作：`submit`、`updateEntry`、`resubmit`、`supersede`、`createTrap`、`approveReviewDecision`、`rejectReviewDecision`、`applyMaintenanceDecision`、`applyDecayDecision`、`publishCandidateResult`

### candidate-ingestion

候选摄取上下文，负责候选提交、去重、分析和解析。

- 模块工厂：`createCandidateIngestionModule(deps: CandidateIngestionDeps) -> CandidateIngestionPort`
- 拥有能力：`candidate-submission`、`candidate-processing`、`dedup`、`resolution`
- 依赖：`knowledge-write`、`job-runtime`
- 主要操作：`submit`、`getById`、`listByStatus`、`applyResolution`、`submitManualResult`、`publishCandidateResult`

### governance-review

治理审查上下文，负责审查决策、反馈和维护/衰减命令。

- 模块工厂：`createGovernanceReviewModule(deps: GovernanceReviewDeps) -> ReviewPort`
- 拥有能力：`review-decisions`、`artifact-review`、`feedback`、`maintenance`、`decay`
- 依赖：`knowledge-write`
- 主要操作：`approve`、`reject`、`applyMaintenance`、`applyDecay`、`reviewArtifact`、`submitFeedback`

### job-runtime

作业运行时上下文，负责任务队列操作和作业调度。

- 模块工厂：`createJobRuntimeModule(deps: JobRuntimeDeps) -> JobRuntimePort`
- 拥有能力：`task-queue`、`workflow-execution`、`job-scheduling`
- 主要操作：`schedule`、`getStatus`、`getQueueStatus`

## 端口接口概览

本包定义了以下端口接口类别，宿主包需提供具体实现：

| 类别 | 接口 | 文件 |
|---|---|---|
| 仓库 | `KnowledgeRepositoryPort`、`CandidateRepositoryPort`、`SessionRepositoryPort`、`AccessKeyRepositoryPort`、`TeamRepositoryPort`、`MembershipRepositoryPort`、`UserRepositoryPort`、`FeedbackRepositoryPort`、`AuditRepositoryPort` | `repo-ports.ts` |
| 仓库集合 | `RepositoryPorts` | `repo-ports.ts` |
| 队列 | `TaskQueuePort`、`OutboxPort`、`WorkflowEnginePort`、`QueuePorts` | `queue-ports.ts` |
| 检索 | `RetrievalQueryPort`、`ReadModelProjectionPort`、`KnowledgeReadProjectionPort` | `retrieval-ports.ts` |
| 身份 | `SessionLookupPort`、`TeamLookupPort`、`PermissionCheckPort`、`ActorBatchLookupPort` | `actor-ports.ts`、`actor-lookup-port.ts` |
| 审计 | `AuditLogPort`、`AuditMetricsPort` | `audit-ports.ts` |
| 发现 | `DiscoveryPort` | `discovery-ports.ts` |
| 遥测 | `MetricsPort`、`TracingPort`、`LoggingPort` | `telemetry-ports.ts` |
| 生命周期 | `LifecycleManager`、`LifecycleHook`、`HealthCheckRegistrar`、`HealthCheck` | `lifecycle-ports.ts` |
| 内部调用 | `IdentityAccessPort`、`KnowledgeReadPort`、`KnowledgeWritePort`、`CandidateIngestionPort`、`ReviewPort`、`GovernanceReviewPort`、`GovernanceReviewAdminPort`、`GovernanceAsyncCommandPort`、`GovernanceConflictReadPort`、`GovernanceConflictWorkflowPort`、`GovernanceRetrievalProjection`、`JobRuntimePort` | `internal-ports.ts` |

## 依赖

| 包 | 类型 | 说明 |
|---|---|---|
| `@trapmap/contracts` | 运行时依赖 | 共享类型定义（DeploymentProfile、Permission、LifecycleState 等） |

## 脚本

```bash
npm run build       # TypeScript 编译
npm run test        # 运行测试（vitest）
npm run typecheck   # 类型检查（不生成输出）
```

## 测试

本包使用 Vitest 运行测试。测试文件与源文件同目录，命名为 `*.test.ts`。

当前包含测试的文件：

- `src/candidate-ingestion/application/module.test.ts`
- `src/governance-review/application/conflict-scheduler.test.ts`
- `src/governance-review/application/module.test.ts`
- `src/job-runtime/application/module.test.ts`
- `src/ports/internal-ports.test.ts`
- `src/ports/lifecycle-ports.test.ts`
- `src/ports/telemetry-ports.test.ts`
- `src/runtime/capability-model.test.ts`
- `src/runtime/dynamic-discovery.test.ts`
- `src/discovery/cached-discovery.test.ts`
- `src/discovery/round-robin-selector.test.ts`