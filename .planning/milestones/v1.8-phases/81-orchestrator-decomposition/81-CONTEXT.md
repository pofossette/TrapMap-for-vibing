# Phase 81: Orchestrator Decomposition

## Context

`packages/server/src/lib/retrieval/orchestrator.ts` 目前有 1145 行代码，是检索管道的核心编排器。

## Current Responsibilities

1. **路由策略选择** — `selectRetrievalStrategy`, `selectRetrievalStrategyV2`
2. **语义召回** — `semanticRecall`
3. **混合召回** — `hybridRecall`
4. **图辅助召回** — `graphAssistedRecall`
5. **候选合并** — `mergeCandidatesWithGraph`
6. **精炼生成** — `generateRefinement`
7. **嵌入缓存更新** — `updateEntryEmbeddingCache`
8. **V2 检索管道** — `searchKnowledgeV2`
9. **主入口** — `searchKnowledge`

## Problem

1. **编排器过重** — 既做路由又做具体实现
2. **测试复杂度高** — 需要 mock 大量依赖
3. **难以扩展** — 添加新策略需要修改大文件

## Goals

1. 将编排器拆分为策略模块和协调层
2. 每个召回策略独立文件
3. 编排器仅负责协调和路由

## Proposed Structure

```
packages/server/src/lib/retrieval/
├── orchestrator.ts          # 主入口，仅路由和协调 (~200 行)
├── strategies/
│   ├── semantic.ts          # semanticRecall (~150 行)
│   ├── hybrid.ts            # hybridRecall (~200 行)
│   └── graph-assisted.ts    # graphAssistedRecall (~200 行)
├── ranking/
│   ├── merge.ts             # 候选合并逻辑 (已存在)
│   └── rerank.ts            # 重排序逻辑 (已存在)
├── refinement.ts            # generateRefinement (~50 行)
├── embedding-cache.ts       # updateEntryEmbeddingCache (~50 行)
└── v2-pipeline.ts           # searchKnowledgeV2 (~300 行)
```

## Acceptance Criteria

- [ ] `orchestrator.ts` 主文件 < 300 行
- [ ] 每个策略文件 < 300 行
- [ ] 所有现有测试通过
- [ ] 公共 API 保持不变 (`searchKnowledge`, `searchKnowledgeV2`)
- [ ] 无功能性变更

## Dependencies

- Phase 80 (建议先完成，积累拆分经验)

## Estimated Effort

Medium-High (6-8 hours)

## Risk

中等 — orchestrator 是检索核心，需确保拆分不影响检索行为
