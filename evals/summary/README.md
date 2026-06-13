# 摘要评测

本目录包含 TrapMap 检索端点的摘要评测系统。

摘要评测使用基于法官验证的方式，对检索上下文中 LLM 生成摘要的质量进行评分。

## 快速开始

从根目录的 pnpm 脚本运行摘要评测：

```bash
# 运行 smoke 层级评测
pnpm eval:summary:smoke

# 运行 core 层级评测
pnpm eval:summary:core

# 空跑（验证布局，不执行）
pnpm eval:summary:dry-run

# 带选项运行
pnpm eval:summary --tier smoke --endpoint /v2/retrieval/search

# 以 JSON 输出运行
pnpm eval:summary --tier core --json --json-path ./reports/summary.json

# 使用特定法官提供商
pnpm eval:summary --tier smoke --provider fallback

# 从 badcase trace 导出 draft（当前统一先导出 retrieval-shaped draft）
pnpm exec tsx scripts/export-badcase-to-eval.ts feedback_example ./reports/badcase-draft.json
```

## 摘要评测概念

摘要评测衡量 LLM 生成摘要的三个关键方面：

### 可 grounding 性（Groundedness）

摘要中的声明被检索上下文支持的比例。

- **高 groundedness** 表示摘要准确反映源材料
- **低 groundedness** 表示存在幻觉或捏造
- **阈值**：默认最低为 0.8（80% 的声明必须被支持）

示例：
```
摘要："Docker Compose 是用于定义多容器 Docker 应用程序的工具。"
上下文：["Docker Compose 允许你定义和运行多容器 Docker 应用程序..."]
结果：可 grounding（声明被上下文支持）
```

### 覆盖率（Coverage）

摘要中出现的必需事实的比例。

- **高覆盖率** 表示摘要包含必要信息
- **低覆盖率** 表示遗漏了重要细节
- **阈值**：默认最低为 0.7（70% 的必需事实必须出现）

示例：
```typescript
expected: {
  requiredFacts: ['docker-compose', 'multi-container'],
  // 摘要必须提及这两个概念
}
```

### 禁止声明（Forbidden Claims）

摘要中不得出现的声明（幻觉检测）。

- **零禁止声明** 是目标
- **发现任何禁止声明** 触发失败
- 用于检测敏感信息泄漏或捏造

示例：
```typescript
expected: {
  forbiddenClaims: ['kubernetes', 'production credentials', 'API token'],
  // 摘要不得提及这些术语
}
```

## 用例结构

每个摘要评测用例定义：

```typescript
import { summaryEvalCaseSchema, type SummaryEvalCase } from '@trapmap/contracts';

export const myCase = summaryEvalCaseSchema.parse({
  schemaVersion: 1,
  caseId: 'unique-case-id',
  tier: 'smoke', // 或 'core'
  endpoint: '/v2/retrieval/search', // 或 '/v1/retrieval/search'
  request: {
    seed: 'search query',
    maxResults: 10,
  },
  scenarioId: 'scenario-for-fixtures',
  expected: {
    requiredFacts: ['fact 1', 'fact 2'],  // 必须出现在摘要中
    forbiddenClaims: ['forbidden term'],  // 不得出现
    minGroundedness: 0.8,  // 最低 groundedness 分数
    minCoverage: 0.7,      // 最低覆盖率分数
    expectSummary: true,   // 是否期望摘要
  },
  tags: ['tag1', 'tag2'],
}) as SummaryEvalCase;
```

## 法官提供商

摘要评测使用法官来验证声明与上下文的一致性。

### Fallback 法官（默认）

- 确定性的、基于规则的验证
- 无外部 API 调用
- 适合 CI 和本地开发
- 不够复杂但可靠

```bash
pnpm eval:summary --provider fallback
```

### OpenAI 法官

- 使用 OpenAI 模型进行基于 LLM 的验证
- 更复杂的声明提取和验证
- 需要 `OPENAI_API_KEY` 环境变量
- 更适合彻底评测

```bash
export OPENAI_API_KEY=your-key
pnpm eval:summary --provider openai
```

## 层级组织

### Smoke 层级

快速反馈，最小覆盖。证明评测管道连接正确。

| 用例 ID | 端点 | 重点 |
|---------|------|------|
| `summary-grounded-smoke` | `/v2/retrieval/search` | Groundedness 验证 |
| `summary-hallucination-smoke` | `/v2/retrieval/search` | 幻觉检测 |
| `summary-forbidden-claims-smoke` | `/v2/retrieval/search` | 禁止声明检测 |

### Core 层级

更广泛的覆盖，用于回归检测。

| 用例 ID | 端点 | 重点 |
|---------|------|------|
| `summary-core-mixed-grounded` | `/v2/retrieval/search` | 混合 groundedness 验证 |
| `summary-core-multi-fact-coverage` | `/v2/retrieval/search` | 多事实覆盖率 |
| `summary-core-governance-boundary` | `/v2/retrieval/search` | 治理边界执行 |
| `summary-core-empty-result` | `/v2/retrieval/search` | 空结果处理 |

## 添加用例

1. **在用例文件目录中创建用例文件** `evals/summary/datasets/`：

```typescript
// evals/summary/datasets/smoke/my-new-case.ts
import { summaryEvalCaseSchema, type SummaryEvalCase } from '@trapmap/contracts';

export const myNewCase = summaryEvalCaseSchema.parse({
  schemaVersion: 1,
  caseId: 'my-new-case',
  tier: 'smoke',
  endpoint: '/v2/retrieval/search',
  request: { seed: 'my query', maxResults: 10 },
  scenarioId: 'my-scenario',
  expected: {
    requiredFacts: ['expected fact'],
    forbiddenClaims: ['forbidden claim'],
    minGroundedness: 0.8,
    minCoverage: 0.7,
    expectSummary: true,
  },
}) as SummaryEvalCase;
```

2. **在层级文件中导出**（`evals/summary/smoke.ts` 或 `evals/summary/core.ts`）：

```typescript
import { myNewCase } from './datasets/smoke/my-new-case.js';

export const summarySmokeCases: SummaryEvalCase[] = [
  // ... 已有用例
  myNewCase,
];
```

3. **如需要，在** `evals/summary/scenarios/` **中添加场景**。

4. **用空跑验证**：

```bash
pnpm eval:summary:dry-run
```

## 运行器选项

| 选项 | 描述 | 默认值 |
|------|------|--------|
| `--tier` | 评测层级：`smoke` 或 `core` | `smoke` |
| `--endpoint` | 按端点过滤 | 所有端点 |
| `--dry-run` | 验证而不执行 | `false` |
| `--allow-empty` | 未找到用例时成功退出 | `false` |
| `--json` | 输出 JSON 报告 | `false` |
| `--json-path` | 将 JSON 写入文件 | stdout |
| `--verbose` | 启用详细输出 | `false` |
| `--provider` | 法官提供商：`openai` 或 `fallback` | `fallback` |

## 输出格式

### 终端输出

```
=== 摘要评测报告 ===
时间戳：2026-04-21T...
耗时：150ms
LLM 提供商：fallback
层级：smoke

=== 摘要 ===
总计用例：3
通过：2
失败：1
通过率：66.7%
平均 Groundedness：0.85
平均覆盖率：0.72
禁止声明命中：0

=== 用例结果 ===
  ✓ summary-grounded-smoke [/v2/retrieval/search]: G=0.92 C=0.80 2/2 声明
  ✗ summary-hallucination-smoke [/v2/retrieval/search]: G=0.45 C=0.50 1/3 声明 | 1 禁止
```

### JSON 输出

```json
{
  "meta": {
    "schemaVersion": 1,
    "timestamp": "2026-04-21T...",
    "durationMs": 150,
    "llmProvider": "fallback"
  },
  "summary": {
    "totalCases": 3,
    "passedCases": 2,
    "failedCases": 1,
    "passRate": 0.667,
    "avgGroundedness": 0.85,
    "avgCoverage": 0.72,
    "forbiddenClaimHits": 0
  },
  "cases": [...],
  "failures": [...]
}
```

## 摘要生成策略

默认摘要路径是**确定性事实合成**（deterministic fact synthesis），而非原始 bullet 拼接。

`buildCapsuleSummary()` 的工作方式：

1. **字段优先级提取**：从每个 capsule 的 `problem`、`goal`、`content` 字段按顺序提取事实行（优先使用 problem，其次 goal，最后 content）。
2. **跨 capsule 去重**：对提取的事实行做大小写不敏感的去重，保留首次出现的顺序，避免重复 boilerplate 占用摘要预算。
3. **预算截断**：最多保留 6 条事实行，以空格连接为流畅段落。
4. **空结果契约**：无 capsule 时 `summary: null`，不生成空摘要。

这意味着摘要中的所有文字均来自已通过治理过滤的 capsule 字段，不引入外部信息，保证 groundedness。

## 与统一运行器集成

**注意**: 摘要评测依赖于已过滤的检索上下文。摘要构建器 (`buildCapsuleSummary`) 是纯函数，仅消费传入的 capsule 数据——它不做任何治理或标签过滤。如果检索路径未正确过滤 capsule，禁止声明（如 Flask）可能会泄漏到摘要中。任何检索过滤 bugfix 都应在 smoke 层添加标签过滤回归用例。

摘要评测包含在统一评测运行器中：

```bash
# 同时运行检索和摘要
pnpm eval:smoke
pnpm eval:core
```

统一运行器在其自己的部分显示摘要评测，包含 groundedness/覆盖率平均值。

## 相关文档

- [evals/README.md](../README.md) - 评测工作区总览
- [检索评测 README](../retrieval/README.md) - 检索评测详情
