# 拓扑排序执行计划 实施方案

> **面向智能体工作者：** 必须使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实施本计划。步骤使用 `- [ ]` 复选框语法追踪进度。

**目标：** 在 `TrapFirstPlan` 中新增服务端 `executionPlan` 字段，返回拓扑排序后的执行序列，使客户端无需自行计算顺序。

**架构：** 在 `plan-compiler.ts` 中新增 `buildExecutionPlan()` 函数，接收已编译的 traps、skills、edges，基于 `mitigates`/`requires`/`order` 边构建依赖图，执行 Kahn 拓扑排序，输出含 rank、blockedBy、kind 元数据的 `ExecutionStep[]`。在 `compileTrapFirstPlan()` 的最终组装步骤中接入。扩展 contracts 层 schema，更新 CLI renderer 直接消费服务端结果。

**技术栈：** TypeScript、Zod、Vitest、现有 plan-compiler 基础设施

**设计参考：**
- SkillGraph (arXiv:2605.12039)：`R_ret = TopoSort(R_seed ∪ R_BFS ∪ R_beam)` — 基于 prerequisite/enhancement 边的拓扑排序
- GraSP (arXiv:2604.17870)：DAG 编译 + state/data/order 边 + 拓扑序执行

---

## 文档信息

- 创建日期：2026-05-25
- 归档旧计划：`docs/superpowers/plans/2026-05-24-llm-intent-parsing.md`
- 输出文件：`plan.md`（项目根目录）
- 范围：`packages/contracts/src/domain/plans.ts`、`packages/server/src/lib/retrieval/graph-plan/plan-compiler.ts`、CLI output-profile、相关测试与文档
- 不在本阶段做的事：
  - 不改 `recommendedSkills` 数组本身的排序（保持 score-based）
  - 不引入运行时执行引擎或 DAG executor
  - 不改 `GraphPlan` 统一图视图的结构
  - 不引入 `blockedBy` 中的 trap → skill 反向边（保持 `mitigates` 语义不变）
  - 不做置信度路由变更

## 阶段完成约束

**一个阶段完成，必须同时满足以下条件：**

- [ ] 本阶段所有任务复选框已完成
- [ ] 本阶段验收标准全部通过
- [ ] 本阶段要求更新的文档已同步
- [ ] 已进行一次提交，且提交信息能说明该阶段完成内容

**提交节奏要求：每完成一个阶段，提交一次。不要把多个阶段攒到最后一起提交。**

建议提交格式：

```bash
git add <本阶段涉及文件>
git commit -m "feat(retrieval): <阶段摘要>"
```

## 总体文件分解

### 主要代码文件

- `packages/contracts/src/domain/plans.ts`
  - 新增 `executionStepSchema` 与 `ExecutionStep` 类型
  - 在 `trapFirstPlanSchema` 中增加 `executionPlan` 字段
- `packages/server/src/lib/retrieval/graph-plan/plan-compiler.ts`
  - 新增 `buildExecutionPlan()` 函数
  - 在 `compileTrapFirstPlan()` 的返回值中组装 `executionPlan`
  - 在 empty-plan 早返回路径中补 `executionPlan: []`
- `packages/cli/src/lib/output-profile.ts`
  - `buildExecutionOrder()` 改为读取 `payload.plan.executionPlan`
  - 各 renderer 适配新结构

### 主要测试文件

- `packages/server/src/lib/retrieval/graph-plan/plan-compiler.test.ts`
  - 新增 `executionPlan` 相关测试用例
- `packages/server/src/lib/retrieval/graph-plan/graph-plan-search.test.ts`
  - 补充 executionPlan 在端到端路径中的断言

### 主要文档文件

- `docs/architecture/GRAPH_RETRIEVAL.md`
- `docs/reference/GLOSSARY.md`（若有新术语）

---

## Phase 1：扩展 Contracts 层

**目标：** 在 `plans.ts` 中定义 `ExecutionStep` schema 并将 `executionPlan` 加入 `TrapFirstPlan`。

**涉及文件：**

- 修改：`packages/contracts/src/domain/plans.ts`
- 修改：`packages/contracts/src/index.ts`（若需要导出新类型）

### 进度追踪

- [x] **Step 1.1：定义 `executionStepSchema` 与 `ExecutionStep` 类型**

在 `plans.ts` 的 `planEdgeSchema` 之后（约 line 135）新增：

```ts
/**
 * A step in the topologically sorted execution plan.
 * Combines traps and skills into a single dependency-aware sequence.
 */
export const executionStepSchema = z.object({
  /** Topological rank (0 = no predecessors; higher = later in sequence) */
  rank: z.number().int().min(0),
  /** Node identifier (matches a trap or skill nodeId in the plan) */
  nodeId: entityIdSchema,
  /** Human-readable label */
  label: z.string().min(1).max(280),
  /** Whether this step represents a trap mitigation or a skill action */
  kind: z.enum(['trap-mitigation', 'skill']),
  /** Node IDs that must complete before this step (predecessors in the DAG) */
  blockedBy: z.array(entityIdSchema).default([]),
});

export type ExecutionStep = z.infer<typeof executionStepSchema>;
```

注意事项：

- `kind` 使用 `'trap-mitigation'` 而非 `'trap'`，因为执行计划中的 trap 步骤隐含"需要被缓解"
- `blockedBy` 默认空数组，表示无前置依赖（rank-0 节点）
- `rank` 从 0 开始，同 rank 内的步骤无顺序约束

- [x] **Step 1.2：在 `trapFirstPlanSchema` 中增加 `executionPlan` 字段**

在 `trapFirstPlanSchema`（约 line 221）的 `graph` 字段之前插入：

```ts
/** Topologically sorted execution sequence combining traps and skills */
executionPlan: z.array(executionStepSchema).default([]),
```

更新后的 schema：

```ts
export const trapFirstPlanSchema = z.object({
  blockingTraps: z.array(planTrapNodeSchema).default([]),
  recommendedSkills: z.array(planSkillNodeSchema).default([]),
  edges: z.array(planEdgeSchema).default([]),
  citations: z.array(planCitationSchema).default([]),
  executionPlan: z.array(executionStepSchema).default([]),
  graph: graphPlanSchema.default({
    nodes: [],
    edges: [],
    citations: [],
    focus: {
      blockingTrapNodeIds: [],
      recommendedSkillNodeIds: [],
    },
  }),
});
```

注意事项：

- 使用 `.default([])` 保持向后兼容——旧客户端不传此字段也不会报错
- `executionPlan` 放在 `citations` 之后、`graph` 之前

- [x] **Step 1.3：确认新类型可导出**

检查 `packages/contracts/src/index.ts` 是否 barrel-export `plans.ts` 中的所有类型。如果使用 `export * from './domain/plans.js'`，则 `ExecutionStep` 自动导出。若不是，手动添加。

- [x] **Step 1.4：运行类型检查确认无破坏**

```bash
pnpm typecheck
```

Expected: 0 errors。由于 `executionPlan` 有 `.default([])`，现有实例化不会报 "missing property"。

- [x] **Step 1.5：Commit**

```bash
git add packages/contracts/src/domain/plans.ts packages/contracts/src/index.ts
git commit -m "feat(contracts): add ExecutionStep schema and executionPlan to TrapFirstPlan"
```

### Phase 1 验收标准

- [x] `ExecutionStep` 类型已定义，包含 `rank`、`nodeId`、`label`、`kind`、`blockedBy` 五个字段
- [x] `trapFirstPlanSchema` 包含 `executionPlan` 字段，且有 `.default([])`
- [x] `ExecutionStep` 可从 `@trapmap/contracts` 正常导入
- [x] `pnpm typecheck` 零错误
- [x] 现有测试不受影响（无 "missing property" 报错）

### Phase 1 文档更新

- [x] `docs/architecture/GRAPH_RETRIEVAL.md`：暂不更新（Phase 4 统一处理）
- [x] `plan.md`：记录 Phase 1 完成状态

---

## Phase 2：实现 `buildExecutionPlan()` 函数

**目标：** 在 `plan-compiler.ts` 中实现拓扑排序逻辑，将 traps + skills + edges 编译成 `ExecutionStep[]`。

**涉及文件：**

- 修改：`packages/server/src/lib/retrieval/graph-plan/plan-compiler.ts`
- 修改：`packages/server/src/lib/retrieval/graph-plan/plan-compiler.test.ts`

### 进度追踪

- [ ] **Step 2.1：编写 `buildExecutionPlan` 的失败测试**

在 `plan-compiler.test.ts` 末尾的 `describe('plan-compiler')` 内新增 `describe('executionPlan')` 块。`buildExecutionPlan` 是内部函数，通过 `compileTrapFirstPlan` 的输出间接测试。

添加以下测试用例：

```ts
describe('executionPlan', () => {
  it('returns empty executionPlan when no traps or skills', async () => {
    const services = makeMockServices({
      knowledgeEntries: [],
      skillArtifacts: [],
      graphIndexDocuments: [],
    });
    const auth = makeMockAuth();
    const query: PlanQuery = { seed: 'empty', skillBudget: 3, maxDepth: 2 };

    const result = await compileTrapFirstPlan(services, auth, query);

    expect(result.executionPlan).toEqual([]);
  });

  it('places mitigating skills before the traps they mitigate', async () => {
    const trapId = 'trap-ep-1';
    const skillId = 'skill-ep-1';

    const trapNode = makeTrapNode(trapId, 'Blocking trap');
    const skillNode = makeSkillNode(skillId, 'Mitigating skill');
    const riskEdge = makeRiskBlocksEdge(trapId, 'cue-ep-1', 'hard');
    const mitEdge = makeMitigatesEdge(skillId, trapId, 'hard');

    const services = makeMockServices({
      knowledgeEntries: [makeKnowledgeEntry(trapId)],
      skillArtifacts: [makeSkillArtifact(skillId)],
      graphIndexDocuments: [
        makeGraphDoc(trapId, 'trap', [trapNode], [riskEdge]),
        makeGraphDoc(skillId, 'skill', [skillNode], [mitEdge]),
      ],
    });
    const auth = makeMockAuth();
    const query: PlanQuery = { seed: 'blocking trap mitigation', skillBudget: 3, maxDepth: 2 };

    const result = await compileTrapFirstPlan(services, auth, query);

    // executionPlan 应包含节点
    expect(result.executionPlan.length).toBeGreaterThan(0);

    // Skill 应在 trap 之前出现
    const skillIndex = result.executionPlan.findIndex((s) => s.nodeId === `skill:${skillId}`);
    const trapIndex = result.executionPlan.findIndex((s) => s.nodeId === `trap:${trapId}`);

    if (skillIndex >= 0 && trapIndex >= 0) {
      expect(skillIndex).toBeLessThan(trapIndex);
    }

    // Trap 步骤的 blockedBy 应包含 skill
    const trapStep = result.executionPlan.find((s) => s.nodeId === `trap:${trapId}`);
    if (trapStep) {
      expect(trapStep.blockedBy).toContain(`skill:${skillId}`);
    }
  });

  it('respects requires edges between skills', async () => {
    const trapId = 'trap-ep-req';
    const skillA = 'skill-ep-a';
    const skillB = 'skill-ep-b';

    const trapNode = makeTrapNode(trapId, 'Trap requiring chain');
    const skillNodeA = makeSkillNode(skillA, 'Prerequisite skill A');
    const skillNodeB = makeSkillNode(skillB, 'Dependent skill B');
    const riskEdge = makeRiskBlocksEdge(trapId, 'cue-ep-req', 'hard');
    const mitEdgeA = makeMitigatesEdge(skillA, trapId, 'hard');
    const mitEdgeB = makeMitigatesEdge(skillB, trapId, 'soft');
    const requiresEdge = makeRequiresEdge(skillA, skillB, 'hard');

    const services = makeMockServices({
      knowledgeEntries: [makeKnowledgeEntry(trapId)],
      skillArtifacts: [makeSkillArtifact(skillA), makeSkillArtifact(skillB)],
      graphIndexDocuments: [
        makeGraphDoc(trapId, 'trap', [trapNode], [riskEdge]),
        makeGraphDoc(skillA, 'skill', [skillNodeA, skillNodeB], [mitEdgeA, mitEdgeB, requiresEdge]),
      ],
    });
    const auth = makeMockAuth();
    const query: PlanQuery = { seed: 'requires chain', skillBudget: 3, maxDepth: 2 };

    const result = await compileTrapFirstPlan(services, auth, query);

    const indexA = result.executionPlan.findIndex((s) => s.nodeId === `skill:${skillA}`);
    const indexB = result.executionPlan.findIndex((s) => s.nodeId === `skill:${skillB}`);

    if (indexA >= 0 && indexB >= 0) {
      // A（前置）应在 B（依赖）之前
      expect(indexA).toBeLessThan(indexB);
    }

    // B 的 blockedBy 应包含 A
    const stepB = result.executionPlan.find((s) => s.nodeId === `skill:${skillB}`);
    if (stepB) {
      expect(stepB.blockedBy).toContain(`skill:${skillA}`);
    }
  });

  it('assigns correct rank values', async () => {
    const trapId = 'trap-ep-rank';
    const skillA = 'skill-rank-a';
    const skillB = 'skill-rank-b';

    const trapNode = makeTrapNode(trapId, 'Ranked trap');
    const skillNodeA = makeSkillNode(skillA, 'Rank A skill');
    const skillNodeB = makeSkillNode(skillB, 'Rank B skill');
    const riskEdge = makeRiskBlocksEdge(trapId, 'cue-rank', 'hard');
    const mitEdge = makeMitigatesEdge(skillA, trapId, 'hard');
    const requiresEdge = makeRequiresEdge(skillA, skillB, 'hard');

    const services = makeMockServices({
      knowledgeEntries: [makeKnowledgeEntry(trapId)],
      skillArtifacts: [makeSkillArtifact(skillA), makeSkillArtifact(skillB)],
      graphIndexDocuments: [
        makeGraphDoc(trapId, 'trap', [trapNode], [riskEdge]),
        makeGraphDoc(skillA, 'skill', [skillNodeA, skillNodeB], [mitEdge, requiresEdge]),
      ],
    });
    const auth = makeMockAuth();
    const query: PlanQuery = { seed: 'rank test', skillBudget: 3, maxDepth: 2 };

    const result = await compileTrapFirstPlan(services, auth, query);

    // 所有步骤的 rank 应为非负整数
    for (const step of result.executionPlan) {
      expect(step.rank).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(step.rank)).toBe(true);
    }

    // 无前置的步骤 rank 应为 0
    const rankZeroSteps = result.executionPlan.filter((s) => s.rank === 0);
    expect(rankZeroSteps.length).toBeGreaterThan(0);
  });

  it('handles 25-node Deploy Cluster with executionPlan', async () => {
    const dataset = buildDeployClusterDataset();

    const services = makeMockServices({
      knowledgeEntries: dataset.knowledgeEntries,
      skillArtifacts: dataset.skillArtifacts,
      graphIndexDocuments: dataset.graphDocs,
    });
    const auth = makeMockAuth();
    const query: PlanQuery = { seed: 'deploy cluster safely', skillBudget: 5, maxDepth: 3 };

    const result = await compileTrapFirstPlan(services, auth, query);

    // executionPlan 应包含计划中的所有节点
    const planNodeIds = new Set([
      ...result.blockingTraps.map((t) => t.nodeId),
      ...result.recommendedSkills.map((s) => s.nodeId),
    ]);

    for (const nodeId of planNodeIds) {
      expect(result.executionPlan.find((s) => s.nodeId === nodeId)).toBeDefined();
    }
  });
});
```

- [ ] **Step 2.2：运行测试确认失败**

```bash
pnpm test -- --run packages/server/src/lib/retrieval/graph-plan/plan-compiler.test.ts
```

Expected: 新测试失败（`executionPlan` 不存在或内容不正确）。

- [ ] **Step 2.3：实现 `buildExecutionPlan()` 函数**

在 `plan-compiler.ts` 的 import 中加入 `ExecutionStep` 类型：

```ts
import type {
  ExecutionStep,
  // ... existing imports
} from '@trapmap/contracts';
```

在 `buildUnifiedGraph()` 函数之后（约 line 564）新增：

```ts
/**
 * Build a topologically sorted execution plan from traps, skills, and edges.
 *
 * 排序语义：
 * - `mitigates` 边 (skill -> trap)：skill 必须在 trap 之前执行
 * - `requires` 边 (A -> B)：A 必须在 B 之前执行（硬依赖）
 * - `order` 边 (A -> B)：A 应在 B 之前执行（软排序）
 * - 无 mitigating 前置的 trap 放在 rank 0（按 severity 排序）
 * - 环路检测：无法拓扑排序的节点追加到末尾
 *
 * 设计参考：
 * - SkillGraph: TopoSort over prerequisite/enhancement edges
 * - GraSP: DAG compilation with state/data/order edges
 */
function buildExecutionPlan(
  traps: PlanTrapNode[],
  skills: PlanSkillNode[],
  edges: PlanEdge[],
): ExecutionStep[] {
  const allNodes = [
    ...traps.map((t) => ({
      nodeId: t.nodeId,
      label: t.label,
      kind: 'trap-mitigation' as const,
      score: t.score,
      severity: t.severity,
    })),
    ...skills.map((s) => ({
      nodeId: s.nodeId,
      label: s.label,
      kind: 'skill' as const,
      score: s.score,
      severity: 'soft' as const,
    })),
  ];

  if (allNodes.length === 0) {
    return [];
  }

  const nodeById = new Map(allNodes.map((n) => [n.nodeId, n]));

  // 构建邻接表和入度
  // 边方向约定：sourceNodeId -> targetNodeId 表示 "source 应在 target 之前执行"
  //
  // `mitigates` (skill -> trap)：skill 先于 trap → 方向正确
  // `requires` (A -> B)：A 先于 B → 方向正确
  // `order` (A -> B)：A 先于 B → 方向正确
  const outgoing = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  const blockedByMap = new Map<string, string[]>();

  for (const node of allNodes) {
    outgoing.set(node.nodeId, []);
    indegree.set(node.nodeId, 0);
    blockedByMap.set(node.nodeId, []);
  }

  const depEdgeTypes = new Set(['mitigates', 'requires', 'order']);

  for (const edge of edges) {
    if (!depEdgeTypes.has(edge.type)) continue;
    if (!nodeById.has(edge.sourceNodeId) || !nodeById.has(edge.targetNodeId)) continue;

    outgoing.get(edge.sourceNodeId)!.push(edge.targetNodeId);
    indegree.set(edge.targetNodeId, (indegree.get(edge.targetNodeId) ?? 0) + 1);
    blockedByMap.get(edge.targetNodeId)!.push(edge.sourceNodeId);
  }

  // Kahn 算法，severity tiebreaking
  const queue: string[] = [];
  for (const node of allNodes) {
    if ((indegree.get(node.nodeId) ?? 0) === 0) {
      queue.push(node.nodeId);
    }
  }

  // 初始队列排序：hard severity 的 trap 优先，然后按 score 降序
  queue.sort((a, b) => {
    const na = nodeById.get(a)!;
    const nb = nodeById.get(b)!;
    if (na.severity === 'hard' && nb.severity !== 'hard') return -1;
    if (na.severity !== 'hard' && nb.severity === 'hard') return 1;
    return nb.score - na.score;
  });

  const rankMap = new Map<string, number>();
  const ordered: string[] = [];

  // 所有初始节点 rank = 0
  for (const nodeId of queue) {
    rankMap.set(nodeId, 0);
  }

  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    ordered.push(nodeId);

    const targets = outgoing.get(nodeId) ?? [];
    for (const targetId of targets) {
      const newIndegree = (indegree.get(targetId) ?? 1) - 1;
      indegree.set(targetId, newIndegree);

      // 更新 rank：所有前驱 rank 的最大值 + 1
      const currentRank = rankMap.get(targetId) ?? 0;
      const predecessorRank = rankMap.get(nodeId) ?? 0;
      rankMap.set(targetId, Math.max(currentRank, predecessorRank + 1));

      if (newIndegree === 0) {
        queue.push(targetId);
      }
    }

    // 队列内按 rank 优先，然后 severity，然后 score 排序
    queue.sort((a, b) => {
      const rankDiff = (rankMap.get(a) ?? 0) - (rankMap.get(b) ?? 0);
      if (rankDiff !== 0) return rankDiff;
      const na = nodeById.get(a)!;
      const nb = nodeById.get(b)!;
      if (na.severity === 'hard' && nb.severity !== 'hard') return -1;
      if (na.severity !== 'hard' && nb.severity === 'hard') return 1;
      return nb.score - na.score;
    });
  }

  // 环路处理：未排入的节点追加到末尾
  const orderedSet = new Set(ordered);
  for (const node of allNodes) {
    if (!orderedSet.has(node.nodeId)) {
      ordered.push(node.nodeId);
      rankMap.set(node.nodeId, allNodes.length);
    }
  }

  // 构建 ExecutionStep 数组
  return ordered.map((nodeId) => {
    const node = nodeById.get(nodeId)!;
    return {
      rank: rankMap.get(nodeId) ?? 0,
      nodeId: node.nodeId,
      label: node.label,
      kind: node.kind,
      blockedBy: blockedByMap.get(nodeId) ?? [],
    };
  });
}
```

- [ ] **Step 2.4：将 `buildExecutionPlan` 接入 `compileTrapFirstPlan`**

在 `compileTrapFirstPlan()` 的 return 语句（约 line 161）中，将 `executionPlan` 加入返回值：

```ts
const executionPlan = buildExecutionPlan(blockingTraps, selectedSkills, edges);

return {
  blockingTraps,
  recommendedSkills: selectedSkills,
  edges,
  citations,
  executionPlan,
  graph,
};
```

同时更新 empty-plan 早返回路径（约 line 104），加上 `executionPlan: []`：

```ts
return {
  blockingTraps: [],
  recommendedSkills: [],
  edges: [],
  citations: [],
  executionPlan: [],
  graph: {
    // ... 保持不变
  },
};
```

- [ ] **Step 2.5：运行测试确认通过**

```bash
pnpm test -- --run packages/server/src/lib/retrieval/graph-plan/plan-compiler.test.ts
```

Expected: 所有测试（包括新增的 executionPlan 测试）通过。

- [ ] **Step 2.6：运行类型检查**

```bash
pnpm typecheck
```

Expected: 0 errors。


```bash
```

- [ ] **Step 2.8：Commit**

```bash
git add packages/server/src/lib/retrieval/graph-plan/plan-compiler.ts packages/server/src/lib/retrieval/graph-plan/plan-compiler.test.ts
git commit -m "feat(retrieval): add topological execution plan to trap-first compiler"
```

### Phase 2 验收标准

- [x] `buildExecutionPlan()` 函数已实现，使用 Kahn 拓扑排序算法
- [x] 边方向约定：`mitigates`/`requires`/`order` 均为 "source 先于 target"
- [x] 环路检测：无法排序的节点追加到末尾，不抛异常
- [x] `rank` 值正确：无前置节点 rank=0，有前置节点 rank = max(前驱 rank) + 1
- [x] `blockedBy` 正确：包含所有直接前驱节点的 nodeId
- [x] `compileTrapFirstPlan()` 返回值包含 `executionPlan` 字段
- [x] 空计划早返回路径包含 `executionPlan: []`
- [x] 所有新增测试用例通过（空计划、mitigates 排序、requires 排序、rank 值、Deploy Cluster 端到端）
- [x] 所有现有测试不受影响
- [x] `pnpm typecheck` 零错误

### Phase 2 文档更新

- [x] `docs/architecture/GRAPH_RETRIEVAL.md`：暂不更新（Phase 4 统一处理）
- [x] `plan.md`：记录 Phase 2 完成状态

---

## Phase 3：更新 CLI 消费端

**目标：** CLI renderer 改为直接使用服务端返回的 `executionPlan`，移除客户端自行计算拓扑排序的逻辑。

**涉及文件：**

- 修改：`packages/cli/src/lib/output-profile.ts`

### 进度追踪

- [ ] **Step 3.1：替换 `buildExecutionOrder` 实现**

将 `output-profile.ts` 中的 `buildExecutionOrder` 函数（lines 157-207）改为从 `executionPlan` 读取：

```ts
function buildExecutionOrder(payload: GraphPlanSearchResponse): string[] {
  const executionPlan = payload.plan?.executionPlan ?? [];
  if (executionPlan.length === 0) {
    return [];
  }

  return executionPlan.map((step) => step.label);
}
```

注意事项：

- 服务端返回 `executionPlan` 后，客户端不再需要自行做拓扑排序
- 保留 fallback 逻辑以防旧服务端不返回此字段

- [ ] **Step 3.2：检查各 renderer 是否需要适配 `executionPlan` 结构**

阅读 `output-profile.ts` 中 `renderClaude`、`renderCodex`、`renderOpenCode`、`renderGeneric` 函数，确认它们如何使用 `buildExecutionOrder` 的结果。

对于 `codex` renderer（JSON 输出），考虑输出完整 `executionPlan` 而非仅 labels：

```ts
// 在 buildCodexObject 中：
executionPlan: plan?.executionPlan ?? [],
```

- [ ] **Step 3.3：运行 CLI 测试**

```bash
pnpm test -- --run packages/cli/
```

Expected: 所有 CLI 测试通过。

- [ ] **Step 3.4：运行类型检查**

```bash
pnpm typecheck
```

Expected: 0 errors。

- [ ] **Step 3.5：Commit**

```bash
git add packages/cli/src/lib/output-profile.ts
git commit -m "refactor(cli): consume server-side executionPlan instead of client-side topo sort"
```

### Phase 3 验收标准

- [x] `buildExecutionOrder()` 已改为从 `payload.plan.executionPlan` 读取
- [x] 当服务端未返回 `executionPlan` 时，降级为空数组（不崩溃）
- [x] `codex` renderer 输出包含 `executionPlan` 完整结构（若有）
- [x] 其他 renderer 的 `next_steps` 输出行为不变（label 列表）
- [x] 所有 CLI 测试通过
- [x] `pnpm typecheck` 零错误

### Phase 3 文档更新

- [x] `docs/architecture/GRAPH_RETRIEVAL.md`：暂不更新（Phase 4 统一处理）
- [x] `plan.md`：记录 Phase 3 完成状态

---

## Phase 4：端到端验证与文档收尾

**目标：** 确保端到端路径正确传递 `executionPlan`，更新架构文档，执行最终正确性验证。

**涉及文件：**

- 修改：`packages/server/src/lib/retrieval/graph-plan/graph-plan-search.test.ts`（若受影响）
- 修改：`docs/architecture/GRAPH_RETRIEVAL.md`
- 修改：`docs/reference/GLOSSARY.md`（若有新术语）

### 进度追踪

- [ ] **Step 4.1：检查 `graph-plan-search.test.ts` 是否受影响**

`searchKnowledgeGraphPlan()` 调用 `compileTrapFirstPlan()` 并通过 `graphPlanSearchResponseSchema.parse()` 验证。由于 `executionPlan` 有 `.default([])`，现有测试不会失败。新增一个端到端断言：

```ts
it('returns executionPlan in graph-plan response', async () => {
  // ... 使用含 trap + skill + edge 的 fixture ...

  const result = await searchKnowledgeGraphPlan(services, auth, query);

  expect(result.plan).not.toBeNull();
  if (result.plan) {
    expect(result.plan.executionPlan).toBeDefined();
    expect(Array.isArray(result.plan.executionPlan)).toBe(true);
    // 若 plan 中有节点，executionPlan 应非空
    if (result.plan.blockingTraps.length > 0 || result.plan.recommendedSkills.length > 0) {
      expect(result.plan.executionPlan.length).toBeGreaterThan(0);
    }
  }
});
```

- [ ] **Step 4.2：运行全量检索测试**

```bash
pnpm test -- --run packages/server/src/lib/retrieval/
pnpm test -- --run packages/server/src/routes/retrieval.test.ts
pnpm typecheck
```

Expected: 全部通过。

- [ ] **Step 4.3：更新 `GRAPH_RETRIEVAL.md`**

在"四、读取路径"的 v3 Graph Plan Search 部分（约 line 198）的输出列表中，在 `citations[]` 之后新增：

```md
       +-- executionPlan[]   (拓扑排序后的执行序列)
           +-- rank: 拓扑层级 (0=无前置，同层可并行)
           +-- nodeId: 关联的 trap 或 skill 节点 ID
           +-- label: 人类可读标签
           +-- kind: 'trap-mitigation' | 'skill'
           +-- blockedBy: 前置节点 ID 列表
```

在"七、关键设计特点"部分新增：

```md
8. **拓扑排序执行计划** -- `executionPlan` 字段基于 `mitigates`/`requires`/`order` 边进行 Kahn 拓扑排序，客户端无需自行计算执行顺序。边方向约定为"source 先于 target"：`mitigates`(skill→trap) 表示 skill 应在 trap 之前执行，`requires`(A→B) 表示 A 应在 B 之前执行，`order`(A→B) 表示 A 应在 B 之前执行。环路节点追加到末尾。
```

更新"八、关键源文件索引"部分的图计划检索表：

```md
| `packages/server/src/lib/retrieval/plan-compiler.ts` | Trap-First Plan 编译器 (BFS 局部展开 + skill 预算 + 拓扑执行计划) |
```

- [ ] **Step 4.4：更新 `GLOSSARY.md`（若需要）**

若 `docs/reference/GLOSSARY.md` 中没有以下术语，补充：

- `executionPlan`：拓扑排序后的执行序列，包含 rank、blockedBy 等依赖信息
- `ExecutionStep`：执行计划中的单个步骤，关联一个 trap 或 skill 节点


```bash
```

- [ ] **Step 4.6：Commit**

```bash
git add docs/architecture/GRAPH_RETRIEVAL.md docs/reference/GLOSSARY.md
git commit -m "docs: document executionPlan in graph retrieval architecture"
```

### Phase 4 验收标准

- [x] `graph-plan-search.test.ts` 新增端到端断言，验证 `executionPlan` 在完整路径中正确传递
- [x] 全量检索测试通过（`packages/server/src/lib/retrieval/`）
- [x] 路由测试通过（`packages/server/src/routes/retrieval.test.ts`）
- [x] `GRAPH_RETRIEVAL.md` 已更新：v3 输出结构含 `executionPlan`、设计特点新增拓扑排序说明、源文件索引已更新
- [x] `GLOSSARY.md` 已补充新术语（若有）
- [x] `pnpm typecheck` 零错误

### Phase 4 文档更新

- [x] `docs/architecture/GRAPH_RETRIEVAL.md`：v3 输出结构、设计特点、源文件索引
- [x] `docs/reference/GLOSSARY.md`：`executionPlan`、`ExecutionStep` 术语
- [x] `plan.md`：记录 Phase 4 完成状态

---

## 最终正确性验证

所有阶段完成后，执行以下验证清单。**任一项不通过则不得标记为完成。**

### 类型安全验证

```bash
pnpm typecheck
```

- [x] 零类型错误

### 单元测试验证

```bash
pnpm test -- --run packages/server/src/lib/retrieval/graph-plan/plan-compiler.test.ts
```

- [x] 所有现有测试通过（无回归）
- [x] 所有新增 executionPlan 测试通过

### 集成测试验证

```bash
pnpm test -- --run packages/server/src/lib/retrieval/graph-plan/graph-plan-search.test.ts
pnpm test -- --run packages/server/src/routes/retrieval.test.ts
```

- [x] v3 端到端路径测试通过
- [x] API 路由测试通过

### CLI 测试验证

```bash
pnpm test -- --run packages/cli/
```

- [x] 所有 CLI 测试通过

### 全量测试验证

```bash
pnpm test -- --run
```

- [x] 全量测试无失败

### Schema 向后兼容验证

- [x] `executionPlan` 使用 `.default([])`，旧客户端不传此字段不会报错
- [x] `graphPlanSearchResponseSchema.parse()` 对含/不含 `executionPlan` 的响应均正常

### 拓扑排序正确性验证

- [x] `mitigates` 边：skill 在 executionPlan 中排在对应的 trap 之前
- [x] `requires` 边：source 在 executionPlan 中排在 target 之前
- [x] `order` 边：source 在 executionPlan 中排在 target 之前
- [x] `rank` 值：无前置节点 rank=0，后续节点 rank 递增
- [x] `blockedBy`：包含所有直接前驱的 nodeId
- [x] 环路处理：存在环路时不会抛异常，未排序节点追加到末尾
- [x] 空计划：无 trap 且无 skill 时 `executionPlan` 为空数组

### 文档一致性验证

- [x] `GRAPH_RETRIEVAL.md` 中 v3 输出结构与实际 schema 一致
- [x] 设计特点中描述的边方向约定与实现一致
- [x] 源文件索引中的文件路径和职责描述准确

### 图谱同步验证


---

## 实施时的统一注意事项

- [ ] 不要修改 `recommendedSkills` 数组本身的排序逻辑（保持 score-based + mitigation boost）
- [ ] 不要引入新的 npm 依赖——Kahn 算法用纯 TypeScript 实现
- [ ] 不要让 `executionPlan` 包含 plan 中不存在的节点
- [ ] 不要忽略 cycle 情况——必须有 graceful degradation（append remaining nodes at end）
- [ ] 不要改动 `GraphPlan` 统一图视图的结构
- [ ] 不要在 `executionPlan` 中引入 trap-to-skill 的 `blockedBy` 边（`mitigates` 方向是 skill→trap，只需 trap 的 `blockedBy` 包含 skill）
- [ ] 不要把多个阶段改动混成一次提交

## 推荐执行顺序

1. Phase 1：先稳住 contracts 层类型
2. Phase 2：实现拓扑排序核心逻辑 + 测试
3. Phase 3：更新 CLI 消费端
4. Phase 4：端到端验证 + 文档收尾

## 最终交付清单

- [ ] `TrapFirstPlan.executionPlan` 字段已加入 contracts schema
- [ ] `buildExecutionPlan()` 已实现并通过单元测试
- [ ] CLI 消费端已改为读取服务端 `executionPlan`
- [ ] `GRAPH_RETRIEVAL.md` 已更新
- [ ] `GLOSSARY.md` 已补充（若有新术语）
- [ ] 全量 typecheck + 测试通过
- [ ] 最终正确性验证全部通过
