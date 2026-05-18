# LLM 驱动的图构建与入库智能设计

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 LLM 完全替代 graph-extract.ts 中的规则引擎，同时增强重复检测、冲突检测和预审质量评估。

**Architecture:** 两阶段 LLM 提取（架构思路借鉴 capsule 管线的两阶段模式，具体流程为新设计：Phase 1 切分策略，Phase 2 并行补全），入库效果优先，出库纯代码路径不变。规则引擎保留为降级 fallback。

**Tech Stack:** `@langchain/openai`, `ChatProvider` (现有), `Zod` schema 校验, `graphology` (现有), 现有 prompt 模板系统 (`ai/prompts.ts`)

**前置条件:** `ChatProvider` 已配置（AI_CHAT_MODEL 非空）

**边界:** 不涉及 Skill Capsule 派生/评分（见 `plans/capsule-contextual-enrichment-plan.md`，已完成 92%，仅剩 C-3 benchmark）

**预估总工作量:** 10-15 天（Phase 1 可拆为 1a/1b 两个子阶段）

---

## 与 capsule-contextual-enrichment-plan 的边界

| capsule 计划（不碰） | 本计划（做） |
|---------------------|-------------|
| `contextual-enrichment.ts` — Skill capsule 上下文前缀 | `graph-lite/llm-extract.ts` — Trap/Skill 图实体提取 |
| `derive.ts` 修改 — 派生流程 | `adapters/graph.ts` 修改 — 图索引适配器 |
| `capsule-recall.ts` 评分 | `detector.ts` / `detect.ts` / `pre-review.ts` 增强 |
| `contextualPrefix` 字段 | `graph-extraction.ts` Zod schema |
| Skill Capsule 内容生成 | 图 nodes/edges/strength 提取 |

零重叠。共享基础设施: `ChatProvider`, `ai/prompts.ts`, `ai/cache/`。

---

## 现状问题分析

### 图实体提取 — `graph-extract.ts`

- 工具列表分裂: `toolKeywords`(47 项) vs `TOOL_KEYWORDS`(35 项)，trap/skill 侧不一致
- 子串误触发: `'ci'` 匹配 `'accessed'`, `'ts'` 匹配 `'tokens'`
- 新技术不可见: Cloudflare Workers、Supabase、Turbopack 等不在列表
- 症状模式太泛: `'error'` 匹配任何含 "error" 的文本
- 正则贪婪: `/prerequisite[:\s]+([^.!\n]+)/gi` 混入无关内容

### 强度分类 — `containsHardTrigger()`

- 无否定处理: `"this does NOT require X"` 误判为 hard
- 无句级作用域: 一个 `"must"` 出现 → 全文所有边变 hard

### 重复/冲突检测 — `detector.ts` / `detect.ts`

- Jaccard 同义词漏检: `"deploy docker"` vs `"ship docker"` 只共享 `"docker"`
- 静态阈值 (0.72/0.5/0.3) 无语义校准

### Pre-review — `pre-review.ts`

- 6 个 evidenceTerms 出现计数无法区分实质解释和表面提及
- completenessRisk 纯长度判断 (80/160 字符)

---

## 两阶段 LLM 切片策略（本文档新设计，借鉴 capsule 管线架构）

参考 `contextual-enrichment.ts` 的 `generateCapsuleManifest` + `generateCapsuleContents` 两阶段模式：

```
输入文本 (canonicalText)
        │
        ▼
  Phase 1: 切分策略 LLM 调用
  ├── 输入: 完整文本 (截断至 maxChars)
  ├── 输出: ExtractionPlan (JSON)
  │     { segments: [{ text, contextHint, priority }] }
  ├── 若文本 <= CHUNK_THRESHOLD (2000 chars): 单段处理，跳过 Phase 2
  └── 缓存: contentHash → ExtractionPlan
        │
        ▼ (仅长文本)
  Phase 2: 并行补全 LLM 调用
  ├── 对每个 segment 并行调用 (maxConcurrent=3)
  ├── 共享 system prompt (prompt cache 命中)
  ├── 每段输出: { nodes[], edges[] }
  └── 合并所有段结果 → 全量 nodes[] + edges[]
        │
        ▼
  Gleaning (可选二次提取)
        │
        ▼
  nodeId 映射 + trap/skill 根节点注入
        │
        ▼
  返回 LlmExtractionResult { nodes[], edges[] }
```

**为什么不总是分块:** TrapMap 条目通常 200-2000 词，单次 LLM 调用即可处理。仅当文本超过 `CHUNK_THRESHOLD` 时才触发两阶段。Skill capsule 的 `profile + capsules` 文本通常较短，同样单次处理。

**缓存命中策略:**
```
缓存键: SHA-256(text + promptVersion)
  Phase 1 缓存: text → ExtractionPlan (避免重复切分)
  Phase 2 缓存: text → LlmExtractionResult (避免重复提取)
  失效: text 变化 (contentHash) 或 promptVersion 递增
```

**实现时可参考的现有模式（均来自 capsule 管线，需新写图提取版本）:**
- 并发控制: 参考 `contextual-enrichment.ts` 的 `maxConcurrent + Promise.all` 批次模式
- 三层降级: LLM → 缓存 → 规则引擎 fallback（capsule 管线的降级目标是确定性前缀，本计划改为降级到 graph-extract.ts 规则引擎）
- 指数退避: 参考 `generateSingleCapsuleContent` 的重试模式 (maxRetries=2, 100ms/400ms)
- Kill-switch: 参考 `enrichmentEnabled` 模式

---

## 文档同步要求

| 代码文件 | 必须更新的文档 |
|---------|---------------|
| `contracts/src/domain/graph-extraction.ts` | `docs/reference/DATA_MODEL.md` |
| `server/src/lib/indexing/graph-lite/llm-extract.ts` | `docs/architecture/components/INDEXING.md` |
| `server/src/lib/indexing/adapters/graph.ts` | `docs/architecture/components/INDEXING.md` |
| `server/src/lib/indexing/adapters/artifact-graph.ts` | `docs/architecture/components/INDEXING.md` |
| `server/src/lib/indexing/skill-events.ts` | `docs/architecture/components/INDEXING.md` |
| `server/src/lib/candidates/llm-dedup.ts` | `docs/architecture/components/INGESTION.md` |
| `server/src/lib/conflict/llm-conflict.ts` | `docs/architecture/components/INGESTION.md` |
| `server/src/lib/pre-review.ts` | `docs/architecture/components/INGESTION.md` |
| `server/src/lib/ai/prompts.ts` | `docs/reference/ENVIRONMENT.md`（如有新环境变量） |
| 测试文件 | `docs/operations/TESTING.md` |

**每个阶段的文档检查项:**
- [ ] 新增/修改的数据结构已在 `DATA_MODEL.md` 中说明
- [ ] 新增/修改的模块已在对应架构文档中说明
- [ ] Prompt 模板变更已记录
- [ ] 环境变量或配置项已添加到 `ENVIRONMENT.md`
- [ ] `DATA_TYPES_PIPELINE.md` 流程图已更新（如有数据流程变更）

---

## 阶段完成标准

- [ ] 所有任务的 checkbox 已标记为完成
- [ ] 所有对应位置的文档已更新
- [ ] `pnpm typecheck` 通过
- [ ] `pnpm lint` 通过
- [ ] `pnpm test` 通过
- [ ] 相关 eval 测试通过（如有）

---

## 并行执行指南

```
执行顺序与并行度:

  Phase 1 (串行，基础层):
    1-1 → 1-2 → 1-3 → 1-4 → 1-5 → 1-6
    (后续阶段依赖 Phase 1 的 schema 和 prompt)

  Phase 2 ∥ Phase 3 (并行，互不依赖):
    ┌─ 2-1 → 2-2 → 2-3 → 2-4 ─┐
    │   candidates/llm-dedup.ts  │
    │   candidates/detector.ts   │
    │   conflict/llm-conflict.ts │
    │   conflict/detect.ts       │
    └────────────────────────────┘
    ┌─ 3-1 → 3-2 → 3-3 ────────┐
    │   boundary-extract.ts      │
    │   pre-review.ts            │
    └────────────────────────────┘

  Phase 4 (串行，依赖所有前置):
    4-1 → 4-2 → 4-3 → 4-4
```

**推荐: Phase 1 完成后，用 2 个并行 subagent 分别执行 Phase 2 和 Phase 3。**

---

## Phase 1: 图实体提取 LLM 化

**目标**: 两阶段 LLM 提取完全替代 graph-extract.ts 中的规则引擎。
**预估工作量**: 4-5 天

### 任务清单

- [ ] **1-1: Zod Schema 定义** (0.5 天)
  - [ ] 新建 `packages/contracts/src/domain/graph-extraction.ts`
  - [ ] 定义 `llmGraphNodeSchema` (kind, label, description)
  - [ ] 定义 `llmGraphEdgeSchema` (sourceLabel, targetLabel, relationType, strength, description)
  - [ ] 定义 `llmGraphExtractionSchema` (nodes max 15, edges max 20)
  - [ ] 定义 `extractionPlanSchema` (segments: [{text, contextHint, priority}])
  - [ ] 定义 `extractionMetrics` (llmSuccessCount, cacheHitCount, fallbackCount, phase1Ms, phase2Ms)
  - [ ] 导出 TypeScript 类型
  - [ ] 编写 schema 校验单元测试

- [ ] **1-2: Prompt 模板** (0.5 天)
  - [ ] 在 `packages/server/src/lib/ai/providers/types.ts` 的 `AiPromptTaskType` 添加 `'graph-extraction'` 和 `'graph-extraction-planner'`
  - [ ] 在 `packages/server/src/lib/ai/providers/templates/` 新增 `graph-extraction.xml`
  - [ ] 在 `packages/server/src/lib/ai/prompts.ts` 添加:
    - [ ] `buildGraphExtractionPlannerSlots()` — Phase 1 切分策略 prompt
    - [ ] `buildGraphExtractionSlots()` — Phase 2 实体提取 prompt
    - [ ] 对应的 `buildGraphExtractionSystemPrompt()` 和 `buildGraphExtractionSystemPromptBlocks()` 导出
  - [ ] 编写 Phase 2 prompt 的 few-shot 示例 (至少 2 个，覆盖 tool/cue/prereq/mitigation/strength 场景)
  - [ ] 验证 prompt 在目标模型上的 JSON 输出稳定性

- [ ] **1-3: LLM 提取核心模块** (2 天)
  - [ ] 新建 `packages/server/src/lib/indexing/graph-lite/llm-extract.ts`
  - [ ] 实现 `planExtraction(chat, text)` — Phase 1 切分策略:
    - [ ] 文本 <= `CHUNK_THRESHOLD`(2000 chars) → 返回单段 plan
    - [ ] 文本 > `CHUNK_THRESHOLD` → LLM 调用返回 ExtractionPlan
    - [ ] 缓存: `contentHash → ExtractionPlan` (复用 `ContextualEnrichmentCache` 模式)
  - [ ] 实现 `extractSegmentEntities(chat, segment)` — Phase 2 单段提取:
    - [ ] LLM 调用 → JSON.parse → Zod 校验 → 返回 nodes/edges
    - [ ] 指数退避重试 (maxRetries=2, 100ms/400ms，复用 contextual-enrichment 模式)
  - [ ] 实现 `extractGraphEntitiesWithLLM(chat, text, options?)` — 两阶段编排:
    - [ ] 调用 `planExtraction()` 获取 segments
    - [ ] 若单段 → 直接调用 `extractSegmentEntities()`
    - [ ] 若多段 → 并发调用 (maxConcurrent=3, 复用批次模式)
    - [ ] 合并所有段的 nodes/edges (按 label 去重，同 label 取更长 description)
    - [ ] 可选 gleaning 二次提取
    - [ ] 返回 `LlmExtractionResult`
  - [ ] 实现 `buildNodeId(kind, label)` 等 ID 生成辅助 (复用现有 `normalizeValue()`)
  - [ ] 实现三层降级: LLM → 缓存 → `extractTrapGraphEntities()` 规则引擎
  - [ ] 编写单元测试 (mock ChatProvider):
    - [ ] 短文本单段提取
    - [ ] 长文本两阶段切分 + 并行提取
    - [ ] gleaning 合并正确性
    - [ ] LLM 失败回退到规则引擎
    - [ ] JSON parse / Zod 校验失败回退
    - [ ] 缓存命中跳过 LLM 调用

- [ ] **1-4: Gleaning 二次提取** (0.5 天)
  - [ ] 实现 gleaning prompt 追问模板
  - [ ] 在 `extractGraphEntitiesWithLLM` 中集成 gleaning
  - [ ] 实现首次 + gleaning 结果的并集合并 (同 label 取更长 description)
  - [ ] 编写 gleaning 合并逻辑的单元测试

- [ ] **1-5: 图适配器集成 — Trap 侧** (1 天)
  - [ ] 修改 `packages/server/src/lib/indexing/adapters/graph.ts` 的 `sync()`:
    - [ ] 参数添加 `chat?: ChatProvider`
    - [ ] 将 `extractTrapGraphEntities(document)` 替换为 `extractGraphEntitiesWithLLM(chat, document.canonicalText)` + trap 根节点注入
    - [ ] 保留 `extractBoundaryGraphEntities()` 调用不变
    - [ ] 合并 LLM 结果 + boundary 结果 → `buildTrapGraphDocument()`
  - [ ] 修改 `packages/server/src/lib/indexing/pipeline.ts` 的 `syncKnowledgeIndex()`:
    - [ ] 将 `services.ai.chat` 传递给 graph adapter
  - [ ] 修改 `packages/server/src/lib/indexing/events.ts` 中的 adapter 调用签名
  - [ ] 运行现有图索引测试确保无回归

- [ ] **1-6: 图适配器集成 — Skill 侧** (0.5 天)
  - [ ] 修改 `packages/server/src/lib/indexing/skill-events.ts`:
    - [ ] `extractSkillGraphPrimitives()` 改为调用 `extractGraphEntitiesWithLLM()`
    - [ ] 保持安全约束: 仅读 profile.summary/keywords + capsules 文本
  - [ ] 修改 `packages/server/src/lib/indexing/adapters/artifact-graph.ts` 的 `sync()`:
    - [ ] 参数添加 `chat?: ChatProvider`
    - [ ] 传递 chat 给 `buildSkillGraphDocument()`
  - [ ] 运行现有 artifact-graph 测试

### 验收标准

##### 测试检查
- [ ] `pnpm typecheck` 通过
- [ ] `pnpm lint` 通过
- [ ] `pnpm test` 通过
- [ ] `llm-extract.ts` 单元测试覆盖:
  - [ ] 正常提取 (tool/cue/prereq/mitigation/env 全覆盖)
  - [ ] strength 判定 (hard/soft 各至少 2 例)
  - [ ] 否定句处理 ("does NOT require" 不提取 requires 边)
  - [ ] 两阶段切分: 短文本单段、长文本多段
  - [ ] 并发合并正确性
  - [ ] 边界情况: 空文本、超短文本、纯代码片段
  - [ ] 三层降级全路径
- [ ] 图适配器集成测试: 入库 → 图文档生成 → cycle check 通过
- [ ] Skill 侧集成测试: artifact 入库 → skill 图文档正确生成

##### 文档同步检查
- [ ] `DATA_MODEL.md` 已更新
- [ ] `INDEXING.md` 已更新
- [ ] `DATA_TYPES_PIPELINE.md` 已更新
- [ ] `ENVIRONMENT.md` 已更新 (如适用)

##### Phase 1 完成检查
- [ ] 所有 checkbox 已标记完成
- [ ] `pnpm typecheck` / `pnpm lint` / `pnpm test` 全部通过
- [ ] 文档同步完成
- 签字: ___  日期: ___

---

## Phase 2: 重复/冲突检测 LLM 增强

**目标**: Jaccard 预筛 + LLM 语义判定两阶段管道。
**预估工作量**: 2-3 天
**依赖**: Phase 1 完成（使用同一 ChatProvider 和 prompt 基础设施）
**可并行**: 与 Phase 3 并行执行

### 任务清单

- [ ] **2-1: LLM 重复判定模块** (1 天)
  - [ ] 新建 `packages/server/src/lib/candidates/llm-dedup.ts`
  - [ ] 定义 `LlmDuplicateJudgment` 接口 (isDuplicate, confidence, overlapType, reasoning)
  - [ ] 实现 `judgeDuplicateWithLLM(chat, candidate, existing)` 函数
  - [ ] 编写 duplicate judgment prompt (exact/semantic/none 三分类)
  - [ ] 实现 JSON 输出解析 + Zod 校验
  - [ ] 编写单元测试 (mock ChatProvider, 至少 3 种 overlapType 场景)

- [ ] **2-2: 集成到 detector.ts** (0.5 天)
  - [ ] 修改 `packages/server/src/lib/candidates/detector.ts` 的 `detectDuplicates()`
  - [ ] 实现两阶段: Jaccard 预筛 top-K → LLM 判定
  - [ ] `chat.isConfigured && candidates.length > 0` 时调用 LLM
  - [ ] `isDuplicate=true && confidence >= 0.8` → 标记为 duplicate
  - [ ] LLM 未配置或失败 → 退化为纯 Jaccard
  - [ ] 同样修改 `pg-detector.ts`
  - [ ] 更新 `getDetectionVersion()` 版本号

- [ ] **2-3: LLM 冲突判定模块** (0.5 天)
  - [ ] 新建 `packages/server/src/lib/conflict/llm-conflict.ts`
  - [ ] 定义 `LlmConflictJudgment` 接口
  - [ ] 实现 `judgeConflictWithLLM(chat, entryA, entryB)`
  - [ ] 编写 conflict judgment prompt (contradictory/alternative/superseded/none)
  - [ ] 编写单元测试

- [ ] **2-4: 集成到 detect.ts** (0.5 天)
  - [ ] 修改 `packages/server/src/lib/conflict/detect.ts` 的 `detectConflicts()`
  - [ ] Jaccard 预筛阈值从 0.5 放宽到 0.3
  - [ ] 对预筛候选对调用 `judgeConflictWithLLM()`
  - [ ] LLM 未配置 → 退化为纯 Jaccard

### 验收标准

##### 测试检查
- [ ] `pnpm typecheck` / `pnpm lint` / `pnpm test` 通过
- [ ] `llm-dedup.ts`: exact/semantic/none 判定 + 失败降级 + confidence 边界
- [ ] `llm-conflict.ts`: contradictory/alternative/superseded/none 判定
- [ ] 两阶段管道集成测试: Jaccard → LLM → 正确结果

##### Eval 代码
- [ ] `evals/graph-extraction/dedup-eval.ts`:
  - [ ] 至少 10 组已标注 (candidate, existing, expected_overlapType) 测试对
  - [ ] 计算 Jaccard-only vs Jaccard+LLM 的 precision/recall
- [ ] `evals/graph-extraction/conflict-eval.ts`:
  - [ ] 至少 10 组已标注 (entryA, entryB, expected_conflictType) 测试对
  - [ ] 计算分类准确率对比

##### 文档同步检查
- [ ] `INGESTION.md` 已更新
- [ ] `TESTING.md` 已更新

##### Phase 2 完成检查
- [ ] 所有 checkbox 已标记完成
- [ ] `pnpm typecheck` / `pnpm lint` / `pnpm test` 通过
- [ ] Eval 显示 LLM+Jaccard 优于 Jaccard-only
- [ ] 文档同步完成
- 签字: ___  日期: ___

---

## Phase 3: Pre-review LLM 增强

**目标**: 正确性/完整性评估从关键词+长度判断升级为 LLM 语义评估。
**预估工作量**: 2 天
**依赖**: Phase 1 完成
**可并行**: 与 Phase 2 并行执行

### 任务清单

- [ ] **3-1: 扩展 boundary-extract.ts 为多任务** (1 天)
  - [ ] 修改 `packages/server/src/lib/boundary-extract.ts`
  - [ ] 在现有 boundary extraction prompt 追加正确性/完整性评估指令
  - [ ] 输出 schema 扩展: `{ boundary, correctness, completeness }`
  - [ ] 实现 `extractCandidateBoundariesWithQuality(chat, input)` 新函数
  - [ ] 保留原 `extractCandidateBoundaries()` 向后兼容
  - [ ] 编写扩展后的单元测试

- [ ] **3-2: 修改 pre-review.ts** (0.5 天)
  - [ ] 修改 `packages/server/src/lib/pre-review.ts` 的 `preReviewChain`
  - [ ] `chatProvider.isConfigured` 时调用 `extractCandidateBoundariesWithQuality()`
  - [ ] `correctnessRisk` 使用 LLM `evidenceQuality` 替代 evidenceTerms 计数
  - [ ] `completenessRisk` 使用 LLM `isComplete` + `missingAspects` 替代长度阈值
  - [ ] `duplicateRisk` 保持 Jaccard (速度要求)
  - [ ] 编写集成测试

- [ ] **3-3: Prompt 优化** (0.5 天)
  - [ ] 测试 boundary + correctness + completeness 单次 JSON 输出稳定性
  - [ ] 验证 correctness 对 5 个已知好坏条目的判别准确性
  - [ ] 必要时拆分为 2 次调用

### 验收标准

##### 测试检查
- [ ] `pnpm typecheck` / `pnpm lint` / `pnpm test` 通过
- [ ] boundary + correctness + completeness 联合提取正确性
- [ ] 正确性评估: 实质证据 → strong/moderate, 表面提及 → weak/none
- [ ] 未配置 chat 时退化为现有行为

##### Eval 代码
- [ ] `evals/graph-extraction/pre-review-eval.ts`:
  - [ ] 至少 10 个已标注提交 (correctness/completeness ground truth)
  - [ ] LLM 评估 vs evidenceTerms+长度 准确率对比

##### 文档同步检查
- [ ] `INGESTION.md` 已更新
- [ ] `TESTING.md` 已更新

##### Phase 3 完成检查
- [ ] 所有 checkbox 已标记完成
- [ ] `pnpm typecheck` / `pnpm lint` / `pnpm test` 通过
- [ ] Eval 显示 LLM 评估优于 evidenceTerms+长度
- [ ] 文档同步完成
- 签字: ___  日期: ___

---

## Phase 4: 缓存与评测框架

**目标**: LLM 缓存 + 系统化图提取质量评测。
**预估工作量**: 2-3 天
**依赖**: Phase 1 + Phase 2 + Phase 3 全部完成

### 任务清单

- [ ] **4-1: LLM 提取缓存** (1 天)
  - [ ] 新建 `packages/server/src/lib/indexing/graph-lite/llm-cache.ts`
  - [ ] 实现 `LlmExtractionCache` (get, set, invalidate)
  - [ ] 缓存键: `SHA-256(text + promptVersion)`
  - [ ] 缓存两层: `phase1Cache`(text→ExtractionPlan) + `phase2Cache`(text→LlmExtractionResult)
  - [ ] 实现 `promptVersion` 常量
  - [ ] 集成到 `llm-extract.ts`
  - [ ] 修改 `packages/server/src/lib/store/store-data.ts` 添加缓存字段
  - [ ] 编写缓存 hit/miss/invalidation 测试

- [ ] **4-2: 全量重建机制** (0.5 天)
  - [ ] `promptVersion` 变化 → `reconcileKnowledgeIndexes()` 触发全量重建
  - [ ] 记录重建进度和错误 (支持中断恢复)
  - [ ] 编写重建流程集成测试

- [ ] **4-3: 图提取 Eval 框架** (1-1.5 天)
  - [ ] 新建 `evals/graph-extraction/` 目录
  - [ ] 准备至少 15 个已标注 ground truth 条目:
    - [ ] 每条标注期望 nodes[] (kind, label)
    - [ ] 每条标注期望 edges[] (source, target, type, strength)
    - [ ] 覆盖: 简单条目、复杂多实体、含否定句、含隐式 prereq/mitigation
  - [ ] 实现 `evals/graph-extraction/run.ts`:
    - [ ] 计算 node precision/recall/F1
    - [ ] 计算 edge precision/recall/F1
    - [ ] 计算 strength classification accuracy
    - [ ] 与规则引擎结果对比
  - [ ] 实现 `evals/graph-extraction/README.md`
  - [ ] 集成到 `pnpm eval:smoke`

- [ ] **4-4: 重复/冲突 Eval 补充** (0.5 天)
  - [ ] 扩充 Phase 2 eval 测试集 (目标: 各 20 组)
  - [ ] 添加 precision/recall/F1 报告
  - [ ] 集成到 `pnpm eval:smoke`

### 验收标准

##### 测试检查
- [ ] `pnpm typecheck` / `pnpm lint` / `pnpm test` 通过
- [ ] 缓存: hit/miss/invalidation/promptVersion 全路径

##### Eval 报告
- [ ] 图提取: Node F1 >= 0.7, Edge F1 >= 0.6, Strength accuracy >= 0.8
- [ ] 重复检测: F1 优于 Jaccard-only
- [ ] 冲突检测: 准确率优于 Jaccard-only
- [ ] `pnpm eval:smoke` 包含图提取评测

##### 文档同步检查
- [ ] `TESTING.md` 已更新
- [ ] `evals/graph-extraction/README.md` 已创建

##### Phase 4 完成检查
- [ ] 所有 checkbox 已标记完成
- [ ] `pnpm typecheck` / `pnpm lint` / `pnpm test` 通过
- [ ] `pnpm eval:smoke` 全部通过
- [ ] 文档同步完成
- 签字: ___  日期: ___

---

## 进度追踪

| 阶段 | 状态 | 预估 | 开始 | 完成 | 备注 |
|------|------|------|------|------|------|
| Phase 1 | ✅ 完成 | 4-5 天 | - | 2026-05-18 | 图实体提取 LLM 化（基础层） |
| Phase 2 | ✅ 完成 | 2-3 天 | - | 2026-05-18 | 重复/冲突检测增强（可与 P3 并行） |
| Phase 3 | ✅ 完成 | 2 天 | - | 2026-05-18 | Pre-review 增强（可与 P2 并行） |
| Phase 4 | ✅ 完成 | 2-3 天 | - | 2026-05-18 | 缓存与评测框架 |

### 详细进度

#### Phase 1: 图实体提取 LLM 化
- [x] 1-1: Zod Schema 定义 (8/8)
- [x] 1-2: Prompt 模板 (6/6)
- [x] 1-3: LLM 提取核心模块 (12/12)
- [x] 1-4: Gleaning 二次提取 (4/4)
- [x] 1-5: 图适配器集成 — Trap 侧 (6/6)
- [x] 1-6: 图适配器集成 — Skill 侧 (4/4)

#### Phase 2: 重复/冲突检测 LLM 增强
- [x] 2-1: LLM 重复判定模块 (6/6)
- [x] 2-2: 集成到 detector.ts (7/7)
- [x] 2-3: LLM 冲突判定模块 (5/5)
- [x] 2-4: 集成到 detect.ts (4/4)

#### Phase 3: Pre-review LLM 增强
- [x] 3-1: 扩展 boundary-extract.ts (6/6)
- [x] 3-2: 修改 pre-review.ts (6/6)
- [x] 3-3: Prompt 优化 (3/3)

#### Phase 4: 缓存与评测框架
- [x] 4-1: LLM 提取缓存 (8/8)
- [x] 4-2: 全量重建机制 (3/3)
- [x] 4-3: 图提取 Eval 框架 (7/7)
- [x] 4-4: 重复/冲突检测 Eval 补充 (3/3)

---

## 出库路径不受影响

```
检索管道中不需要任何 LLM 调用:

  v1 graph-assisted (graph-assisted.ts):
    extractQueryEntities(query)  → 纯 label 归一化匹配（不改）
    expandSourcesOneHop()        → graphology 遍历（不改）
    calculateGraphScore()        → 确定性公式（不改）

  v3 graph plan (plan-compiler.ts):
    parseSeedIntent()            → 启发式关键词（不改）
    extractSeedNodeIds()         → ID 映射（不改）
    buildLocalExpansionView()    → BFS（不改）
    findBlockingTraps()          → 边类型过滤（不改）
    findMitigatingSkills()       → 边类型过滤（不改）

  共享基础设施 (graphology.ts):
    buildGraphRuntimeSnapshot()  → 纯代码组装（不改）
    assertNoHardDependencyCycles() → DAG 检测（不改）

入库时 LLM 的价值已沉淀到 GraphIndexDocumentRecord 中。
```

## 与 LightRAG 的设计对比

| 维度 | LightRAG | TrapMap 本方案 |
|------|----------|---------------|
| LLM 角色 | 唯一提取手段 | 主提取 + 规则 fallback |
| 分块 | 1200 tokens/chunk + 重叠 | 两阶段: Phase 1 切分策略, Phase 2 并行补全 |
| 短文本 | 同样分块 | 跳过 Phase 1 直接单次提取 (<=2000 chars) |
| 输出格式 | `<\|#\|>` 分隔符 + 修复器 | 约束 JSON + Zod 校验 |
| 缓存 | LLM KV 缓存 | contentHash + promptVersion 两层缓存 |
| 强度判定 | 无 | LLM 直接输出 hard/soft |
| 去重/冲突 | 不涉及 | Jaccard 预筛 + LLM 判定 |
| 预审 | 不涉及 | LLM 正确性/完整性 |

## 风险与缓解

| 风险 | 缓解措施 |
|------|---------|
| LLM 幻觉 | Zod + max 15 nodes/20 edges + label 长度限制 |
| LLM 输出格式错误 | JSON.parse + Zod + catch → 规则引擎 fallback |
| LLM 调用延迟 | 入库异步，不影响提交响应；两阶段并发 |
| LLM 调用失败 | 指数退避 (max 2) → 规则引擎 fallback |
| Hard edge 环路 | `assertNoHardDependencyCycles()` 兜底 |
| 不确定性 | contentHash 缓存保证一致性 |
| Prompt 升级 | promptVersion 递增 → 全量 cache miss + 后台重建 |

## 关键文件索引

| 职责 | 文件 | 操作 |
|------|------|------|
| **图实体提取** | `retrieval/recall/graph-extract.ts` | **废弃** regex，保留 legacy 接口 |
| **Skill 图提取** | `indexing/skill-events.ts` | **修改** 改用共享 LLM 提取 |
| **边界提取** | `indexing/boundary-extract.ts` | **修改** 扩展为多任务 LLM |
| **图适配器** | `indexing/adapters/graph.ts` | **修改** sync() 调 LLM |
| **Skill 图适配器** | `indexing/adapters/artifact-graph.ts` | **修改** sync() 调 LLM |
| **重复检测** | `candidates/detector.ts` | **修改** 集成 LLM 判定 |
| **冲突检测** | `conflict/detect.ts` | **修改** 集成 LLM 判定 |
| **预审** | `pre-review.ts` | **修改** LLM 正确性/完整性 |
| LLM 提取核心 | — | **新增** `indexing/graph-lite/llm-extract.ts` |
| LLM 提取缓存 | — | **新增** `indexing/graph-lite/llm-cache.ts` |
| LLM 重复判定 | — | **新增** `candidates/llm-dedup.ts` |
| LLM 冲突判定 | — | **新增** `conflict/llm-conflict.ts` |
| Zod schema | — | **新增** `contracts/src/domain/graph-extraction.ts` |
| Prompt 模板 | — | **新增** `ai/providers/templates/graph-extraction.xml` |
| AI 任务类型 | `ai/providers/types.ts` | **修改** |
| AI Prompt 构建 | `ai/prompts.ts` | **修改** |
| Eval 框架 | — | **新增** `evals/graph-extraction/` |
| 图文档构建 | `indexing/adapters/graph-builders.ts` | 不改 |
| graphology | `indexing/graph-lite/graphology.ts` | 不改 |
| 检索管道 | `retrieval/**` | **不改** |

---

## 新会话继续提示词

```
我在继续 TrapMap 的 LLM 图提取改造项目。

计划文档: docs/architecture/HYBRID_GRAPH_EXTRACTION.md

当前状态:
- Phase 1-4 全部未开始
- 前置条件: capsule-contextual-enrichment-plan 已 92% 完成 (仅剩 C-3 benchmark)
- 本计划与 capsule 计划零重叠

执行策略:
1. 先完成 Phase 1 (图实体提取 LLM 化) — 基础层，后续阶段依赖
2. Phase 2 和 Phase 3 可并行 (2 个 subagent)
3. Phase 4 最后执行

复用注意:
- LLM 两阶段切分复用 contextual-enrichment.ts 的 generateCapsuleManifest + generateCapsuleContents 模式
- 并发控制复用 maxConcurrent + Promise.all 批次模式
- 三层降级: LLM → 缓存 → 规则引擎
- 节点/边类型复用 graph-lite/documents.ts 的 GraphNodeKind/GraphRelationType
- 不要重复定义已在 documents.ts 中的类型

请从 Phase 1 任务 1-1 开始执行。
```
