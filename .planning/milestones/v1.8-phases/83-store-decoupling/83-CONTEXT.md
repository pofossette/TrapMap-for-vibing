# Phase 83: Store Decoupling

## Context

`packages/server/src/lib/store.ts` 目前有 774 行，被 96 个文件导入，是项目的核心数据层。

## Problem

1. **紧耦合** — 业务逻辑直接依赖具体实现 (PostgresStore / MemoryStore)
2. **测试困难** — 需要 mock 整个 store 或使用 pg-mem
3. **扩展受限** — 添加新存储后端需要修改多处
4. **职责不清** — store 既管理数据又包含业务逻辑

## Goals

1. 引入 Repository 接口层
2. 业务逻辑依赖接口而非实现
3. 简化测试 mock
4. 为未来存储扩展做准备

## Proposed Changes

### 1. 定义 Repository 接口

```typescript
// lib/repositories/types.ts
export interface KnowledgeRepository {
  findById(id: string): Promise<KnowledgeRecord | null>;
  findByTeam(teamId: string): Promise<KnowledgeRecord[]>;
  save(entry: KnowledgeRecord): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface ArtifactRepository {
  findById(id: string): Promise<SkillArtifact | null>;
  // ...
}

export interface Store {
  knowledge: KnowledgeRepository;
  artifacts: ArtifactRepository;
  // ...
}
```

### 2. 实现分离

```typescript
// lib/repositories/postgres-knowledge.ts
export class PostgresKnowledgeRepository implements KnowledgeRepository {
  constructor(private pool: Pool) {}
  // ...
}

// lib/repositories/memory-knowledge.ts
export class MemoryKnowledgeRepository implements KnowledgeRepository {
  private data: Map<string, KnowledgeRecord> = new Map();
  // ...
}
```

### 3. 依赖注入

```typescript
// lib/context.ts
export interface Services {
  store: Store;  // 接口类型，非具体实现
  // ...
}
```

## Acceptance Criteria

- [ ] Repository 接口定义完成
- [ ] PostgresStore 实现 Repository 接口
- [ ] MemoryStore 实现 Repository 接口
- [ ] 业务代码依赖接口而非具体类
- [ ] 测试可使用 mock repository
- [ ] 现有测试通过

## Dependencies

- Phase 80, 81 (建议先完成核心拆分)

## Estimated Effort

High (8-12 hours)

## Risk

高 — 涉及核心数据层，需谨慎重构

## Note

此 Phase 可作为技术债务清理，不改变现有行为。
完整实施可能需要多个迭代。
