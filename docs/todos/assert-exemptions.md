# 裸类型断言豁免清单（Wave 6 清理积压）

> 由 `pnpm exec tsx scripts/check-naked-asserts.ts --record` 自动生成，不要手动编辑。
> 本清单只追踪存量裸断言（`as never` / `as unknown as` / `@ts-ignore` / `@ts-expect-error`），
> 由 Wave 6 统一清理。新代码禁止新增裸断言，门禁见 `pnpm check:asserts`。

## 统计

- 总条目：118 处
- 文件数：32

## 清单

### packages/host-local/src/nest/candidate-ingestion/candidate-processing.service.test.ts

- 8: `as never`

### packages/host-local/src/nest/governance-review/governance-review.module.test.ts

- 25: `as never`

### packages/host-local/src/nest/job-runtime/job-runtime-worker.service.test.ts

- 31: `as never`
- 33: `as never`
- 36: `as unknown as`

### packages/host-local/src/nest/observability/http-metrics.middleware.test.ts

- 17: `as unknown as`
- 19: `as unknown as`

### packages/host-local/src/nest/observability/otel.service.test.ts

- 8: `as unknown as`

### packages/host-local/src/nest/observability/prometheus.service.test.ts

- 9: `as unknown as`

### packages/host-local/src/nest/runtime/exception-filter.test.ts

- 76: `as never`
- 90: `as never`
- 102: `as never`
- 114: `as never`
- 126: `as never`
- 138: `as never`
- 150: `as never`
- 162: `as never`
- 173: `as never`
- 194: `as never`

### packages/host-local/src/nest/runtime/governance-composition.test.ts

- 29: `as never`

### packages/host-local/src/nest/runtime/host-services.test.ts

- 77: `as never`
- 90: `as never`
- 99: `as never`
- 110: `as never`
- 120: `as never`
- 131: `as never`

### packages/host-local/src/nest/runtime/logging.middleware.test.ts

- 25: `as never`
- 35: `as never`
- 62: `as never`
- 70: `as never`

### packages/host-local/src/nest/runtime/request-context.test.ts

- 154: `as never`
- 155: `as never`
- 181: `as never`
- 182: `as never`

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

### packages/service-knowledge-write/src/artifact-ports.test.ts

- 100: `as never`
- 119: `as never`
- 140: `as never`
- 153: `as never`
- 183: `as never`
- 227: `as never`
- 283: `as never`
- 329: `as never`
- 385: `as never`

### packages/service-knowledge-write/src/artifact-routes.test.ts

- 23: `as never`
- 24: `as never`
- 25: `as never`
- 31: `as never`

### packages/service-knowledge-write/src/labels/llm-align.test.ts

- 52: `as unknown as`

### packages/service-knowledge-write/src/pg-ports.test.ts

- 44: `as never`
- 111: `as never`
- 148: `as never`
- 176: `as never`
- 214: `as never`
- 261: `as never`
- 274: `as never`
- 299: `as never`
- 342: `as never`
- 356: `as never`
- 390: `as never`
- 394: `as unknown as`
- 395: `as unknown as`
- 396: `as unknown as`
- 397: `as unknown as`
- 409: `as never`
- 438: `as never`
- 469: `as never`
- 493: `as never`
- 515: `as never`
- 534: `as never`
