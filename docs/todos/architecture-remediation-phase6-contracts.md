# Phase 6 — 契约模块化

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development`
> 归属：`architecture-remediation-mainline.md` 的 delegated Phase 6。可与 P5 并行，门禁在 P5 后。

**Goal:** 消灭 `operations 5187` 等单体，`Zod→JSON Schema→Go` 链路门禁闭环。

**探针输入:** 清单 #30-34（契约）

## Scope

- 改 `packages/contracts/src/domain/{operations,review,knowledge,retrieval,admin,candidates}.ts` 按域拆，`index.ts` 唯一出口
- 改 `packages/contracts/test/index.test.ts` 3424 按域拆
- 改 `contracts/json-schema/{go-accelerator,knowledge-read-go}/*` 与 `services/*/pkg/api/types.go`
- 引入 `oapi-codegen + playground/validator` 若缺

## 非目标

- 不改契约语义，仅拆文件；不改 `lib` 底层

## 拆分边界（先图谱再拆）

```bash
grep -rn "export.*Schema" packages/contracts/src/domain/operations.ts | head
# 按 identity(6)/knowledge(7)/governance(5)/job(4) 四域拆，每文件 ≤400
```

## 预估

- `operations 5187 → 4× ~1300 + index` → 目标每文件 ≤400，需再拆子域
- `test/index 3424 → 按域拆 4 文件`

## Tasks

- [x] **6.1 拆契约大文件** — `operations 5187→按 identity/knowledge/governance/job 4 文件`，每文件 ≤400，`index.ts` 唯一出口；`contracts/test/index 3424` 按域拆
- [x] **6.2 门禁** — `pnpm generate:contracts --check` + `git diff --exit-code -- contracts/json-schema services/*/pkg/api` + `pnpm check:go-contract` 进 `ci: type-alignment` job
- [x] **6.3 OpenAPI/proto** — `oapi-codegen` 对齐 `RouteDef` Zod，`proto/trapmap/compute/v1/compute.proto` 仅 `batchCosine` 二进制时启用（`TRAPMAP_GO_ACCEL_PROTO` benchmark gated）

## 完成标准

- 无单文件 >600；`typecheck` 0 错；`generate:contracts:check` 绿

## 测试（精确）

```bash
pnpm generate:contracts
pnpm generate:contracts:check
git diff --exit-code -- contracts/json-schema services/*/pkg/api
pnpm check:go-contract
pnpm typecheck
pnpm --filter @trapmap/contracts test --run test/index.test.ts
```

## 证据

- 变更文件：`contracts/domain/*` 4+, `test/*` 4, `pkg/api/*` 2
- 命令：见上

## 反例

- 禁手搓校验，禁深路径 `src/domain/*` 导入，仅 `@trapmap/contracts`

## 文档与测试

- [ ] 深路径导入禁 via lint，仅允许 `@trapmap/contracts`
- [ ] `lib` 三函数与 Go 侧 property test 对齐

