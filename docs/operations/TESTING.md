# 测试指南

本文档说明 TrapMap 的测试架构、运行方法和用例编写规范。

## 测试架构

TrapMap 采用两级评估体系：

```mermaid
flowchart TB
    subgraph 评估层级["评估层级"]
        Smoke["Smoke 层<br/>快速反馈，验证核心路径正确性<br/>命令: pnpm eval:smoke"]
        Core["Core 层<br/>全面覆盖，验证边界条件和治理规则<br/>命令: pnpm eval:core"]
        
        Smoke --> Core
    end
```

### 评估类型

| 类型 | 说明 | 运行器 |
|------|------|--------|
| 检索评估 (Retrieval) | 验证召回结果的相关性和治理正确性 | `evals/retrieval/run.ts` |
| 摘要评估 (Summary) | 验证 AI 生成摘要的忠实度和覆盖率 | `evals/summary/run.ts` |
| 治理评估 (Governance) | 验证 RBAC 和安全等级过滤 | 内嵌于检索评估 |

### 目录结构

```text
evals/
├── scripts/
│   └── eval-all.ts          # 统一运行器
├── retrieval/
│   ├── run.ts               # 检索运行器入口
│   ├── smoke.ts / core.ts   # 分层数据集导出
│   ├── datasets/            # 测试用例定义
│   ├── scenarios/           # Fixture 状态定义
│   └── lib/                 # 运行器基础设施
└── summary/
    ├── run.ts               # 摘要运行器入口
    ├── smoke.ts / core.ts   # 分层数据集导出
    ├── datasets/            # 测试用例定义
    ├── scenarios/           # Fixture 状态定义
    └── lib/                 # 评判器和评分基础设施
```

---

## 运行测试

### 单元测试

```bash
# 运行所有包的测试
pnpm test

# 按包运行
pnpm --filter @trapmap/server test
pnpm --filter @trapmap/cli test
pnpm --filter @trapmap/contracts test

# 覆盖率报告
pnpm test:coverage

# 类型检查
pnpm typecheck
```

### 评测（Eval）

#### 本地运行

```bash
# Smoke 层（快速，~10s）
pnpm eval:smoke

# Core 层（完整，~60s）
pnpm eval:core

# 仅检索评估
pnpm eval:retrieval:smoke
pnpm eval:retrieval:core

# 仅摘要评估
pnpm eval:summary:smoke
pnpm eval:summary:core

# 详细输出（逐用例结果）
pnpm eval:smoke -- --verbose

# Dry-run（验证用例格式，不执行）
pnpm exec tsx evals/scripts/eval-all.ts --tier smoke --dry-run --allow-empty
```

### 模拟 CI 运行

```bash
# 模拟 CI smoke
pnpm eval:ci

# 模拟 CI core
TIER=core pnpm eval:ci

# 查看 JSON 报告
cat reports/eval-report.json
```

### CI 自动触发

| 触发条件 | 层级 | 说明 |
|----------|------|------|
| PR 到 main（修改 evals/、server/、contracts/） | Smoke | 快速回归检测 |
| 每周一 06:00 UTC | Core | 全面质量检查 |
| GitHub Actions 手动触发 | Smoke/Core | 可选层级 |

CI 配置位于 `.github/workflows/eval.yml`。

---

## 检索评估指标

| 指标 | 含义 | 目标值 |
|------|------|--------|
| Hit@1 | 首条结果即为相关条目 | > 0.8 |
| Hit@5 | 前 5 条包含相关条目 | > 0.9 |
| MRR | 相关条目排名倒数均值 | > 0.7 |
| nDCG | 归一化折损累积增益 | > 0.7 |

### 治理检查

治理检查与相关性指标分开追踪，确保高相关性不能掩盖权限泄漏：

| 失败类型 | 含义 | 排查方向 |
|----------|------|----------|
| `forbidden-hit` | 返回了应被过滤的条目 | 检查 RBAC、安全等级、生命周期状态 |
| `unexpected-empty` | 应有结果但为空 | 可能过度过滤 |
| `unexpected-non-empty` | 应为空但有结果 | 可能过滤不足 |
| `shape-mismatch` | 响应结构不符合契约 | 检查端点版本 |

---

## 摘要评估指标

| 维度 | 含义 | 检查方法 |
|------|------|----------|
| Groundedness | 摘要内容基于检索上下文 | 事实提取 + 交叉验证 |
| Coverage | 覆盖预期关键信息 | 关键点匹配率 |
| Hallucination | 不含源内容之外的声明 | 禁止声明检测 |

---

## 添加测试用例

### 添加检索用例

1. 在 `evals/retrieval/datasets/` 的合适文件中定义用例：

```typescript
import { retrievalEvalCaseSchema, type RetrievalEvalCase } from '@trapmap/contracts';

export const myCase = retrievalEvalCaseSchema.parse({
  schemaVersion: 1,
  caseId: 'my-case-id',
  tier: 'smoke',           // 'smoke' 或 'core'
  endpoint: '/v1/retrieval/search',
  request: {
    seed: '查询文本',
    mode: 'semantic',       // 'semantic' | 'hybrid' | 'graph-assisted'
    maxResults: 10,
  },
  scenarioId: 'my-scenario',
  expected: {
    outcome: 'non-empty',  // 'non-empty' 或 'empty'
    relevance: {
      relevantIds: ['entry_1', 'entry_2'],
      idealOrder: ['entry_1', 'entry_2'],  // 可选
    },
    governance: {
      forbiddenIds: [],
      forbiddenReasons: [],
    },
  },
}) as RetrievalEvalCase;
```

2. 在对应的层级文件（`smoke.ts` 或 `core.ts`）中导出：

```typescript
export const cases = [...existingCases, myCase];
```

3. 如需 Fixture 数据，在 `evals/retrieval/scenarios/` 中创建场景 JSON。

### 多路召回测试覆盖（v2 Multi-Recall Phase 2）

Phase 0-2 为 v2 多路召回管线补充了以下目标用例切片，用于验证 keyword/semantic/graph/heuristic 通道的召回收益：

**Core 层**:

| 切片 | 用例 ID | 说明 |
|------|---------|------|
| keyword-dominant | `v2-keyword-dominant-core` | 精确标签/术语命中（pnpm lockfile） |
| keyword-dominant | `v2-keyword-error-text-core` | 错误文本/文件路径召回（ENOENT nginx.conf） |
| semantic-dominant | `v2-semantic-paraphrase-core` | 同义改写查询 vs 技术术语（orchestration -> "running services together"） |
| semantic-dominant | `v2-semantic-debug-core` | 口语化查询 vs 专业术语（observability -> "figure out why broken"） |
| mixed-channel | `v2-mixed-channel-core` | 关键字+语义双通道命中/去重（TypeScript CI build） |

**Smoke 层** (Phase 2 新增):

| 切片 | 用例 ID | 说明 |
|------|---------|------|
| keyword-dominant | `v2-keyword-dominant-smoke` | 精确错误文本召回（ModuleNotFoundError） |
| keyword-dominant | `v2-keyword-regex-smoke` | 技术术语召回（regex pattern parsing） |

这些用例使用独立的 scenario fixture（`core-keyword-dominant`、`core-semantic-paraphrase`、`core-mixed-channel`、`smoke-keyword-dominant`），不依赖生产数据。

**Phase 2 状态**: heuristic + keyword 双通道已激活。keyword 通道提供独立词法召回，字段权重: labels(3.0) > problem(2.5) > goal(2.0) > situation/contextualPrefix(1.5) > content(1.0)。

### 添加摘要用例

1. 在 `evals/summary/datasets/` 中定义：

```typescript
import { summaryEvalCaseSchema, type SummaryEvalCase } from '@trapmap/contracts';

export const mySummaryCase = summaryEvalCaseSchema.parse({
  schemaVersion: 1,
  caseId: 'my-summary-case',
  tier: 'smoke',
  endpoint: '/v2/retrieval/search',
  request: {
    seed: '查询文本',
    maxResults: 10,
  },
  scenarioId: 'my-scenario',
  expected: {
    requiredFacts: ['必须出现的事实'],
    forbiddenClaims: ['不得出现的声明'],
    minGroundedness: 0.8,
    minCoverage: 0.7,
    expectSummary: true,
  },
}) as SummaryEvalCase;
```

2. 在对应的层级文件中导出。

---

## Schema 定义位置

所有评估 Schema 集中在 `packages/contracts/src/domain/evals/`：

| 文件 | 内容 |
|------|------|
| `retrieval.ts` | 检索用例和请求 Schema |
| `summary.ts` | 摘要用例和预期结果 Schema |
| `report.ts` | 报告结构 Schema |

---

## 单元测试

项目使用 Vitest 运行单元测试：

```bash
# 运行所有单元测试
pnpm test

# 运行特定文件
pnpm vitest run evals/retrieval/runner.test.ts
```

测试文件遵循 `*.test.ts` 命名约定，放置在对应模块目录下。

### PostgreSQL 集成测试

部分模块包含需要真实 PostgreSQL 连接的集成测试。这些测试通过 `TRAPMAP_DATABASE_URL` 或 `DATABASE_URL` 环境变量控制，未设置时自动跳过。

```bash
# 运行 PG 集成测试（需要数据库）
TRAPMAP_DATABASE_URL=postgresql://user:pass@localhost:5432/trapmap pnpm --filter @trapmap/server test
```

包含 PG 集成测试的模块：

| 模块 | 测试文件 | 说明 |
|------|----------|------|
| Feedback | `src/lib/feedback/pg-repository.test.ts` | 反馈 CRUD、过滤、约束验证 |
| Usage Analytics | `src/lib/analytics/pg-repository.test.ts` | 使用统计写入、查询、归档 |
| Candidates | `src/lib/candidates/pg-repository.test.ts` | 候选提交、分析、判重 |
| Duplicates | `src/lib/duplicates/pg-repository.test.ts` | 重复检测 |
| Keyword Recall | `src/lib/retrieval/recall/pg-keyword.test.ts` | 关键词检索：text[] 重叠匹配、字段权重评分、GIN 索引验证 |
| Knowledge PG | `src/lib/knowledge/pg-repository.test.ts` | 知识条目 CRUD、标签过滤、约束验证 |

---

## 相关文档

- [模块详解](../architecture/MODULES.md) — 系统模块架构和设计
- [API 参考 — 检索端点](../architecture/API.md#检索端点) — 检索算法和模式
- [安全指南](SECURITY.md) — RBAC 和安全等级
- [环境变量参考](ENVIRONMENT.md) — 测试相关环境变量
