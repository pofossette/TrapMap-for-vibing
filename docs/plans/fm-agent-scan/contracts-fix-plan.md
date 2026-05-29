# Contracts FM Agent Scan Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `/home/wunai/Downloads/fm-agent-raw-reports/contracts` 的 raw findings 收敛成当前 HEAD 的真实 schema backlog，并分阶段收紧路径/哈希 helper、跨字段语义约束和 retrieval/artifact/eval 契约一致性。

**Architecture:** `packages/contracts` 已经有密集的 domain 测试文件，因此重点不是重建测试基础设施，而是统一 helper、消除测试/实现漂移，并把“结构校验”和“语义校验”拆开处理。执行顺序采用“revalidate live gaps -> 抽 shared helper -> 补 cross-field invariants -> 收敛 retrieval/artifact/eval downstream fixtures”。

**Tech Stack:** TypeScript, Zod, Vitest

---

## 执行输入（必查）

- Raw summary：`/home/wunai/Downloads/fm-agent-raw-reports/contracts/summary.json`
- Raw detail 根目录：`/home/wunai/Downloads/fm-agent-raw-reports/contracts/`
- 执行时优先抽查的 raw detail：
  - `/home/wunai/Downloads/fm-agent-raw-reports/contracts/src--domain--artifacts-ts--bodies.md`
  - `/home/wunai/Downloads/fm-agent-raw-reports/contracts/src--domain--artifacts-ts--descriptor.md`
  - `/home/wunai/Downloads/fm-agent-raw-reports/contracts/src--domain--operations-ts--object_11.md`
  - `/home/wunai/Downloads/fm-agent-raw-reports/contracts/src--domain--evals--report-ts--object_20.md`
- 执行时必须联动阅读的项目文档：
  - `docs/PACKAGES.md`
  - `packages/contracts/README.md`
  - `docs/operations/TESTING.md`
  - `docs/reference/api-surface.md`
- 硬规则：
  - 每个 schema 修复都要记录 `raw_id`、`detail_md`、`schema_file`、`test_file`、`downstream_doc`
  - 每次把 raw finding 判定为 `fixed` / `stale`，都要附上当前 schema 或测试证据，避免重复 tightening

## Subagent 执行要求

- [ ] `Phase 0/1` 完成前，不允许修改 `packages/contracts/src/domain/**` 的实现。
- [ ] `1 个 subagent` 只负责 `1 个 phase` 或 `1 个 helper / invariant lane`，避免多个子任务同时写同一组 domain 文件。
- [ ] 每次开始 schema 修复前，先更新 `docs/plans/fm-agent-scan/contracts-live-gap-matrix.md`，确认该 finding 仍然是 live。
- [ ] 每个 schema 或 helper 变更都必须一起提交下游文档说明与对应测试代码，不能只 tighten schema 不补 README / TESTING 说明。
- [ ] 如果 raw finding 已在当前 HEAD 被吸收，必须在 matrix 中标记 `fixed` / `stale` 并附当前 schema 或测试证据。
- [ ] 子任务回报必须包含：覆盖的 `raw_id`、受影响的 domain 文件、对应测试文件、已更新文档、执行过的命令、对 CLI / Server 的潜在影响。

## 建议并行 Lane

- [ ] Lane 0：`Phase 0/1`，只做 source pack、live gap matrix、失败测试冻结。
- [ ] Lane A：`Phase 2`，统一 path/hash/media-type helper。
- [ ] Lane B：`Phase 3`，补 cross-field semantic invariants。
- [ ] Lane C：`Phase 4`，收敛 retrieval / artifact / eval downstream fixture。
- [ ] 并行规则：contracts 内部高重叠文件较多，`Phase 2 -> Phase 3 -> Phase 4` 以串行为主；若切换 subagent，只允许在前一 lane 合并并重新跑 targeted tests 后接力。

### Phase 0: Build Report-to-Schema Crosswalk

**Files:**
- Create: `docs/plans/fm-agent-scan/contracts-source-pack.md`
- Create: `docs/plans/fm-agent-scan/contracts-live-gap-matrix.md`
- Modify: `packages/contracts/README.md`
- Modify: `docs/operations/TESTING.md`

- [ ] **Step 1: 先写 contracts source pack，把 raw report 映射到 schema / test / doc**

```markdown
| raw id | detail md | current schema file | current test file | doc to open first |
|---|---|---|---|---|
| src--domain--artifacts-ts--bodies | /home/wunai/Downloads/fm-agent-raw-reports/contracts/src--domain--artifacts-ts--bodies.md | packages/contracts/src/domain/artifacts.ts | packages/contracts/src/domain/artifacts.test.ts | packages/contracts/README.md |
| src--domain--evals--report-ts--object_20 | /home/wunai/Downloads/fm-agent-raw-reports/contracts/src--domain--evals--report-ts--object_20.md | packages/contracts/src/domain/evals/report.ts | packages/contracts/src/domain/evals/evals.test.ts | docs/operations/TESTING.md |
```

- [ ] **Step 2: 先把 crosswalk 写全，再决定哪些是当前 HEAD 仍然 live**

```markdown
| raw id | status | current schema | current test | downstream doc | note |
|---|---|---|---|---|---|
| src--domain--artifacts-ts--descriptor | fixed | packages/contracts/src/domain/artifacts.ts | packages/contracts/src/domain/artifacts.test.ts | docs/PACKAGES.md | relative path + hex sha256 already enforced |
```

- [ ] **Step 3: 运行只读核对，不改 schema**

```bash
rtk jq '.bugs[] | select(.confirmation_status=="confirmed") | {id,detail_file,trigger_summary}' /home/wunai/Downloads/fm-agent-raw-reports/contracts/summary.json
rtk sed -n '1,220p' packages/contracts/README.md
rtk sed -n '1,220p' docs/operations/TESTING.md
```

Expected: 后续任何 schema 改动都能从 `contracts-source-pack.md` 反查到原始报告和下游文档承诺。

## 当前判断

- raw report `109` 条、confirmed `83` 条，但当前 HEAD 已经修掉不少历史问题，例如：
  - `packages/contracts/src/domain/artifacts.ts` 中 `clientManifestScriptSchema` 已经限制相对路径和小写 hex
  - `packages/contracts/src/domain/evals/report.ts` 已经使用 `datetime({ offset: true })`
- 当前仍需优先关注的点：
  - `canonicalPathSchema` 没有在 `artifacts.ts`、`retrieval.ts`、`candidates.ts`、`operations.ts` 中被充分复用
  - 部分 cross-field invariant 仍然分散在各域，维护成本高
  - `retrieval.test.ts` 与 `retrieval.adversarial.test.ts` 仍使用绝对 `sourcePaths`

### Phase 1: Revalidate Raw Findings and Freeze the Live Schema Gap Matrix

**Files:**
- Modify: `packages/contracts/src/domain/artifacts.test.ts`
- Modify: `packages/contracts/src/domain/candidates.test.ts`
- Modify: `packages/contracts/src/domain/operations.test.ts`
- Modify: `packages/contracts/src/domain/retrieval.test.ts`
- Modify: `packages/contracts/src/domain/retrieval.adversarial.test.ts`
- Modify: `packages/contracts/src/domain/evals/evals.test.ts`

- [ ] **Step 1: 把 raw finding 映射成当前 schema gap matrix**

```markdown
| raw id | current file | status | note |
|---|---|---|---|
| src--domain--artifacts-ts--descriptor | packages/contracts/src/domain/artifacts.ts | fixed | clientManifestScriptSchema already rejects absolute paths |
| src--domain--artifacts-ts--bodies | packages/contracts/src/domain/artifacts.ts | live | skillCapsuleSchema.sourcePaths still accepts arbitrary strings |
| src--domain--evals--report-ts--object_15 | packages/contracts/src/domain/evals/report.ts | fixed | offset-aware datetime already landed |
```

- [ ] **Step 2: 对 live gap 先补失败测试，不先改 schema**

```ts
it('rejects absolute sourcePaths in skillCapsuleSchema', () => {
  expect(() =>
    skillCapsuleSchema.parse({
      ...makeCapsule(),
      sourcePaths: ['/src/auth.ts'],
    }),
  ).toThrow();
});
```

- [ ] **Step 3: 跑 contracts targeted tests，冻结现状**

```bash
rtk pnpm test -- --run \
  packages/contracts/src/domain/artifacts.test.ts \
  packages/contracts/src/domain/candidates.test.ts \
  packages/contracts/src/domain/operations.test.ts \
  packages/contracts/src/domain/retrieval.test.ts \
  packages/contracts/src/domain/retrieval.adversarial.test.ts \
  packages/contracts/src/domain/evals/evals.test.ts
```

Expected: 只允许 live gap 的 case 失败；已修复 raw finding 不得重新回红。

- [ ] **Step 4: 提交 Phase 1**

```bash
rtk git add \
  docs/plans/fm-agent-scan/contracts-live-gap-matrix.md \
  packages/contracts/src/domain/artifacts.test.ts \
  packages/contracts/src/domain/candidates.test.ts \
  packages/contracts/src/domain/operations.test.ts \
  packages/contracts/src/domain/retrieval.test.ts \
  packages/contracts/src/domain/retrieval.adversarial.test.ts \
  packages/contracts/src/domain/evals/evals.test.ts
rtk git commit --no-verify -m "test(contracts): freeze fm-agent live schema gaps"
```

### Phase 1 完成标准

- [ ] `contracts-live-gap-matrix.md` 区分 live / fixed / stale
- [ ] 每个 live gap 至少被一个失败测试接住
- [ ] 不再盲修已经在当前 HEAD 收敛的 raw finding
- [ ] 每个 live / fixed / stale 判断都带 `detail_md` 与 `downstream_doc` 证据

### Phase 1 文档更新

- [ ] `packages/contracts/README.md`：新增 “Schema Regression Map” 小节
- [ ] `docs/operations/TESTING.md`：补充 “contracts raw report triage workflow”，明确先看 raw detail 再改 schema

### Phase 1 测试 / Eval 更新

- [ ] 扩展 `artifacts.test.ts`、`candidates.test.ts`、`operations.test.ts`、`retrieval*.test.ts`、`evals.test.ts`
- [ ] 本阶段不改 eval dataset，只建立 live regression baseline

### Phase 1 示例结构

```text
docs/plans/fm-agent-scan/contracts-live-gap-matrix.md
packages/contracts/src/domain/retrieval.test.ts
packages/contracts/src/domain/evals/evals.test.ts
```

### Phase 2: Consolidate Shared Path, Hash, and Media-Type Helpers

**Files:**
- Modify: `packages/contracts/src/domain/path-validation.ts`
- Modify: `packages/contracts/src/domain/common.ts`
- Modify: `packages/contracts/src/domain/artifacts.ts`
- Modify: `packages/contracts/src/domain/candidates.ts`
- Modify: `packages/contracts/src/domain/operations.ts`
- Modify: `packages/contracts/src/domain/retrieval.ts`
- Modify: `packages/contracts/src/domain/artifacts.test.ts`
- Modify: `packages/contracts/src/domain/candidates.test.ts`
- Modify: `packages/contracts/src/domain/operations.test.ts`
- Modify: `packages/contracts/src/domain/retrieval.test.ts`

- [ ] **Step 1: 先在 helper 层定义统一 schema，不在各域继续复制 regex / refine**

```ts
export const sha256HexSchema = z
  .string()
  .regex(/^[0-9a-f]{64}$/, 'sha256 must be 64 lowercase hex characters');

export const mediaTypeSchema = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[a-z]+\\/[a-z0-9.+-]+$/i, 'mediaType must be a valid IANA media type');
```

- [ ] **Step 2: 用 `canonicalPathSchema` 替换散落的 `z.string().min(1).max(512)` 路径字段**

```ts
sourcePaths: z.array(canonicalPathSchema).min(1),
path: canonicalPathSchema,
```

- [ ] **Step 3: 运行 helper 影响面测试**

```bash
rtk pnpm test -- --run \
  packages/contracts/src/domain/artifacts.test.ts \
  packages/contracts/src/domain/candidates.test.ts \
  packages/contracts/src/domain/operations.test.ts \
  packages/contracts/src/domain/retrieval.test.ts
```

Expected: 路径、sha256、mediaType 的断言全部由 shared helper 兜住。

- [ ] **Step 4: 提交 Phase 2**

```bash
rtk git add \
  packages/contracts/src/domain/path-validation.ts \
  packages/contracts/src/domain/common.ts \
  packages/contracts/src/domain/artifacts.ts \
  packages/contracts/src/domain/candidates.ts \
  packages/contracts/src/domain/operations.ts \
  packages/contracts/src/domain/retrieval.ts \
  packages/contracts/src/domain/artifacts.test.ts \
  packages/contracts/src/domain/candidates.test.ts \
  packages/contracts/src/domain/operations.test.ts \
  packages/contracts/src/domain/retrieval.test.ts
rtk git commit --no-verify -m "refactor(contracts): centralize path and hash helpers"
```

### Phase 2 完成标准

- [ ] 路径校验统一复用 `canonicalPathSchema`
- [ ] sha256 / mediaType 不再在多个 domain 文件里手写重复 regex
- [ ] retrieval / artifacts / candidates / operations 的路径与哈希行为一致

### Phase 2 文档更新

- [ ] `packages/contracts/README.md`：新增 “Shared Validation Helpers” 小节
- [ ] `docs/PACKAGES.md`：补充 contracts helper 作为 CLI / Server 的统一事实源

### Phase 2 测试 / Eval 更新

- [ ] 继续扩展上述四个 domain 测试文件
- [ ] 本阶段不改 eval dataset

### Phase 2 示例代码

```ts
export const canonicalPathSchema = z.string().min(1).max(512).refine(relativePathRefinement, {
  message:
    'Path must be relative, without absolute paths, parent traversal, or Windows drive letters',
});
```

### Phase 3: Add Cross-Field Semantic Invariants

**Files:**
- Modify: `packages/contracts/src/domain/auth.ts`
- Modify: `packages/contracts/src/domain/candidates.ts`
- Modify: `packages/contracts/src/domain/decay.ts`
- Modify: `packages/contracts/src/domain/feedback.ts`
- Modify: `packages/contracts/src/domain/knowledge.ts`
- Modify: `packages/contracts/src/domain/maintenance.ts`
- Modify: `packages/contracts/src/domain/operations.ts`
- Modify: `packages/contracts/src/domain/review.ts`
- Modify: `packages/contracts/src/domain/auth.test.ts`
- Modify: `packages/contracts/src/domain/candidates.test.ts`
- Modify: `packages/contracts/src/domain/decay.test.ts`
- Modify: `packages/contracts/src/domain/feedback.test.ts`
- Modify: `packages/contracts/src/domain/knowledge.test.ts`
- Modify: `packages/contracts/src/domain/maintenance.test.ts`
- Modify: `packages/contracts/src/domain/operations.test.ts`
- Modify: `packages/contracts/src/domain/review.test.ts`

- [ ] **Step 1: 把 conditional logic 收敛到 `refine` / `superRefine`，不要靠调用方兜底**

```ts
.superRefine((data, ctx) => {
  if (data.dryRun && data.appliedAt !== null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'appliedAt must be null when dryRun is true' });
  }
  if (data.eligible && data.ineligibilityReason !== null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'ineligibilityReason must be null when eligible is true' });
  }
})
```

- [ ] **Step 2: 为 auth / knowledge / review 的 presence 语义补断言**

```ts
it('rejects authenticated=true with session=null', () => {
  expect(() =>
    authSessionStateSchema.parse({ authenticated: true, session: null }),
  ).toThrow();
});
```

- [ ] **Step 3: 跑 cross-field regression 集**

```bash
rtk pnpm test -- --run \
  packages/contracts/src/domain/auth.test.ts \
  packages/contracts/src/domain/candidates.test.ts \
  packages/contracts/src/domain/decay.test.ts \
  packages/contracts/src/domain/feedback.test.ts \
  packages/contracts/src/domain/knowledge.test.ts \
  packages/contracts/src/domain/maintenance.test.ts \
  packages/contracts/src/domain/operations.test.ts \
  packages/contracts/src/domain/review.test.ts
```

- [ ] **Step 4: 提交 Phase 3**

```bash
rtk git add \
  packages/contracts/src/domain/auth.ts \
  packages/contracts/src/domain/candidates.ts \
  packages/contracts/src/domain/decay.ts \
  packages/contracts/src/domain/feedback.ts \
  packages/contracts/src/domain/knowledge.ts \
  packages/contracts/src/domain/maintenance.ts \
  packages/contracts/src/domain/operations.ts \
  packages/contracts/src/domain/review.ts \
  packages/contracts/src/domain/auth.test.ts \
  packages/contracts/src/domain/candidates.test.ts \
  packages/contracts/src/domain/decay.test.ts \
  packages/contracts/src/domain/feedback.test.ts \
  packages/contracts/src/domain/knowledge.test.ts \
  packages/contracts/src/domain/maintenance.test.ts \
  packages/contracts/src/domain/operations.test.ts \
  packages/contracts/src/domain/review.test.ts
rtk git commit --no-verify -m "fix(contracts): enforce cross-field invariants"
```

### Phase 3 完成标准

- [ ] 调用方不再需要自行兜底 `dryRun/appliedAt`、`eligible/ineligibilityReason`、`authenticated/session`
- [ ] 语义错误在 schema 边界直接抛出，而不是在 CLI / Server 深层才暴露
- [ ] 相关 domain tests 全绿

### Phase 3 文档更新

- [ ] `packages/contracts/README.md`：加入 cross-field invariant 约束约定
- [ ] `docs/reference/api-surface.md`：若请求/响应语义收紧，补上对应字段的约束说明

### Phase 3 测试 / Eval 更新

- [ ] 扩展 `auth` / `candidates` / `decay` / `feedback` / `knowledge` / `maintenance` / `operations` / `review` 测试
- [ ] 本阶段不改 eval dataset

### Phase 3 示例代码

```ts
refine((d) => !d.success || d.entry !== null, {
  message: 'entry must be non-null when success is true',
});
```

### Phase 4: Converge Retrieval, Artifact, and Eval Contracts

**Files:**
- Modify: `packages/contracts/src/domain/artifacts.ts`
- Modify: `packages/contracts/src/domain/retrieval.ts`
- Modify: `packages/contracts/src/domain/evals/report.ts`
- Modify: `packages/contracts/src/domain/evals/retrieval.ts`
- Modify: `packages/contracts/src/domain/artifacts.test.ts`
- Modify: `packages/contracts/src/domain/retrieval.test.ts`
- Modify: `packages/contracts/src/domain/retrieval.adversarial.test.ts`
- Modify: `packages/contracts/src/domain/evals/evals.test.ts`

- [ ] **Step 1: 先清理 retrieval / artifact 测试里的绝对路径 fixture**

```ts
const capsule = makeCapsule({
  sourcePaths: ['references/auth.md'],
});
```

- [ ] **Step 2: 统一 artifact / retrieval / eval 的 shape 和 offset-aware timestamp 断言**

```ts
expect(() =>
  retrievalEvalCaseSchema.parse({
    ...validCase,
    forbiddenIds: ['entry_1'],
    forbiddenReasons: [],
  }),
).toThrow();
```

- [ ] **Step 3: 跑 contracts 包级测试、类型检查和仓库 smoke**

```bash
rtk pnpm --filter @trapmap/contracts test
rtk pnpm --filter @trapmap/contracts typecheck
rtk pnpm eval:smoke
```

- [ ] **Step 4: 提交 Phase 4**

```bash
rtk git add \
  packages/contracts/src/domain/artifacts.ts \
  packages/contracts/src/domain/retrieval.ts \
  packages/contracts/src/domain/evals/report.ts \
  packages/contracts/src/domain/evals/retrieval.ts \
  packages/contracts/src/domain/artifacts.test.ts \
  packages/contracts/src/domain/retrieval.test.ts \
  packages/contracts/src/domain/retrieval.adversarial.test.ts \
  packages/contracts/src/domain/evals/evals.test.ts
rtk git commit --no-verify -m "fix(contracts): converge retrieval artifact eval contracts"
```

### Phase 4 完成标准

- [ ] `sourcePaths` 在 artifacts / retrieval / tests 中都改为相对路径约束
- [ ] eval contracts 与当前 tests、timestamp policy、array-length invariant 一致
- [ ] contracts 包级 `test` / `typecheck` 通过，仓库 `eval:smoke` 通过

### Phase 4 文档更新

- [ ] `packages/contracts/README.md`：补充 retrieval / artifact / eval contract 约定
- [ ] `docs/operations/TESTING.md`：补充 “contracts 变更后必须跑 `eval:smoke`” 的落地命令

### Phase 4 测试 / Eval 更新

- [ ] 更新 `retrieval.test.ts` 与 `retrieval.adversarial.test.ts` 的 path fixtures
- [ ] 运行 `rtk pnpm eval:smoke` 作为 downstream regression check

### Phase 4 示例结构

```text
packages/contracts/src/domain/
├── artifacts.ts
├── retrieval.ts
├── evals/report.ts
└── path-validation.ts
```

## 包级最终验收与交付物

### 必须更新的文档

- [x] `packages/contracts/README.md`
- [x] `docs/PACKAGES.md`
- [x] `docs/operations/TESTING.md`
- [x] `docs/reference/api-surface.md`，如果本轮 contracts 收敛影响公开 API shape

### 必须更新的测试代码

- [x] `packages/contracts/src/domain/artifacts.test.ts`
- [x] `packages/contracts/src/domain/candidates.test.ts`
- [x] `packages/contracts/src/domain/operations.test.ts`
- [x] `packages/contracts/src/domain/retrieval.test.ts`
- [x] `packages/contracts/src/domain/retrieval.adversarial.test.ts`
- [x] `packages/contracts/src/domain/evals/evals.test.ts`

### 最终验收标准

- [x] `docs/plans/fm-agent-scan/contracts-live-gap-matrix.md` 已完整记录 live / fixed / stale 结论
- [x] 四个 phase 的完成标准都已满足
- [x] contracts 文档已明确 shared helper、schema regression map、downstream fixture 约束
- [x] contracts 测试代码已覆盖本轮 live schema gaps
- [x] `rtk pnpm --filter @trapmap/contracts test` 通过
- [x] `rtk pnpm --filter @trapmap/contracts typecheck` 通过
- [x] `rtk pnpm eval:smoke` 通过

## Execution Close-Out (2026-05-29)

- 状态：已完成，并在 post-audit reconciliation 中迁移到 `docs/plans/fm-agent-scan/`
- 当前 HEAD 证据：contracts raw matrix 已回写为 `0 current live`
- 当前验证：仓库级 `rtk pnpm test`、`rtk pnpm typecheck`、`rtk pnpm eval:smoke` 已重跑通过
- 残留说明：`parsing.ts` 的 function-as-record / empty-title 争议已归类为 design-level stale，而非未实现 contracts gap
