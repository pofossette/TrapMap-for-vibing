# TrapMap Contracts

共享 Zod schema 和 TypeScript 类型，在 CLI 和 Server 之间提供运行时验证。

## 入口

- `src/index.ts` — 导出所有 schema 和类型

## 目录结构

- `src/domain/` — 按领域组织的 Zod schema
- `src/types/` — TypeScript 类型声明

## 共享验证辅助函数

以下可复用的辅助函数定义在 `src/domain/` 中，作为所有 schema 文件的唯一校验来源：

| 辅助函数 | 文件 | 用途 |
|----------|------|------|
| `canonicalPathSchema` | `path-validation.ts` | 相对路径安全校验（拒绝绝对路径、父目录遍历、Windows 盘符） |
| `sha256HexSchema` | `common.ts` | 64 字符小写十六进制字符串 |
| `mediaTypeSchema` | `common.ts` | 带正则校验的 IANA 媒体类型 |

所有领域文件（artifacts、candidates、operations、retrieval）均导入这些辅助函数，避免重复内联校验逻辑。

## 跨字段不变量约束

以下 `.refine()` / `.superRefine()` 约束用于维护单字段校验无法覆盖的字段间关系：

| Schema | 文件 | 不变量 |
|--------|------|-----------|
| `knowledgeMetadataSchema` | `knowledge.ts` | `submissionCount >= resubmissionCount` |
| `skillArtifactMetadataSchema` | `artifacts.ts` | `submissionCount >= resubmissionCount` |
| `conflictRelationSchema` | `conflict.ts` | `entryIdA !== entryIdB` and `entryIdA < entryIdB` (canonical ordering) |
| `retrievalEvalRelevanceExpectationsSchema` | `evals/retrieval.ts` | `idealOrder` entries must all be in `relevantIds` |
| `statsSummaryQuerySchema` | `operations.ts` | `from <= to` when both timestamps are present |
| `skillArtifactRevisionSchema` | `artifacts.ts` | `derived.sourceHash === sourceHash` when derived is present |
| `sessionStatusResponseSchema` | `auth.ts` | `session !== null` when `authenticated === true` |
| `batchOperationItemSchema` | `decay.ts` | `eligible` → `ineligibilityReason === null` and `!eligible` → `ineligibilityReason !== null` |
| `batchOperationResponseSchema` | `decay.ts` | `dryRun === true` → `appliedAt === null` |
| `maintenanceEntryListRequestSchema` | `maintenance.ts` | `staleVerification` → `staleDays !== undefined` |
| `importResultItemSchema` | `operations.ts` | `success` → `entry !== null` |
| `maintenanceBatchOperationItemSchema` | `maintenance.ts` | Same invariants as `batchOperationItemSchema` (decay) |
| `maintenanceBatchOperationResponseSchema` | `maintenance.ts` | Same invariants as `batchOperationResponseSchema` (decay) |
| `evals/report.ts` schemas | `evals/report.ts` | `passRate === passedCases / totalCases` |
| `retrievalEvalGovernanceExpectationsSchema` | `evals/retrieval.ts` | `forbiddenIds.length === forbiddenReasons.length` |

## 契约约定

### 检索契约
- 源路径（`sourcePaths`、`path`）使用 `canonicalPathSchema`——仅允许相对路径，禁止绝对路径和父目录遍历
- 胶囊优先响应（`retrievalV2ResponseWithHintsSchema`）仅包含蒸馏内容，不含原始源代码
- 激活提示仅为元数据——不含文件正文或脚本内容（T-15-01）
- 所有哈希值使用 `sha256HexSchema`（64 位小写十六进制字符）

### 工件契约
- `skillArtifactRevisionSchema`：`derived.sourceHash` 存在时必须与顶层 `sourceHash` 一致
- `skillArtifactMetadataSchema`：`submissionCount >= resubmissionCount`
- 工件内文件路径使用 `canonicalPathSchema`，确保相对路径安全

### 评测契约
- `retrievalEvalGovernanceExpectationsSchema`：`forbiddenIds.length === forbiddenReasons.length`
- `retrievalEvalRelevanceExpectationsSchema`：`idealOrder` 条目必须为 `relevantIds` 的子集
- 报告 schema：当 `totalCases > 0` 时 `passRate === passedCases / totalCases`
- 所有时间戳使用 `z.string().datetime({ offset: true })`

### 运行验证
```bash
rtk pnpm --filter @trapmap/contracts test -- --run   # 单元测试
rtk pnpm --filter @trapmap/contracts typecheck         # 类型检查
rtk pnpm eval:smoke                                    # 运行时集成测试
```

## 内部导航

- Schema 入口：[`src/domain/`](src/domain/)
- 类型定义：[`src/types/`](src/types/)
