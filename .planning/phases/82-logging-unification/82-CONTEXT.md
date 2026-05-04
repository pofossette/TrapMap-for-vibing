# Phase 82: Logging Unification - Context

**Gathered:** 2026-05-05
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure phase)

<domain>
## Phase Boundary

统一项目日志体系，将分散的 `console.*` 调用迁移到 Fastify 的 Pino logger，建立一致的日志规范。

**Deliverables:**
1. 创建统一的 logger 工具模块 (`lib/logger.ts`)
2. 迁移所有 lib/ 文件中的 `console.*` 调用到 Pino logger
3. 支持通过 `LOG_LEVEL` 环境变量控制日志级别
4. 保持现有结构化 JSON 格式

**Out of Scope:**
- 替换 `rag-log.ts` 和 `user-ops-log.ts` 的文件日志（这些有特定用途）
- 日志聚合基础设施
- 告警系统

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure phase.

Key decisions to make:
- Logger module API design (singleton vs factory)
- Child logger creation pattern for non-request contexts
- How to handle log rotation (existing `log-rotation.ts` uses console.error)

</decisions>

<code_context>
## Existing Code Insights

### Current Logger Setup
- Fastify app uses Pino logger configured in `app.ts:125`
- LOG_LEVEL env var already supported (default: 'info')
- In test environment, logger is disabled (`logger: false`)

### Files with console.* calls (non-test, to migrate)

| File | Calls | Type |
|------|-------|------|
| `lib/persistence/backfill-indexes.ts` | 3 | console.log |
| `lib/persistence/postgres-store.ts` | 1 | console.warn |
| `lib/indexing/pipeline.ts` | 2 | console.warn, console.log |
| `lib/log-rotation.ts` | 4 | console.error |
| `lib/retrieval/recall-coordinator.ts` | 2 | console.error |
| `lib/retrieval/recall/semantic.ts` | 1 | console.error |
| `lib/candidates/processor.ts` | 3 | console.error |
| `lib/rag-log.ts` | 1 | console.error |
| `lib/user-ops-log.ts` | 1 | console.error |

### Files Already Using Pino
Routes have access to Fastify's Pino logger via `request.log`:
- `routes/knowledge.ts`
- `routes/traps.ts`
- `routes/review.ts`
- `routes/candidates.ts`

### Integration Points
- New `lib/logger.ts` module needed for standalone logger access
- Lib files need to import logger from the new module
- Request handlers can continue using `request.log`

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure phase. Use ROADMAP phase goal and success criteria.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
