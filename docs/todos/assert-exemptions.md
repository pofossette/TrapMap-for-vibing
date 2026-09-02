# 裸类型断言豁免清单（Wave 6 清理积压）

> 由 `pnpm exec tsx scripts/check-naked-asserts.ts --record` 自动生成，不要手动编辑。
> 本清单只追踪存量裸断言（`as never` / `as unknown as` / `@ts-ignore` / `@ts-expect-error`），
> 由 Wave 6 统一清理。新代码禁止新增裸断言，门禁见 `pnpm check:asserts`。

## 统计

- 总条目：34 处
- 文件数：6

## 清单

### packages/service-candidate-ingestion/src/pg-ports.ts

- 433: `as unknown as`

### packages/service-governance-review/src/routes/admin.routes.ts

- 34: `as unknown as`
- 53: `as unknown as`
- 70: `as unknown as`
- 129: `as unknown as`

### packages/service-governance-review/src/routes/feedback.routes.ts

- 34: `as unknown as`
- 43: `as unknown as`
- 46: `as unknown as`
- 59: `as unknown as`
- 62: `as unknown as`
- 72: `as unknown as`

### packages/service-governance-review/src/routes/helpers.ts

- 309: `as unknown as`
- 336: `as unknown as`
- 370: `as unknown as`
- 371: `as unknown as`
- 372: `as unknown as`
- 373: `as unknown as`
- 374: `as unknown as`
- 376: `as unknown as`
- 379: `as unknown as`
- 380: `as unknown as`

### packages/service-governance-review/src/routes/maintenance.routes.ts

- 23: `as unknown as`
- 32: `as unknown as`
- 41: `as unknown as`
- 50: `as unknown as`
- 59: `as unknown as`
- 68: `as unknown as`
- 81: `as unknown as`

### packages/service-governance-review/src/routes/queue.routes.ts

- 41: `as unknown as`
- 63: `as unknown as`
- 96: `as unknown as`
- 159: `as unknown as`
- 163: `as unknown as`
- 168: `as unknown as`
