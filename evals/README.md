# TrapMap 评测工作区

本目录包含 TrapMap 检索和摘要评测系统的数据集和运行器入口点。

## 快速开始

在检索和摘要上运行统一评测：

```bash
# 运行 smoke 层级（快速反馈）
pnpm eval:smoke

# 运行 core 层级（更广泛覆盖）
pnpm eval:core

# 运行完整评测，带 JSON 输出
pnpm eval:all:json

# 空跑验证，不执行
pnpm exec tsx evals/scripts/eval-all.ts --tier smoke --dry-run --allow-empty
```

为特定类型运行评测：

```bash
# 仅检索
pnpm eval:retrieval:smoke
pnpm eval:retrieval:core

# 仅摘要
pnpm eval:summary:smoke
pnpm eval:summary:core
```

## 工作区布局

```text
evals/
├── README.md                    # 本文件
├── scripts/
│   └── eval-all.ts              # 两种评测类型的统一运行器
├── retrieval/
│   ├── README.md                # 检索评测约定和端点详情
│   ├── run.ts                   # 检索运行器入口
│   ├── smoke.ts                 # Smoke 层级数据集导出
│   ├── core.ts                  # Core 层级数据集导出
│   ├── datasets/                # 检索用例定义
│   └── lib/                     # 运行器基础设施
└── summary/
    ├── README.md                # 摘要评测文档
    ├── run.ts                   # 摘要运行器入口
    ├── smoke.ts                 # Smoke 层级数据集导出
    ├── core.ts                  # Core 层级数据集导出
    ├── datasets/                # 摘要用例定义
    └── lib/                     # 法官和评分基础设施
```

## Phase 状态

| Phase | 范围 | 状态 |
|-------|------|------|
| Phase 25 | 契约、工作区布局、薄入口 | 完成 |
| Phase 26 | 数据集编写、指标运行器、报告生成 | 完成 |
| Phase 27 | 基于法官验证的摘要评测 | 完成 |
| Phase 28 | CI 集成和回归门控 | **当前** |

## 如何添加用例

### 添加检索用例

1. **在用例文件目录中创建用例定义** `evals/retrieval/datasets/` 下的适当数据集文件中：

```typescript
import { retrievalEvalCaseSchema, type RetrievalEvalCase } from '@trapmap/contracts';

export const myNewCase = retrievalEvalCaseSchema.parse({
  schemaVersion: 1,
  caseId: 'my-new-case-id',
  tier: 'smoke', // 或 'core'
  endpoint: '/v2/retrieval/search', // 或 '/v1/retrieval/search'
  request: {
    seed: 'my search query',
    mode: 'semantic', // 可选：'hybrid'、'graph-assisted'
    maxResults: 10,
  },
  scenarioId: 'my-scenario-id',
  expected: {
    outcome: 'non-empty', // 或 'empty'
    relevance: {
      relevantIds: ['entry_1', 'entry_2'],
      idealOrder: ['entry_1', 'entry_2'], // 可选
    },
    governance: {
      forbiddenIds: [],
      forbiddenReasons: [],
    },
  },
}) as RetrievalEvalCase;
```

2. **在层级文件中导出用例**（`smoke.ts` 或 `core.ts`）。

3. **如需要，在** `evals/retrieval/scenarios/` **中添加场景**用于 fixture 状态。

### 添加摘要用例

1. **在用例文件目录中创建用例定义** `evals/summary/datasets/` 下的适当数据集文件中：

```typescript
import { summaryEvalCaseSchema, type SummaryEvalCase } from '@trapmap/contracts';

export const mySummaryCase = summaryEvalCaseSchema.parse({
  schemaVersion: 1,
  caseId: 'my-summary-case',
  tier: 'smoke', // 或 'core'
  endpoint: '/v2/retrieval/search',
  request: {
    seed: 'my query for summary',
    maxResults: 10,
  },
  scenarioId: 'my-summary-scenario',
  expected: {
    requiredFacts: ['fact that must appear in summary'],
    forbiddenClaims: ['claim that must not appear'],
    minGroundedness: 0.8,
    minCoverage: 0.7,
    expectSummary: true,
  },
}) as SummaryEvalCase;
```

2. **在层级文件中导出用例**（`smoke.ts` 或 `core.ts`）。

### Schema 参考

所有 schema 定义在 `packages/contracts/src/domain/evals/`：
- `retrieval.ts` - 检索用例和请求 schema
- `summary.ts` - 摘要用例和预期结果 schema
- `report.ts` - 报告结构 schema

## 解读失败

### 治理失败

治理失败表示权限或策略违规，而非排序问题：

| 失败类型 | 含义 |
|----------|------|
| `forbidden-hit` | 返回了应被 RBAC、安全等级或生命周期状态过滤的结果 |
| `unexpected-empty` | 期望有结果但得到空（可能过度过滤） |
| `unexpected-non-empty` | 期望无结果但得到一些（可能过滤不足） |
| `shape-mismatch` | 响应结构与端点契约不匹配 |

**操作**：检查受影响条目的 RBAC 配置、安全等级和生命周期状态。

### 指标失败（检索）

低指标分数表示排序质量问题：

| 指标 | 目标 | 含义 |
|------|------|------|
| Hit@1 | > 0.8 | 首个结果相关 |
| Hit@5 | > 0.9 | 前 5 个中有相关结果 |
| MRR | > 0.7 | 首个相关结果的平均倒数排名 |
| nDCG | > 0.7 | 归一化排序质量 |

**操作**：检查 embedding 质量、重排序器配置和查询预处理。

### Groundedness/覆盖率失败（摘要）

摘要评测失败表示幻觉或信息缺失：

| 问题 | 含义 |
|------|------|
| 低 Groundedness | 摘要包含检索上下文不支持的声明 |
| 低覆盖率 | 摘要遗漏预期集中的必需事实 |
| 禁止声明 | 摘要包含幻觉或不允许的内容 |

**操作**：检查法官配置、检索上下文质量和摘要生成提示。

## 报告结构

### JSON 报告格式

检索和摘要报告遵循共同结构：

```typescript
interface EvalReport {
  meta: {
    schemaVersion: 1;
    timestamp: string;
    durationMs: number;
    options: { tier, endpoint, dryRun, ... };
  };
  summary: {
    totalCases: number;
    passedCases: number;
    failedCases: number;
    passRate: number;
    passed: boolean;
  };
  cases: CaseSummary[];
  failures: FailureRecord[];
}
```

### 终端输出

使用 `--verbose` 获取详细的每个用例输出：

```bash
pnpm eval:smoke -- --verbose
```

统一运行器显示：
- 检索评测部分，含切片比较表
- 摘要评测部分，含 groundedness/覆盖率平均值
- 总体状态，含通过/失败摘要

## CI 集成

评测在 GitHub Actions 中自动运行。工作流定义在 `.github/workflows/eval.yml`。

### 自动触发

| 触发器 | 层级 | 何时 |
|--------|------|------|
| Pull Request | Smoke | 修改 `packages/contracts/src/domain/evals/**`、`evals/**` 或 `packages/server/src/**` 的 PR 到 `main` |
| 定时 | Core | 每周一 UTC 6 AM |
| 手动触发 | Smoke 或 Core | 通过 GitHub Actions UI 选择层级 |

### 查看结果

1. **在 GitHub 的 Actions 标签页中检查**工作流运行状态和日志
2. **下载报告工件** - 运行失败时，工作流会将 `reports/` 上传为工件
3. **查看** `eval-report.json` 获取每个用例的详细指标、失败和切片分解
4. Core 评测报告保留 30 天；smoke 报告保留 7 天

### CI 脚本

| 脚本 | 用途 |
|------|------|
| `pnpm eval:ci` | CI 优化运行器，带 GitHub Actions 输出，写入报告到 `reports/eval-report.json` |
| `pnpm eval:ci:core` | Core 层级 CI 运行器（设置 `TIER=core`），用于定时运行 |

CI 运行器（`evals/scripts/eval-ci.ts`）与本地运行器不同：
- 将机器可读的 JSON 报告写入 `reports/eval-report.json`
- 设置 GitHub Actions 输出变量（`passed`、`total_cases`、`passed_cases`、`failed_cases`）
- 在分组日志输出中使用紧凑的单行摘要格式
- 即使失败也始终写入报告，用于工件上传

### 本地 CI 模拟

你可以在本地模拟 CI 行为，无需 GitHub Actions：

```bash
# 模拟 CI smoke 运行
pnpm eval:ci

# 模拟 CI core 运行
TIER=core pnpm eval:ci

# 带 GitHub Actions 输出运行（用于测试）
GITHUB_OUTPUT=/tmp/gh-output pnpm eval:ci
```

## 治理 vs 相关性

根据 REVAL-02 和 v1.4 里程碑，检索评测分离两个关注点：

- **相关性**：排序质量（Hit@K、MRR、nDCG）
- **治理**：权限/策略正确性（跨团队、安全等级、生命周期泄漏）

高相关性分数不能掩盖治理泄漏。每个评测用例都带有独立的 `relevance` 和 `governance` 断言组。

## 关键原则

1. **契约在** `packages/contracts`：所有评测 schema 位于共享契约包中，而非此处。此工作区仅包含数据集和入口点。

2. **数据集由里程碑拥有**：数据集文件是 `.ts` 模块，导出针对共享契约验证的纯对象。

3. **端点特定性**：检索评测针对明确端点（`/v1/retrieval/search`、`/v2/retrieval/search`）。每个用例都明确声明其目标端点。

4. **关注点分离**：治理失败和相关性失败被分别跟踪，两者都必须通过才能整体成功。

## 相关文档

- [检索评测 README](./retrieval/README.md) - 端点特定约定
- [摘要评测 README](./summary/README.md) - 基于法官的评测详情
