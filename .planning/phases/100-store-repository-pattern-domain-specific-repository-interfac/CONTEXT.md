# Phase 100: Store Repository Pattern — Context

## Why This Phase Exists

TrapMap 的 `SkillShareerStore` 当前只暴露 `snapshot()/transact()/nextId()` 三个方法。所有业务逻辑（路由、lib 模块）直接操作 `StoreData` 的巨型 JSON 结构（含 15+ 数组：knowledgeEntries, teams, memberships, sessions, accessKeys, users, candidates, skillArtifacts 等）。

这导致三个问题：

1. **路由层紧耦合数据结构** — 增删字段需要同时改路由、lib、store.ts 类型定义
2. **Json/PG 路径不对称** — PG 模式下 app.ts onReady 钩子创建 7 个 `createXxxRepository()`（knowledgeRepo, artifactRepo, sessionRepo 等），但 Json 模式下这些 repo 是 `undefined`，路由层用 `?? store.transact()` 兜底
3. **测试困难** — 测试路由需要构造完整 StoreData，而非 mock 一个 repo 接口

## Current Architecture (Before)

```
app.ts
  app.decorate('skillShareer', {
    store: SkillShareerStore,        // 只有 snapshot/transact
    knowledgeRepo: undefined,        // 仅 PG 模式赋值
    artifactRepo: undefined,         // 仅 PG 模式赋值
    sessionRepo: undefined,          // 仅 PG 模式赋值
    ...5 more repos (PG only)
  })

路由层:
  const data = await store.snapshot();
  data.knowledgeEntries.find(...)    // 直接操作 StoreData
  store.transact(d => { d.knowledgeEntries.push(...) })
```

## Target Architecture (After)

```
app.ts
  app.decorate('skillShareer', {
    store: SkillShareerStore,
    repos: {
      knowledge: KnowledgeRepo,      // 两种模式都赋值
      team: TeamRepo,                // 两种模式都赋值
      membership: MembershipRepo,
      session: SessionRepo,
      accessKey: AccessKeyRepo,
      user: UserRepo,
      candidate: CandidateRepo,
      artifact: ArtifactRepo,
    }
  })

路由层:
  const entry = await repos.knowledge.getById(id);
  await repos.knowledge.transition(id, 'approved');
```

## Key Files to Understand

### Core Store
- `packages/server/src/lib/store.ts` — SkillShareerStore 接口 + JsonStore 实现 + 35+ Record 类型 + StoreData 结构
- `packages/server/src/lib/persistence/create-store.ts` — 工厂函数（Json/PG 选择）
- `packages/server/src/lib/persistence/postgres-store.ts` — PostgresStore 实现
- `packages/server/src/lib/persistence/schema.ts` — Drizzle schema

### Existing Repository Implementations (PG only)
- `packages/server/src/lib/knowledge/index.ts` — createKnowledgeRepository()（仅 PG）
- `packages/server/src/lib/artifacts/index.ts` — createArtifactRepository()（仅 PG）
- `packages/server/src/lib/auth/index.ts` — createSessionRepository(), createAccessKeyRepository()（仅 PG）
- `packages/server/src/lib/teams/index.ts` — createTeamRepository(), createMembershipRepository()（仅 PG）
- `packages/server/src/lib/users/index.ts` — createUserRepository()（仅 PG）

### Consumers (route files that directly access StoreData)
- `packages/server/src/routes/knowledge.ts` — 最大消费者
- `packages/server/src/routes/review.ts` — 生命周期转换
- `packages/server/src/routes/candidates.ts` — 候选处理
- `packages/server/src/routes/retrieval.ts` — 检索入口
- `packages/server/src/routes/operations.ts` — 导入/导出/维护
- `packages/server/src/routes/decay.ts` — 衰减管理
- `packages/server/src/routes/feedback.ts` — 反馈管理

### Type Definitions to Extract
- `store.ts` lines 25-100: UserRecord, TeamRecord, MembershipRecord, AccessKeyRecord, SessionRecord
- `store.ts` lines 80-120: KnowledgeRevisionRecord, KnowledgeReviewNoteRecord, AgentReviewRecord
- `store.ts` lines 120-200: KnowledgeRecord, SkillArtifactRecord, CandidateSubmission (duplicate)
- `store.ts` lines 200-350: DuplicateCaseRecord, ConflictRelationRecord, FeedbackRecord, etc.
- `store.ts` lines 350-450: EvidenceRecord, DecayMetaRecord, EntityLineageRecord
- `store.ts` lines 450-690: StoreData 接口（15+ 数组字段）

## Constraints

- **Backward compatible**: 旧 import 路径必须继续工作（re-export）
- **No behavior change**: 这是纯重构，功能行为不变
- **Both paths must work**: Json 和 PG 实现都必须通过相同接口测试
- **Incremental migration**: 可以逐个 repo 迁移，不需要一次全改
- **Phase 83 precedent**: Phase 83 (Store Decoupling) 已将部分操作从路由抽到 lib，本 phase 继续这个方向

## Risks

- StoreData 结构被广泛引用（路由 + lib + 测试），迁移可能遗漏
- PG repo 现有实现可能不支持所有 Json 路径需要的操作
- 测试覆盖不均匀，某些路径可能缺少测试保护

## Dependencies

- Phase 99: Agent-Native Verification（确保当前测试基线稳定）
- Phase 83: Store Decoupling（前置工作，已将部分逻辑抽出）
- Phase 87: Type & State Machine Centralization（可选，类型拆分可先做）
