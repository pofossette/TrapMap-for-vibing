# 裸类型断言豁免清单（Wave 6 清理积压）

> 由 `pnpm exec tsx scripts/check-naked-asserts.ts --record` 自动生成，不要手动编辑。
> 本清单只追踪存量裸断言（`as never` / `as unknown as` / `@ts-ignore` / `@ts-expect-error`），
> 由 Wave 6 统一清理。新代码禁止新增裸断言，门禁见 `pnpm check:asserts`。

## 统计

- 总条目：49 处
- 文件数：17

## 清单

### packages/service-candidate-ingestion/src/pg-ports.test.ts

- 100: `as never`
- 133: `as never`
- 147: `as never`
- 196: `as never`
- 211: `as never`
- 258: `as never`
- 293: `as never`
- 329: `as never`
- 378: `as never`

### packages/service-candidate-ingestion/src/processing-task-queue.test.ts

- 74: `as unknown as`

### packages/service-governance-review/src/conflict-read.test.ts

- 26: `as never`

### packages/service-governance-review/src/pg-ports.test.ts

- 21: `as never`
- 52: `as never`
- 114: `as never`
- 133: `as never`
- 163: `as never`
- 245: `as never`
- 315: `as never`

### packages/service-governance-review/src/review-queue-projection.test.ts

- 119: `as unknown as`

### packages/service-governance-review/src/server.test.ts

- 15: `as never`

### packages/service-identity-access/src/pg-ports.test.ts

- 15: `as never`
- 46: `as never`
- 101: `as never`
- 129: `as never`
- 158: `as never`
- 160: `as never`
- 165: `as never`

### packages/service-job-runtime/src/async-runtime.test.ts

- 14: `as never`
- 30: `as never`

### packages/service-job-runtime/src/server.test.ts

- 44: `as unknown as`
- 51: `as never`
- 78: `as never`
- 103: `as never`

### packages/service-knowledge-read/src/candidate-corpus-pg.test.ts

- 25: `as never`

### packages/service-knowledge-read/src/graph-index-repository.test.ts

- 26: `as never`

### packages/service-knowledge-read/src/import-boundary.test.ts

- 303: `as never`

### packages/service-knowledge-read/src/read-model.test.ts

- 22: `as unknown as`
- 31: `as unknown as`
- 60: `as unknown as`
- 98: `as unknown as`

### packages/service-knowledge-read/src/response-refinement.test.ts

- 16: `as never`
- 48: `as never`

### packages/service-knowledge-read/src/retrieval-infra-default.test.ts

- 52: `as never`
- 78: `as never`
- 102: `as never`
- 117: `as never`

### packages/service-knowledge-read/src/retrieval-orchestration.test.ts

- 81: `as never`
- 99: `as never`

### packages/service-knowledge-read/src/search-knowledge.test.ts

- 22: `as never`
