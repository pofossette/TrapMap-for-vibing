# 标签三路匹配对齐效果检测计划

## 1. 目标

为 TrapMap 新增一类独立 eval suite，用于检测项目入库阶段"标签三路匹配对齐"管线的实际效果：LLM 从 Skill 内容中提取出的原始标签存在多少同义实体，三路召回 + LLM 裁决管线又能消除其中多少。

本计划首版只交付：

- 可扩展的测试脚手架
- 真实模型执行入口（完整对齐管线）
- dry-run 执行入口（只测确定性召回层）
- 1-2 个 smoke 级标注 Skill fixture
- 聚合报表与文档

本计划首版不交付：

- 大规模正式标注数据集
- 与向量召回强绑定的 embedding 评测（首版 embedding 召回为可选加分项）
- 自动化标注工具链

## 2. 关键约束

- 一个完整 case 的主标识必须是"标注 Skill"，不是某个标签名，也不是规范目录快照名。
- 同一个标注 Skill 可以挂多个变体；变体之间只改变目录预置状态、干扰标签数量、向量召回开关等控制变量。
- 目录种子数据（catalog seed）在每个 case 执行前预置、执行后销毁，不依赖线上数据库状态。
- 标注 Skill 的内容必须优先复用仓内已有的 Skill fixture 或真实下载的 Skill，不新造一套脱离现有 fixture 语义的假文本。
- LLM 提取阶段在首版不做重复测试——假设 `graph-extraction` eval 已覆盖提取质量，本 eval 只关注"提取出的原始标签 → 对齐后的规范标签"这一段。
- 执行模型与 chat provider 解耦配置；首版默认走同一 provider 家族，但接口不能写死成单一路径。
- 这条 eval 属于独立 suite，不复用 retrieval/summary/graph-extraction case schema，也不把对齐打分硬塞进现有 report 结构。

## 3. 数据建模规则

### 3.1 Case 与 Variant

- `skillId`：同一标注 Skill 的稳定标识，作为完整 case 的主标识。
- `variantId`：同一 Skill 下的具体变体标识。
- `variantGroupId`：同一 Skill 的一组对比实验归组键，至少覆盖：
  - `catalog-populated`
  - `catalog-empty`
  - `with-embedding`
  - `no-embedding`
- `tier`：`smoke` 或 `core`。
- `synonymGroupCount`：该 Skill 中人工标注的同义实体组数。
- `totalRawLabels`：该 Skill 中人工标注的原始标签总数。
- `totalCanonicalLabels`：该 Skill 中人工标注的规范标签总数。
- `catalogSeed`：该变体预置到目录中的规范标签列表。
- `embeddingEnabled`：是否启用向量召回。

### 3.2 标注结构

每个标注 Skill 必须提供 `goldenAnnotations`，内容包括：

- `rawLabels`：原始标签列表，每个包含 `label`（标签文本）、`evidence`（上下文描述）、`kind`（节点类型，可选）。
- `synonymGroups`：同义实体分组，每组包含：
  - `canonicalName`：该组的规范名称
  - `members`：属于该组的原始标签文本列表（长度 ≥ 2 才算一组同义实体）
  - `kind`：节点类型
  - `definition`：可选的定义文本
- `expectedAlignment`：对齐后期望的输出标签列表（去重后），每项包含：
  - `canonicalName`：规范名
  - `decision`：`existing`（目录中有）或 `new`（应创建新的）
  - `canonicalLabelId`：若 `existing`，应归入哪个规范标签 ID

### 3.3 效果度量口径

同一 `skillId` 下，必须能计算：

- **同义实体数** = `totalRawLabels - totalCanonicalLabels`
- **成功消除数** = 对齐后实际输出的规范标签数中，被正确合并的同义实体数
- **遗漏未合并数** = 应该合并但系统没合并的同义实体数
- **误合并数** = 不应该合并但系统错误合并的标签数
- **同义消除率** = `成功消除数 / max(同义实体数, 1)`
- **对齐准确率** = `正确对齐的标签数 / totalCanonicalLabels`

报表同时输出：

- 各 recall reason 的命中分布（exact-alias / normalized-name / semantic-embedding 各贡献了多少）
- LLM 裁决与期望一致率
- dry-run 模式下的召回层独立指标

## 4. 标注 Skill 来源与构造规则

### 4.1 内容来源必须优先复用仓内现有数据

首版标注 Skill 内容必须优先来自以下仓内来源：

- `evals/ingestion/fixtures/*/SKILL.md`
  - 用作最小 Skill 内容池，适合构造短文本、单一主题的标注用例。
- `evals/fixtures/traps/index.ts` 中的 trap JSON
  - 用作标签内容素材，从中提取常见的同义标签场景（如 "connection pool exhaustion" / "连接池耗尽" / "pool timeout"）。
- `evals/graph-extraction/fixtures-real.ts`
  - 用作真实场景 Skill 文本池，适合构造更接近真实提取结果的标注用例。
- `evals/graph-extraction/dedup-fixtures-real.ts`
  - 用作高相似度标签对素材池，适合构造"容易误合并"或"容易遗漏合并"的边界用例。

### 4.2 同义实体场景覆盖

首版 smoke 用例至少覆盖以下 4 类同义场景：

- **精确别名**：原始标签和目录别名完全一致（如 `useEffect 陷阱` → 目录别名 `useEffect 陷阱`）
- **归一化可消歧**：原始标签和规范名只差大小写、空格、连写（如 `react hooks` → `React Hooks`）
- **语义近似**：原始标签和规范名字面不同但语义一致（如 `连接池耗尽` → `connection pool exhaustion`）
- **不该合并的近似**：原始标签和某个规范名很像但实际不同（如 `端口映射` vs `端口转发`，语义相近但不是一回事）

### 4.3 目录种子数据构造规则

- `catalog-populated` 变体：预置一组规范标签和别名，模拟"目录已有部分知识"的状态。
- `catalog-empty` 变体：不预置任何标签，所有标签都应该走 `new` 决策路径。
- 种子数据中的别名至少包含一个 `manual` 来源和一个 `llm` 来源，验证来源不影响召回。
- 同一 `skillId` 的不同变体不允许修改 Skill 内容本身，只允许修改目录预置状态和配置开关。

## 5. 实现范围

### 5.1 Contracts

在 `packages/contracts/src/domain/evals/` 新增独立 contract：

- label alignment eval case schema
- label alignment eval fixture schema
- label alignment eval report schema

最少字段必须覆盖：

- `skillId`
- `variantId`
- `variantGroupId`
- `tier`
- `synonymGroupCount`
- `totalRawLabels`
- `totalCanonicalLabels`
- `catalogSeed`
- `embeddingEnabled`
- `goldenAnnotations`
- `expectedAlignment`
- `tags`

### 5.2 Evals 目录

新增 `evals/label-alignment/`：

- `README.md`
- `run.ts`
- `smoke.ts`
- `core.ts`
- `fixtures/` — 标注 Skill fixture 目录
- `lib/`

`lib/` 至少拆成：

- `recall-eval.ts` — 召回层独立评测（dry-run 核心逻辑）
- `decision-eval.ts` — LLM 裁决层评测
- `metrics.ts` — 指标聚合
- `report.ts` — 报告结构化输出
- `format.ts` — 终端格式化
- `catalog-seed.ts` — 目录种子数据的预置与清理工具

### 5.3 CLI 与聚合入口

新增 root scripts：

- `eval:label-alignment`
- `eval:label-alignment:smoke`
- `eval:label-alignment:core`
- `eval:label-alignment:dry-run`

并把该 suite 接入 `evals/scripts/eval-all.ts`，使其进入：

- `pnpm eval:smoke`
- `pnpm eval:core`

### 5.4 执行管线

- `recall-eval.ts` 负责 dry-run 模式：
  - 预置 catalog seed
  - 对每个 rawLabel 调用 `recallCandidates()`
  - 比较召回结果与期望的 recallExpectations
  - 输出召回层指标
  - 清理 catalog seed
- `decision-eval.ts` 负责 live 模式：
  - 预置 catalog seed
  - 对每个 rawLabel 调用完整 `alignLabel()` 管线
  - 比较最终 decision 与 expectedAlignment
  - 统计同义消除数、误合并数、遗漏数
  - 清理 catalog seed
- catalog seed 预置通过 `LabelRepository.upsertCanonicalLabel()` 和 `upsertAlias()` 实现，清理通过测试 transaction rollback 或显式删除实现。

## 6. Smoke 数据要求

首版至少放 1-2 个标注 Skill fixture，并满足：

- 每个 fixture 都有 `skillId`
- 内容来自 `evals/ingestion/fixtures/*/SKILL.md` 或 `evals/fixtures/traps/index.ts`
- 每个 fixture 至少有 3 组原始标签，其中至少 1 组是同义实体（≥ 2 个成员）
- 每个 fixture 至少有两个变体：
  - `catalog-populated` 变体（目录有预置数据）
  - `catalog-empty` 变体（目录为空）
- 至少有一个变体启用向量召回（如果环境支持）
- 至少有一个 case 包含"不该合并的近似"场景

### 示例 fixture 结构

```typescript
export const dockerDeploySkill: LabelAlignmentFixture = {
  id: 'docker-deploy-skill',
  tier: 'smoke',
  skillContent: `# Docker Deploy Guide
  ...（来自 evals/ingestion/fixtures/ 或真实 Skill 内容）`,
  goldenAnnotations: {
    rawLabels: [
      { label: 'Docker Compose', evidence: '使用 docker-compose 编排多容器', kind: 'tool' },
      { label: 'docker-compose 配置', evidence: '编写 docker-compose.yml', kind: 'tool' },
      { label: 'port mapping', evidence: '配置端口映射', kind: 'cue' },
      { label: '端口暴露', evidence: 'EXPOSE 指令暴露端口', kind: 'cue' },
      { label: '.env 配置', evidence: '使用 .env 文件注入环境变量', kind: 'cue' },
      { label: 'env_file', evidence: 'docker-compose env_file 指令', kind: 'cue' },
      { label: '健康检查', evidence: '配置 container healthcheck', kind: 'cue' },
    ],
    synonymGroups: [
      {
        canonicalName: '容器编排',
        members: ['Docker Compose', 'docker-compose 配置'],
        kind: 'tool',
        definition: '使用 Docker Compose 或类似工具编排多容器应用',
      },
      {
        canonicalName: '端口映射',
        members: ['port mapping', '端口暴露'],
        kind: 'cue',
        definition: '容器内外端口映射配置',
      },
      {
        canonicalName: '环境变量注入',
        members: ['.env 配置', 'env_file'],
        kind: 'cue',
        definition: '通过文件或指令向容器注入环境变量',
      },
      // "健康检查" 单独一组，不同义，decision = new
    ],
    expectedAlignment: [
      { canonicalName: '容器编排', decision: 'new' },
      { canonicalName: '端口映射', decision: 'new' },
      { canonicalName: '环境变量注入', decision: 'new' },
      { canonicalName: '健康检查', decision: 'new' },
    ],
  },
  variants: [
    {
      variantId: 'catalog-populated',
      variantGroupId: 'catalog-populated',
      embeddingEnabled: false,
      catalogSeed: [
        {
          id: 'lbl_container_orchestration',
          canonicalName: '容器编排',
          aliases: ['Docker Compose'],
          kind: 'tool',
          definition: '使用 Docker Compose 或类似工具编排多容器应用',
        },
      ],
    },
    {
      variantId: 'catalog-empty',
      variantGroupId: 'catalog-empty',
      embeddingEnabled: false,
      catalogSeed: [],
    },
  ],
};
```

## 7. 报表要求

报告分为 case 级、group 级、slice 级三层：

- case 级：
  - 原始标签列表
  - 对齐后输出列表
  - 每个 rawLabel 的 recall 命中情况
  - 每个 rawLabel 的 LLM 裁决结果
  - 同义消除数 / 遗漏数 / 误合并数
  - 同义消除率与对齐准确率
  - pass/fail（消除率 ≥ 阈值则 pass）
- group 级：
  - 同一 `skillId` 下各变体对比
  - `catalog-populated` 对 `catalog-empty` 的指标差异
  - `with-embedding` 对 `no-embedding` 的指标差异
- slice 级：
  - 按 `tier`
  - 按 `synonymGroupCount` 区间
  - 按同义场景类型（精确别名 / 归一化 / 语义近似 / 不该合并）
  - 按 `embeddingEnabled`
  - 按 catalog seed 填充度

终端报告格式（dry-run 模式示例）：

```
============================================================
         Label Alignment Evaluation Report (dry-run)
============================================================

Mode: DRY-RUN (recall layer only, no LLM calls)
Total fixtures: 2

=== Aggregate Metrics ===

Metric                  | Value
------------------------|--------
Recall Hit Rate         |  0.900
Exact Alias Hits        |      4
Normalized Name Hits    |      3
Embedding Hits          |      0
Total Synonym Entities  |      5
Successfully Eliminated |      4
Elimination Rate        |  0.800

=== Per-Case Results ===

Skill ID                | Var   | Raw | Canon | Elim | Elim%
------------------------|-------|-----|-------|------|-------
docker-deploy-skill     | pop   |   7 |     4 |    3 |  1.00
docker-deploy-skill     | empty |   7 |     4 |    3 |  1.00
react-hooks-skill       | pop   |   6 |     4 |    1 |  0.50

=== Synonym Breakdown ===

Skill                 | Group             | Members              | Merged
----------------------|-------------------|----------------------|-------
docker-deploy-skill   | 容器编排          | Docker Compose, ...  | ✅
docker-deploy-skill   | 端口映射          | port mapping, ...    | ✅
react-hooks-skill     | Hook 闭包         | useEffect 陷阱, ...  | ❌ (未命中)

Duration: 120ms
```

## 8. 文档回写

至少更新：

- `evals/README.md`
- `docs/operations/TESTING.md`
- `evals/label-alignment/README.md`

如果新增命令或 suite 名称容易漂移，补充 doc drift guard，锁定：

- `eval:label-alignment*` 命令面
- `evals/label-alignment/` 目录入口
- "完整 case 以标注 Skill 为标识"的规则
- "同一 Skill 配置不同目录预置状态"的规则

## 9. 最小验证

实现完成后至少运行：

```bash
pnpm --filter @trapmap/contracts test --run <label-alignment-contract-tests>
pnpm test:file -- <label-alignment-runner-tests>
pnpm eval:label-alignment:dry-run
pnpm eval:smoke
pnpm check:docs-drift
pnpm check:structure
```

如果首版真实模型执行默认需要 provider env，则 dry-run 必须在无 provider env 条件下也能通过。

## 10. 首版完成标准

- 新 suite 能独立运行 dry-run
- root eval 聚合入口能识别并汇总该 suite
- 至少 1 个 `skillId` 能跑出 `catalog-populated` 与 `catalog-empty` 对比结果
- 至少覆盖精确别名、归一化、语义近似、不该合并 4 类同义场景中的 3 类
- 标注 Skill 内容来源明确绑定仓内现有 fixture 或真实 Skill
- 文档写明 case 标识规则、目录预置规则、同义场景覆盖规则与扩展位
- 报表能输出同义实体数、消除数、消除率三个核心指标
