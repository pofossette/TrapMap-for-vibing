# Phase 87: Type & State Machine Centralization - Context

**Gathered:** 2026-05-06
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss)

<domain>
## Phase Boundary

集中导出 server 包的散落类型、枚举和状态机，建立统一的 barrel re-export 体系

**Requirements:**
1. 将 `store.ts` 中 35+ 个 record 接口拆分到 `store/types/` 目录（按领域：knowledge-records.ts, skill-records.ts, system-records.ts 等）
2. 创建 `server/src/lib/types.ts` 统一 re-export 所有子模块类型（indexing, retrieval, ai, candidates, governance, store 等）
3. 为 decay 和 lifecycle 状态机创建统一导出点（`state-machines/index.ts`）
4. 所有现有 import 路径保持 backward-compatible（旧路径 re-export 自新位置）
5. 添加类型导出的编译验证测试

**Success Criteria:**
- store.ts 中的接口按领域拆分到独立文件
- 存在 `lib/types.ts` 作为所有 server 类型的统一入口
- 状态机有统一的 barrel 导出
- 所有现有 import 路径不受影响（typecheck 通过）
- 现有测试全部通过

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — discuss phase was skipped per user setting. Use ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.

</decisions>

<code_context>
## Existing Code Insights

Codebase context will be gathered during plan-phase research.

</code_context>

<specifics>
## Specific Ideas

No specific requirements — discuss phase skipped. Refer to ROADMAP phase description and success criteria.

</specifics>

<deferred>
## Deferred Ideas

None — discuss phase skipped.

</deferred>
