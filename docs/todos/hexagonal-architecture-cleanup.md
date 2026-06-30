# 六边形架构清理与质量提升计划

> 审计时间：2026-06-30（最新验证）
> 工具：fallow 2.101.0 全量分析
> 整体健康评分：70.3（B级）
> 总文件数：1,012 | Monorepo 包数：14

---

## 1. 背景与目标

本计划作为 **服务发现与可观测性主线的前置工作**，解决六边形架构在实施中积累的技术债和质量缺陷。这些工作必须在引入 Consul、Prometheus、OpenTelemetry 等复杂基础设施组件之前完成，因为：

- **架构边界未配置**：无法验证层间依赖是否符合六边形原则
- **大量代码重复**：引入服务发现/可观测性代码时会进一步放大维护成本
- **依赖管理混乱**：无法安全地添加新的基础设施依赖
- **模块边界不清**：难以隔离六边形架构的各层

**目标**：将六边形架构从"概念正确"提升到"工程护栏完备"的状态。

---

## 2. 问题全景

### 2.1 架构边界（最高优先级）

**现状**：fallow 边界配置为 `configured: false`，无法检测违规。

**影响**：
- 可能存在基础设施层直接调用领域层的逆向依赖
- 引入服务发现代码时，违反六边形原则的风险高
- 架构腐化无法被 CI 自动检测

**健康惩罚**：间接影响所有相关指标

### 2.2 代码重复（最大技术债）

**统计**：
- 克隆组：4,957 组
- 重复实例：12,127 个
- 健康惩罚：10.0（满分）

**重复热点分布**：

| 类型 | 影响文件数 | 重复代码量 |
|------|-----------|-----------|
| CLI 测试 setup/teardown | 30+ | 高 |
| Server 路由测试 | 25+ | 高 |
| 验证逻辑 | 15+ | 中 |
| DTO ↔ Domain 转换 | 10+ | 中 |
| 错误处理模式 | 20+ | 中 |
| Mock 数据生成 | 12+ | 中 |

**成本**：修改一个核心逻辑需同步 10+ 个文件，引入不一致 bug 的风险指数级增长。

### 2.3 模块单元过大

**健康惩罚**：10.0（满分）

**问题**：某些文件超过 500+ 行，违反单一职责原则。

**示例**：
- 检索相关模块（orchestration、scoring、recall、response）
- 持久化层
- 配置管理

### 2.4 未使用的依赖（6 个）

**影响**：
- 增加包体积和安全风险
- 隐藏已弃用的 API 或遗留代码
- 引入新依赖时可能与旧依赖冲突

### 2.5 未使用的导出（217 个）和类型（95 个）

**影响**：
- 代码维护成本增加
- API 设计可能不清晰
- 消费者可能依赖了弃用的 API

### 2.6 耦合度偏高

**健康惩罚**：2.1

**问题**：某些模块间存在不期望的依赖，与未配置架构边界问题直接相关。

---

## 3. 实施计划

### Phase 0.1：架构边界配置（Week 1）

**目标**：启用 fallow 边界检测，建立六边形架构的 CI 门禁

**任务**：

1. **配置 fallow 边界规则**
   - [ ] 定义六边形各层的 zone：`domain`、`ports`、`use-cases`、`commands`、`http`、`gateway`、`config`、`shared`
   - [ ] 设定依赖方向规则
   - [ ] 启用 `boundary-violation` 检测
   - [ ] 配置 `boundary-coverage` 确保所有文件都归属到 zone

2. **CI 门禁集成**
   - [ ] 将 fallow 边界检查加入 pre-commit hook
   - [ ] 配置 CI pipeline 失败于违规
   - [ ] 保存基线，新代码不得引入违规

3. **文档更新**
   - [ ] 更新 `docs/architecture/` 架构边界说明
   - [ ] 添加六边形架构的 zone 划分图

**验收标准**：
- ✅ `fallow list --boundaries` 返回 configured: true
- ✅ 新提交违反边界时 CI 失败
- ✅ 文档完整说明 zone 和依赖方向

**涉及文件**：`.fallowrc.json`（新建）、CI 配置

---

### Phase 0.2：依赖清理（Week 1-2）

**目标**：清理未使用的依赖，建立依赖审计机制

**任务**：

1. **识别并移除未使用依赖**
   - [ ] 运行 `fallow dead-code --unused-deps --format json --quiet`
   - [ ] 逐个审查并移除 6 个未使用的依赖
   - [ ] 验证移除后构建和测试通过

2. **依赖审计自动化**
   - [ ] 将 `fallow dead-code --unused-deps` 加入 CI 门禁
   - [ ] 配置 `--fail-on-issues` 阻止新未使用依赖引入
   - [ ] 定期审计依赖使用情况

3. **文档更新**
   - [ ] 更新 `package.json` 注释说明依赖用途
   - [ ] 记录依赖审计的 CI 流程

**验收标准**：
- ✅ 未使用依赖数降至 0
- ✅ CI 门禁阻止新未使用依赖
- ✅ 依赖审计文档完整

**涉及文件**：6 个包的 `package.json`、CI 配置

---

### Phase 0.3：测试代码去重（Week 2-3）

**目标**：抽取重复的测试 setup/teardown 逻辑，减少维护成本

**任务**：

1. **识别测试重复热点**
   - [ ] 运行 `fallow dupes --mode semantic --format json --quiet`
   - [ ] 分析 30+ 个重复测试文件的模式
   - [ ] 分类重复类型（setup、teardown、mock、assertion）

2. **抽取通用测试工具**
   - [ ] 创建 `packages/testing/src/test-utils/` 模块
   - [ ] 实现通用的测试 setup/teardown 函数
   - [ ] 实现通用的 mock 工厂和断言辅助函数
   - [ ] 创建测试 fixture 管理工具

3. **重构现有测试**
   - [ ] 逐个包迁移测试到新的通用工具
   - [ ] 确保所有测试通过
   - [ ] 减少重复代码量 50%+

4. **文档更新**
   - [ ] 创建测试编写指南（`docs/guides/testing.md`）
   - [ ] 说明如何使用新的通用测试工具

**验收标准**：
- ✅ 测试重复组数降低 50%+
- ✅ 通用测试工具被 80%+ 的测试文件使用
- ✅ 测试执行时间不增加（或增加 <10%）

**涉及文件**：`packages/testing/`（新建或扩展）、30+ 个测试文件

---

### Phase 0.4：模块大小拆分（Week 3-4）

**目标**：拆分超大模块，降低单个文件的认知负荷

**任务**：

1. **识别超大模块**
   - [ ] 运行 `fallow health --complexity --complexity-breakdown`
   - [ ] 识别 500+ 行的文件
   - [ ] 识别复杂度最高的函数

2. **制定拆分策略**
   - [ ] 按职责拆分（单一职责原则）
   - [ ] 确保拆分后符合六边形边界规则
   - [ ] 保持向后兼容（或明确弃用计划）

3. **实施拆分**
   - [ ] 逐个模块拆分
   - [ ] 确保所有测试通过
   - [ ] 重构导入路径
   - [ ] 更新 barrel exports（如需要）

4. **文档更新**
   - [ ] 更新模块结构说明
   - [ ] 说明拆分的原因和原则

**验收标准**：
- ✅ 500+ 行文件数减少 80%+
- ✅ 模块复杂度分数下降 30%+
- ✅ 所有测试通过

**涉及文件**：检索模块、持久化层、配置管理等

---

### Phase 0.5：死代码清理（Week 4-5）

**目标**：清理未使用的文件、导出和类型，减少维护负担

**任务**：

1. **清理未使用文件**
   - [ ] 运行 `fallow dead-code --unused-files --format json --quiet`
   - [ ] 审查并删除 5 个未使用的文件
   - [ ] 验证删除后构建和测试通过

2. **清理未使用导出**
   - [ ] 运行 `fallow dead-code --unused-exports --format json --quiet`
   - [ ] 逐个审查 217 个未使用导出
   - [ ] 使用 `fallow fix --dry-run` 预览自动修复
   - [ ] 使用 `fallow fix --yes` 自动删除未使用导出
   - [ ] 对于需要保留的导出，添加 `// fallow-ignore-next-line unused-export`

3. **清理未使用类型**
   - [ ] 运行 `fallow dead-code --unused-types --format json --quiet`
   - [ ] 审查并删除 91 个未使用的类型

4. **CI 门禁集成**
   - [ ] 将 fallow 死代码检查加入 pre-commit hook
   - [ ] 配置 CI pipeline 警告或失败于新死代码

5. **文档更新**
   - [ ] 说明死代码清理的原则和工具

**验收标准**：
- ✅ 未使用文件数降至 0
- ✅ 未使用导出数降低 80%+
- ✅ CI 门禁阻止新死代码
- ✅ 构建和测试时间不显著增加

**涉及文件**：5 个未使用文件、217 个导出、91 个类型

---

### Phase 0.6：耦合度优化（Week 5-6）

**目标**：降低模块耦合度，提升六边形架构的清晰度

**任务**：

1. **分析模块依赖图**
   - [ ] 使用 codegraph 分析模块间依赖
   - [ ] 识别不期望的依赖
   - [ ] 制定解耦策略

2. **重新组织依赖方向**
   - [ ] 确保领域层不依赖基础设施层
   - [ ] 确保用例层通过端口与基础设施层通信
   - [ ] 使用依赖注入替换直接导入

3. **验证六边形架构**
   - [ ] 运行 fallow 边界检查验证
   - [ ] 确保所有违规都被修复或标记为 intentional
   - [ ] 文档记录 intentional 违规的原因

4. **文档更新**
   - [ ] 更新架构图，清晰展示六边形各层
   - [ ] 说明依赖方向的规则和例外

**验收标准**：
- ✅ 耦合度惩罚降至 1.0 以下
- ✅ 所有边界违规都被修复或 intentional
- ✅ 架构文档清晰完整

**涉及文件**：多个模块的依赖导入

---

### Phase 0.7：架构边界验证自动化（Week 6-7）

**目标**：建立完整的架构质量门禁，防止未来退化

**任务**：

1. **集成 fallow 为 CI 核心工具**
   - [ ] 配置 `fallow audit` 作为 PR 门禁
   - [ ] 配置 `--fail-on-regression` 防止质量退化
   - [ ] 设置回归基线

2. **建立质量指标基线**
   - [ ] 保存当前健康评分、重复率、复杂度作为基线
   - [ ] 配置 `fallow --save-baseline .fallow/baseline.json`
   - [ ] CI 失败于基线退化

3. **建立定期审计机制**
   - [ ] 每周运行 `fallow audit --base main`
   - [ ] 记录质量趋势
   - [ ] 识别新的技术债

4. **文档更新**
   - [ ] 创建质量门禁说明文档
   - [ ] 说明 fallow 的使用和配置
   - [ ] 更新 `AGENTS.md` 添加 fallow 相关指导

**验收标准**：
- ✅ CI 门禁在 PR 不通过时阻止合并
- ✅ 质量基线被保存并在 CI 中使用
- ✅ 定期审计流程文档化

**涉及文件**：CI 配置、`.fallowrc.json`、文档

---

## 4. 工具配置

### 4.1 fallow 配置（`.fallowrc.json`）

```json
{
  "$schema": "https://raw.githubusercontent.com/fallow-rs/fallow/main/schema.json",
  "entry": ["packages/*/src/index.ts"],
  "rules": {
    "unused-files": "error",
    "unused-exports": "warn",
    "unused-types": "warn",
    "unused-deps": "error",
    "circular-dependencies": "error",
    "code-duplication": "warn",
    "high-complexity": "warn",
    "boundary-violations": "error"
  },
  "boundaries": {
    "zones": [
      {
        "name": "domain",
        "match": "packages/*/src/domain/**"
      },
      {
        "name": "ports",
        "match": "packages/*/src/ports/**"
      },
      {
        "name": "use-cases",
        "match": "packages/*/src/use-cases/**"
      },
      {
        "name": "commands",
        "match": "packages/*/src/commands/**"
      },
      {
        "name": "http",
        "match": "packages/*/src/http/**"
      },
      {
        "name": "gateway",
        "match": "packages/*/src/gateway/**"
      },
      {
        "name": "config",
        "match": "packages/*/src/config/**"
      },
      {
        "name": "shared",
        "match": "packages/shared/**"
      }
    ],
    "rules": [
      {
        "from": "domain",
        "to": ["ports", "shared"],
        "reason": "领域层只依赖端口接口和共享工具"
      },
      {
        "from": "ports",
        "to": ["shared"],
        "reason": "端口层只依赖共享工具，不依赖具体实现"
      },
      {
        "from": "use-cases",
        "to": ["domain", "ports", "shared"],
        "reason": "用例层依赖领域层和端口接口"
      },
      {
        "from": "commands",
        "to": ["use-cases", "shared"],
        "reason": "命令层依赖用例层"
      },
      {
        "from": "http",
        "to": ["use-cases", "gateway", "shared"],
        "reason": "HTTP适配器层依赖用例层和网关"
      },
      {
        "from": "gateway",
        "to": ["use-cases", "shared"],
        "reason": "网关层依赖用例层"
      },
      {
        "from": "config",
        "to": ["shared"],
        "reason": "配置层只依赖共享工具"
      },
      {
        "from": "shared",
        "to": [],
        "reason": "共享层不依赖其他层"
      }
    ]
  }
}
```

### 4.2 CI 门禁配置

```yaml
# .github/workflows/quality-gate.yml
name: Quality Gate

on: [pull_request]

jobs:
  fallow-audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v3
        with:
          node-version: '18'

      - run: npm install -g fallow

      - name: Fallw Audit
        run: |
          fallow audit --format json --quiet --base ${{ github.event.pull_request.base.sha }} \
            --fail-on-issues --explain > fallow-report.json

      - name: Post PR Comment
        if: always()
        uses: actions/github-script@v6
        with:
          script: |
            const fs = require('fs');
            const report = JSON.parse(fs.readFileSync('fallow-report.json', 'utf8'));
            const summary = `## Fallow Audit Results

            **Verdict**: ${report.verdict}
            **Total Issues**: ${report.total_issues}

            ### Breakdown
            - Dead Code: ${report.breakdown.dead_code}
            - Complexity: ${report.breakdown.complexity}
            - Duplication: ${report.breakdown.duplication}

            Run \`fallow audit --base main\` locally for details.`;

            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: summary
            });
```

### 4.3 Pre-commit Hook

```bash
#!/bin/bash
# .git/hooks/pre-commit

# Run fallow dead-code check
fallow dead-code --format json --quiet --changed-since HEAD || {
  echo "Fallow found dead code in changed files. Please fix before committing."
  exit 1
}

# Run fallow boundary check
fallow list --boundaries --format json --quiet | jq -e '.boundaries.configured' || {
  echo "Warning: Fallow boundaries not configured. Run 'fallow init' to set up."
}
```

---

## 5. 时间表与依赖

### 总时间线

```
Week 1:    Phase 0.1 (边界配置) + Phase 0.2 (依赖清理)
Week 2:    Phase 0.2 (依赖清理) + Phase 0.3 (测试去重)
Week 3:    Phase 0.3 (测试去重) + Phase 0.4 (模块拆分)
Week 4:    Phase 0.4 (模块拆分) + Phase 0.5 (死代码清理)
Week 5:    Phase 0.5 (死代码清理) + Phase 0.6 (耦合度优化)
Week 6:    Phase 0.6 (耦合度优化) + Phase 0.7 (自动化门禁)
Week 7:    Phase 0.7 (自动化门禁) + 文档收尾
```

### 依赖关系

```
Phase 0.1 (边界配置) ← 必须首先完成
Phase 0.2 (依赖清理) ← 可并行 Phase 0.1
Phase 0.3 (测试去重) ← 可并行 Phase 0.2
Phase 0.4 (模块拆分) ← 必须 Phase 0.1 完成后
Phase 0.5 (死代码清理) ← 可并行 Phase 0.3/0.4
Phase 0.6 (耦合度优化) ← 必须 Phase 0.1/0.4 完成后
Phase 0.7 (自动化门禁) ← 最后完成
```

### 风险与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| 测试重构引入回归 | 中 | 高 | 逐个包迁移，全量测试验证 |
| 模块拆分导致导入路径大范围修改 | 中 | 中 | 使用 IDE 重构工具，分步实施 |
| 架构边界规则过于严格 | 低 | 中 | 从 `warn` 开始，逐步提升到 `error` |
| 自动修复删除重要导出 | 低 | 高 | 先 dry-run，审查后再 apply |

---

## 6. 验收标准（总）

### 6.1 量化指标

| 指标 | 基线（当前） | 目标（完成后） | 验证方式 |
|------|-------------|--------------|---------|
| 健康评分 | 70.3 | 85+ | `fallow health --score` |
| 健康等级 | B | A | `fallow health --score` |
| 未使用文件 | 5 | 0 | `fallow dead-code --unused-files` |
| 未使用导出 | 217 | <50 | `fallow dead-code --unused-exports` |
| 未使用类型 | 95 | <20 | `fallow dead-code --unused-types` |
| 未使用依赖 | 6 | 0 | `fallow dead-code --unused-deps` |
| 重复代码组 | 4,957 | <2,500 | `fallow dupes` |
| 重复实例 | 12,127 | <6,000 | `fallow dupes` |
| 架构边界违规 | 未配置 | 0 | `fallow list --boundaries` |
| 模块复杂度 | 高 | 低 | `fallow health --complexity` |

### 6.2 流程指标

- [ ] CI 门禁在 PR 不通过时阻止合并
- [ ] Pre-commit hook 在提交前运行 fallow 检查
- [ ] 定期审计流程文档化
- [ ] 质量基线被保存并使用

### 6.3 文档指标

- [ ] 架构边界规则文档完整
- [ ] 测试编写指南完整
- [ ] 模块结构文档更新
- [ ] 质量门禁使用指南完整

---

## 7. 指标追踪

### 7.1 定期指标

```bash
# 每周运行
fallow health --format json --quiet --score
fallow dead-code --format json --quiet | jq '.total_issues'
fallow dupes --format json --quiet | jq '.clone_groups | length'
fallow list --boundaries --format json --quiet | jq '.boundaries.configured'
```

### 7.2 趋势分析

使用 `fallow impact enable` 追踪 fallow 的价值输出。

---

## 8. 相关文档

- **现有审计**：[`static-analysis-audit-2026-06-29.md`](./static-analysis-audit-2026-06-29.md)
- **债务注册**：[`open-debt-and-compromises.md`](./open-debt-and-compromises.md)
- **服务发现计划**：[`service-discovery-and-observability-plan.md`](./service-discovery-and-observability-plan.md)
- **fallow 文档**：[https://docs.fallow.tools](https://docs.fallow.tools)

---

## 9. 下一步行动

1. **立即执行**：Phase 0.1（架构边界配置）
2. **并行启动**：Phase 0.2（依赖清理）
3. **完成后**：进入服务发现主线（Phase 1）

---

## 10. 附录：fallow 分析原始数据

> 数据采集时间：2026-06-30（与文档创建同步）

```json
{
  "health_score": {
    "score": 70.3,
    "grade": "B",
    "penalties": {
      "dead_files": 0.1,
      "dead_exports": 1.7,
      "complexity": 0.0,
      "maintainability": 0.3,
      "unused_deps": 4.0,
      "circular_deps": 1.5,
      "unit_size": 10.0,
      "coupling": 2.1,
      "duplication": 10.0
    }
  },
  "dead_code": {
    "total_issues": 392,
    "unused_files": 5,
    "unused_exports": 217,
    "unused_types": 95,
    "unused_class_members": 46,
    "unresolved_imports": 6,
    "circular_dependencies": 3,
    "unused_dependencies": 6
  },
  "duplication": {
    "clone_groups": 4957,
    "total_instances": 12127
  },
  "boundaries": {
    "configured": false,
    "zone_count": 0
  },
  "audit": {
    "verdict": "fail",
    "dead_code_issues": 15
  }
}
```
