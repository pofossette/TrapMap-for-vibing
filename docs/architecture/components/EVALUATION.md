# 评估框架 (Evaluation Framework)

## 概述

TrapMap 的评估框架用于验证系统核心功能的正确性，包括检索质量、摘要生成、治理执行等。框架支持烟雾测试（快速）和核心测试（全面）两个层级。

## 架构概览

```mermaid
flowchart TB
    subgraph 评估运行器["评估运行器"]
        A["- 按层级加载测试用例（smoke/core）\n- 对运行中的服务器执行测试\n- 收集指标\n- 生成报告"]
    end

    subgraph 评估类型["评估类型"]
        subgraph 检索评估["检索评估"]
            B1["Hit@K\nMRR\nnDCG"]
        end

        subgraph 摘要评估["摘要评估"]
            B2["Groundedness\nCoverage\nHallucination"]
        end

        subgraph 治理评估["治理评估"]
            B3["等级检查\nRBAC 检查\n作用域检查"]
        end
    end

    subgraph 持续集成["持续集成"]
        C["GitHub Actions 工作流\n.github/workflows/eval.yml"]
    end

    评估运行器 --> 检索评估
    评估运行器 --> 摘要评估
    评估运行器 --> 治理评估
    评估类型 --> 持续集成
```

---

## 评估类型

### 1. 检索评估 (Retrieval Evaluation)

测试检索系统的准确性和相关性。

#### 测试用例结构

```typescript
interface RetrievalTestCase {
  id: string;
  description: string;
  query: string;
  tier: 'smoke' | 'core';
  
  // Expected results
  expected: {
    minResults: number;           // Minimum results to return
    governanceEnforced: boolean; // Should filter by level/team
    relevanceThreshold: number;   // Min relevance score (0-1)
    expectedCategories?: string[]; // Entry categories that should appear
  };
  
  // Filter constraints
  filter?: {
    mode?: 'semantic' | 'hybrid' | 'graph-assisted';
    level?: { max: number };
    teamId?: string;
  };
}
```

#### 评估指标

| 指标 | 名称 | 描述 | 公式 |
|------|------|------|------|
| Hit@K | Hit at K | 前 K 个结果中包含相关条目的比例 | #{relevant in top-K} / #{queries} |
| MRR | Mean Reciprocal Rank | 相关条目排名的倒数均值 | Σ(1/rank) / N |
| nDCG@K | Normalized DCG at K | 折扣累积增益的标准化版本 | DCG/K / IDCG |

#### 评估流程

```mermaid
flowchart TB
    subgraph 加载测试用例["加载测试用例"]
        A["evals/retrieval/cases/\n├── smoke/\n│   ├── query-config-auth.yaml\n│   └── query-oauth-setup.yaml\n└── core/\n    ├── query-security-levels.yaml\n    └── ..."]
    end

    subgraph 执行检索查询["执行检索查询"]
        B["POST /v1/retrieval/search\n{ query, mode, filter }"]
    end

    subgraph 计算指标["计算指标"]
        C1["1. 对每个结果:\n   - 计算相关性分数（手动标注）\n   - 检查治理合规"]
        C2["2. 计算 Hit@K, MRR, nDCG"]
    end

    subgraph 生成报告["生成报告"]
        D["{ hitRate, mrr, ndcg, passed, failed, errors }"]
    end

    加载测试用例 --> 执行检索查询 --> 计算指标 --> 生成报告
```

#### 测试用例示例

```yaml
# evals/retrieval/cases/smoke/query-config-auth.yaml
id: retrieval-smoke-auth-config
description: Query about authentication configuration
query: "how to configure authentication for a new service"
tier: smoke

expected:
  minResults: 3
  governanceEnforced: true
  relevanceThreshold: 0.6

filter:
  mode: semantic
  level:
    max: 5
```

---

### 2. 摘要评估 (Summary Evaluation)

测试 AI 生成摘要的质量。

#### 测试用例结构

```typescript
interface SummaryTestCase {
  id: string;
  description: string;
  sourceContent: string;
  summary: string;
  tier: 'smoke' | 'core';
  
  // Ground truth requirements
  requiredFacts: string[];        // Facts that MUST appear
  forbiddenClaims: string[];     // Claims that MUST NOT appear
  
  // Quality criteria
  quality: {
    minLength?: number;
    maxLength?: number;
    minCoverage?: number;         // % of source covered
  };
}
```

#### 评估维度

| 维度 | 描述 | 检查方法 |
|------|------|----------|
| Groundedness | 摘要内容是否基于源内容 | 事实提取 + 交叉验证 |
| Coverage | 摘要覆盖源内容的关键点 | 关键点匹配率 |
| Hallucination | 摘要是否包含源内容中没有的信息 | 禁止声明检测 |
| Conciseness | 摘要是否简洁 | 长度检查 |

#### 评估流程

```mermaid
flowchart TB
    subgraph 加载测试用例["加载测试用例"]
        A["{ sourceContent, summary, requiredFacts, forbiddenClaims }"]
    end

    subgraph 真实性检查["真实性检查"]
        B1["1. 从摘要提取事实\n2. 检查每个事实是否出现在源内容中\n3. 计算真实性分数"]
    end

    subgraph 覆盖率检查["覆盖率检查"]
        C1["1. 从源内容提取关键点\n2. 检查每个关键点是否在摘要中\n3. 计算覆盖率分数"]
    end

    subgraph 幻觉检查["幻觉检查"]
        D1["1. 检查摘要是否包含禁止声明\n2. 验证没有超出源内容的声明"]
    end

    subgraph 生成报告["生成报告"]
        E["{ groundedness, coverage, hallucination, passed }"]
    end

    加载测试用例 --> 真实性检查 --> 覆盖率检查 --> 幻觉检查 --> 生成报告
```

---

### 3. 治理评估 (Governance Evaluation)

测试 RBAC 和安全等级治理是否正确执行。

#### 测试用例结构

```typescript
interface GovernanceTestCase {
  id: string;
  description: string;
  tier: 'smoke' | 'core';
  
  // Setup
  setup: {
    entries: Array<{
      id: string;
      requiredLevel: number;
      scope: 'global' | 'team';
      teamId?: string;
    }>;
    users: Array<{
      id: string;
      level: number;
      teamId?: string;
      permissions: string[];
    }>;
  };
  
  // Test scenario
  scenario: {
    userId: string;
    action: Permission;
    resourceId: string;
  };
  
  // Expected outcome
  expected: {
    allowed: boolean;
    reason?: string;
  };
}
```

#### 治理检查点

| 检查点 | 描述 |
|--------|------|
| Level Check | 用户等级 >= 条目等级 |
| Team Check | 用户是团队成员（如果是团队作用域） |
| Permission Check | 用户有执行操作的权限 |
| Scope Check | 全局条目可被所有用户访问 |

---

## 运行器实现

### 检索评估运行器

```typescript
interface EvaluationResult {
  testCaseId: string;
  passed: boolean;
  metrics: Record<string, number>;
  errors: string[];
  duration: number;  // ms
}

interface EvaluationReport {
  totalTests: number;
  passed: number;
  failed: number;
  duration: number;
  results: EvaluationResult[];
  summary: {
    hitRate: number;
    mrr: number;
    ndcg: number;
  };
}

class RetrievalEvaluator {
  private serverUrl: string;
  
  async run(tier: 'smoke' | 'core'): Promise<EvaluationReport> {
    const testCases = await this.loadTestCases(tier);
    const results: EvaluationResult[] = [];
    
    for (const testCase of testCases) {
      const result = await this.runTestCase(testCase);
      results.push(result);
    }
    
    return this.generateReport(results);
  }
  
  private async runTestCase(testCase: RetrievalTestCase): Promise<EvaluationResult> {
    const startTime = Date.now();
    
    try {
      // Execute retrieval
      const response = await fetch(`${this.serverUrl}/v1/retrieval/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: testCase.query,
          mode: testCase.filter?.mode || 'semantic',
          limit: 10
        })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      
      // Calculate metrics
      const metrics = this.calculateMetrics(data.results, testCase);
      
      // Check governance
      const governancePassed = testCase.expected.governanceEnforced
        ? this.checkGovernance(data.results, testCase)
        : true;
      
      const passed = 
        data.results.length >= testCase.expected.minResults &&
        metrics.relevance >= testCase.expected.relevanceThreshold &&
        governancePassed;
      
      return {
        testCaseId: testCase.id,
        passed,
        metrics,
        errors: [],
        duration: Date.now() - startTime
      };
    } catch (error) {
      return {
        testCaseId: testCase.id,
        passed: false,
        metrics: {},
        errors: [(error as Error).message],
        duration: Date.now() - startTime
      };
    }
  }
  
  private calculateMetrics(results: any[], testCase: RetrievalTestCase) {
    // Simplified - real implementation would use manual relevance judgments
    return {
      resultCount: results.length,
      relevance: results.length > 0 ? 0.8 : 0,  // Placeholder
      hitRate: results.length > 0 ? 1 : 0
    };
  }
  
  private checkGovernance(results: any[], testCase: RetrievalTestCase): boolean {
    if (!testCase.filter?.level) return true;
    
    for (const result of results) {
      if (result.requiredLevel > testCase.filter.level.max) {
        return false;  // Governance violation
      }
    }
    
    return true;
  }
}
```

---

## CI 集成

### GitHub Actions Workflow

```yaml
# .github/workflows/eval.yml
name: Evaluation

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  eval:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
        
      - name: Setup environment
        run: |
          cp .env.example .env
          echo "OPENAI_API_KEY=${{ secrets.OPENAI_API_KEY }}" >> .env
          
      - name: Start server
        run: pnpm dev:server &
        shell: background
        
      - name: Wait for server
        run: |
          for i in {1..30}; do
            curl -s http://localhost:4000/health && break
            sleep 2
          done
          
      - name: Run smoke evaluation
        run: pnpm eval:retrieval --tier smoke
        continue-on-error: true
        
      - name: Run core evaluation
        run: pnpm eval:retrieval --tier core
        continue-on-error: true
        
      - name: Run summary evaluation
        run: pnpm eval:summary
        continue-on-error: true
        
      - name: Upload results
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: eval-results
          path: .eval-results/
```

### 运行命令

```bash
# Run all smoke tests (fast)
pnpm eval:smoke

# Run all core tests (comprehensive)
pnpm eval:core

# Run specific evaluation
pnpm eval:retrieval:smoke
pnpm eval:summary:smoke

# Run with report
pnpm eval:ci:core
```

---

## 测试用例示例

### 检索测试用例

```yaml
# evals/retrieval/cases/core/query-security-oauth.yaml
id: retrieval-core-oauth-security
description: Security concerns with OAuth2 implementation
query: "what security concerns should I address for OAuth2"
tier: core

expected:
  minResults: 5
  governanceEnforced: true
  relevanceThreshold: 0.7
  expectedCategories:
    - security
    - authentication

filter:
  mode: hybrid
  level:
    max: 3
```

### 摘要测试用例

```yaml
# evals/summary/cases/core/summary-jwt-validation.yaml
id: summary-core-jwt-validation
description: Summary of JWT validation best practices
sourceContent: |
  JWT tokens should be validated on every request...
  1. Verify signature using public key
  2. Check expiration
  3. Validate issuer and audience
  4. Reject tokens with alg: none

summary: |
  JWT validation requires checking signature, expiration,
  issuer/audience, and rejecting 'none' algorithm.

requiredFacts:
  - signature verification
  - expiration check
  - issuer validation
  - reject none algorithm

forbiddenClaims:
  - "JWT tokens are not secure"
  - "you can skip validation for testing"
```

---

## 报告格式

### JSON 报告

```json
{
  "timestamp": "2026-04-30T12:00:00Z",
  "tier": "core",
  "duration": 45000,
  "summary": {
    "total": 25,
    "passed": 23,
    "failed": 2,
    "passRate": 0.92
  },
  "metrics": {
    "hitRate": 0.88,
    "mrr": 0.75,
    "ndcg": 0.71
  },
  "results": [
    {
      "testCaseId": "retrieval-core-oauth-security",
      "passed": true,
      "metrics": {
        "hitRate": 1.0,
        "relevance": 0.85
      },
      "duration": 120
    }
  ],
  "failures": [
    {
      "testCaseId": "retrieval-core-security-levels",
      "passed": false,
      "errors": ["Governance violation: returned entry with level 7 > max 5"]
    }
  ]
}
```

---

## 添加新测试

### 创建检索测试

1. 在 `evals/retrieval/cases/<tier>/` 创建 YAML 文件
2. 定义 query、expected、filter
3. 运行 `pnpm eval:retrieval --tier <tier>` 验证

### 创建摘要测试

1. 在 `evals/summary/cases/<tier>/` 创建 YAML 文件
2. 提供 sourceContent、summary、requiredFacts、forbiddenClaims
3. 运行 `pnpm eval:summary --tier <tier>` 验证

---

## 流程图

### 检索评估流程

```mermaid
flowchart TB
    A[加载测试用例] --> B[执行检索查询]
    B --> C[计算指标]
    C --> D[检查治理合规]
    D --> E[生成报告]
    
    A --> A1[evals/retrieval/cases/]
    A1 --> A2[smoke/]
    A1 --> A3[core/]
    
    B --> B1[POST /v1/retrieval/search]
    B1 --> B2[{ query, mode, filter }]
    
    C --> C1[计算相关性分数]
    C1 --> C2[Hit@K, MRR, nDCG]
    
    D --> D1[检查安全等级]
    D --> D2[检查团队作用域]
    
    E --> E1[{ hitRate, mrr, ndcg, passed, failed }]
```

### 摘要评估流程

```mermaid
flowchart TB
    A[加载测试用例] --> B[Groundedness 检查]
    B --> C[Coverage 检查]
    C --> D[Hallucination 检查]
    D --> E[生成报告]
    
    B --> B1[从摘要提取事实]
    B1 --> B2[检查事实是否在源内容中]
    B2 --> B3[计算 groundedness 分数]
    
    C --> C1[从源内容提取关键点]
    C1 --> C2[检查关键点是否在摘要中]
    C2 --> C3[计算 coverage 分数]
    
    D --> D1[检查摘要中的禁止声明]
    D1 --> D2[验证无源外声明]
    
    E --> E1[{ groundedness, coverage, hallucination, passed }]
```

## 测试层级

### 烟雾测试 (Smoke Tests)

| 特性 | 描述 |
|------|------|
| 目的 | 快速验证核心功能 |
| 运行时间 | < 1 分钟 |
| 测试数量 | 5-10 个用例 |
| 运行时机 | 每次提交 |

### 核心测试 (Core Tests)

| 特性 | 描述 |
|------|------|
| 目的 | 全面验证系统功能 |
| 运行时间 | 5-15 分钟 |
| 测试数量 | 20-50 个用例 |
| 运行时机 | 合并前、定期运行 |

## CI 集成

### GitHub Actions 工作流

```yaml
# .github/workflows/eval.yml
name: Evaluation

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]
  schedule:
    - cron: '0 0 * * *'  # Daily

jobs:
  eval:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          
      - name: Install dependencies
        run: pnpm install
        
      - name: Build
        run: pnpm build
        
      - name: Start server
        run: pnpm dev:server &
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/trapmap_test
          
      - name: Wait for server
        run: |
          for i in {1..30}; do
            if curl -s http://localhost:4000/health > /dev/null; then
              echo "Server is ready"
              break
            fi
            sleep 1
          done
          
      - name: Run smoke tests
        run: pnpm eval:smoke
        
      - name: Run core tests
        run: pnpm eval:core
        if: github.event_name == 'schedule'
```

## 运行评估

### 命令行运行

```bash
# 运行烟雾测试
pnpm eval:smoke

# 运行核心测试
pnpm eval:core

# 运行特定评估类型
pnpm eval:retrieval:smoke
pnpm eval:retrieval:core
pnpm eval:summary:smoke
pnpm eval:summary:core
```

## 测试用例管理

### 目录结构

```
evals/
├── retrieval/
│   ├── cases/
│   │   ├── smoke/
│   │   │   ├── query-config-auth.yaml
│   │   │   └── query-oauth-setup.yaml
│   │   └── core/
│   │       ├── query-security-levels.yaml
│   │       └── ...
│   └── README.md
├── summary/
│   ├── cases/
│   │   ├── smoke/
│   │   └── core/
│   └── README.md
└── governance/
    ├── cases/
    │   ├── smoke/
    │   └── core/
    └── README.md
```

## 审计事件

评估框架产生的审计事件：

```typescript
type EvaluationAuditEvent =
  | { type: 'evaluation.started'; tier: 'smoke' | 'core'; testCount: number }
  | { type: 'evaluation.completed'; tier: 'smoke' | 'core'; passed: number; failed: number }
  | { type: 'evaluation.failed'; tier: 'smoke' | 'core'; error: string };
```
