# CLI FM Agent Scan Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `/home/wunai/Downloads/fm-agent-raw-reports/cli` 的 raw findings 收敛为基于当前 HEAD 的 live backlog，并分阶段修复 CLI 的文本渲染、命令注册、参数校验和本地状态/导出 helper 缺口。

**Architecture:** 当前 `packages/cli` 已经有较完整的命令与 helper 测试矩阵，因此不需要新建平行 harness。执行顺序采用“revalidate raw findings -> 修 formatter/render contract -> 修 command/permission contract -> 修 config/output/export helper”，所有修复都先落成失败测试再补实现。

**Tech Stack:** TypeScript, Commander, Vitest, `@trapmap/contracts`

---

## 执行输入（必查）

- Raw summary：`/home/wunai/Downloads/fm-agent-raw-reports/cli/summary.json`
- Raw detail 根目录：`/home/wunai/Downloads/fm-agent-raw-reports/cli/`
- 执行时优先抽查的 raw detail：
  - `/home/wunai/Downloads/fm-agent-raw-reports/cli/commands--decay-ts--formatBatchResult.md`
  - `/home/wunai/Downloads/fm-agent-raw-reports/cli/commands--feedback-admin-ts--formatBatchResult.md`
  - `/home/wunai/Downloads/fm-agent-raw-reports/cli/commands--feedback-ts--registerFeedbackCommands.md`
  - `/home/wunai/Downloads/fm-agent-raw-reports/cli/lib--config-ts--loadCliState.md`
- 执行时必须联动阅读的项目文档：
  - `docs/PACKAGES.md`
  - `packages/cli/README.md`
  - `docs/architecture/CLI.md`
  - `docs/operations/TESTING.md`
- 硬规则：
  - 每个 live 修复都要在 matrix 里记录 `raw_id`、`detail_md`、`current_source`、`truth_doc`、`test_file`
  - 每个被判定为 `fixed` / `stale` 的 raw finding 都必须写明当前证据，至少引用一个现有测试或当前实现片段

## Subagent 执行要求

- [ ] `Phase 0/1` 没完成前，不允许开始 CLI 代码修复。
- [ ] `1 个 subagent` 只处理 `1 个 lane` 或 `1 个 phase` 的交付，不得同时改 formatter、command contract、state helper 三个方向。
- [ ] 每次开始修复前，先把对应 raw finding 写进 `docs/plans/fm-agent-scan/cli-live-gap-matrix.md`，并补上当前文档入口与测试入口。
- [ ] 同一个修复任务必须一起提交实现、`packages/cli/README.md` 或 `docs/architecture/CLI.md` 中的相关说明、以及对应测试代码。
- [ ] 如果判断某条 raw finding 已被当前 HEAD 吸收，必须在 matrix 中写清 `fixed` / `stale` 证据后再跳过。
- [ ] 子任务回报必须包含：本次覆盖的 `raw_id`、修改文件、执行过的命令、失败测试如何转绿、仍需哪个下游 lane 接力。

## 建议并行 Lane

- [ ] Lane 0：`Phase 0/1`，只做 triage、source pack、live gap matrix、失败测试冻结。
- [ ] Lane A：`Phase 2`，专注 formatter / renderer / human-readable output。
- [ ] Lane B：`Phase 3`，专注 command registration / validation / permission contract。
- [ ] Lane C：`Phase 4`，专注 config / output profile / JSON output / export helper。
- [ ] 并行规则：Lane A 与 Lane B 可在 Lane 0 完成后并行；Lane C 等待 A/B 合并，因为它要收尾 CLI 输出与本地状态契约，并负责最终 `eval:smoke`。

### Phase 0: Build Report-to-Code-to-Doc Crosswalk

**Files:**
- Create: `docs/plans/fm-agent-scan/cli-source-pack.md`
- Create: `docs/plans/fm-agent-scan/cli-live-gap-matrix.md`
- Modify: `packages/cli/README.md`
- Modify: `docs/architecture/CLI.md`

- [ ] **Step 1: 从 raw summary 抽出当前执行要跟踪的 source pack**

```markdown
| raw id | detail md | likely current file | doc to open first |
|---|---|---|---|
| commands--decay-ts--formatBatchResult | /home/wunai/Downloads/fm-agent-raw-reports/cli/commands--decay-ts--formatBatchResult.md | packages/cli/src/commands/decay.ts | docs/architecture/CLI.md |
| lib--config-ts--loadCliState | /home/wunai/Downloads/fm-agent-raw-reports/cli/lib--config-ts--loadCliState.md | packages/cli/src/lib/config.ts | packages/cli/README.md |
```

- [ ] **Step 2: 先写 crosswalk，再决定 live / fixed / stale**

```markdown
| raw id | status | current source | current test | truth doc | note |
|---|---|---|---|---|---|
| commands--feedback-ts--registerFeedbackCommands | fixed | packages/cli/src/commands/feedback.ts | packages/cli/src/commands/feedback.test.ts | docs/architecture/CLI.md | InvalidArgumentError already rejects invalid entry-type |
```

- [ ] **Step 3: 运行只读核对，不改实现**

```bash
rtk jq '.bugs[] | select(.confirmation_status=="confirmed") | {id,detail_file,trigger_summary}' /home/wunai/Downloads/fm-agent-raw-reports/cli/summary.json
rtk sed -n '1,220p' packages/cli/README.md
rtk sed -n '1,220p' docs/architecture/CLI.md
```

Expected: `cli-source-pack.md` 与 `cli-live-gap-matrix.md` 足以指导后续每次修复前的原始报告/文档交叉核对。

## 当前判断

- raw report `82` 条、confirmed `54` 条，但其中一部分已经被当前代码吸收，例如 `feedback` 的 `--entry-type` 校验和 ANSI 清理。
- 当前 HEAD 仍然直接暴露的问题集中在：
  - `packages/cli/src/commands/decay.ts`
  - `packages/cli/src/commands/maintenance.ts`
  - `packages/cli/src/commands/feedback-admin.ts`
  - `packages/cli/src/lib/config.ts`
  - `packages/cli/src/lib/output.ts`
- 现有测试入口已经覆盖大部分热点：
  - `packages/cli/src/commands/*.test.ts`
  - `packages/cli/src/lib/{config,markdown-formatter,output,output-profile,skill-artifact-export}.test.ts`

### Phase 1: Revalidate Raw Findings Against Current HEAD

**Files:**
- Modify: `packages/cli/src/commands/decay.test.ts`
- Modify: `packages/cli/src/commands/maintenance.test.ts`
- Modify: `packages/cli/src/commands/feedback.test.ts`
- Modify: `packages/cli/src/commands/skill.test.ts`
- Modify: `packages/cli/src/commands/operations.test.ts`
- Modify: `packages/cli/src/lib/config.test.ts`
- Modify: `packages/cli/src/lib/output-profile.test.ts`
- Modify: `packages/cli/src/lib/skill-artifact-export.test.ts`
- Modify: `packages/cli/src/lib/markdown-formatter.test.ts`

- [ ] **Step 1: 产出 live gap matrix，把 raw id 映射到当前文件与状态**

```markdown
| raw id | current file | status | note |
|---|---|---|---|
| commands--decay-ts--formatBatchResult | packages/cli/src/commands/decay.ts | live | empty-string reason/appliedAt still omitted |
| commands--feedback-ts--registerFeedbackCommands | packages/cli/src/commands/feedback.ts | fixed | InvalidArgumentError already enforces entry-type |
| lib--config-ts--loadCliState | packages/cli/src/lib/config.ts | live | invalid outputProfile scalar leaks through spread |
```

- [ ] **Step 2: 把 live finding 先变成失败测试，不改实现**

```ts
it('renders explicit empty ineligibilityReason instead of dropping it', async () => {
  queueApiResponse({
    action: 'extend',
    dryRun: false,
    totalEligible: 0,
    totalIneligible: 1,
    appliedAt: '',
    items: [
      {
        entryId: 'entry-1',
        eligible: false,
        changeDescription: 'extend by 30 days',
        ineligibilityReason: '',
      },
    ],
  });

  await runDecayBatch(['--action', 'extend', '--entries', 'entry-1']);
  expect(stdout()).toContain('Applied at: ');
  expect(stdout()).toContain('✗ entry-1: extend by 30 days ()');
});
```

- [ ] **Step 3: 运行最小回归集，确认这些 case 先红后绿**

```bash
rtk pnpm test -- --run \
  packages/cli/src/commands/decay.test.ts \
  packages/cli/src/commands/maintenance.test.ts \
  packages/cli/src/commands/feedback.test.ts \
  packages/cli/src/commands/skill.test.ts \
  packages/cli/src/commands/operations.test.ts \
  packages/cli/src/lib/config.test.ts \
  packages/cli/src/lib/output-profile.test.ts \
  packages/cli/src/lib/skill-artifact-export.test.ts \
  packages/cli/src/lib/markdown-formatter.test.ts
```

Expected: 至少包含 raw matrix 标记为 `live` 的失败断言。

- [ ] **Step 4: 提交 Phase 1**

```bash
rtk git add \
  docs/plans/fm-agent-scan/cli-live-gap-matrix.md \
  packages/cli/src/commands/decay.test.ts \
  packages/cli/src/commands/maintenance.test.ts \
  packages/cli/src/commands/feedback.test.ts \
  packages/cli/src/commands/skill.test.ts \
  packages/cli/src/commands/operations.test.ts \
  packages/cli/src/lib/config.test.ts \
  packages/cli/src/lib/output-profile.test.ts \
  packages/cli/src/lib/skill-artifact-export.test.ts \
  packages/cli/src/lib/markdown-formatter.test.ts
rtk git commit --no-verify -m "test(cli): freeze fm-agent live backlog"
```

### Phase 1 完成标准

- [ ] `docs/plans/fm-agent-scan/cli-live-gap-matrix.md` 明确列出 live / fixed / not-applicable
- [ ] 每个 live finding 至少有一个失败测试承接
- [ ] 已明确不重复修当前 HEAD 已经吸收的 raw finding
- [ ] 每个 live finding 都能回链到一个 raw detail 文件和一个项目文档入口

### Phase 1 文档更新

- [ ] `packages/cli/README.md`：补一节“Command/Test Hotspots”，指向 `src/commands/*.test.ts` 与 `src/lib/*.test.ts`
- [ ] `docs/architecture/CLI.md`：补一节“CLI Contract Regression Workflow”，说明 formatter / renderer / command registration 先测后改，以及修复时要先对照 raw report

### Phase 1 测试 / Eval 更新

- [ ] 扩展上述 CLI 单测文件，覆盖 raw live backlog
- [ ] 本阶段不改 eval dataset；只建立 CLI 本地回归集

### Phase 1 示例结构

```text
docs/plans/fm-agent-scan/cli-live-gap-matrix.md
packages/cli/src/commands/decay.test.ts
packages/cli/src/lib/config.test.ts
```

### Phase 2: Fix Formatter and Human-Readable Output Contracts

**Files:**
- Modify: `packages/cli/src/commands/decay.ts`
- Modify: `packages/cli/src/commands/maintenance.ts`
- Modify: `packages/cli/src/commands/feedback-admin.ts`
- Modify: `packages/cli/src/commands/skill.ts`
- Modify: `packages/cli/src/lib/markdown-formatter.ts`
- Modify: `packages/cli/src/lib/sanitize.ts`
- Modify: `packages/cli/src/commands/decay.test.ts`
- Modify: `packages/cli/src/commands/maintenance.test.ts`
- Modify: `packages/cli/src/commands/feedback.test.ts`
- Modify: `packages/cli/src/commands/skill.test.ts`
- Modify: `packages/cli/src/lib/markdown-formatter.test.ts`

- [ ] **Step 1: 先把 formatter contract case 写成最小失败测试**

```ts
it('prints empty feedback-admin reason when field is explicitly present', () => {
  const result = formatBatchResult({
    action: 'resolve',
    dryRun: false,
    totalEligible: 0,
    totalIneligible: 1,
    appliedAt: '',
    items: [{ feedbackId: 'fb_1', eligible: false, reason: '', transitionApplied: false }],
  });

  expect(result).toContain('Applied at: ');
  expect(result).toContain('✗ fb_1 ()');
});
```

- [ ] **Step 2: 用显式 presence check 和共享 sanitize helper 修实现**

```ts
function formatOptionalSuffix(value: string | null | undefined): string {
  return value == null ? '' : ` (${sanitizeForDisplay(value)})`;
}

if (data.appliedAt != null) {
  lines.push(`Applied at: ${data.appliedAt}`);
}

const reason = formatOptionalSuffix(item.ineligibilityReason);
```

- [ ] **Step 3: 修复 markdown / skill renderer 的换行、空数组和固定前缀问题**

```ts
const channels = payload.channelsUsed.length > 0 ? payload.channelsUsed.join(', ') : 'unknown';
const lines = [`Candidate: ${response.candidateId}`];
lines.push('✅ Resolution applied successfully');
```

- [ ] **Step 4: 运行 formatter 回归集**

```bash
rtk pnpm test -- --run \
  packages/cli/src/commands/decay.test.ts \
  packages/cli/src/commands/maintenance.test.ts \
  packages/cli/src/commands/feedback.test.ts \
  packages/cli/src/commands/skill.test.ts \
  packages/cli/src/lib/markdown-formatter.test.ts
```

Expected: 全绿，且无 snapshot/line-count regression。

- [ ] **Step 5: 提交 Phase 2**

```bash
rtk git add \
  packages/cli/src/commands/decay.ts \
  packages/cli/src/commands/maintenance.ts \
  packages/cli/src/commands/feedback-admin.ts \
  packages/cli/src/commands/skill.ts \
  packages/cli/src/lib/markdown-formatter.ts \
  packages/cli/src/lib/sanitize.ts \
  packages/cli/src/commands/decay.test.ts \
  packages/cli/src/commands/maintenance.test.ts \
  packages/cli/src/commands/feedback.test.ts \
  packages/cli/src/commands/skill.test.ts \
  packages/cli/src/lib/markdown-formatter.test.ts
rtk git commit --no-verify -m "fix(cli): harden formatter contracts"
```

### Phase 2 完成标准

- [ ] 所有“present-but-empty”字段都按 presence 而非 truthiness 处理
- [ ] formatter 输出不再额外插入空行或固定错误前缀
- [ ] 文本输出统一经过 `sanitizeForDisplay()` 或等价 helper

### Phase 2 文档更新

- [ ] `docs/architecture/CLI.md`：记录“human-readable output contract”规则
- [ ] `packages/cli/README.md`：补充 formatter / sanitize helper 入口说明

### Phase 2 测试 / Eval 更新

- [ ] 补齐 `decay` / `maintenance` / `feedback-admin` / `skill` / `markdown-formatter` 的回归 case
- [ ] 本阶段仍不新增 eval dataset

### Phase 2 示例代码

```ts
export function sanitizeForDisplay(text: string): string {
  return stripAnsi(stripNewlines(text));
}
```

### Phase 3: Harden Command Registration and Flag Validation

**Files:**
- Modify: `packages/cli/src/commands/feedback.ts`
- Modify: `packages/cli/src/commands/operations.ts`
- Modify: `packages/cli/src/commands/operations/index.ts`
- Modify: `packages/cli/src/commands/operations/deactivate.ts`
- Modify: `packages/cli/src/commands/operations/edit.ts`
- Modify: `packages/cli/src/commands/skill.ts`
- Modify: `packages/cli/src/commands/operations.test.ts`
- Modify: `packages/cli/src/commands/feedback.test.ts`
- Modify: `packages/cli/src/commands/skill.test.ts`

- [ ] **Step 1: 为 permission gating 和 flag coercion 写失败测试**

```ts
it('rejects non-integer security level in skill edit flow', async () => {
  await expect(runOperationsEdit(['--security-level', '3.5'])).rejects.toThrow(
    'security level must be an integer',
  );
});

it('keeps review subcommands available when only allowReview=true', () => {
  const names = listSubcommands(registerSkillCommandsFor({ allowSearch: false, allowSubmit: false, allowExport: false, allowReview: true }));
  expect(names).toContain('review');
});
```

- [ ] **Step 2: 在 Commander 层做输入约束，不把无效值继续发给 API**

```ts
.option('--security-level <n>', 'Required level', (value: string) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || String(parsed) !== value.trim()) {
    throw new InvalidArgumentError('security level must be an integer');
  }
  return parsed;
})
```

- [ ] **Step 3: 统一 operations / skill 命令注册语义**

```ts
if (options.allowReview) {
  registerSkillReviewCommands(skill, options);
}
```

- [ ] **Step 4: 运行命令注册与参数校验测试**

```bash
rtk pnpm test -- --run \
  packages/cli/src/commands/operations.test.ts \
  packages/cli/src/commands/feedback.test.ts \
  packages/cli/src/commands/skill.test.ts
```

- [ ] **Step 5: 提交 Phase 3**

```bash
rtk git add \
  packages/cli/src/commands/feedback.ts \
  packages/cli/src/commands/operations.ts \
  packages/cli/src/commands/operations/index.ts \
  packages/cli/src/commands/operations/deactivate.ts \
  packages/cli/src/commands/operations/edit.ts \
  packages/cli/src/commands/skill.ts \
  packages/cli/src/commands/operations.test.ts \
  packages/cli/src/commands/feedback.test.ts \
  packages/cli/src/commands/skill.test.ts
rtk git commit --no-verify -m "fix(cli): tighten command gating and flags"
```

### Phase 3 完成标准

- [ ] Commander 层拦住无效 flag，而不是把垃圾值继续传给 API
- [ ] `allow*` 语义和实际注册出的 subcommands 一致
- [ ] 命令权限矩阵在测试里可见、可复现

### Phase 3 文档更新

- [ ] `docs/architecture/CLI.md`：更新 operations / skill permission matrix
- [ ] `packages/cli/README.md`：补充关键命令的参数约束与非交互模式要求

### Phase 3 测试 / Eval 更新

- [ ] 扩展 `operations.test.ts`、`feedback.test.ts`、`skill.test.ts`
- [ ] 本阶段不改 eval dataset

### Phase 3 示例结构

```text
packages/cli/src/commands/operations/
├── index.ts
├── deactivate.ts
├── edit.ts
└── types.ts
```

### Phase 4: Fix Config, Output, and Export Helpers

**Files:**
- Modify: `packages/cli/src/lib/config.ts`
- Modify: `packages/cli/src/lib/output.ts`
- Modify: `packages/cli/src/lib/output-profile.ts`
- Modify: `packages/cli/src/lib/skill-artifact-export.ts`
- Modify: `packages/cli/src/lib/prompts.ts`
- Modify: `packages/cli/src/lib/input.ts`
- Modify: `packages/cli/src/lib/config.test.ts`
- Modify: `packages/cli/src/lib/output.test.ts`
- Modify: `packages/cli/src/lib/output-profile.test.ts`
- Modify: `packages/cli/src/lib/skill-artifact-export.test.ts`
- Modify: `packages/cli/src/lib/prompts.test.ts`

- [ ] **Step 1: 为脏本地状态、单行 JSON、导出路径边界补失败测试**

```ts
it('drops invalid scalar outputProfile when loading cli state', async () => {
  vi.mocked(readFile).mockResolvedValue(JSON.stringify({ outputProfile: '' }) as never);
  const state = await loadCliState();
  expect(state.outputProfile).toBeUndefined();
});

it('prints json result on exactly one line', () => {
  printResult({ answer: 1 }, { json: true });
  expect(stdoutLines()).toHaveLength(1);
});
```

- [ ] **Step 2: 先修 state normalization，再修 render / export helper**

```ts
const outputProfile = normalizeOutputProfile(parsed.outputProfile);
return {
  ...getDefaultState(),
  ...parsed,
  ...(outputProfile != null ? { outputProfile } : { outputProfile: undefined }),
};
```

```ts
export function printJsonLine(value: unknown): void {
  console.log(JSON.stringify(value));
}
```

- [ ] **Step 3: 运行 helper 回归集和包级验证**

```bash
rtk pnpm test -- --run \
  packages/cli/src/lib/config.test.ts \
  packages/cli/src/lib/output.test.ts \
  packages/cli/src/lib/output-profile.test.ts \
  packages/cli/src/lib/skill-artifact-export.test.ts \
  packages/cli/src/lib/prompts.test.ts
rtk pnpm --filter @trapmap/cli test
rtk pnpm --filter @trapmap/cli typecheck
```

- [ ] **Step 4: 运行仓库级 smoke，确保 CLI 修复未破坏跨包行为**

```bash
rtk pnpm eval:smoke
```

Expected: smoke 通过；若失败，优先回查 CLI 输出 profile 与 artifact export 相关路径。

- [ ] **Step 5: 提交 Phase 4**

```bash
rtk git add \
  packages/cli/src/lib/config.ts \
  packages/cli/src/lib/output.ts \
  packages/cli/src/lib/output-profile.ts \
  packages/cli/src/lib/skill-artifact-export.ts \
  packages/cli/src/lib/prompts.ts \
  packages/cli/src/lib/input.ts \
  packages/cli/src/lib/config.test.ts \
  packages/cli/src/lib/output.test.ts \
  packages/cli/src/lib/output-profile.test.ts \
  packages/cli/src/lib/skill-artifact-export.test.ts \
  packages/cli/src/lib/prompts.test.ts
rtk git commit --no-verify -m "fix(cli): normalize local state and render helpers"
```

### Phase 4 完成标准

- [ ] 非法本地 `outputProfile` 不会再透传回 `CliState`
- [ ] JSON 模式输出稳定为单行机器可解析格式
- [ ] export / activate 的输出路径校验与测试一致
- [ ] CLI 包级测试和 typecheck 通过，仓库 `eval:smoke` 通过

### Phase 4 文档更新

- [ ] `packages/cli/README.md`：记录 config path fallback、output profile 和 JSON line contract
- [ ] `docs/architecture/CLI.md`：记录 renderer 选择和 machine-readable output 规则

### Phase 4 测试 / Eval 更新

- [ ] 扩展 `config.test.ts`、`output.test.ts`、`output-profile.test.ts`、`skill-artifact-export.test.ts`、`prompts.test.ts`
- [ ] 运行 `rtk pnpm eval:smoke` 作为跨包回归

### Phase 4 示例代码

```ts
function normalizeOutputProfile(
  profile: Partial<OutputProfile> | undefined,
): OutputProfile | undefined {
  if (!profile || typeof profile !== 'object') {
    return undefined;
  }
  return {
    ...getDefaultOutputProfile(),
    ...profile,
  };
}
```

## 包级最终验收与交付物

### 必须更新的文档

- [x] `packages/cli/README.md`
- [x] `docs/architecture/CLI.md`
- [x] `docs/operations/TESTING.md`，如果新增或调整了 CLI 回归命令

### 必须更新的测试代码

- [x] `packages/cli/src/commands/decay.test.ts`
- [x] `packages/cli/src/commands/maintenance.test.ts`
- [x] `packages/cli/src/commands/feedback.test.ts`
- [x] `packages/cli/src/commands/skill.test.ts`
- [x] `packages/cli/src/commands/operations.test.ts`
- [x] `packages/cli/src/lib/config.test.ts`
- [x] `packages/cli/src/lib/markdown-formatter.test.ts`
- [x] `packages/cli/src/lib/output.test.ts`
- [x] `packages/cli/src/lib/output-profile.test.ts`
- [x] `packages/cli/src/lib/skill-artifact-export.test.ts`
- [x] `packages/cli/src/lib/prompts.test.ts`

### 最终验收标准

- [x] `docs/plans/fm-agent-scan/cli-live-gap-matrix.md` 已完整记录 live / fixed / stale 结论
- [x] 四个 phase 的完成标准都已满足
- [x] CLI 相关文档已同步到当前实现与测试入口
- [x] CLI 相关测试代码已覆盖本轮 live backlog
- [x] `rtk pnpm --filter @trapmap/cli test` 通过
- [x] `rtk pnpm --filter @trapmap/cli typecheck` 通过
- [x] `rtk pnpm eval:smoke` 通过

## Execution Close-Out (2026-05-29)

- 状态：已完成，并在 post-audit reconciliation 中迁移到 `docs/plans/fm-agent-scan/`
- 当前 HEAD 证据：CLI matrix 中原 live rows 已全部重分流为 `fixed` 或 `stale/design`
- 当前验证：仓库级 `rtk pnpm test`、`rtk pnpm typecheck`、`rtk pnpm eval:smoke` 已重跑通过
- 残留说明：少量 formatter / renderer / stdin 边界被回写为设计约定或非复现场景，不再作为 live CLI backlog
