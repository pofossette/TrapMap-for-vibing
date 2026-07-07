# @trapmap/backend-core

TrapMap 的后端核心内核。本包提供与宿主无关的应用逻辑、端口接口和运行时能力模型。

## 用途

`backend-core` 是轻量宿主（`local-agent`、`team-monolith`）和重量宿主（`distributed`）共享的基础层，包含：

- **运行时能力模型**：部署配置、运行时模式、服务单元、拓扑
- **端口接口**：仓库、队列、检索、认证、审计等抽象契约
- **用例模式**：命令处理、审查流程、检索编排、任务调度
- **限界上下文模块**：`identity-access`、`knowledge-read`、`knowledge-write`、`candidate-ingestion`、`governance-review`、`job-runtime`
- **调用模型**：与传输无关的同步/异步契约及错误分类
- **测试工具**：所有端口的桩实现，用于单元测试

## 本包不包含的内容

- 不依赖 Fastify 或其他 HTTP 框架
- 不负责进程启动或服务器引导
- 不包含具体基础设施实现（PostgreSQL、RabbitMQ、Neo4j）
- 不负责配置加载或环境变量解析

## 目录结构

```text
src/
  index.ts              主桶导出
  runtime/
    capability-model.ts 部署 profile、运行时模式、服务单元、能力解析
    route-surface.ts    路由族、不支持路由、表面摘要
    topology.ts         服务拓扑描述符与快照
    dynamic-discovery.ts DynamicDiscovery、本地缓存与轮询负载均衡
    status.ts           运行时依赖状态与服务状态构建
  ports/
    repo-ports.ts       仓库端口接口（knowledge、candidate、auth、team 等）
    queue-ports.ts      任务队列与 outbox 端口接口
    retrieval-ports.ts  检索查询与读模型端口
    actor-ports.ts      会话查找、团队查找、权限检查端口
    audit-ports.ts      审计日志与指标端口
    internal-ports.ts   内部服务调用端口（identity、knowledge、candidates 等）
    discovery-ports.ts  服务发现端口接口
    lifecycle-ports.ts  生命周期钩子抽象（init、ready、shutdown、health-check）
    telemetry-ports.ts  遥测端口接口（metrics、tracing、structured logging）
  discovery/
    index.ts            CachedDiscovery、RoundRobinSelector、缓存选项
  use-cases/
    command-handling.ts 命令模式与结果类型
    review-flows.ts     审查决策与队列编排
    retrieval-orchestration.ts 检索搜索编排
    job-scheduling.ts   异步任务调度模式
  invocation/
    invocation-model.ts 同步/异步调用契约与错误分类
    invocation-config.ts 内部服务路由配置
  testing/
    test-utils.ts       所有端口的桩实现
```

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
import { createKnowledgeWriteModule } from '@trapmap/backend-core';
import { InvocationError } from '@trapmap/backend-core/invocation';
import { createStubRepositoryPorts } from '@trapmap/backend-core/testing';
```

### 解析部署配置

```typescript
const deployment = resolveRuntimeDeployment({
  profile: 'team-monolith',
  preset: 'monolith',
});
// deployment.capabilities.supportsReviewGovernance === true
// deployment.capabilities.routeSurface === 'gateway-core'
```

### 使用桩实现组装模块进行测试

```typescript
import { createStubAuditLog, createStubKnowledgeRepository } from '@trapmap/backend-core/testing';
import { createKnowledgeWriteModule } from '@trapmap/backend-core';

const module = createKnowledgeWriteModule({
  knowledgeRepo: createStubKnowledgeRepository(),
  auditLog: createStubAuditLog(),
});

const { entryId } = await module.submit({
  content: 'test content',
  actorId: 'user-1',
});
```
