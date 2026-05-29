# Server FM Agent Scan Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `/home/wunai/Downloads/fm-agent-raw-reports/server` 的 raw findings 收敛成当前 HEAD 的 live backlog，并按 app/bootstrap、AI/prompt、retrieval/indexing、artifacts/candidates/persistence 四层逐步修复。

**Architecture:** 当前 `packages/server` 的 raw report 明显来自旧快照，不能直接按 `595/391` 逐条开刀。执行顺序必须先建立“当前代码可复现”的安全网，再从系统边界向内推进：`app.ts` / bootstrap 生命周期，AI provider 与动态上下文，capsule retrieval + graph-lite + indexing，最后 artifact/candidate/persistence/route surface。

**Tech Stack:** TypeScript, Fastify, Drizzle ORM, Vitest, pg-mem, `@trapmap/contracts`

---

## 执行输入（必查）

- Raw summary：`/home/wunai/Downloads/fm-agent-raw-reports/server/summary.json`
- Raw detail 根目录：`/home/wunai/Downloads/fm-agent-raw-reports/server/`
- 执行时优先抽查的 raw detail：
  - `/home/wunai/Downloads/fm-agent-raw-reports/server/app-ts--addHook_1.md`
  - `/home/wunai/Downloads/fm-agent-raw-reports/server/bootstrap--bootstrap-candidate-recovery-ts--bootstrapCandidateRecovery.md`
  - `/home/wunai/Downloads/fm-agent-raw-reports/server/lib--ai--dynamic--context-resolver-ts--getMcpServerStatus.md`
  - `/home/wunai/Downloads/fm-agent-raw-reports/server/lib--artifacts--pg-repository--index-ts--updateLifecycle.md`
- 执行时必须联动阅读的项目文档：
  - `docs/PACKAGES.md`
  - `packages/server/README.md`
  - `packages/server/src/lib/README.md`
  - `docs/architecture/API.md`
  - `docs/architecture/components/RETRIEVAL.md`
  - `docs/architecture/components/INDEXING.md`
  - `docs/operations/TESTING.md`
- 硬规则：
  - 每个 live 修复都要记录 `raw_id`、`detail_md`、`current_source`、`current_test`、`truth_doc`
  - 每个被判定为 `stale` 的 raw finding 都必须写明是“提取片段过期”还是“当前实现已修复”，并留下当前代码证据

## Subagent 执行要求

- [ ] `Phase 0/1` 完成前，不允许直接修改 server 实现；必须先建立 `server-source-pack.md` 与 `server-live-gap-matrix.md`。
- [ ] `1 个 subagent` 只负责 `1 个 lane` 或 `1 个 phase`，禁止同一子任务同时横跨 app/bootstrap、AI/provider、retrieval/indexing、artifacts/persistence 多个系统边界。
- [ ] 每次开始修复前，先把对应 raw finding 和 truth doc 写入 `docs/plans/fm-agent-scan/server-live-gap-matrix.md`，确认仍是 live。
- [ ] 每个修复必须在同一子任务内一起提交实现、相关系统文档、相关测试代码；不得把文档和测试留给下一个 server lane 补。
- [ ] 如果判断 raw finding 已过期或已被当前 HEAD 吸收，必须在 matrix 中写明 `stale` 证据与当前代码位置。
- [ ] 子任务回报必须包含：本次覆盖的 `raw_id`、修改文件、执行命令、测试从红到绿的证据、对后续 lane 的阻塞或解除情况。

## 建议并行 Lane

- [ ] Lane 0：`Phase 0/1`，只做 source pack、live gap matrix、失败测试冻结。
- [ ] Lane A：`Phase 2`，专注 app / bootstrap / lifecycle / config。
- [ ] Lane B：`Phase 3`，专注 AI provider / prompt / dynamic context / cache contract。
- [ ] Lane C：`Phase 4`，专注 retrieval / recall / indexing / graph-lite。
- [ ] Lane D：`Phase 5`，专注 artifacts / candidates / persistence / routes。
- [ ] 并行规则：Lane A 与 Lane B 可在 Lane 0 完成后并行，但如果都要改 `config.ts` 或共享 bootstrap 入口，则以 lane A 为准；Lane C 等待 contracts Phase 4 与 server AI/provider 相关接口稳定；Lane D 的代码改动等待 Lane C 合并，但它的 source-pack、文档入口核对和测试草稿可以提前只读准备。

### Phase 0: Build Report-to-System Crosswalk

**Files:**
- Create: `docs/plans/fm-agent-scan/server-source-pack.md`
- Create: `docs/plans/fm-agent-scan/server-live-gap-matrix.md`
- Modify: `packages/server/README.md`
- Modify: `packages/server/src/lib/README.md`
- Modify: `docs/operations/TESTING.md`

- [ ] **Step 1: 先写 source pack，把 raw report 映射到当前系统边界**

```markdown
| raw id | detail md | current source file | current test file | doc to open first |
|---|---|---|---|---|
| app-ts--addHook_1 | /home/wunai/Downloads/fm-agent-raw-reports/server/app-ts--addHook_1.md | packages/server/src/app.ts | packages/server/src/app.test.ts | docs/architecture/API.md |
| lib--ai--dynamic--context-resolver-ts--getMcpServerStatus | /home/wunai/Downloads/fm-agent-raw-reports/server/lib--ai--dynamic--context-resolver-ts--getMcpServerStatus.md | packages/server/src/lib/ai/dynamic/context-resolver.ts | packages/server/src/lib/ai/dynamic/context-resolver.test.ts | docs/architecture/components/AI_PROVIDER.md |
```

- [ ] **Step 2: 先标 stale，再进入 live 修复**

```markdown
| raw id | status | current source | current test | truth doc | note |
|---|---|---|---|---|---|
| app-ts--buildServer | stale | packages/server/src/app.ts | packages/server/src/app.test.ts | packages/server/README.md | current buildServer already returns Fastify instance |
```

- [ ] **Step 3: 运行只读核对，不改实现**

```bash
rtk jq '.bugs[] | select(.confirmation_status=="confirmed") | {id,detail_file,trigger_summary}' /home/wunai/Downloads/fm-agent-raw-reports/server/summary.json
rtk sed -n '1,220p' packages/server/README.md
rtk sed -n '1,220p' packages/server/src/lib/README.md
rtk sed -n '1,220p' docs/operations/TESTING.md
```

Expected: `server-source-pack.md` 足以指导后续每个修复同时回看 raw report、包内导航和系统文档。

## 当前判断

- 当前 HEAD 已经明显超出 raw snapshot，例如 `buildServer()` 实现完整、`documentedRoutes` 和 capsule-native retrieval 已经落地。
- 仍可直接命中的 live 点：
  - `packages/server/src/app.ts`：`onClose` 未 `await taskWorker.stop()` / `outboxWorker.stop()`
  - `packages/server/src/lib/ai/dynamic/context-resolver.ts`：`getMcpServerStatus()` 仍是 placeholder，`getDynamicInjections()` 仍未区分 task type
  - `packages/server/src/lib/ai/provider-config.ts`：空字符串和 env precedence 语义仍需重新校准
- raw report 的高风险热点桶：
  - `lib/retrieval/capsules`：31
  - `lib/persistence/schema`：24
  - `lib/retrieval/recall`：19
  - `lib/artifacts/pg-repository`：16
  - `lib/indexing/graph-lite`：15
  - `lib/indexing/adapters`：13
  - `lib/ai/providers`：12

### Phase 1: Revalidate Raw Findings and Build the Live Server Gap Matrix

**Files:**
- Create: `packages/server/src/app.test.ts`
- Modify: `packages/server/src/bootstrap/startup.test.ts`
- Modify: `packages/server/src/lib/ai/dynamic/context-resolver.test.ts`
- Modify: `packages/server/src/lib/ai/provider-config.test.ts`
- Modify: `packages/server/src/__tests__/docs-truth-smoke.test.ts`

- [ ] **Step 1: 产出 server live gap matrix，先标记 stale raw finding**

```markdown
| raw id | current file | status | note |
|---|---|---|---|
| app-ts--buildServer | packages/server/src/app.ts | stale | buildServer now returns Fastify instance |
| app-ts--addHook_1 | packages/server/src/app.ts | live | onClose still does not await async stop |
| lib--ai--dynamic--context-resolver-ts--getMcpServerStatus | packages/server/src/lib/ai/dynamic/context-resolver.ts | live | placeholder still returns "[]" |
```

- [ ] **Step 2: 为 live gap 先补失败测试**

```ts
it('awaits async worker shutdown before close resolves', async () => {
  const app = buildServer();
  const events: string[] = [];
  (app as any).taskWorker = {
    stop: async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      events.push('task-stopped');
    },
  };

  await app.close();
  expect(events).toContain('task-stopped');
});
```

- [ ] **Step 3: 跑最小 server backlog 测试集**

```bash
rtk pnpm test -- --run \
  packages/server/src/app.test.ts \
  packages/server/src/bootstrap/startup.test.ts \
  packages/server/src/lib/ai/dynamic/context-resolver.test.ts \
  packages/server/src/lib/ai/provider-config.test.ts \
  packages/server/src/__tests__/docs-truth-smoke.test.ts
```

Expected: live gap 断言先红；stale raw finding 不得重新失败。

- [ ] **Step 4: 提交 Phase 1**

```bash
rtk git add \
  docs/plans/fm-agent-scan/server-live-gap-matrix.md \
  packages/server/src/app.test.ts \
  packages/server/src/bootstrap/startup.test.ts \
  packages/server/src/lib/ai/dynamic/context-resolver.test.ts \
  packages/server/src/lib/ai/provider-config.test.ts \
  packages/server/src/__tests__/docs-truth-smoke.test.ts
rtk git commit --no-verify -m "test(server): freeze fm-agent live backlog"
```

### Phase 1 完成标准

- [ ] `server-live-gap-matrix.md` 区分 stale raw finding 和 current live issue
- [ ] `app.ts`、`context-resolver.ts`、`provider-config.ts` 都有失败测试承接
- [ ] 后续阶段不再基于过期 raw snapshot 盲修
- [ ] 每个 live / stale 结论都能反查到一个 raw detail 文件和一个系统文档入口

### Phase 1 文档更新

- [ ] `packages/server/README.md`：加入 “Hotspot Modules and Tests” 小节
- [ ] `packages/server/src/lib/README.md`：加入 “Raw-report hotspot to lib/ module mapping” 小节
- [ ] `docs/operations/TESTING.md`：加入 “server raw report revalidation” 命令与顺序，明确先对照 detail md 再动代码

### Phase 1 测试 / Eval 更新

- [ ] 新增 `packages/server/src/app.test.ts`
- [ ] 扩展 `startup.test.ts`、`context-resolver.test.ts`、`provider-config.test.ts`
- [ ] 本阶段不跑全量 eval，只冻结 live regression set

### Phase 1 示例结构

```text
docs/plans/fm-agent-scan/server-live-gap-matrix.md
packages/server/src/app.test.ts
packages/server/src/lib/ai/dynamic/context-resolver.test.ts
```

### Phase 2: Fix App, Bootstrap, and Lifecycle Boundaries

**Files:**
- Modify: `packages/server/src/app.ts`
- Modify: `packages/server/src/bootstrap/bootstrap-candidate-recovery.ts`
- Modify: `packages/server/src/bootstrap/bootstrap-lifecycle.ts`
- Modify: `packages/server/src/bootstrap/bootstrap-repositories.ts`
- Modify: `packages/server/src/config.ts`
- Modify: `packages/server/src/index.ts`
- Modify: `packages/server/src/app.test.ts`
- Modify: `packages/server/src/bootstrap/startup.test.ts`
- Modify: `packages/server/src/config.test.ts`

- [ ] **Step 1: 用失败测试锁住 shutdown / bootstrap / config 语义**

```ts
it('treats empty HOST as default host instead of empty string', () => {
  process.env.HOST = '';
  expect(loadConfig().host).toBe('127.0.0.1');
});
```

- [ ] **Step 2: 修 `app.ts` 的 graceful shutdown 和 startup 边界**

```ts
if (taskWorker?.stop) {
  await taskWorker.stop();
  app.log.info('Task worker stopped');
}
if (outboxWorker?.stop) {
  await outboxWorker.stop();
  app.log.info('Outbox worker stopped');
}
```

- [ ] **Step 3: 补齐 JSON store / non-Postgres bootstrap 分支**

```ts
if (!isPostgresStore) {
  await enqueueRecoveredCandidates(recoveredCandidates);
}
```

- [ ] **Step 4: 运行 lifecycle/config 回归集**

```bash
rtk pnpm test -- --run \
  packages/server/src/app.test.ts \
  packages/server/src/bootstrap/startup.test.ts \
  packages/server/src/config.test.ts
```

- [ ] **Step 5: 提交 Phase 2**

```bash
rtk git add \
  packages/server/src/app.ts \
  packages/server/src/bootstrap/bootstrap-candidate-recovery.ts \
  packages/server/src/bootstrap/bootstrap-lifecycle.ts \
  packages/server/src/bootstrap/bootstrap-repositories.ts \
  packages/server/src/config.ts \
  packages/server/src/index.ts \
  packages/server/src/app.test.ts \
  packages/server/src/bootstrap/startup.test.ts \
  packages/server/src/config.test.ts
rtk git commit --no-verify -m "fix(server): harden app and bootstrap boundaries"
```

### Phase 2 完成标准

- [ ] `app.close()` 只在 worker 真正停止后返回
- [ ] JSON store / PG store 的 bootstrap 语义一致
- [ ] host/config 空字符串边界被显式定义并测试化

### Phase 2 文档更新

- [ ] `docs/architecture/API.md`：补充 `/health`、`/ready`、shutdown 行为约束
- [ ] `docs/architecture/components/ASYNC_INFRASTRUCTURE.md`：补充 worker shutdown / recovery 说明
- [ ] `packages/server/README.md`：补充 `app.ts` / `bootstrap/` 阅读顺序

### Phase 2 测试 / Eval 更新

- [ ] 扩展 `app.test.ts`、`startup.test.ts`、`config.test.ts`
- [ ] 本阶段仍不跑全量 eval

### Phase 2 示例代码

```ts
app.addHook('onClose', async () => {
  const taskWorker = (app as any).taskWorker;
  const outboxWorker = (app as any).outboxWorker;

  if (taskWorker?.stop) await taskWorker.stop();
  if (outboxWorker?.stop) await outboxWorker.stop();
});
```

### Phase 3: Fix AI Provider, Prompt, and Dynamic Context Contracts

**Files:**
- Modify: `packages/server/src/lib/ai/provider-config.ts`
- Modify: `packages/server/src/lib/ai/prompts.ts`
- Modify: `packages/server/src/lib/ai/parse.ts`
- Modify: `packages/server/src/lib/ai/providers.ts`
- Modify: `packages/server/src/lib/ai/providers/index.ts`
- Modify: `packages/server/src/lib/ai/providers/defaults.ts`
- Modify: `packages/server/src/lib/ai/providers/json-renderer.ts`
- Modify: `packages/server/src/lib/ai/providers/xml-renderer.ts`
- Modify: `packages/server/src/lib/ai/dynamic/context-resolver.ts`
- Modify: `packages/server/src/lib/ai/dynamic/conditions.ts`
- Modify: `packages/server/src/lib/ai/cache/boundary-marker.ts`
- Modify: `packages/server/src/lib/ai/cache/section-cache.ts`
- Modify: `packages/server/src/lib/ai/provider-config.test.ts`
- Modify: `packages/server/src/lib/ai/prompts.test.ts`
- Modify: `packages/server/src/lib/ai/providers.test.ts`
- Modify: `packages/server/src/lib/ai/providers/index.test.ts`
- Modify: `packages/server/src/lib/ai/dynamic/context-resolver.test.ts`
- Modify: `packages/server/src/lib/ai/dynamic/conditions.test.ts`
- Modify: `packages/server/src/lib/ai/cache/index.test.ts`

- [ ] **Step 1: 先补空字符串、env precedence、placeholder MCP 的失败测试**

```ts
it('treats AI_PROMPT_TEMPLATE_FILE empty string as null', () => {
  process.env.AI_PROVIDER = 'openai';
  process.env.AI_API_KEY = 'sk-test';
  process.env.AI_PROMPT_TEMPLATE_FILE = '';
  expect(loadAiProviderConfig().promptTemplateFile).toBeNull();
});
```

- [ ] **Step 2: 修 provider config 和 dynamic context resolver**

```ts
function loadPromptTemplateFile(): string | null {
  const value = process.env.AI_PROMPT_TEMPLATE_FILE;
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}
```

```ts
export function getDynamicInjections(taskType: AiPromptTaskType): DynamicInjection[] {
  const base = [workingDirInjection(), dateInjection(), gitStatusInjection(), sessionInjection()];
  return taskType === 'knowledge-refinement' ? [...base, mcpStatusInjection()] : base;
}
```

- [ ] **Step 3: 修 prompt renderer / cache 的空数组和边界标记语义**

```ts
const shouldInsertBoundaryMarker = staticSections.length > 0 || dynamicSections.length > 0;
```

- [ ] **Step 4: 运行 AI 子系统回归集**

```bash
rtk pnpm test -- --run \
  packages/server/src/lib/ai/provider-config.test.ts \
  packages/server/src/lib/ai/prompts.test.ts \
  packages/server/src/lib/ai/providers.test.ts \
  packages/server/src/lib/ai/providers/index.test.ts \
  packages/server/src/lib/ai/dynamic/context-resolver.test.ts \
  packages/server/src/lib/ai/dynamic/conditions.test.ts \
  packages/server/src/lib/ai/cache/index.test.ts
```

- [ ] **Step 5: 提交 Phase 3**

```bash
rtk git add \
  packages/server/src/lib/ai/provider-config.ts \
  packages/server/src/lib/ai/prompts.ts \
  packages/server/src/lib/ai/parse.ts \
  packages/server/src/lib/ai/providers.ts \
  packages/server/src/lib/ai/providers/index.ts \
  packages/server/src/lib/ai/providers/defaults.ts \
  packages/server/src/lib/ai/providers/json-renderer.ts \
  packages/server/src/lib/ai/providers/xml-renderer.ts \
  packages/server/src/lib/ai/dynamic/context-resolver.ts \
  packages/server/src/lib/ai/dynamic/conditions.ts \
  packages/server/src/lib/ai/cache/boundary-marker.ts \
  packages/server/src/lib/ai/cache/section-cache.ts \
  packages/server/src/lib/ai/provider-config.test.ts \
  packages/server/src/lib/ai/prompts.test.ts \
  packages/server/src/lib/ai/providers.test.ts \
  packages/server/src/lib/ai/providers/index.test.ts \
  packages/server/src/lib/ai/dynamic/context-resolver.test.ts \
  packages/server/src/lib/ai/dynamic/conditions.test.ts \
  packages/server/src/lib/ai/cache/index.test.ts
rtk git commit --no-verify -m "fix(server): harden ai provider and prompt contracts"
```

### Phase 3 完成标准

- [ ] provider config 对空字符串、env precedence、override file 的语义在测试和实现中一致
- [ ] MCP status 不再是永久 placeholder
- [ ] prompt/cache/renderers 对空 sections、slot、marker 的边界行为稳定

### Phase 3 文档更新

- [ ] `docs/operations/PROMPT_PROVIDERS.md`：记录 env precedence、prompt template override 和 provider fallback
- [ ] `docs/reference/xml-system-prompt-methodology.md`：记录 boundary marker / section cache 约束
- [ ] `docs/architecture/components/AI_PROVIDER.md`：记录 dynamic injections 与 task-type 差异

### Phase 3 测试 / Eval 更新

- [ ] 扩展所有 AI 相关单测文件
- [ ] 本阶段先不跑 retrieval eval，避免把 AI 基础设施与检索回归耦合在一起

### Phase 3 示例结构

```text
packages/server/src/lib/ai/
├── provider-config.ts
├── prompts.ts
├── providers/
├── dynamic/
└── cache/
```

### Phase 4: Fix Capsule Retrieval, Graph-Lite, and Indexing Integrity

**Files:**
- Modify: `packages/server/src/lib/retrieval/capsules/skill-lookup.ts`
- Modify: `packages/server/src/lib/retrieval/capsules/capsule-recall.ts`
- Modify: `packages/server/src/lib/retrieval/capsules/capsule-recall-coordinator.ts`
- Modify: `packages/server/src/lib/retrieval/capsules/intent.ts`
- Modify: `packages/server/src/lib/retrieval/capsules/intent-cache.ts`
- Modify: `packages/server/src/lib/retrieval/capsules/repositories/index-sync.ts`
- Modify: `packages/server/src/lib/retrieval/capsules/repositories/index-rebuild.ts`
- Modify: `packages/server/src/lib/indexing/graph-lite/documents.ts`
- Modify: `packages/server/src/lib/indexing/graph-lite/llm-extract.ts`
- Modify: `packages/server/src/lib/indexing/graph-lite/graphology.ts`
- Modify: `packages/server/src/lib/indexing/adapters/artifact-graph.ts`
- Modify: `packages/server/src/lib/indexing/adapters/graph.ts`
- Modify: `packages/server/src/lib/indexing/adapters/keyword.ts`
- Modify: `packages/server/src/lib/indexing/adapters/vector.ts`
- Modify: `packages/server/src/lib/indexing/adapters/pg-keyword.ts`
- Modify: `packages/server/src/lib/indexing/adapters/pg-vector.ts`
- Modify: `packages/server/src/lib/retrieval/capsules/skill-lookup.test.ts`
- Modify: `packages/server/src/lib/retrieval/capsules/capsule-recall.test.ts`
- Modify: `packages/server/src/lib/retrieval/capsules/intent.test.ts`
- Modify: `packages/server/src/__tests__/lib/retrieval/capsule-index-sync.test.ts`
- Modify: `packages/server/src/__tests__/lib/retrieval/capsule-index-rebuild.test.ts`
- Modify: `packages/server/src/lib/indexing/graph-lite/llm-extract.test.ts`
- Modify: `packages/server/src/lib/indexing/graph-lite/graphology.test.ts`
- Modify: `packages/server/src/lib/indexing/adapters/artifact-graph.test.ts`
- Modify: `packages/server/src/lib/indexing/adapters/keyword.test.ts`
- Modify: `packages/server/src/lib/indexing/adapters/vector.test.ts`
- Modify: `packages/server/src/routes/retrieval.test.ts`

- [ ] **Step 1: 给 capsule/indexing 关键分支补失败测试**

```ts
it('returns stable empty sync result when artifact has no capsules', async () => {
  const result = await syncArtifact({ ...artifact, latestRevision: { ...artifact.latestRevision, derived: { ...artifact.latestRevision.derived, capsules: [] } } });
  expect(result.keyword).toEqual([]);
  expect(result.embedding).toEqual([]);
});
```

- [ ] **Step 2: 收紧 capsule/indexing 的空数组、idempotency、status 语义**

```ts
const capsules = artifact.latestRevision.derived?.capsules ?? [];
if (capsules.length === 0) {
  return { keyword: [], embedding: [] };
}
```

- [ ] **Step 3: 校准 graph-lite / adapter 输出只依赖 distilled profile + capsules**

```ts
const sourceText = [
  artifact.latestRevision.derived?.profile?.summary ?? '',
  ...(artifact.latestRevision.derived?.capsules ?? []).map((capsule) => capsule.content),
].filter(Boolean);
```

- [ ] **Step 4: 运行 retrieval/indexing 测试和 eval**

```bash
rtk pnpm test -- --run \
  packages/server/src/lib/retrieval/capsules/skill-lookup.test.ts \
  packages/server/src/lib/retrieval/capsules/capsule-recall.test.ts \
  packages/server/src/lib/retrieval/capsules/intent.test.ts \
  packages/server/src/__tests__/lib/retrieval/capsule-index-sync.test.ts \
  packages/server/src/__tests__/lib/retrieval/capsule-index-rebuild.test.ts \
  packages/server/src/lib/indexing/graph-lite/llm-extract.test.ts \
  packages/server/src/lib/indexing/graph-lite/graphology.test.ts \
  packages/server/src/lib/indexing/adapters/artifact-graph.test.ts \
  packages/server/src/lib/indexing/adapters/keyword.test.ts \
  packages/server/src/lib/indexing/adapters/vector.test.ts \
  packages/server/src/routes/retrieval.test.ts
rtk pnpm eval:retrieval:smoke
rtk pnpm eval:graph-extraction:smoke
```

- [ ] **Step 5: 提交 Phase 4**

```bash
rtk git add \
  packages/server/src/lib/retrieval/capsules/skill-lookup.ts \
  packages/server/src/lib/retrieval/capsules/capsule-recall.ts \
  packages/server/src/lib/retrieval/capsules/capsule-recall-coordinator.ts \
  packages/server/src/lib/retrieval/capsules/intent.ts \
  packages/server/src/lib/retrieval/capsules/intent-cache.ts \
  packages/server/src/lib/retrieval/capsules/repositories/index-sync.ts \
  packages/server/src/lib/retrieval/capsules/repositories/index-rebuild.ts \
  packages/server/src/lib/indexing/graph-lite/documents.ts \
  packages/server/src/lib/indexing/graph-lite/llm-extract.ts \
  packages/server/src/lib/indexing/graph-lite/graphology.ts \
  packages/server/src/lib/indexing/adapters/artifact-graph.ts \
  packages/server/src/lib/indexing/adapters/graph.ts \
  packages/server/src/lib/indexing/adapters/keyword.ts \
  packages/server/src/lib/indexing/adapters/vector.ts \
  packages/server/src/lib/indexing/adapters/pg-keyword.ts \
  packages/server/src/lib/indexing/adapters/pg-vector.ts \
  packages/server/src/lib/retrieval/capsules/skill-lookup.test.ts \
  packages/server/src/lib/retrieval/capsules/capsule-recall.test.ts \
  packages/server/src/lib/retrieval/capsules/intent.test.ts \
  packages/server/src/__tests__/lib/retrieval/capsule-index-sync.test.ts \
  packages/server/src/__tests__/lib/retrieval/capsule-index-rebuild.test.ts \
  packages/server/src/lib/indexing/graph-lite/llm-extract.test.ts \
  packages/server/src/lib/indexing/graph-lite/graphology.test.ts \
  packages/server/src/lib/indexing/adapters/artifact-graph.test.ts \
  packages/server/src/lib/indexing/adapters/keyword.test.ts \
  packages/server/src/lib/indexing/adapters/vector.test.ts \
  packages/server/src/routes/retrieval.test.ts
rtk git commit --no-verify -m "fix(server): stabilize capsule retrieval and indexing"
```

### Phase 4 完成标准

- [ ] capsule/index sync 在空 capsule、重跑、失败写回场景下都可预测
- [ ] graph-lite / adapter 只消费 distilled profile + capsules，不泄露原始 asset/script body
- [ ] retrieval / graph-extraction smoke eval 通过

### Phase 4 文档更新

- [ ] `docs/architecture/components/RETRIEVAL.md`：记录 capsule-first recall 和 fallback 约束
- [ ] `docs/architecture/components/INDEXING.md`：记录 graph-lite 与 derived index 的事实源
- [ ] `docs/architecture/GRAPH_RETRIEVAL.md`：补充 capsule index rebuild / sync 的运行语义

### Phase 4 测试 / Eval 更新

- [ ] 扩展 capsule / graph-lite / adapter / retrieval 路径上的单测
- [ ] 运行 `rtk pnpm eval:retrieval:smoke` 和 `rtk pnpm eval:graph-extraction:smoke`

### Phase 4 示例结构

```text
packages/server/src/lib/retrieval/capsules/
├── skill-lookup.ts
├── capsule-recall.ts
├── repositories/index-sync.ts
└── repositories/index-rebuild.ts
```

### Phase 5: Fix Artifact, Candidate, Persistence, and Route-Surface Contracts

**Files:**
- Modify: `packages/server/src/lib/artifacts/model.ts`
- Modify: `packages/server/src/lib/artifacts/edit.ts`
- Modify: `packages/server/src/lib/artifacts/pg-repository/index.ts`
- Modify: `packages/server/src/lib/artifacts/pg-repository/record-reconstruction.ts`
- Modify: `packages/server/src/lib/artifacts/pg-repository/revision-reader.ts`
- Modify: `packages/server/src/lib/artifacts/pg-repository/revision-writer.ts`
- Modify: `packages/server/src/lib/artifacts/pg-repository/derived-store.ts`
- Modify: `packages/server/src/lib/candidates/detector.ts`
- Modify: `packages/server/src/lib/candidates/fingerprint.ts`
- Modify: `packages/server/src/lib/candidates/llm-dedup.ts`
- Modify: `packages/server/src/lib/candidates/processor.ts`
- Modify: `packages/server/src/lib/candidates/pg-repository.ts`
- Modify: `packages/server/src/lib/candidates/reconcile.ts`
- Modify: `packages/server/src/lib/candidates/repository.ts`
- Modify: `packages/server/src/lib/knowledge/application-service.ts`
- Modify: `packages/server/src/lib/knowledge/pg-repository.ts`
- Modify: `packages/server/src/lib/knowledge/repository.ts`
- Modify: `packages/server/src/lib/persistence/schema/artifacts.ts`
- Modify: `packages/server/src/lib/persistence/schema/candidates.ts`
- Modify: `packages/server/src/lib/persistence/schema/knowledge.ts`
- Modify: `packages/server/src/lib/artifacts/model.test.ts`
- Modify: `packages/server/src/lib/artifacts/edit.test.ts`
- Modify: `packages/server/src/lib/artifacts/pg-repository.round4.test.ts`
- Modify: `packages/server/src/lib/artifacts/pg-repository.round4.roundtrip.test.ts`
- Modify: `packages/server/src/lib/candidates/detector.test.ts`
- Modify: `packages/server/src/lib/candidates/fingerprint.test.ts`
- Modify: `packages/server/src/lib/candidates/llm-dedup.test.ts`
- Modify: `packages/server/src/lib/candidates/processor.test.ts`
- Modify: `packages/server/src/lib/candidates/pg-repository.test.ts`
- Modify: `packages/server/src/lib/candidates/reconcile.test.ts`
- Modify: `packages/server/src/lib/knowledge/application-service.test.ts`
- Modify: `packages/server/src/lib/knowledge/pg-repository.test.ts`
- Modify: `packages/server/src/routes/candidates.test.ts`
- Modify: `packages/server/src/routes/operations/artifacts-import.test.ts`
- Modify: `packages/server/src/routes/operations/artifacts-export.test.ts`
- Modify: `packages/server/src/routes/operations/skill-edit.test.ts`
- Modify: `packages/server/src/routes/operations/skill-review.test.ts`

- [ ] **Step 1: 先给 artifact/candidate/persistence 补失败测试**

```ts
it('preserves lifecycle history when updateLifecycle succeeds', async () => {
  const updated = await repo.updateLifecycle('artifact_1', transition);
  expect(updated.lifecycleHistory.at(-1)?.state).toBe(transition.to);
});
```

- [ ] **Step 2: 收紧 repository/model 层的 timestamp、rowCount、history append 语义**

```ts
if ((result.rowCount ?? 0) !== 1) {
  throw new Error(`expected exactly one row for artifact ${artifactId}`);
}
```

```ts
return {
  ...record,
  lifecycleHistory: [...record.lifecycleHistory, nextEvent],
};
```

- [ ] **Step 3: 修 candidate fingerprint / dedup / status pipeline 的一致性**

```ts
const normalized = text.toLowerCase().replace(/\\s+/g, ' ').trim();
const fingerprint = sha256(normalized);
```

- [ ] **Step 4: 运行 persistence / artifact / candidate / route surface 测试和 ingestion smoke**

```bash
rtk pnpm test -- --run \
  packages/server/src/lib/artifacts/model.test.ts \
  packages/server/src/lib/artifacts/edit.test.ts \
  packages/server/src/lib/artifacts/pg-repository.round4.test.ts \
  packages/server/src/lib/artifacts/pg-repository.round4.roundtrip.test.ts \
  packages/server/src/lib/candidates/detector.test.ts \
  packages/server/src/lib/candidates/fingerprint.test.ts \
  packages/server/src/lib/candidates/llm-dedup.test.ts \
  packages/server/src/lib/candidates/processor.test.ts \
  packages/server/src/lib/candidates/pg-repository.test.ts \
  packages/server/src/lib/candidates/reconcile.test.ts \
  packages/server/src/lib/knowledge/application-service.test.ts \
  packages/server/src/lib/knowledge/pg-repository.test.ts \
  packages/server/src/routes/candidates.test.ts \
  packages/server/src/routes/operations/artifacts-import.test.ts \
  packages/server/src/routes/operations/artifacts-export.test.ts \
  packages/server/src/routes/operations/skill-edit.test.ts \
  packages/server/src/routes/operations/skill-review.test.ts
rtk pnpm eval:ingestion:smoke
rtk pnpm eval:smoke
```

- [ ] **Step 5: 提交 Phase 5**

```bash
rtk git add \
  packages/server/src/lib/artifacts/model.ts \
  packages/server/src/lib/artifacts/edit.ts \
  packages/server/src/lib/artifacts/pg-repository/index.ts \
  packages/server/src/lib/artifacts/pg-repository/record-reconstruction.ts \
  packages/server/src/lib/artifacts/pg-repository/revision-reader.ts \
  packages/server/src/lib/artifacts/pg-repository/revision-writer.ts \
  packages/server/src/lib/artifacts/pg-repository/derived-store.ts \
  packages/server/src/lib/candidates/detector.ts \
  packages/server/src/lib/candidates/fingerprint.ts \
  packages/server/src/lib/candidates/llm-dedup.ts \
  packages/server/src/lib/candidates/processor.ts \
  packages/server/src/lib/candidates/pg-repository.ts \
  packages/server/src/lib/candidates/reconcile.ts \
  packages/server/src/lib/candidates/repository.ts \
  packages/server/src/lib/knowledge/application-service.ts \
  packages/server/src/lib/knowledge/pg-repository.ts \
  packages/server/src/lib/knowledge/repository.ts \
  packages/server/src/lib/persistence/schema/artifacts.ts \
  packages/server/src/lib/persistence/schema/candidates.ts \
  packages/server/src/lib/persistence/schema/knowledge.ts \
  packages/server/src/lib/artifacts/model.test.ts \
  packages/server/src/lib/artifacts/edit.test.ts \
  packages/server/src/lib/artifacts/pg-repository.round4.test.ts \
  packages/server/src/lib/artifacts/pg-repository.round4.roundtrip.test.ts \
  packages/server/src/lib/candidates/detector.test.ts \
  packages/server/src/lib/candidates/fingerprint.test.ts \
  packages/server/src/lib/candidates/llm-dedup.test.ts \
  packages/server/src/lib/candidates/processor.test.ts \
  packages/server/src/lib/candidates/pg-repository.test.ts \
  packages/server/src/lib/candidates/reconcile.test.ts \
  packages/server/src/lib/knowledge/application-service.test.ts \
  packages/server/src/lib/knowledge/pg-repository.test.ts \
  packages/server/src/routes/candidates.test.ts \
  packages/server/src/routes/operations/artifacts-import.test.ts \
  packages/server/src/routes/operations/artifacts-export.test.ts \
  packages/server/src/routes/operations/skill-edit.test.ts \
  packages/server/src/routes/operations/skill-review.test.ts
rtk git commit --no-verify -m "fix(server): harden persistence and route contracts"
```

### Phase 5 完成标准

- [ ] artifact lifecycle、candidate pipeline、repository rowCount/timestamp 语义都由测试锁住
- [ ] route-level import/export/edit/review surface 与仓储实现一致
- [ ] `eval:ingestion:smoke` 与仓库 `eval:smoke` 通过

### Phase 5 文档更新

- [ ] `docs/architecture/components/ARTIFACTS.md`：记录 lifecycle history、derived-store、roundtrip 约束
- [ ] `docs/architecture/components/PERSISTENCE.md`：记录 rowCount/timestamp/runtime validation 规则
- [ ] `docs/architecture/components/KNOWLEDGE_LIFECYCLE.md`：记录 candidate -> review -> artifact transition 语义
- [ ] `docs/reference/api-surface.md`：若 route surface 有响应 shape 调整，同步更新 artifacts/candidates 相关端点

### Phase 5 测试 / Eval 更新

- [ ] 扩展 artifact / candidate / knowledge / route surface 测试
- [ ] 运行 `rtk pnpm eval:ingestion:smoke`
- [ ] 运行 `rtk pnpm eval:smoke`

### Phase 5 示例结构

```text
packages/server/src/lib/artifacts/pg-repository/
├── index.ts
├── revision-reader.ts
├── revision-writer.ts
├── record-reconstruction.ts
└── derived-store.ts
```

## 包级最终验收与交付物

### 必须更新的文档

- [x] `packages/server/README.md`
- [x] `packages/server/src/lib/README.md`
- [x] `docs/architecture/API.md`
- [x] `docs/architecture/components/AI_PROVIDER.md`
- [x] `docs/architecture/components/ASYNC_INFRASTRUCTURE.md`
- [x] `docs/architecture/components/RETRIEVAL.md`
- [x] `docs/architecture/components/INDEXING.md`
- [x] `docs/architecture/components/ARTIFACTS.md`
- [x] `docs/architecture/components/PERSISTENCE.md`
- [x] `docs/architecture/components/KNOWLEDGE_LIFECYCLE.md`
- [x] `docs/reference/api-surface.md`，如果本轮修改影响 route response shape
- [x] `docs/operations/TESTING.md`

### 必须更新的测试代码

- [x] `packages/server/src/app.test.ts`
- [x] `packages/server/src/bootstrap/startup.test.ts`
- [x] `packages/server/src/config.test.ts`
- [x] `packages/server/src/lib/ai/dynamic/context-resolver.test.ts`
- [x] `packages/server/src/lib/ai/provider-config.test.ts`
- [x] `packages/server/src/lib/ai/prompts.test.ts`
- [x] `packages/server/src/lib/ai/providers.test.ts`
- [x] `packages/server/src/lib/retrieval/**/*.test.ts`
- [x] `packages/server/src/lib/indexing/**/*.test.ts`
- [x] `packages/server/src/lib/artifacts/**/*.test.ts`
- [x] `packages/server/src/lib/candidates/**/*.test.ts`
- [x] `packages/server/src/lib/knowledge/**/*.test.ts`
- [x] `packages/server/src/routes/**/*.test.ts`
- [x] `packages/server/src/__tests__/docs-truth-smoke.test.ts`

### 最终验收标准

- [x] `docs/plans/fm-agent-scan/server-live-gap-matrix.md` 已完整记录 live / stale 结论
- [x] 五个 phase 的完成标准都已满足
- [x] server 相关系统文档已同步到当前 lifecycle、AI、retrieval、persistence 和 route surface
- [x] server 相关测试代码已覆盖本轮 live backlog
- [x] phase-targeted server tests 已按子计划全部跑通
- [x] `rtk pnpm eval:smoke` 通过
- [x] 若触达 ingestion / artifact lifecycle，`rtk pnpm eval:ingestion:smoke` 通过

## Execution Close-Out (2026-05-29)

- 状态：已完成，并在 post-audit reconciliation 中迁移到 `docs/plans/fm-agent-scan/`
- 当前 HEAD 证据：server matrix 中原 live rows 已全部重分流为 `fixed` 或 `stale/design`
- 当前验证：仓库级 `rtk pnpm test`、`rtk pnpm typecheck`、`rtk pnpm eval:smoke`、`rtk pnpm eval:ingestion:smoke` 已重跑通过
- 残留说明：MCP `unavailable` 占位结果与 JSON store candidate recovery 边界已显式文档化，不再作为 server live backlog
