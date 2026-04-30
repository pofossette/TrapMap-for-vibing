# 评估框架 (Evaluation Framework)

## 概述

TrapMap 的评估框架用于验证系统核心功能的正确性，包括检索质量、摘要生成、治理执行等。框架支持烟雾测试（快速）和核心测试（全面）两个层级。

## 架构概览

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    Evaluation Framework Architecture                     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Evaluation Runner                             │   │
│  │                                                                    │   │
│  │  - Load test cases by tier (smoke/core)                         │   │
│  │  - Execute tests against running server                         │   │
│  │  - Collect metrics                                              │   │
│  │  - Generate report                                              │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                              │                                          │
│              ┌───────────────┼───────────────┐                         │
│              ▼               ▼               ▼                         │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐         │
│  │    Retrieval   │ │    Summary     │ │    Governance  │         │
│  │    Evals      │ │    Evals       │ │    Evals       │         │
│  │                │ │                │ │                │         │
│  │  - Hit@K      │ │  - Groundedness│ │  - Level check │         │
│  │  - MRR        │ │  - Coverage    │ │  - RBAC check  │         │
│  │  - nDCG       │ │  - Hallucination│ │  - Scope check │         │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘         │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    CI Integration                                 │   │
│  │  GitHub Actions workflow: .github/workflows/eval.yml             │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
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

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    Retrieval Evaluation Flow                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Load Test Cases                                                        │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  evals/retrieval/cases/                                         │   │
│  │  ├── smoke/                                                    │   │
│  │  │   ├── query-config-auth.yaml                                │   │
│  │  │   └── query-oauth-setup.yaml                                │   │
│  │  └── core/                                                      │   │
│  │      ├── query-security-levels.yaml                           │   │
│  │      └── ...                                                    │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│        │                                                                │
│        ▼                                                                │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Execute Retrieval Query                       │   │
│  │  POST /v1/retrieval/search                                     │   │
│  │  { query, mode, filter }                                       │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│        │                                                                │
│        ▼                                                                │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Calculate Metrics                          │   │
│  │                                                                    │   │
│  │  1. For each result:                                            │   │
│  │     - Compute relevance score (manual labeling)                 │   │
│  │     - Check governance compliance                               │   │
│  │                                                                    │   │
│  │  2. Calculate Hit@K, MRR, nDCG                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│        │                                                                │
│        ▼                                                                │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Generate Report                               │   │
│  │  { hitRate, mrr, ndcg, passed, failed, errors }               │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
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

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    Summary Evaluation Flow                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Load Test Case                                                        │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  {                                                               │   │
│  │    sourceContent: "...",                                        │   │
│  │    summary: "...",                                              │   │
│  │    requiredFacts: ["fact1", "fact2"],                         │   │
│  │    forbiddenClaims: ["claim1"]                                  │   │
│  │  }                                                              │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│        │                                                                │
│        ▼                                                                │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Groundedness Check                            │   │
│  │  1. Extract facts from summary                                  │   │
│  │  2. Check if each fact appears in source                        │   │
│  │  3. Calculate groundedness score                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│        │                                                                │
│        ▼                                                                │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Coverage Check                                │   │
│  │  1. Extract key points from source                             │   │
│  │  2. Check if each key point in summary                          │   │
│  │  3. Calculate coverage score                                   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│        │                                                                │
│        ▼                                                                │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Hallucination Check                           │   │
│  │  1. Check summary against forbidden claims                      │   │
│  │  2. Validate no out-of-source claims                          │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│        │                                                                │
│        ▼                                                                │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Generate Report                               │   │
│  │  { groundedness, coverage, hallucination, passed }            │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
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
        run: pnpm dev &
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
pnpm eval:ci --tier smoke

# Run all core tests (comprehensive)
pnpm eval:ci --tier core

# Run specific evaluation
pnpm eval:retrieval
pnpm eval:summary

# Run with report
pnpm eval:ci --report
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
