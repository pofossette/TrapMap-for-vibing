# TrapMap Capsule Contextual Enrichment 实现计划

## 📋 文档信息

- **创建日期**: 2026-05-18
- **版本**: 1.0
- **负责人**: 开发者
- **预估总工作量**: 7-11 天 (1.5-2 周)
- **优先级**: 高

---

## 🎯 项目目标

为 TrapMap 的 Skill Capsule 派生系统实现 **Anthropic Contextual Retrieval** 策略，通过两阶段处理生成高质量的上下文前缀（contextualPrefix），显著提升检索效果。

### 核心策略

```
阶段 1: 首次调用 → 生成 Capsule 清单（结构化 JSON）
阶段 2: 并发调用 → 为每个 Capsule 生成内容
优化点: Skill 内容在前部，提高 prompt cache 命中率
```

### 预期收益

| 指标 | 当前 | 优化后 | 提升 |
|------|------|--------|------|
| 检索失败率 | 5.7% | 1.9% | **67% ↓** |
| Token 成本 | $0.0045 | $0.0018 | **60% ↓** |
| 延迟 | 9s | 1.5s | **83% ↓** |

---

## 🏗️ 架构设计

### 整体流程

```
┌─────────────────────────────────────────────────────────────────┐
│  输入: SKILL.md + references/ + 解析的 sections                  │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│  阶段 1: 生成 Capsule 清单                                      │
│  ├── 输入: 完整文档 (7500 tokens)                                │
│  ├── 输出: CapsuleManifest (结构化 JSON, 500 tokens)             │
│  ├── 延迟: ~0.5s                                                │
│  └── 成本: $0.0015                                              │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│  阶段 2: 并发生成 Capsule 内容                                   │
│  ├── 输入: 清单 + 共享基础内容 (prompt cache 命中 75%+)           │
│  ├── 输出: 每个 Capsule 的 contextualPrefix + content           │
│  ├── 延迟: ~1s (并发, 非串行)                                   │
│  └── 成本: $0.0003 (3 × 2000 tokens)                           │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│  阶段 3: 组装和存储                                              │
│  ├── 合并清单信息 + 内容                                         │
│  ├── 生成 DerivedSkillCapsuleRecord                             │
│  └── 缓存到 revision.derived                                    │
└─────────────────────────────────────────────────────────────────┘
```

### 数据结构扩展

```typescript
// 新增字段到 skillCapsuleSchema
contextualPrefix?: z.string().max(300).optional()

// 新增接口
interface CapsuleManifestItem {
  capsuleIndex: number;
  title: string;
  description: string;
  contentScope: string;
  sourceType: 'skill-main' | 'reference';
  sourcePath: string;
  relatedProblemIndex?: number;
  tags: string[];
}

interface CapsuleManifest {
  documentTitle: string;
  documentLabels: string[];
  capsules: CapsuleManifestItem[];
}
```

---

## 📦 实现阶段

### Phase A: 基础设施搭建（3-4 天）

**目标**: 完成数据结构扩展和 LLM 交互模块

#### 任务清单

- [ ] **A-1: 数据结构扩展** (0.5 天)
  - [ ] 在 `packages/contracts/src/domain/artifacts.ts` 添加 `contextualPrefix` 字段
  - [ ] 更新 `skillCapsuleSchema` 和相关类型
  - [ ] 运行 `pnpm typecheck` 确保无错误
  - [ ] 更新相关测试用例

- [ ] **A-2: 创建 contextual-enrichment.ts 模块** (2-3 天)
  - [ ] 创建 `packages/server/src/lib/artifacts/contextual-enrichment.ts`
  - [ ] 实现 `CapsuleManifestItem` 和 `CapsuleManifest` 接口
  - [ ] 实现 `buildManifestPrompt()` 函数
  - [ ] 实现 `generateCapsuleManifest()` 函数（阶段 1）
  - [ ] 实现 `buildBaseContentForCache()` 函数（prompt cache 优化）
  - [ ] 实现 `generateSingleCapsuleContent()` 函数（阶段 2）
  - [ ] 实现 `generateCapsuleContents()` 并发处理函数
  - [ ] 添加错误处理和 fallback 机制
  - [ ] 编写单元测试

**验收标准**:
- [ ] 能够调用 LLM 生成 Capsule 清单
- [ ] 能够并发生成多个 Capsule 内容
- [ ] Prompt cache 命中率达到 75%+
- [ ] 单元测试覆盖率 > 80%

---

### Phase B: 派生流程集成（2-3 天）

**目标**: 将 contextual enrichment 集成到现有的 Capsule 派生流程

#### 任务清单

- [ ] **B-1: 修改 derive.ts 派生流程** (1-2 天)
  - [ ] 在 `packages/server/src/lib/artifacts/derive.ts` 中：
  - [ ] 修改 `deriveFromPayloads()` 函数，添加 contextual enrichment 调用
  - [ ] 在阶段 1 生成清单后，调用阶段 2 生成内容
  - [ ] 将 `contextualPrefix` 添加到 `DerivedSkillCapsuleRecord`
  - [ ] 保持向后兼容（contextualPrefix 为可选字段）

- [ ] **B-2: 实现缓存机制** (0.5 天)
  - [ ] 缓存 LLM 生成的上下文（基于 capsuleId + content hash）
  - [ ] 实现缓存命中检查逻辑
  - [ ] 添加缓存过期和清理机制

- [ ] **B-3: 集成测试** (0.5 天)
  - [ ] 测试完整的 Capsule 派生流程
  - [ ] 验证 contextualPrefix 正确生成
  - [ ] 验证性能指标（延迟、成本）

**验收标准**:
- [ ] Capsule 派生流程正常运行
- [ ] contextualPrefix 字段正确填充
- [ ] 缓存机制生效，减少重复调用
- [ ] 集成测试通过

---

### Phase C: 检索评分扩展（2-3 天）

**目标**: 在检索时利用 contextualPrefix 提升匹配效果

#### 任务清单

- [ ] **C-1: 扩展 capsule-recall.ts 评分逻辑** (1-2 天)
  - [ ] 在 `packages/server/src/lib/retrieval/capsules/capsule-recall.ts` 中：
  - [ ] 添加 `computeContextMatchScore()` 函数
  - [ ] 修改 `rankCapsules()` 评分权重
  - [ ] 调整评分公式：添加 15% 权重给上下文匹配

- [ ] **C-2: 检索测试** (0.5 天)
  - [ ] 更新现有的 capsule-recall 测试用例
  - [ ] 添加 contextualPrefix 相关的测试场景
  - [ ] 验证检索效果提升

- [ ] **C-3: 性能基准测试** (0.5 天)
  - [ ] 对比有/无 contextualPrefix 的检索效果
  - [ ] 生成性能对比报告
  - [ ] 更新文档

**验收标准**:
- [ ] 评分公式包含 contextualPrefix 权重
- [ ] 检索测试通过
- [ ] 性能指标达到预期（失败率 ↓ 67%）

---

### Phase D: 测试、文档和上线（1-2 天）

**目标**: 完成全面测试、更新文档、准备上线

#### 任务清单

- [ ] **D-1: 端到端测试** (0.5 天)
  - [ ] 创建完整的测试用例
  - [ ] 测试从 SKILL.md 到最终 Capsule 的完整流程
  - [ ] 验证错误处理和边界情况

- [ ] **D-2: 文档更新** (0.5 天)
  - [ ] 更新 `docs/architecture/components/ARTIFACTS.md`
  - [ ] 更新 `docs/architecture/DATA_TYPES_PIPELINE.md`
  - [ ] 添加 contextual enrichment 技术文档
  - [ ] 更新 README 或 CONTRIBUTING 指南

- [ ] **D-3: 性能优化和调优** (0.5 天)
  - [ ] 优化 prompt 模板，减少 token 消耗
  - [ ] 调优并发请求数量和限流策略
  - [ ] 监控生产环境性能

- [ ] **D-4: 上线准备** (0.5 天)
  - [ ] 创建 feature flag（可选）
  - [ ] 制定灰度发布计划
  - [ ] 准备回滚方案

**验收标准**:
- [ ] 端到端测试通过
- [ ] 文档完整更新
- [ ] 性能指标满足要求
- [ ] 准备就绪，可以上线

---

## 📁 关键代码位置

```
packages/
├── contracts/src/domain/
│   └── artifacts.ts                    ← 数据结构定义
│
└── server/src/lib/
    ├── artifacts/
    │   ├── derive.ts                   ← Capsule 派生流程（需修改）
    │   ├── contextual-enrichment.ts    ← 🆕 LLM 上下文生成模块
    │   └── model.ts                    ← Artifact 持久化
    │
    ├── retrieval/
    │   └── capsules/
    │       └── capsule-recall.ts       ← 检索评分逻辑（需修改）
    │
    └── ai/
        └── providers.ts               ← AI Provider 集成
```

---

## 📊 进度追踪

### 总体进度

| 阶段 | 状态 | 开始日期 | 完成日期 | 备注 |
|------|------|---------|---------|------|
| Phase A | ⏳ 待开始 | - | - | 基础设施搭建 |
| Phase B | ⏳ 待开始 | - | - | 派生流程集成 |
| Phase C | ⏳ 待开始 | - | - | 检索评分扩展 |
| Phase D | ⏳ 待开始 | - | - | 测试和上线 |

### 详细进度

#### Phase A: 基础设施搭建
- [ ] A-1: 数据结构扩展 (0/1)
- [ ] A-2: contextual-enrichment.ts 模块 (0/9)

#### Phase B: 派生流程集成
- [ ] B-1: 修改 derive.ts 派生流程 (0/4)
- [ ] B-2: 实现缓存机制 (0/3)
- [ ] B-3: 集成测试 (0/3)

#### Phase C: 检索评分扩展
- [ ] C-1: 扩展 capsule-recall.ts 评分逻辑 (0/3)
- [ ] C-2: 检索测试 (0/3)
- [ ] C-3: 性能基准测试 (0/3)

#### Phase D: 测试、文档和上线
- [ ] D-1: 端到端测试 (0/3)
- [ ] D-2: 文档更新 (0/4)
- [ ] D-3: 性能优化和调优 (0/3)
- [ ] D-4: 上线准备 (0/4)

---

## 🧪 测试策略

### 单元测试

```typescript
// contextual-enrichment.test.ts
describe('ContextualEnrichment', () => {
  describe('generateCapsuleManifest', () => {
    it('should generate manifest for simple SKILL.md')
    it('should handle references with entry-specific content')
    it('should handle references with holistic content')
    it('should limit capsules to max 5')
  })
  
  describe('generateCapsuleContents', () => {
    it('should generate content for all capsules')
    it('should use prompt cache effectively')
    it('should handle concurrent requests')
  })
})
```

### 集成测试

```typescript
// derive.test.ts
describe('Derive with Contextual Enrichment', () => {
  it('should generate contextualPrefix in DerivedSkillCapsuleRecord')
  it('should cache LLM responses')
  it('should maintain backward compatibility')
})
```

### 端到端测试

```typescript
// e2e-capsule-generation.test.ts
describe('E2E Capsule Generation', () => {
  it('should generate complete capsules from SKILL.md')
  it('should generate capsules with references')
  it('should achieve performance targets')
})
```

---

## ⚠️ 风险和缓解措施

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| LLM 调用失败 | 高 | 中 | 实现 fallback 机制，生成简单的上下文前缀 |
| Prompt cache 未命中 | 中 | 低 | 优化 prompt 结构，确保基础内容一致 |
| 并发请求限流 | 中 | 中 | 实现并发控制和指数退避 |
| 上下文质量不佳 | 中 | 低 | 添加人工审核机制，优化 prompt 模板 |
| 成本超支 | 低 | 低 | 监控 token 消耗，设置告警阈值 |

---

## 📚 参考资料

### 外部资源

- [Anthropic Contextual Retrieval 研究](https://www.anthropic.com/research/contextual-retrieval)
- [Anthropic RAG 最佳实践](https://docs.anthropic.com/en/docs/build-with-claude/retrieval-augmented-generation)
- [Prompt Caching 文档](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching)

### 内部文档

- `docs/architecture/components/ARTIFACTS.md` - 工件系统架构
- `docs/architecture/DATA_TYPES_PIPELINE.md` - 数据类型流程
- `packages/contracts/src/domain/artifacts.ts` - 类型定义

---

## ✅ 完成标准

### 技术标准

- [ ] 所有单元测试通过
- [ ] 集成测试通过
- [ ] 端到端测试通过
- [ ] TypeScript 类型检查通过
- [ ] 无 ESLint 错误
- [ ] 性能指标达到预期

### 文档标准

- [ ] 代码注释完整
- [ ] API 文档更新
- [ ] 架构文档更新
- [ ] README 更新（如需要）

### 上线标准

- [ ] Feature flag 就绪
- [ ] 监控和告警配置
- [ ] 回滚方案就绪
- [ ] 灰度发布计划就绪

---

## 📝 变更日志

### v1.0 (2026-05-18)

- 初始版本
- 定义完整实现计划
- 包含 4 个阶段、25+ 个任务
- 预估工作量 7-11 天
