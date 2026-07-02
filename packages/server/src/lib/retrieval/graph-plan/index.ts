/**
 * Graph-plan retrieval barrel.
 *
 * Re-exports the public API for graph-plan search, plan compilation,
 * and its sub-modules (trap identification, skill selection, edges,
 * citations, graph assembly, and execution plan building).
 */

// Main entry point
export { searchKnowledgeGraphPlan, assessGraphPlanReadiness } from './graph-plan-search.js';

// Plan compiler (main + re-exported sub-modules)
export {
  compileTrapFirstPlan,
  buildExecutionPlan,
  buildCitations as buildPlanCitations,
  buildPlanEdges,
  buildUnifiedGraph,
  applySkillBudget,
  buildActivationRefs,
  findBlockingTraps,
} from './plan-compiler.js';

// Sub-modules (direct access)
export { buildExecutionPlan as buildExecutionPlanDirect } from './execution-plan.js';
export { buildCitations } from './plan-citations.js';
export { buildPlanEdges as buildPlanEdgesDirect } from './plan-edges.js';
export { buildUnifiedGraph as buildUnifiedGraphDirect } from './plan-graph.js';
export {
  applySkillBudget as applySkillBudgetDirect,
  buildActivationRefs as buildActivationRefsDirect,
} from './skill-selection.js';
export { findBlockingTraps as findBlockingTrapsDirect } from './trap-identification.js';
export { selectQueryRelevantTraps } from './trap-ranking.js';
export type { RankedTrapSeed } from './trap-ranking.js';
