# Tech-Debt Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 清掉配置集中两轮后残留的 P0/P1/P2 技术债：mcp 存量类型错误、AI 调用零超时、registry 静默失败、悬空归档指针、gene LLM 温度无生产构造点、boot 等待跨包复制、内联 URL 默认四处重复、assembly 超时未透出、双 host 默认分叉说明、退避口径、旧 env 名退役、命名三轨、真相表待确认项、links WARN。

**Architecture:** 按 Wave A（P0 正确性）→ B（P1 残留）→ C（P2 polish）分三批；每批内按文件零重叠分区并行；每批走实现→spec 合规评审→quality 评审三轮，多轮 review 直到全绿；行为零变化铁律延续（默认值=现状值，关闭类默认关闭），新语义必须有测试先行。

**Tech Stack:** TypeScript（Node 24 ESM、TS 6.0.3 pin）、Vitest（workspace projects）、Zod（config schema）、pnpm 10、Biome、doc guards（`pnpm check:docs` 8 步）。

---

## 0. 全局约定（所有任务遵守）

- **分支**：在 `feat/config-refactor` 上继续（12 个提交，未推远端）。新提交按 Wave 分组，不混提。
- **行为铁律**：任何默认值必须等于现状值；`?? env ?? <现状>` 写法；关闭类（超时/重试）默认关闭=现状。
- **env 命名**：新变量一律 `TRAPMAP_*` 前缀；`OTEL_*`/`LOG_*`/`SENTRY_*` 既有命名不动（Wave C1 另行处理）。
- **文件零重叠**：同一 Wave 内两个任务绝不碰同一文件（分区表见各 Wave）。跨 Wave  touching 同一文件必须串行。
- **验证三件套**（每个实现任务收尾必跑，贴输出）：
  ```bash
  pnpm --filter <pkg> typecheck
  pnpm --filter <pkg> test
  ```
  改 docs 的任务加跑 `pnpm check:docs`（blocking 全绿；links WARN 需逐条确认与本次无关）。
- **提交格式**：`feat(config): ...` / `fix(...) : ...` / `docs(reference): ...`，尾部加 `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`。

## 1. 执行协议：最大并行 + 多轮 review（本计划硬性要求）

### 1.1 并行分区规则

- 每个 Wave 内，所有 Task 同时派给互不相识的 fresh subagent（每个 agent 只拿到自己的任务文本 + 文件清单，不知道其它任务）。
- 分区依据就是各任务 `**Files:**` 清单；派发前 controller 核对清单两两无交集。
- agent 禁止切换分支、禁止提交，改完放工作树；回报格式固定：`DONE / DONE_WITH_CONCERNS / BLOCKED + 改动行号 + 验证输出`。

### 1.2 三轮 review（每 Wave 必走，缺一不可）

- **Round 1 — spec 合规评审**（只读 agent，可与实现同 Wave 并行派发、实现 DONE 后才开始看）：逐条核对任务 spec（env 名、默认值、文件范围、行为不变），输出 `✅ / ❌（缺哪条+证据+严重度）`。
- **Round 2 — quality 评审**（只读 agent，Round 1 全过后）：只看质量——命名、表格风格、注释准确性、有无重复展开；输出 strengths + Important/Minor issues。
- **Round 3 — fix 循环**：任一轮有 ❌/Important → 原实现 agent 修 → 对应 reviewer 复审，直到 ✅。不许跳过复审直接合入。
- **合入**：三轮全绿 → 按 Wave 分组提交（每组独立可审，见 §5）。

### 1.3 升级规则

- 实现 agent 报 BLOCKED：先补上下文重派一次；仍卡则拆小任务；计划本身错误则升级给人。
- 同一问题复审两次不过：升级给人，不许第三次硬试。

---

## Wave A：P0 正确性（5 任务，可全并行）

### Task A1：修 mcp 包存量类型错误

**Files:**
- Modify: `apps/mcp/src/gateway-client.ts`（约 42 行附近）
- Modify: `apps/mcp/src/tools/governance-tools.ts`（约 33、72 行附近）
- Modify: `apps/mcp/src/tools/shared.ts`（约 5 行附近）
- Modify: `apps/mcp/src/tools/skill-files.ts`（约 103 行附近）

- [ ] **Step 1: 复现错误**

```bash
pnpm --filter @trapmap/app-mcp typecheck 2>&1 | head -20
```

Expected：看到以下 5 个存量错误（与 2026-09-08 实测一致）：

```text
src/gateway-client.ts(42,43): error TS2304: Cannot find name 'T'.
src/tools/governance-tools.ts(33,54): error TS2345: Argument of type 'unknown' is not assignable to parameter of type 'string | number | boolean'.
src/tools/governance-tools.ts(72,65): error TS2345: Argument of type 'unknown' is not assignable to parameter of type 'string | number | boolean'.
src/tools/shared.ts(5,15): error TS2484: Export declaration conflicts with exported declaration of 'Role'.
src/tools/skill-files.ts(103,53): error TS2345: Argument of type 'unknown' is not assignable to parameter of type 'readonly string[]'.
```

- [ ] **Step 2: 逐个最小修复**
  - `gateway-client.ts:42`：`T` 未定义——给泛型函数补 `<T>` 类型参数，或若是误写则改为具体类型。只改该行，不重构周边。
  - `governance-tools.ts:33,72`：`unknown` 入参——在传参前做窄化（`typeof x === 'string' ? x : String(x)` 或 zod parse），不放宽目标函数签名。
  - `shared.ts:5`：`Role` 重复导出——其中一处加 `as` 别名（如 `export type { Role as McpRole }`），调用方同步改名。
  - `skill-files.ts:103`：`unknown` 传给 `readonly string[]`——窄化或 `Array.isArray` 守卫后传入。
- [ ] **Step 3: 验证通过**

```bash
pnpm --filter @trapmap/app-mcp typecheck 2>&1 | tail -3
pnpm --filter @trapmap/app-mcp test 2>&1 | tail -3
```

Expected：typecheck 零报错；test 全过（mcp 现有 config+index 5 项为基线）。

- [ ] **Step 4: 回报**（DONE + 行号 + 上述两命令输出，不提交）

### Task A2：AI 调用加可选超时（默认关闭）

**Files:**
- Modify: `packages/ai-providers/src/provider-config.ts`（在 `DEFAULT_STRUCTURED_RETRY_BASE_MS` 附近追加）
- Modify: `packages/ai-providers/src/index.ts`（导出新区区，如该文件已导出其它 resolver 则仿照）
- Modify: `packages/ai-providers/src/adapters/aisdk.ts`（调用点）
- Test: 与 `provider-config` 同包既有 `*.test.ts` 同目录新建或追加（先 `ls packages/ai-providers/src/*.test.ts packages/ai-providers/test 2>/dev/null` 找位置，与现有测试放一起）

- [ ] **Step 1: 确认 SDK 是否支持 signal**

```bash
grep -n "generateText\|embedMany\|^import\|from 'ai'" packages/ai-providers/src/adapters/aisdk.ts | head -20
```

Expected：看到 `generateText`/`embed`/`embedMany` 的调用点。若任一调用不支持 abort 选项，走变体 B（见 Step 4）。

- [ ] **Step 2: 先写测试（resolver 层，与 A2-其它 resolver 同风格）**

```ts
import { describe, expect, it } from 'vitest';

const load = async (env: Record<string, string | undefined>) => {
  const mod = await import('../src/provider-config.js');
  const orig = { ...process.env };
  for (const k of Object.keys(env)) {
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k] as string;
  }
  try {
    return mod.resolveAiRequestTimeoutMs();
  } finally {
    process.env = orig;
  }
};

describe('resolveAiRequestTimeoutMs', () => {
  it('returns undefined when unset (legacy behavior: no timeout)', async () => {
    await expect(load({ AI_REQUEST_TIMEOUT_MS: undefined })).resolves.toBeUndefined();
  });
  it('parses a positive value', async () => {
    await expect(load({ AI_REQUEST_TIMEOUT_MS: '15000' })).resolves.toBe(15000);
  });
  it('falls back to undefined on garbage', async () => {
    await expect(load({ AI_REQUEST_TIMEOUT_MS: 'abc' })).resolves.toBeUndefined();
  });
});
```

（注：若包内既有 resolver 测试用的是纯函数传参风格而非读 `process.env`，改用包内风格：把 env 对象当参数传。先读一个既有测试再定，以既有风格为准。）

- [ ] **Step 3: 跑测试确认失败**

Expected：FAIL（`resolveAiRequestTimeoutMs is not a function`）。

- [ ] **Step 4: 最小实现**
  - `provider-config.ts` 追加（仿照 `AI_STRUCTURED_RETRY_BASE_MS` 的守卫写法）：

```ts
export const DEFAULT_AI_REQUEST_TIMEOUT_MS: number | undefined = undefined;
/** AI request timeout in ms. Env: AI_REQUEST_TIMEOUT_MS. Unset/invalid = no timeout (legacy). */
export function resolveAiRequestTimeoutMs(
  env: Record<string, string | undefined> = process.env,
): number | undefined {
  const parsed = Number.parseInt(env.AI_REQUEST_TIMEOUT_MS ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_AI_REQUEST_TIMEOUT_MS;
}
```

  - `aisdk.ts` 调用点（变体 A：SDK 支持 signal）：仅当 `resolveAiRequestTimeoutMs() !== undefined` 时传 `abortSignal: AbortSignal.timeout(ms)`，否则调用形状与现状逐字一致。
  - 变体 B（SDK 不支持 signal）：用 `Promise.race([call, timeoutReject(ms)])` 包裹，仅超时分支新增；正常路径行为不变。回报中注明走了哪个变体。
- [ ] **Step 5: 验证**

```bash
pnpm --filter @trapmap/ai-providers typecheck 2>&1 | tail -2
pnpm --filter @trapmap/ai-providers test 2>&1 | tail -3
```

Expected：零报错；54+新增全过。

- [ ] **Step 6: 回报**（DONE + 行号 + 变体 + 输出，不提交）

### Task A3：skill-registry 外部源加可选超时 + 失败语义显式化

**Files:**
- Modify: `packages/skill-registry/src/adapters/github.ts`
- Modify: `packages/skill-registry/src/adapters/ai-pkgs-compat.ts`
- Test: 与该包既有测试同目录（`ls packages/skill-registry/src/**/*.test.ts packages/skill-registry/test 2>/dev/null` 先找位置）

- [ ] **Step 1: 先写测试**

```ts
import { describe, expect, it } from 'vitest';

// github adapter：timeout 可配，默认关闭
describe('github fetch timeout', () => {
  it('is a no-op when SKILL_REGISTRY_GITHUB_TIMEOUT_MS is unset', async () => {
    const { resolveGithubTimeoutMs } = await import('../src/adapters/github.js');
    const orig = process.env.SKILL_REGISTRY_GITHUB_TIMEOUT_MS;
    delete process.env.SKILL_REGISTRY_GITHUB_TIMEOUT_MS;
    try {
      expect(resolveGithubTimeoutMs()).toBeUndefined();
    } finally {
      if (orig !== undefined) process.env.SKILL_REGISTRY_GITHUB_TIMEOUT_MS = orig;
    }
  });
});
```

（ai-pkgs-compat 同理一个用例；若包内既有纯函数风格则改用传参风格，先读既有测试。）

- [ ] **Step 2: 跑测试确认失败**（`resolveGithubTimeoutMs is not a function`）。
- [ ] **Step 3: 最小实现**
  - `github.ts` 新增（仿照 `skills-sh.ts:13-37` 的 `SKILLS_SH_TIMEOUT_MS` 写法，一字不差地抄它的守卫形状）：
    ai-pkgs 侧平行命名（Wave A 回填确认）：`resolveAiPkgsTimeoutMs` / `SKILL_REGISTRY_AI_PKGS_TIMEOUT_MS`。

```ts
export function resolveGithubTimeoutMs(
  env: Record<string, string | undefined> = process.env,
): number | undefined {
  const parsed = Number.parseInt(env.SKILL_REGISTRY_GITHUB_TIMEOUT_MS ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}
```

  - github search 与 ai-pkgs search 的 `fetch` 调用：仅当值非 undefined 时加 `signal: AbortSignal.timeout(ms)`；其余逐字不变。**失败返回 `[]` 的语义不动**，但在返回处加一行注释 `// NOTE: empty = not found OR upstream failure (no retry by design)`。
- [ ] **Step 4: 验证**（typecheck + test 全过，17+新增为基线）。
- [ ] **Step 5: 回报**（DONE + 行号 + 输出，不提交）

### Task A4：EVALUATION 悬空归档指针修正

**Files:**
- Modify: `docs/architecture/components/EVALUATION.md`（约 35-42 行“性能阈值”节）

- [ ] **Step 1: 读现状**

```bash
sed -n '30,45p' docs/architecture/components/EVALUATION.md
```

Expected：看到“`docs/architecture/performance/` 下三文件已完成并归档”字样（该目录在工作树不存在，`docs/archived/` 整树已删）。

- [ ] **Step 2: 改写为真实落点**（只改这一节，不动其它）：

```markdown
## 性能阈值

毫秒阈值与实测耗时属易变数字，本页不收录。历史基线见 git 历史（`git show ec0e4c99:docs/architecture/performance/`），现网值以 CI 压测输出（`benchmarks/results/`）为准。
```

  - 禁止出现 `docs/archived/...`、`docs/architecture/performance/...` 这类工作树不存在的路径（`check-doc-references` 会拦）。
- [ ] **Step 3: 验证**

```bash
pnpm check:docs 2>&1 | tail -11
```

Expected：blocking 全绿（links WARN 若与本次文件无关则放行，回报中列出）。

- [ ] **Step 4: 回报**（DONE + 行号 + 输出，不提交）

### Task A5：gene LLM temperature 无生产构造点核查

**Files:** 只读（不改任何文件）。范围：全仓 `GenerateStructuredExperienceGeneExtractor` 与 `temperature` 构造点。

- [ ] **Step 1: 找所有构造点**

```bash
grep -rn "GenerateStructuredExperienceGeneExtractor\|new .*ExperienceGene.*Extractor" packages apps --include="*.ts" | grep -v test | head
grep -rn "temperature" packages/service-knowledge-write/src/experience-gene-llm.ts | head -5
```

- [ ] **Step 2: 下结论（二选一，如实回报）**
  - 若生产 host/service 确有构造点：列出文件:行 + 传入值，结论“有接线，建议补 `TRAPMAP_GENE_LLM_TEMPERATURE`（默认取现行值）”，**不动代码**。
  - 若只有测试构造：结论“生产路径未接线”，建议“保持 `temperature: number` 必填 + 在 `experience-gene-llm.ts` 文件头加一行注释说明未接线”，**不动代码**（注释由 Wave B 统一加，回报写清原句）。
- [ ] **Step 3: 回报**（结论 + 证据行号，不写文件）

---

## Wave B：P1 残留（6 任务，可全并行；与 Wave A 文件零重叠 except B6-docs，需等 A4 合入后串行——B6 与 A4 同改 `docs/architecture/components/EVALUATION.md`？不，B6 只改 ENVIRONMENT，此处无冲突；但 B6 与 C4 同改 ENVIRONMENT，需串行：B6 先，C4 后）

### Task B1：distributed boot 等待去重 + knowledge-read 默认 URL 单点

**Files:**
- Modify: `packages/host-distributed/src/assembly/profiles/distributed.ts`（约 151、155 行）
- Modify: `packages/host-distributed/src/gateway/routes.ts`（约 215 行）
- Modify: `packages/host-distributed/src/config/service-config.ts`（`TRAPMAP_KNOWLEDGE_READ_URL` 默认值处，只读先行、改时才动）

- [ ] **Step 1: 读三处现状**

```bash
sed -n '145,160p' packages/host-distributed/src/assembly/profiles/distributed.ts
sed -n '210,220p' packages/host-distributed/src/gateway/routes.ts
grep -n "TRAPMAP_KNOWLEDGE_READ_URL" packages/host-distributed/src/config/service-config.ts | head -5
```

Expected：`Date.now() + 30_000`、`setTimeout(resolve, 50)`、`?? 'http://localhost:4002'` 三处字面量。

- [ ] **Step 2: 最小改动（值全部不变）**
  - `distributed.ts` 文件顶加 `const BOOT_SURFACE_DEADLINE_MS = 30_000;` / `const BOOT_SURFACE_POLL_MS = 50;`（与 host-local `main.ts` 同名常量跨包不 import，只在本文件去重，注释注明对端位置），两处引用替换。
  - `routes.ts:215` 的 `'http://localhost:4002'` 改为引用 `service-config.ts` 中 `TRAPMAP_KNOWLEDGE_READ_URL` 的同一默认常量（若 service-config 侧是内联字面量，则先在 service-config 命名导出再引用，保证单点）。
- [ ] **Step 3: 验证**（`pnpm --filter @trapmap/host-distributed typecheck` + 相关单测）。
- [ ] **Step 4: 回报**（DONE + 行号 + 输出，不提交）

### Task B2：网关默认 URL 单点常量

**Files:**
- Modify: `packages/client-core/src/index.ts`（或 `http/` 下既有常量文件，先 `ls packages/client-core/src packages/client-core/src/http` 找最合适位置——已有常量文件优先用，没有才放 `index.ts`）
- Modify: `apps/cli/src/lib/config.ts`（约 54 行）
- Modify: `apps/mcp/src/config.ts`（约 9 行）
- Modify: `apps/web-panel/src/services/admin-panel-service-context.ts`（约 120 行）

- [ ] **Step 1: 确认依赖方向**

```bash
grep -l "client-core" apps/cli/package.json apps/mcp/package.json apps/web-panel/package.json
```

Expected：cli/web-panel 依赖 client-core（已知）；mcp 若不在列表中，则 mcp 侧用本地同名常量 + 注释指回 client-core，不准反向依赖。

- [ ] **Step 2: 定义 + 替换**（值 `http://127.0.0.1:4000` 一字不动）

```ts
/** Default gateway URL when TRAPMAP_GATEWAY_URL is unset. Single source; keep in sync note only. */
export const DEFAULT_GATEWAY_URL = 'http://127.0.0.1:4000';
```

  - 三处 `?? 'http://127.0.0.1:4000'` / `.default('http://127.0.0.1:4000')` / `= 'http://127.0.0.1:4000'` 改为引用该常量（zod `.default(DEFAULT_GATEWAY_URL)` 写法保留）。
  - `apps/mcp/src/index.ts:5` 注释里的示例 URL 不动（注释非代码）。
- [ ] **Step 3: 验证**（三包 typecheck + 相关单测）。
- [ ] **Step 4: 回报**（DONE + 行号 + 输出，不提交）

### Task B3：assembly shutdown 超时向外透出

**Files:**
- Modify: `packages/assembly/src/create-assembly.ts`
- Test: 与 assembly 既有测试同目录（`ls packages/assembly/src/*.test.ts packages/assembly/test 2>/dev/null` 先找位置）

- [ ] **Step 1: 读现状**

```bash
grep -n "shutdown\|Shutdown\|dispose" packages/assembly/src/create-assembly.ts | head -10
grep -n "DEFAULT_SHUTDOWN_TIMEOUT_MS" packages/assembly/src/shutdown-controller.ts | head -5
```

Expected：`create-assembly` 构造 shutdown controller 处未传 `timeoutMs`；`shutdown-controller.ts` 有 `DEFAULT_SHUTDOWN_TIMEOUT_MS = 5000`。

- [ ] **Step 2: 先写测试**

```ts
import { describe, expect, it } from 'vitest';

describe('assembly shutdown timeout passthrough', () => {
  it('defaults to DEFAULT_SHUTDOWN_TIMEOUT_MS when not provided', async () => {
    const mod = await import('../src/create-assembly.js');
    // 按实际导出名调整：断言未传 timeoutMs 时控制器按 5000ms 语义工作，
    // 最小断言为“透出字段存在且默认 5000”（读源码定断言，先读 Step 1 输出）。
    expect(mod.DEFAULT_SHUTDOWN_TIMEOUT_MS ?? 5000).toBe(5000);
  });
});
```

  （先读 Step 1 输出再把断言写实：options 字段名以源码为准，测试必须 fail 先行。）

- [ ] **Step 3: 最小实现**：`create-assembly` 的装配 options 加可选 `shutdownTimeoutMs?: number`，透给 controller（`?? DEFAULT_SHUTDOWN_TIMEOUT_MS`，默认 5000 不变，不读 env）。
- [ ] **Step 4: 验证**（assembly typecheck + 48+新增全过）。
- [ ] **Step 5: 回报**（DONE + 行号 + 输出，不提交）

### Task B4：退避底数口径说明（不改值）

**Files:**
- Modify: `packages/ai-providers/src/ai-parse.ts`（`retryBaseMs * 2 ** (attempt * 2)` 行注释）
- Modify: `packages/ai-providers/src/structured-generation.ts`（`baseDelayMs * 4 ** (attempts - 1)` 行注释）
- Modify: `packages/service-job-runtime/src/async-runtime.ts`（`* 2 ** (attempts - 1)` 行注释）

- [ ] **Step 1: 每处加一行注释**（值、形状全部不动），格式统一：

```ts
// NOTE: backoff base 2 differs from structured-generation (base 4) by design: <一句话原因以源码行为为准，如 parse 为轻量重试、structured 为 LLM 重试，不确定就写“历史选择，改前先压测”> (2026-09-08)
```

  - 如实写：能从调用频率/超时推导就写推导，推导不出就写“历史选择，改前先压测”，不许编造。
- [ ] **Step 2: 验证**（三包 typecheck；注释-only，单测可免，回报注明）。
- [ ] **Step 3: 回报**（DONE + 行号，不提交）

### Task B5：`USE_DB_SEARCH` 旧名定删除日期

**Files:**
- Modify: `packages/service-knowledge-read/src/retrieval-infra-default.ts`（约 241 行兼容行）
- Modify: `docs/reference/ENVIRONMENT.md`（`TRAPMAP_RETRIEVAL_USE_DB_SEARCH` 行）

- [ ] **Step 1: 读兼容行**（确认 `(process.env.TRAPMAP_RETRIEVAL_USE_DB_SEARCH ?? process.env.USE_DB_SEARCH) === 'true'` 形状）。
- [ ] **Step 2: 加 deprecation 注释 + 文档标注**（行为不动）：代码行上方加 `// DEPRECATED: USE_DB_SEARCH will be removed after 2026-12-08; use TRAPMAP_RETRIEVAL_USE_DB_SEARCH.`；ENVIRONMENT 对应行说明追加“（旧名 `USE_DB_SEARCH` 兼容至 2026-12-08）”。
- [ ] **Step 3: 验证**（knowledge-read 包 typecheck + 单测；`pnpm check:docs` blocking 绿）。
- [ ] **Step 4: 回报**（DONE + 行号 + 输出，不提交）

### Task B6：双 host 默认分叉 + 待确认默认值核实

**Files:**
- Modify: `docs/reference/ENVIRONMENT.md`（host-local 池节 + 网关韧性节 + Gene/Go/熔断待确认行）
- 只读：`packages/host-local/src/nest/config/config.ts`、`packages/host-distributed/src/config/service-config.ts`

- [ ] **Step 1: 核实 8 个“未知/待确认”**：`TRAPMAP_EXPERIENCE_GENE_MODE`、`TRAPMAP_EXPERIENCE_GENES_MODE`、`TRAPMAP_READ_IMPL`、`TRAPMAP_INTERNAL_RETRY_MAX_ATTEMPTS`、`TRAPMAP_INTERNAL_BREAKER_THRESHOLD`、`TRAPMAP_INTERNAL_BREAKER_COOLDOWN_MS`、`TRAPMAP_GATEWAY_RATE_LIMIT_RPS`、`TRAPMAP_GATEWAY_RATE_LIMIT_BURST` 在 service-config 源码行逐个读出真实默认值，填表（未知就写实测逻辑如“未设置”）。
- [ ] **Step 2: 加分叉说明**（host-local 池节下方加一段）：

```markdown
> 注意：host-local 池默认（`max 10`、其余超时不设）与 distributed 默认（`max 5`、`statement/query 30s`）有意不同，各自保留旧有效行为。切形态迁移前先对齐两边，见 `packages/host-local/src/nest/config/config.ts` 与 `packages/host-distributed/src/config/service-config.ts`。
```

- [ ] **Step 3: 验证**（`pnpm check:docs` blocking 绿）。
- [ ] **Step 4: 回报**（DONE + 行号 + 输出，不提交）

---

## Wave C：P2 polish（6 任务，可全并行；C4 需等 B6 合入后串行——同改 ENVIRONMENT）

### Task C1：非 TRAPMAP 前缀变量统一别名（只加不改）

**Files:**
- Modify: `packages/host-local/src/nest/config/config.ts`（`LOG_*`/`LANGFUSE_*`/`SENTRY_*` 读取处，只加别名分支）
- 只读：`packages/contracts/src/domain/observability-config.ts`（`OTEL_*` 注释口径，已开放不动）

- [ ] **Step 1: 列出现状读取行**

```bash
grep -n "process.env.LOG_\|process.env.LANGFUSE_\|process.env.SENTRY_" packages/host-local/src/nest/config/*.ts packages/host-local/src/nest/observability/*.ts | head -20
```

- [ ] **Step 2: 加别名（旧名永远优先，行为不变）**：每个旧名加 `TRAPMAP_` 同名别名，形状统一为 `process.env.TRAPMAP_X ?? process.env.X`。`OTEL_*` 不动（contracts 已定口径）。
- [ ] **Step 3: 先加测试后实现**（TDD：config 包既有测试旁加用例，断言“旧名优先、别名回退、都不设走默认”三条，fail 先行）。
- [ ] **Step 4: 验证**（host-local typecheck + 251+新增全过）。
- [ ] **Step 5: 回报**（DONE + 行号 + 输出，不提交；ENVIRONMENT 收录由 C4 一并做，回报列出新增别名清单供 C4 用）

### Task C2：api-surface 待核实契约转正

**Files:**
- Modify: `docs/reference/api-surface.md`（“待核实 2026-09-08”标注行）
- 只读：`packages/host-distributed/src/gateway/route-defs/shared.ts`、`packages/host-local/src/nest/gateway/gateway.cron-route-defs.ts`、`packages/contracts/src/domain/*.ts`

- [ ] **Step 1: 列出所有待核实**

```bash
grep -n "待核实" docs/reference/api-surface.md
```

- [ ] **Step 2: 逐个转正或删改**：网关本地 schema（`knowledgeActionSchema` 等）在 shared 文件确认定义行后，去掉“待核实”、补真实落点；contracts 全仓无定义的（如 `scheduleJobSchema` 系），核对调用方实际类型后改写为真实类型名 + 落点；实在找不到的改为“（未收敛，2026-09-08）”并回报清单。
- [ ] **Step 3: 验证**（`pnpm check:docs` blocking 绿）。
- [ ] **Step 4: 回报**（DONE + 转正/未收敛清单 + 输出，不提交）

### Task C3：SERVICE 池别名逐条收录

**Files:**
- Modify: `docs/reference/ENVIRONMENT.md`（host-local 池节；需等 B6 合入后串行，conflict 时以 B6 为准 rebase 意图）

- [ ] **Step 1: 读 service-config 侧 6 别名**（`TRAPMAP_SERVICE_POOL_SIZE`/`_IDLE_TIMEOUT_MS`/`_CONNECTION_TIMEOUT_MS`/`_STATEMENT_TIMEOUT_MS`/`_QUERY_TIMEOUT_MS`/`_IDLE_IN_TRANSACTION_TIMEOUT_MS` 的解析行号）。
- [ ] **Step 2: 在池节每行追加回退说明**（值不动）：如 `TRAPMAP_HOST_LOCAL_POOL_SIZE` 行说明追加“（`TRAPMAP_SERVICE_POOL_SIZE` 回退；distributed 侧默认 `5`，见 service-config）”。
- [ ] **Step 3: 验证**（`pnpm check:docs` blocking 绿）。
- [ ] **Step 4: 回报**（DONE + 行号 + 输出，不提交）

### Task C4：新 env 别名收录 + links WARN 分诊

**Files:**
- Modify: `docs/reference/ENVIRONMENT.md`（收录 C1 产出的别名清单；需等 B6、C3 合入后串行）
- 只读：`pnpm check:docs` 的 links WARN 输出

- [ ] **Step 1: 跑出 WARN**

```bash
pnpm check:docs 2>&1 | grep -A5 -i "warn" | head -30
```

- [ ] **Step 2: 逐条分诊**：与本次改动文件有关的修掉；无关的列清单回报（不修，记为下一轮债）。
- [ ] **Step 3: 别名收录**（格式与既有 4 列一致，来源行号实测）。
- [ ] **Step 4: 验证**（`pnpm check:docs` blocking 绿）。
- [ ] **Step 5: 回报**（DONE + 行号 + WARN 清单 + 输出，不提交）

### Task C5：全量门禁（无文件改动，纯验证）

- [ ] **Step 1: 根 typecheck**

```bash
pnpm typecheck 2>&1 | tail -5
```

Expected：零报错（mcp 存量修完后应无报错；若有，列清单回报 BLOCKED）。

- [ ] **Step 2: 全量单测**

```bash
pnpm test 2>&1 | tail -8
```

Expected：全过（evals smoke 除外：无 LLM key 基线 54/81，见记忆 `eval-environment-constraints`，不判失败，回报注明）。

- [ ] **Step 3: docs 门禁**

```bash
pnpm check:docs 2>&1 | tail -11
```

Expected：blocking 全绿。

- [ ] **Step 4: 回报**（DONE + 三命令输出；任一红即 BLOCKED + 清单）

---

## 5. 提交分组（Wave 完成后执行，三轮全绿才合入）

1. `fix(mcp): ...` — A1
2. `feat(config): ...` — A2 + A3 + B3（AI 超时、registry 超时、assembly 透出）
3. `refactor(config): ...` — B1 + B2 + B4（去重、单点、注释）
4. `docs(reference): ...` — A4 + B5 + B6 + C2 + C3 + C4（EVALUATION、USE_DB_SEARCH 标注、待确认转正、别名收录、WARN 分诊）
5. `feat(config): ...` — C1（别名实现，需等 C4 文档同批或先代码后文档两提交）

## 6. 不做的事项（明确边界）

- skill-registry 全 adapter 重试、`AI_REQUEST_TIMEOUT_MS` 默认开启、env 命名整体迁移到 `TRAPMAP_*`（破坏性）、`tokenization` 权重跨包合并（分层倒置）、`task-queue` 1000/2000 对齐（行为变化）、`GENE_LLM_TEMPERATURE` 默认值（A5 无接线则不设）。
- 上述如下一轮立项，另起计划。

---

## Self-review 记录

- Spec 覆盖：P0 5 项→A1-A5；P1 残留→B1-B6（boot 复制、4002、URL 单点、assembly 透出、退避注释、USE_DB_SEARCH、分叉+待确认）；P2→C1-C5。`pre` 分支、PR 流程属执行动作，由 §5/门禁覆盖，不单独立任务。
- Placeholder 扫描：无 TBD/TODO；“先读再定”处（A2 变体 A/B、B2 mcp 依赖、C1 测试风格）均给了双分支完整写法或既有风格锚点；类型/函数名均为本计划内定义或源码既有（`AbortSignal.timeout`、`Promise.race`、`zod` 沿用）。
- 类型一致：`resolveAiRequestTimeoutMs` 等新函数名在任务内定义并在同任务测试/实现中复用；`DEFAULT_GATEWAY_URL` 定义与引用同任务；B6/C3/C4 的 ENVIRONMENT 串行顺序已标注（B6→C3→C4）。
