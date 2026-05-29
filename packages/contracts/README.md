# TrapMap Contracts

共享 Zod schema 和 TypeScript 类型，在 CLI 和 Server 之间提供运行时验证。

## 入口

- `src/index.ts` — 导出所有 schema 和类型

## 目录结构

- `src/domain/` — 按领域组织的 Zod schema
- `src/types/` — TypeScript 类型声明

## Shared Validation Helpers

The following reusable helpers are defined in `src/domain/` and serve as the single source of truth for all schema files:

| Helper | File | Usage |
|--------|------|-------|
| `canonicalPathSchema` | `path-validation.ts` | Relative path with security refinement (rejects absolute paths, parent traversal, Windows drive letters) |
| `sha256HexSchema` | `common.ts` | 64-character lowercase hex string |
| `mediaTypeSchema` | `common.ts` | IANA media type with regex validation |

All domain files (artifacts, candidates, operations, retrieval) import these helpers instead of repeating inline validations.

## Cross-Field Invariant Constraints

The following `.refine()` / `.superRefine()` constraints enforce relationships between fields that are beyond single-field validation:

| Schema | File | Invariant |
|--------|------|-----------|
| `knowledgeMetadataSchema` | `knowledge.ts` | `submissionCount >= resubmissionCount` |
| `skillArtifactMetadataSchema` | `artifacts.ts` | `submissionCount >= resubmissionCount` |
| `conflictRelationSchema` | `conflict.ts` | `entryIdA !== entryIdB` and `entryIdA < entryIdB` (canonical ordering) |
| `retrievalEvalRelevanceExpectationsSchema` | `evals/retrieval.ts` | `idealOrder` entries must all be in `relevantIds` |
| `statsSummaryQuerySchema` | `operations.ts` | `from <= to` when both timestamps are present |
| `skillArtifactRevisionSchema` | `artifacts.ts` | `derived.sourceHash === sourceHash` when derived is present |
| `sessionStatusResponseSchema` | `auth.ts` | `session !== null` when `authenticated === true` |
| `decayResultSchema` | `decay.ts` | `!eligible` → `ineligibilityReason === null` and reverse |
| `decayApplicationResultSchema` | `decay.ts` | `dryRun === false` → `appliedAt === null` |
| `maintenanceMetaSchema` | `maintenance.ts` | `!staleVerification` → `staleDays === undefined` |
| `importResultItemSchema` | `operations.ts` | `!success` → `entry === null` |
| `evals/report.ts` schemas | `evals/report.ts` | `passRate === passedCases / totalCases` |
| `retrievalEvalGovernanceExpectationsSchema` | `evals/retrieval.ts` | `forbiddenIds.length === forbiddenReasons.length` |

## 内部导航

- Schema 入口：[`src/domain/`](src/domain/)
- 类型定义：[`src/types/`](src/types/)
