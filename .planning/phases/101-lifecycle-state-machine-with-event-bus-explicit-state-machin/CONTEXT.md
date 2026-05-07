# Phase 101: Lifecycle State Machine with Event Bus — Context

## Why This Phase Exists

知识条目的 `LifecycleState`（`draft → submitted → agent-pass → approved → deactivated`）转换规则散落在多处：

- `routes/knowledge.ts` — 提交/重提时的状态赋值
- `routes/review.ts` — 审批时的 approve/reject 转换
- `lib/candidates/index.ts` — 候选处理后的状态推进
- `indexing/events.ts` — 索引触发时的状态检查
- `routes/decay.ts` — 衰减触发的 deactivation

每处都是 if/switch 判断，且转换后的副作用（索引同步、审计记录、候选创建）在同一处命令式调用。增加新状态或新副作用需要修改多个路由文件。

## Current Architecture (Before)

```
routes/review.ts (approve action):
  1. 检查当前状态是 agent-pass
  2. 更新 lifecycleState = 'approved'
  3. 手动调用 syncKnowledgeIndex()   ← 索引
  4. 手动调用 recordAudit()           ← 审计
  5. 手动触发候选处理                 ← 候选管道
  6. 返回响应
```

## Target Architecture (After)

```
lifecycle-machine.ts:
  transitions: [
    { from: 'agent-pass', to: 'approved', event: 'knowledge.approved', guard: hasReviewPermission },
    ...
  ]

routes/review.ts (approve action):
  1. 调用 stateMachine.executeTransition('approved', { actor, entry })
  2. 状态机发布 knowledge.approved 事件
  3. 事件订阅者自动触发：
     - indexing subscriber → syncKnowledgeIndex()
     - audit subscriber → recordAudit()
     - candidate subscriber → processCandidate()
  4. 返回响应
```

## Key Files to Understand

### State Transition Points (where lifecycle state changes)
- `packages/server/src/routes/knowledge.ts` — submit (→submitted), resubmit, update
- `packages/server/src/routes/review.ts` — approve (→approved), reject (→rejected)
- `packages/server/src/lib/candidates/index.ts` — candidate resolution (→agent-pass/agent-rejected)
- `packages/server/src/routes/decay.ts` — deactivation
- `packages/server/src/routes/operations.ts` — batch operations

### LifecycleState Definition
- `packages/contracts/src/domain/common.ts` — `lifecycleStateSchema = z.enum(['draft', 'submitted', 'agent-pass', 'agent-rejected', 'approved', 'rejected', 'deactivated'])`

### Side-effect Callers (what happens after state changes)
- `packages/server/src/lib/indexing/events.ts` — `runKnowledgeIndexEvent()` — lifecycle → index action mapping
- `packages/server/src/lib/indexing/pipeline.ts` — `syncKnowledgeIndex()` — actual index sync
- `packages/server/src/routes/knowledge.ts` — audit recording calls
- `packages/server/src/lib/candidates/index.ts` — candidate creation/processing

### Phase 60 Precedent
- Phase 60 (Type Consolidation & Lifecycle State Machine) 已做过部分状态机工作，本 phase 在其基础上继续

## Constraints

- **Event system must be synchronous-in-process** — 不需要分布式消息队列，Node.js EventEmitter 足够
- **Error isolation** — 一个订阅者失败不应阻断其他订阅者或主流程
- **Event ordering** — 同步订阅者按注册顺序执行，保证索引在审计之前
- **No behavior change** — 纯重构，功能行为不变
- **Works with Phase 100** — 依赖 Repository 接口，状态转换通过 repo 方法执行

## Risks

- 事件驱动增加调试复杂度（副作用不在调用栈中直接可见）
- 订阅者错误处理策略需要明确（静默失败 vs 抛出 vs 重试）
- 迁移期间可能存在混合模式（部分路由用事件、部分仍手动调用）

## Dependencies

- Phase 100: Store Repository Pattern（状态转换通过 repo 接口执行）
- Phase 87: Type & State Machine Centralization（类型基础，如已完成可简化本 phase）
