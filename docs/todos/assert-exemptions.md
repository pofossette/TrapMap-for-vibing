# 裸类型断言豁免清单（Wave 6 清理积压）

> 由 `pnpm exec tsx scripts/check-naked-asserts.ts --record` 自动生成，不要手动编辑。
> 本清单只追踪存量裸断言（`as never` / `as unknown as` / `@ts-ignore` / `@ts-expect-error`），
> 由 Wave 6 统一清理。新代码禁止新增裸断言，门禁见 `pnpm check:asserts`。

## 统计

- 总条目：238 处
- 文件数：73

## 清单

### packages/backend-core/src/job-runtime/application/module.test.ts

- 16: `as never`
- 18: `as never`

### packages/backend-core/src/ports/lifecycle-ports.test.ts

- 168: `as unknown as`

### packages/backend-core/src/ports/telemetry-ports.test.ts

- 138: `as unknown as`
- 148: `as unknown as`
- 158: `as unknown as`
- 181: `as unknown as`
- 201: `as unknown as`
- 214: `as unknown as`
- 223: `as unknown as`

### packages/backend-core/src/testing/test-utils.ts

- 202: `as never`
- 220: `as never`
- 271: `as never`
- 280: `as never`

### packages/cli/src/commands/decay.test.ts

- 779: `as unknown as`

### packages/cli/src/lib/config.test.ts

- 31: `as never`
- 63: `as never`
- 78: `as never`
- 98: `as never`
- 121: `as never`
- 138: `as never`
- 155: `as never`
- 170: `as never`
- 186: `as never`
- 201: `as never`

### packages/cli/src/lib/output-profile.test.ts

- 311: `as unknown as`

### packages/contracts/src/domain/graph-query.ts

- 106: `as unknown as`
- 266: `as never`
- 283: `as never`
- 288: `as never`

### packages/host-distributed/src/governance-review/conflict-read.test.ts

- 28: `as never`

### packages/host-distributed/src/governance-review/ports.test.ts

- 15: `as never`
- 20: `as never`
- 34: `as never`
- 43: `as never`
- 48: `as never`
- 62: `as never`
- 77: `as never`
- 85: `as never`
- 98: `as never`
- 109: `as never`

### packages/host-distributed/src/governance-review/ports.ts

- 72: `as unknown as`

### packages/host-distributed/src/index.ts

- 118: `as never`

### packages/host-distributed/src/job-runtime/handlers.test.ts

- 14: `as never`
- 34: `as never`
- 60: `as never`
- 96: `as never`
- 198: `as never`

### packages/host-distributed/src/knowledge-write/composition.test.ts

- 11: `as never`

### packages/host-distributed/src/shared/database-ownership.test.ts

- 45: `as never`
- 54: `as never`
- 60: `as never`
- 71: `as never`
- 83: `as never`

### packages/host-distributed/src/shared/database.test.ts

- 42: `as never`
- 57: `as never`

### packages/host-distributed/src/shared/internal-job-runtime-client.test.ts

- 8: `as never`
- 21: `as never`
- 45: `as never`

### packages/host-distributed/src/shared/observability.test.ts

- 45: `as never`

### packages/host-distributed/src/shared/ports.ts

- 61: `as never`
- 79: `as never`
- 95: `as never`

### packages/host-distributed/src/shared/telemetry.test.ts

- 27: `as never`
- 60: `as never`
- 83: `as never`

### packages/host-local/src/nest/app.module.ts

- 70: `as never`
- 73: `as never`
- 88: `as never`

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

### packages/host-local/src/nest/observability/langfuse-sink.ts

- 82: `as unknown as`

### packages/host-local/src/nest/observability/langfuse.service.ts

- 76: `as unknown as`

### packages/host-local/src/nest/observability/otel.service.test.ts

- 8: `as unknown as`

### packages/host-local/src/nest/observability/prometheus.service.test.ts

- 9: `as unknown as`

### packages/host-local/src/nest/observability/sentry.service.ts

- 202: `as unknown as`
- 202: `as never`

### packages/host-local/src/nest/runtime/backend-core-adapters.ts

- 106: `as unknown as`
- 113: `as unknown as`
- 121: `as unknown as`
- 149: `as unknown as`
- 157: `as unknown as`
- 166: `as unknown as`
- 185: `as unknown as`
- 193: `as unknown as`
- 201: `as unknown as`
- 204: `as never`
- 226: `as unknown as`
- 234: `as unknown as`
- 242: `as unknown as`
- 248: `as unknown as`
- 251: `as never`
- 267: `as unknown as`
- 275: `as unknown as`
- 280: `as never`
- 367: `as unknown as`

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

### packages/host-local/src/nest/runtime/host-runtime.ts

- 43: `as unknown as`

### packages/host-local/src/nest/runtime/host-services.test.ts

- 77: `as never`
- 90: `as never`
- 99: `as never`
- 110: `as never`
- 120: `as never`
- 131: `as never`

### packages/host-local/src/nest/runtime/host-services.ts

- 94: `as unknown as`

### packages/host-local/src/nest/runtime/logging.middleware.test.ts

- 25: `as never`
- 35: `as never`
- 62: `as never`
- 70: `as never`

### packages/host-local/src/nest/runtime/logging.middleware.ts

- 18: `as unknown as`

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

### packages/service-governance-review/src/pg-ports.ts

- 342: `as never`

### packages/service-governance-review/src/review-queue-projection.test.ts

- 119: `as unknown as`

### packages/service-governance-review/src/routes.test.ts

- 77: `as never`
- 291: `as never`
- 357: `as never`

### packages/service-governance-review/src/server.test.ts

- 15: `as never`

### packages/service-governance-review/src/snapshot-backfill.test.ts

- 5: `as never`
- 6: `as never`

### packages/service-identity-access/src/identity-audit-backfill.test.ts

- 106: `as never`
- 116: `as never`
- 123: `as never`

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

### packages/service-knowledge-read/src/graph-llm-extract.ts

- 47: `as unknown as`

### packages/service-knowledge-read/src/graph-projection-backfill.test.ts

- 49: `as never`
- 75: `as never`

### packages/service-knowledge-read/src/import-boundary.test.ts

- 303: `as never`

### packages/service-knowledge-read/src/knowledge-read-support-infra-default.ts

- 64: `as never`

### packages/service-knowledge-read/src/read-model.test.ts

- 22: `as unknown as`
- 31: `as unknown as`
- 60: `as unknown as`
- 98: `as unknown as`

### packages/service-knowledge-read/src/read-model.ts

- 87: `as unknown as`
- 88: `as unknown as`

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

### packages/service-knowledge-read/src/retrieval-semantic.ts

- 227: `as unknown as`

### packages/service-knowledge-read/src/search-knowledge.test.ts

- 22: `as never`

### packages/service-knowledge-read/src/server-retrieval-seam.ts

- 61: `as unknown as`
- 62: `as unknown as`
- 82: `as unknown as`

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

- 17: `as never`
- 18: `as never`
- 19: `as never`
- 25: `as never`

### packages/service-knowledge-write/src/knowledge-snapshot-owner.test.ts

- 57: `as never`
- 82: `as never`

### packages/service-knowledge-write/src/labels/llm-align.test.ts

- 52: `as unknown as`

### packages/service-knowledge-write/src/labels/llm-align.ts

- 220: `as unknown as`

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

### packages/service-knowledge-write/src/wave9-artifact-snapshot-owner.test.ts

- 75: `as never`
- 101: `as never`
- 112: `as never`
