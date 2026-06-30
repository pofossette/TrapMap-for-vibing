# 静态分析审计：占位实现、未接入代码与死代码

> 审计时间：2026-06-29
> 工具：fallow dead-code/health/dupes + subagent 深度扫描
> fallow 版本：2.101.0 | 总问题数：382

本报告覆盖三类问题：

1. **做了没接入**——完整实现但零消费方的模块
2. **占位符代替成熟实现**——hardcoded 返回值、空 stub、"not implemented" 输出
3. **死代码**——未使用的文件、导出、类型、依赖、barrel index

与 [`open-debt-and-compromises.md`](./open-debt-and-compromises.md) 的区别：本文档基于静态分析工具的量化扫描结果，侧重可删除/需接入的代码；open-debt 侧重架构层面的有意识妥协。

---

## 1. 做了没接入的模块

### 1.1 DecayBatchApplicationService（零导入，205 行）

- **文件**：`packages/server/src/lib/decay/application-service.ts`
- **问题**：完整的 application service 层（preview/execute batch 操作），但 decay 路由直接使用 `batch.ts`，该文件从未被任何模块导入
- **建议**：删除，或确认是否计划接入后保留

### 1.2 一次性迁移脚本（4 个，无导入无注册）

| 文件 | Phase |
|------|-------|
| `packages/server/src/lib/persistence/migrate-artifacts.ts` | Phase 63 |
| `packages/server/src/lib/persistence/mersistence/migrate-candidates.ts` | Phase 61 |
| `packages/server/src/lib/persistence/migrate-identity-audit.ts` | Phase 3, Round 10 |
| `packages/server/src/lib/persistence/migrate-knowledge.ts` | Phase 62 |

- **问题**：无代码导入，也未注册为 `package.json` script（对比 `backfill-runner.ts` 等有 pnpm script 入口）
- **建议**：如迁移已完成则删除；如仍需执行则注册为 script

### 1.3 server 类型 barrel（无人引用）

- **文件**：`packages/server/src/lib/types.ts`
- **问题**：barrel re-export 所有 server 类型，但消费者全部直接导入子模块。文件头注明"preparing for potential future type-only package extraction"
- **建议**：删除

### 1.4 host-local 未使用文件

| 文件 | fallow 检出 |
|------|------------|
| `packages/host-distributed/src/testing/distributed-runtime-smoke-service.ts` | unused-file |
| `packages/host-local/src/nest/config/config-bridge.ts` | unused-file |
| `packages/host-local/src/nest/main.ts` | unused-file |

### 1.5 未注册的 codemod 脚本

- **文件**：`scripts/codemods/relative-to-alias.cjs`
- **建议**：如已完成迁移则删除

---

## 2. 占位符代替成熟实现

### 2.1 Versioned Decay 硬编码返回"匹配" ⚠️

- **文件**：`packages/server/src/lib/decay/freshness.ts:148-157`
- **代码**：

```ts
function computeVersionedMultiplier(config: FreshnessDecayConfig['versioned']): number {
  // Version mismatch detection requires boundary context (Phase 51+)
  // For now, assume match (no penalty)
  if (!config.enabled) {
    return 1.0;
  }
  return stepDecay(true, config.matchMultiplier, config.mismatchMultiplier);
}
```

- **影响**：配置 schema 存在、pipeline 已接入，但 `matches` 永远传 `true`，版本不匹配永远不会触发衰减惩罚
- **建议**：实现版本上下文检测，或在配置层标记为 `experimental` 避免误导

### 2.2 host-local Outbox/Queue 空壳端口

- **文件**：`packages/host-local/src/nest/runtime/host-runtime.ts:141-171`
- **代码**：

```ts
async requeue() {},
async claimBatch() { return []; },
async complete() {},
async fail() {},
async getStatusSnapshot() {
  return { provider: 'postgres', pending: 0, running: 0, dead: 0, staleRunning: 0, reclaimCount: 0 };
},
```

- **影响**：host-local 模式下异步任务系统完全空壳，`getStatusSnapshot` 返回硬编码零值而非真实遥测
- **现状**：open-debt 已记录 host-local 从 scaffold 推进到 Nest 装配，但这些端口 stub 仍然存在

### 2.3 CLI Entry Fallback 输出"not implemented"

- **文件**：`packages/cli/src/lib/markdown-formatter.ts:216`
- **代码**：`sections.push('_Entry fallback rendering not implemented yet._');`
- **影响**：CLI 用户会看到 "not implemented" 原文
- **建议**：实现 fallback 渲染逻辑，或改为友好的降级提示

### 2.4 Knowledge-Read 临时投影层

- **文件**：`packages/service-knowledge-read/src/deps.ts:34-52`
- **问题**：`knowledge-entry:getById` 和 `knowledge-entry:listMine` 标记为 `temporary-direct-backed-projection`，exit criteria 明确要求"replace with a derived entry projection owned by knowledge-read"
- **现状**：open-debt 已记录读侧阶段性例外，此处为具体实例

### 2.5 Artifact `derived: null`

- **文件**：`packages/server/src/lib/artifacts/model.ts:273`
- **代码**：`derived: null, // Derived outputs will be computed in a later phase`
- **影响**：artifact 创建时 derived 字段永远为 null

### 2.6 Gateway Schema 重复定义

- **文件**：`packages/host-local/src/nest/gateway/gateway.schemas.ts:10`
- **代码**：`TODO(Phase 1 closeout): replace with shared contract schema once the pilot surface contract is finalized in packages/contracts.`
- **问题**：本地 `searchBodySchema` Zod 定义重复了 contract schema

### 2.7 Label Backfill Step 5 未实现

- **文件**：`packages/server/src/lib/labels/backfill.ts:71`
- **代码**：`5. Reindex affected graph documents (not implemented here — callers handle this)`
- **问题**：pipeline 第 5 步声明式延期给调用方，但无证据表明调用方已实现

### 2.8 CLI 版本号仍为 prototype

- **文件**：`packages/cli/src/index.ts:84,90`
- **代码**：`.version('0.1.0')` + `console.log('TrapMap prototype')`

---

## 3. 死代码

### 3.1 未使用的 barrel index.ts（7 个）

| 文件 |
|------|
| `packages/server/src/lib/retrieval/orchestration/index.ts` |
| `packages/server/src/lib/retrieval/scoring/index.ts` |
| `packages/server/src/lib/retrieval/recall/index.ts` |
| `packages/server/src/lib/retrieval/response/index.ts` |
| `packages/server/src/lib/retrieval/graph-plan/index.ts` |
| `packages/server/src/lib/retrieval/capsules/index.ts` |
| `packages/server/src/lib/workflows/index.ts` |

消费者全部直接导入子模块，barrel 只增加维护负担。

### 3.2 Contracts 包大量死导出

| 文件 | 未使用/总数 | 说明 |
|------|------------|------|
| `contracts/src/domain/async.ts` | ~45/~45 | 全部事件契约、payload schema、helper 函数零消费。server 在 `packages/server/src/lib/jobs/types.ts` 定义了本地等价物 |
| `contracts/src/domain/observability.ts` | 28/30 | 仅 `pickWorkflowCorrelation` 和 `observabilityFailureTaxonomyItems` 被使用 |
| `contracts/src/domain/plans.ts` | 17/36 | `GraphPlanNode`、`GraphPlanEdgeType`、`GraphPlanFocus` 等未使用 |
| `contracts/src/domain/graph-extraction.ts` | 12/24 | `LlmNodeKind`、`LlmRelationType`、`LlmRelationStrength` 等未使用 |
| `contracts/src/domain/skills.ts` | 5/6 | 仅 `SkillApplyResult` 有消费方 |
| `contracts/src/domain/parsing.ts` | 4/7 | `parseMarkdownFrontmatter` 等未使用 |
| `contracts/src/domain/admin.ts` | 4/6 | admin 搜索相关类型未使用 |

`async.ts` 尤其值得关注——~750 行事件元数据定义，服务器端完全没有消费，存在"定义了契约但从未按契约实现"的割裂。

### 3.3 backend-core 空 Domain 占位（6 个）

| 目录 | 内容 |
|------|------|
| `packages/backend-core/src/identity-access/domain/index.ts` | 仅导出 context 常量 + capability 数组 |
| `packages/backend-core/src/knowledge-read/domain/index.ts` | 同上 |
| `packages/backend-core/src/knowledge-write/domain/index.ts` | 同上 |
| `packages/backend-core/src/candidate-ingestion/domain/index.ts` | 同上 |
| `packages/backend-core/src/governance-review/domain/index.ts` | 同上 |
| `packages/backend-core/src/job-runtime/domain/index.ts` | 同上 |

注释均为"reserves the pure-domain home for future extraction"，尚未有任何实际域逻辑。

### 3.4 fallow 统计汇总

| 指标 | 数量 |
|------|------|
| 未使用文件 | 10 |
| 未使用导出 | 207 |
| 未使用类型 | 91 |
| 未使用 class 成员 | 46 |
| 未解析导入 | 6 |
| 循环依赖 | 3 |
| 未使用依赖 | 7 |
| 重复导出 | 10 |
| 代码重复组 | 20 |

---

## 4. 质量附录（非占位符但值得跟进）

### 4.1 静默吞错误的空 catch（8 处）

| 文件 | 行 |
|------|----|
| `packages/cli/src/lib/artifact-bundle.ts` | 167 |
| `packages/server/src/lib/artifacts/contextual-enrichment.ts` | 195, 224 |
| `packages/server/src/lib/conflict/llm-conflict.ts` | 107 |
| `packages/server/src/lib/labels/candidate-recall.ts` | 143 |
| `packages/server/src/lib/retrieval/capsules/capsule-channel-registry.ts` | 121 |
| `packages/server/src/lib/retrieval/capsules/repositories/index-sync.ts` | 189, 269 |

部分有设计注释说明"non-fatal fallback"，但全部吞掉错误且无 logging，可能隐藏 bug。

### 4.2 server 库代码用 console 而非结构化 logger（~20 处）

涉及文件：`indexing/pipeline.ts`、`indexing/reconcile.ts`、`indexing/graph-lite/llm-extract.ts`、`log-rotation.ts`、`rag-log.ts`、`user-ops-log.ts`、`persistence/backfill-indexes.ts`、`persistence/migration-runner.ts`、`retrieval/orchestration/recall-coordinator.ts`。

### 4.3 延期的架构边界

- **文件**：`packages/server/src/lib/runtime/service-topology.ts:46-50`
- **内容**：`DEFERRED_ISOLATION_BOUNDARIES` 包含 `per-service-database`、`split-repository-packages`、`service-mesh-event-backbone`
- **另有**：Governance 服务边界尚未作为独立 runtime 发出（line 115）

### 4.4 测试代码重复

20 个 clone group 集中在 CLI test 文件和 server route test 文件，存在大量复制粘贴的测试 setup/teardown 逻辑。

---

## 5. 建议优先级

| 优先级 | 行动 | 涉及文件数 |
|--------|------|-----------|
| 🔴 高 | 删除 4 个未注册迁移脚本 + application-service.ts + types.ts + codemod | 7 |
| 🔴 高 | 清理 `contracts/src/domain/async.ts` 死导出或标记为 reserved | 1 |
| 🟠 中 | 实现或标记 versioned decay 为 experimental | 1 |
| 🟠 中 | CLI markdown-formatter entry fallback 渲染 | 1 |
| 🟠 中 | 清理 7 个未使用 barrel index.ts | 7 |
| 🟡 低 | contracts 其他 domain 文件死导出清理 | 6 |
| 🟡 低 | backend-core 空 domain 占位评估保留/删除 | 6 |
| 🟡 低 | 空 catch 块补充 logging | 8 |
| 🟡 低 | console.* 替换为结构化 logger | ~10 |

---

## 6. 证据入口

- fallow 完整输出：运行 `fallow dead-code --format json --quiet`
- `packages/server/src/lib/decay/application-service.ts`
- `packages/server/src/lib/decay/freshness.ts`
- `packages/host-local/src/nest/runtime/host-runtime.ts`
- `packages/cli/src/lib/markdown-formatter.ts`
- `packages/service-knowledge-read/src/deps.ts`
- `packages/server/src/lib/artifacts/model.ts`
- `packages/server/src/lib/runtime/service-topology.ts`
- `packages/contracts/src/domain/async.ts`
- `packages/contracts/src/domain/observability.ts`
- `packages/backend-core/src/*/domain/index.ts`
