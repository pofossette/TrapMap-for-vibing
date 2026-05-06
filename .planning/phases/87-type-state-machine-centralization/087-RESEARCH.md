# Phase 87: Type & State Machine Centralization - Research

**Gathered:** 2026-05-06
**Phase:** 87
**Status:** Research complete

---

## Summary

Phase 87 需要将 `store.ts` 中 35+ 个 record 接口按领域拆分到独立文件，创建 `lib/types.ts` 作为统一入口，并为 decay 和 lifecycle 状态机创建 barrel 导出。关键挑战在于保持向后兼容性——当前有 **163 个文件** 从 `store.ts` 导入类型。

---

## Codebase Current State

### 1. `store.ts` 类型清单 (774 行, 47 个导出)

按领域分类的接口：

**系统/用户管理 (System/User Management):**
- `UserRecord` - 用户记录
- `TeamRecord` - 团队记录
- `MembershipRecord` - 成员关系
- `AccessKeyRecord` - API 访问密钥
- `SessionRecord` - 会话记录
- `AuditEventRecord` - 审计事件

**知识条目相关 (Knowledge Entry Domain):**
- `KnowledgeRecord` - 核心知识条目聚合根
- `KnowledgeRevisionRecord` - 修订记录
- `KnowledgeReviewNoteRecord` - 审核备注
- `KnowledgeReviewDecisionRecord` - 审核决定
- `KnowledgeSubmissionRecord` - 提交记录
- `KnowledgeLifecycleEventRecord` - 生命周期事件
- `KnowledgeMetadataRecord` - 元数据
- `AgentReviewRecord` - Agent 审核结果
- `EmbeddingCacheRecord` - 嵌入向量缓存
- `MaintenanceMetaRecord` - 维护元数据

**Skill Artifact 相关 (Skill Artifact Domain):**
- `SkillArtifactRecord` - 核心 artifact 聚合根
- `SkillArtifactRevisionRecord` - artifact 修订
- `SkillArtifactFileRecord` - 文件记录
- `SkillScriptDescriptorRecord` - 脚本描述
- `DerivedSkillProfileRecord` - 派生配置
- `DerivedSkillCapsuleRecord` - 派生 capsule
- `SkillArtifactDerivedRecord` - 派生输出封装
- `SkillArtifactReviewNoteRecord` - artifact 审核备注
- `SkillArtifactReviewDecisionRecord` - artifact 审核决定
- `SkillArtifactLifecycleEventRecord` - artifact 生命周期事件
- `SkillArtifactMetadataRecord` - artifact 元数据
- `ClientManifestRecord` - 客户端清单
- `ClientManifestReferenceRecord` - 引用文件清单
- `ClientManifestAssetRecord` - 资产文件清单
- `ClientManifestScriptRecord` - 脚本清单
- `ArtifactFilePayloadRecord` - 文件负载存储

**候选/提交 (Candidate/Submission):**
- `CandidateSubmissionRecord` - 候选提交
- `DuplicateCaseRecord` - 重复案例
- `EntityLineageRecord` - 实体血缘

**反馈系统 (Feedback System):**
- `FeedbackQueueRecord` - 反馈队列

**核心类型/工具 (Core/Utilities):**
- `StoreData` - 存储数据聚合根
- `SkillShareerStore` - 存储接口
- `JsonStore` - JSON 文件存储实现
- `StoredScriptActivationPolicy` - 脚本策略类型别名
- `createEmptyStoreData()` - 工厂函数
- `cloneStoreData()` - 克隆函数
- `nowIso()` - 时间戳工具
- `hashSecret()` - 哈希工具
- `createOpaqueToken()` - 令牌生成
- `createSlug()` - slug 生成

### 2. 状态机模块

**Decay State Machine** (`lib/decay/state-machine.ts`):
```typescript
// 导出:
export interface DecayableEntry { ... }
export const DEFAULT_DECAY_CONFIG: DecayConfig
export function computeDecayState(...)
export function isTerminalDecayState(...)
export function requiresAttention(...)
export function validateDecayConfig(...)
```

**Lifecycle State Machine** (`lib/lifecycle/state-machine.ts`):
```typescript
// 导出:
export function isValidTransition(from, to): boolean
export function getValidTransitions(state): LifecycleState[]
export function isTerminalState(state): boolean
export function transitionLifecycleState(entry, newState, context): void
```

**消费者:**
- Decay state machine: 3 个文件导入
- Lifecycle state machine: 10 个文件导入

### 3. 现有 Barrel 导出模块

以下子目录已有 `index.ts`:
- `lib/ai/index.ts` - 导出 `types.ts` 中的类型
- `lib/artifacts/index.ts` - 导出 `model.ts`, `repository.ts`, `pg-repository.ts`
- `lib/auth/index.ts` - 导出 repository 接口
- `lib/candidates/index.ts` - 已包含 `types.ts`
- `lib/governance/index.ts` - 导出 `types.ts` 类型
- `lib/knowledge/index.ts` - 导出 `knowledge.ts`, `repository.ts`, `pg-repository.ts`
- `lib/teams/index.ts` - 导出 repository 接口
- `lib/users/index.ts` - 导出 repository 接口

现有 `types.ts` 文件:
- `lib/ai/types.ts` - `EmbeddingsProvider`, `ChatProvider`, `AiProviders`
- `lib/candidates/types.ts` - `CandidateFingerprintInput`, `DuplicateDetectionInput`, `DuplicateDetectionResult`
- `lib/governance/types.ts` - `GovernanceContext`, `GovernedEntity`, `GovernanceFilters`, `EligibilityOptions`
- `lib/indexing/types.ts` - `NormalizedIndexDocument`, `AdapterSyncState`, `KnowledgeIndexStateRecord`, `IndexAdapter`, 等
- `lib/retrieval/types.ts` - `RecallChannel`, `RecallCandidate`, `MergedCandidate`, `ParsedIntent`, 等

### 4. 导入模式统计

| 来源路径 | 消费文件数 | 主要导入类型 |
|----------|-----------|-------------|
| `../lib/store.js` | ~60 | `KnowledgeRecord`, `SkillArtifactRecord`, `StoreData`, `SkillShareerStore` |
| `../store.js` (lib 内部) | ~80 | 同上 + `nowIso`, `createEmptyStoreData` |
| `../../store.js` (深层) | ~20 | 主要是 `KnowledgeRecord` |
| `decay/state-machine.js` | 3 | `computeDecayState` |
| `lifecycle/state-machine.js` | 10 | `transitionLifecycleState` |

**总计: 163 个文件从 store.ts 导入，251 处导入语句**

---

## Technical Context

### TypeScript 配置

```json
// tsconfig.base.json
{
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "declaration": true,
    "composite": true,
    "exactOptionalPropertyTypes": true
  }
}
```

**关键点:**
- 未启用 `isolatedModules`，允许从 barrel files 重新导出类型
- 使用 ESM (`NodeNext`)，import 路径需要 `.js` 扩展名
- `composite: true` 支持项目引用

### 测试框架

- **Vitest 3.2.4** (项目安装版本)
- 配置: `vitest.config.ts`, pool: `forks`, singleFork: true
- 测试命令: `pnpm test` → `vitest run --passWithNoTests`

---

## Implementation Considerations

### 1. 目录结构设计

**推荐方案:**

```
packages/server/src/lib/
├── store/                          # 新目录
│   ├── index.ts                    # Barrel: 重导出所有类型 + 保留 StoreData/SkillShareerStore
│   ├── types/
│   │   ├── index.ts                # 类型 barrel
│   │   ├── system-records.ts       # UserRecord, TeamRecord, MembershipRecord, etc.
│   │   ├── knowledge-records.ts    # KnowledgeRecord, KnowledgeRevisionRecord, etc.
│   │   ├── artifact-records.ts     # SkillArtifactRecord, DerivedSkill*, Client*, etc.
│   │   ├── candidate-records.ts    # CandidateSubmissionRecord, DuplicateCaseRecord, etc.
│   │   └── feedback-records.ts     # FeedbackQueueRecord
│   ├── store-data.ts               # StoreData 接口 + createEmptyStoreData
│   ├── store-interface.ts          # SkillShareerStore 接口
│   └── json-store.ts               # JsonStore 类 + 工具函数
├── store.ts                        # 向后兼容: export * from './store/index.js'
├── state-machines/                 # 新目录
│   ├── index.ts                    # 统一导出 decay + lifecycle
│   ├── decay.ts                    # 重导出 from '../decay/state-machine.js'
│   └── lifecycle.ts                # 重导出 from '../lifecycle/state-machine.js'
└── types.ts                        # 统一入口: 重导出所有子模块类型
```

### 2. 向后兼容策略

**关键原则:** 旧路径继续工作，新路径提供更清晰的导入。

**store.ts 向后兼容:**
```typescript
// lib/store.ts (保持原位置)
// 重导出所有内容以保持向后兼容
export * from './store/index.js';
```

**状态机兼容:**
```typescript
// lib/state-machines/index.ts
export * from '../decay/state-machine.js';
export * from '../lifecycle/state-machine.js';
```

### 3. 类型分组边界

| 文件 | 包含类型 |
|------|---------|
| `system-records.ts` | `UserRecord`, `TeamRecord`, `MembershipRecord`, `AccessKeyRecord`, `SessionRecord`, `AuditEventRecord` |
| `knowledge-records.ts` | `KnowledgeRecord` + 所有 `Knowledge*Record` + `AgentReviewRecord` + `EmbeddingCacheRecord` + `MaintenanceMetaRecord` |
| `artifact-records.ts` | `SkillArtifactRecord` + 所有 `SkillArtifact*` + `DerivedSkill*` + `ClientManifest*` + `ArtifactFilePayloadRecord` + `SkillScriptDescriptorRecord` |
| `candidate-records.ts` | `CandidateSubmissionRecord`, `DuplicateCaseRecord`, `EntityLineageRecord` |
| `feedback-records.ts` | `FeedbackQueueRecord` |

### 4. `lib/types.ts` 统一入口

```typescript
// lib/types.ts
// 系统类型
export * from './store/types/system-records.js';

// 知识条目类型
export * from './store/types/knowledge-records.js';

// Skill Artifact 类型
export * from './store/types/artifact-records.js';

// 候选/提交类型
export * from './store/types/candidate-records.js';

// 反馈类型
export * from './store/types/feedback-records.js';

// AI 类型
export * from './ai/types.js';

// 治理类型
export * from './governance/types.js';

// 索引类型
export * from './indexing/types.js';

// 检索类型
export * from './retrieval/types.js';

// 候选类型
export * from './candidates/types.js';

// 状态机类型
export * from './state-machines/index.js';
```

### 5. 测试验证策略

**类型导出编译测试:**

创建 `lib/__tests__/types-export.test.ts`:
```typescript
import type {
  // 从各子模块验证类型可导入
  UserRecord,
  KnowledgeRecord,
  SkillArtifactRecord,
  CandidateSubmissionRecord,
  FeedbackQueueRecord,
  StoreData,
  SkillShareerStore,
} from '../types.js';

import {
  // 验证状态机函数可导入
  computeDecayState,
  isValidTransition,
} from '../state-machines/index.js';

// 类型守卫测试
function _typeCheck(): void {
  // 编译通过即验证成功
  const _user: UserRecord = {} as UserRecord;
  const _knowledge: KnowledgeRecord = {} as KnowledgeRecord;
}
```

---

## Risk Assessment

| 风险 | 影响 | 缓解措施 |
|-----|------|---------|
| 循环依赖 | 编译失败 | 分层导出: 类型文件不导入实现 |
| 遗漏类型导入 | 运行时/编译错误 | 全量 grep 验证 + typecheck |
| barrel file 性能 | IDE 慢 | 使用 `export type { ... }` 明确类型导出 |
| `.js` 扩展名遗漏 | ESM 解析失败 | 统一使用 `.js` 后缀 |

---

## Dependencies

**前置条件:**
- Phase 86 已完成 (Gitignore Cleanup) ✓

**无阻断性依赖。**

---

## Actionable Plan Outline

### Step 1: 创建 `store/types/` 目录结构
- 创建 5 个类型文件 + index.ts
- 移动接口定义 (不改变类型名)

### Step 2: 创建 `store/` 模块文件
- `store-data.ts` - StoreData + createEmptyStoreData
- `store-interface.ts` - SkillShareerStore
- `json-store.ts` - JsonStore + 工具函数

### Step 3: 创建 `store/index.ts` barrel
- 重导出所有子模块

### Step 4: 更新原 `store.ts` 为兼容层
- `export * from './store/index.js'`

### Step 5: 创建 `state-machines/index.ts`
- 重导出 decay + lifecycle

### Step 6: 创建 `lib/types.ts` 统一入口
- 重导出所有子模块类型

### Step 7: 添加类型导出测试
- 编译验证测试文件

### Step 8: 验证
- `pnpm typecheck` 通过
- `pnpm test` 全部通过

---

## Verification Checklist

- [ ] `store/types/` 目录包含 5 个领域类型文件
- [ ] `lib/types.ts` 存在并导出所有子模块类型
- [ ] `lib/state-machines/index.ts` 存在并导出两个状态机
- [ ] 原有 import 路径 (`from '../store.js'`) 继续工作
- [ ] `pnpm typecheck` 无错误
- [ ] `pnpm test` 全部通过
- [ ] 类型导出编译测试存在并通过

---

## Files to Modify/Create

**新建:**
- `packages/server/src/lib/store/types/index.ts`
- `packages/server/src/lib/store/types/system-records.ts`
- `packages/server/src/lib/store/types/knowledge-records.ts`
- `packages/server/src/lib/store/types/artifact-records.ts`
- `packages/server/src/lib/store/types/candidate-records.ts`
- `packages/server/src/lib/store/types/feedback-records.ts`
- `packages/server/src/lib/store/store-data.ts`
- `packages/server/src/lib/store/store-interface.ts`
- `packages/server/src/lib/store/json-store.ts`
- `packages/server/src/lib/store/index.ts`
- `packages/server/src/lib/state-machines/index.ts`
- `packages/server/src/lib/types.ts`
- `packages/server/src/lib/__tests__/types-export.test.ts`

**修改:**
- `packages/server/src/lib/store.ts` → 简化为兼容层重导出

---

## Open Questions

1. **是否需要在 `lib/types.ts` 中重导出 `StoreData` 和 `SkillShareerStore`？**
   - 建议: 是，作为核心类型保留在统一入口

2. **是否需要将 `decay/` 和 `lifecycle/` 目录移动到 `state-machines/` 下？**
   - 建议: 否，保持原位置，仅添加 barrel 重导出以减少破坏性

3. **`context.ts` 的 `ResolvedAuthContext` 是否应纳入 `lib/types.ts`？**
   - 建议: 是，作为服务层核心类型

---

*Research completed: 2026-05-06*
