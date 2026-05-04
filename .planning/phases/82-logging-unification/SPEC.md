# Phase 82: Logging Unification

## Summary

统一项目日志体系，将分散的 `console.*` 调用迁移到 Fastify 的 Pino logger，建立一致的日志规范。

## Motivation

当前项目存在三种日志方式混合使用：

| 方式 | 位置 | 问题 |
|------|------|------|
| `app.log` (Pino) | app.ts, index.ts | 正确用法，结构化日志 |
| `console.error/warn/log` | 10+ 个 lib/ 文件 | 不走 Pino pipeline，生产环境不可控 |
| 自定义 JSON Lines | rag-log.ts, user-ops-log.ts | 独立写文件，与 Pino 不互通 |

散落位置：
- `lib/indexing/pipeline.ts` — console.log/error/warn
- `lib/candidates/processor.ts` — console.error
- `lib/retrieval/orchestrator.ts` — console.error
- `lib/persistence/backfill-indexes.ts` — console.log

## Scope

### In Scope
- 创建统一的 logger 工具模块
- 迁移所有 `console.*` 调用到 Pino logger
- 在非请求上下文中提供 child logger 获取方式
- 统一日志级别和格式
- 添加请求级 correlation ID（可选）

### Out of Scope
- 替换 rag-log.ts 和 user-ops-log.ts 的文件日志（这些有特定用途）
- 日志聚合基础设施
- 告警系统

## Success Criteria

- [ ] 所有 lib/ 文件中的 `console.*` 调用已迁移
- [ ] 存在统一的 logger 工具模块
- [ ] 日志级别可通过环境变量控制 (LOG_LEVEL)
- [ ] 所有测试通过

## Dependencies

- None

## Risks

| Risk | Mitigation |
|------|------------|
| 非请求上下文无法获取 logger | 提供全局 child logger 工具 |
| 日志格式变更影响日志解析 | 保持结构化 JSON 格式 |

## Estimated Effort

1-2 小时

## Files Affected

- `packages/server/src/lib/logger.ts` (新建)
- `packages/server/src/lib/indexing/pipeline.ts`
- `packages/server/src/lib/candidates/processor.ts`
- `packages/server/src/lib/retrieval/orchestrator.ts`
- `packages/server/src/lib/persistence/backfill-indexes.ts`
- `packages/server/src/lib/retrieval/recall/semantic.ts`
- 其他含 console.* 的文件
