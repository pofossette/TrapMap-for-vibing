# Phase 82: Logging Unification

## Context

当前项目日志系统现状：

1. **RAG 日志** — `lib/rag-log.ts` (JSON Lines, 支持轮转)
2. **用户操作日志** — `lib/user-ops-log.ts`
3. **分散的 console.*** — 约 30+ 处使用 `console.log/error/warn`

## Problem

1. **日志规范不统一** — console.* 和结构化日志混用
2. **缺少日志级别** — 无法动态调整日志详细程度
3. **缺少请求追踪** — 无 request ID 贯穿调用链
4. **生产可观测性差** — 难以聚合分析

## Goals

1. 引入 Pino 结构化日志库
2. 统一所有日志输出
3. 支持日志级别配置
4. 添加请求 ID 追踪

## Proposed Changes

### 1. 引入 Pino

```typescript
// lib/logger.ts
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export const createRequestLogger = (requestId: string) =>
  logger.child({ requestId });
```

### 2. Fastify 集成

```typescript
// app.ts
import fastifyLogger from '@fastify/logger';

app.register(fastifyLogger, {
  logger,
});
```

### 3. 迁移现有日志

```typescript
// Before
console.error('[rag-log] Failed to write log entry:', error);

// After
logger.error({ error, component: 'rag-log' }, 'Failed to write log entry');
```

## Acceptance Criteria

- [ ] Pino 作为唯一日志输出
- [ ] 所有 console.* 替换为 logger.*
- [ ] 支持 LOG_LEVEL 环境变量
- [ ] Fastify 请求自动附带 requestId
- [ ] RAG 日志保持 JSON Lines 格式 (可观测性需求)
- [ ] 文档更新

## Dependencies

- None

## Estimated Effort

Medium (3-4 hours)

## Risk

低 — 仅影响日志输出，不影响业务逻辑

## Optional Enhancement

- Phase 82a: ELK/Loki 集成 (生产环境)
- Phase 82b: 日志采样 (高流量场景)
