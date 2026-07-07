# @trapmap/backend-core

TrapMap 的后端核心内核。本包提供与宿主无关的应用逻辑、端口接口、运行时能力模型以及六个限界上下文的稳定入口。

## 用途

`backend-core` 是轻量宿主（`local-agent`、`team-monolith`）和重量宿主（`distributed`）共享的基础层，包含：

- **运行时能力模型**：部署 profile、运行时模式、服务单元、拓扑与路由表面
- **端口接口**：仓库、队列、检索、认证、审计、服务发现、遥测等抽象契约
- **用例模式**：命令处理、审查流程、检索编排、任务调度
- **限界上下文入口**：`identity-access`、`knowledge-read`、`knowledge-write`、`candidate-ingestion`、`governance-review`、`job-runtime`
- **调用模型**：与传输无关的同步 / 异步契约与错误分类
- **测试工具**：所有端口的桩实现，用于模块级单元测试

## 本包不包含的内容

- 不依赖 Fastify、Nest 或其他 HTTP 框架
- 不负责进程启动或服务器引导
- 不包含 PostgreSQL、RabbitMQ、Neo4j 等具体基础设施实现
- 不负责环境变量读取、部署配置加载或 exporter 组装

## 目录结构

```text
src/
  index.ts                    主桶导出
  identity-access/            身份访问上下文（domain / application / module）
  knowledge-read/             读侧检索上下文（domain / application / module）
  knowledge-write/            写侧知识上下文（domain / application / module）
  candidate-ingestion/        候选摄取上下文（domain / application / module）
  governance-review/          治理审查上下文（domain / application / module）
  job-runtime/                作业运行时上下文（domain / application / module）
  runtime/
    capability-model.ts       部署 profile、运行时模式、服务单元、能力解析
    dynamic-discovery.ts      动态服务发现包装与 owner-hint 解析
    route-surface.ts          路由族、不支持路由、表面摘要
    status.ts                 运行时依赖状态与服务状态构建
    topology.ts               服务拓扑描述符与快照
  ports/
    actor-ports.ts            会话查找、团队查找、权限检查端口
    audit-ports.ts            审计日志与指标端口
    discovery-ports.ts        服务发现端口接口
    internal-ports.ts         内部服务调用端口
    lifecycle-ports.ts        生命周期钩子与健康检查端口
    queue-ports.ts            任务队列与 outbox 端口接口
    repo-ports.ts             仓库端口接口
    retrieval-ports.ts        检索查询与读模型端口
    telemetry-ports.ts        遥测端口接口
  discovery/
    cached-discovery.ts       带缓存的 DiscoveryPort 包装
    round-robin-selector.ts   轮询实例选择器
  use-cases/
    command-handling.ts       命令模式与结果类型
    review-flows.ts           审查决策与队列编排
    retrieval-orchestration.ts 检索搜索编排
    job-scheduling.ts         异步任务调度模式
  invocation/
    invocation-model.ts       同步 / 异步调用契约与错误分类
    invocation-config.ts      内部服务路由配置
  testing/
    test-utils.ts             所有端口的桩实现
```

六个上下文目录都遵循同一模式：

- `domain/`：术语、规则和领域对象
- `application/`：用例编排与模块装配
- `module.ts` / `index.ts`：稳定的上下文入口

宿主包应消费这些稳定入口，而不是直接依赖上下文内部文件。

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
