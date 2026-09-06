import type {
  GraphPlanSearchResponse,
  RetrievalResponse,
  RetrievalV2Response,
  SkillLookupResponse,
} from '@trapmap/contracts';

import type { GraphPlanSummaryView, RenderEnvelope } from './types.js';

export function xmlEscape(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function summarizeRetrievalV1(payload: RetrievalResponse): string {
  if (payload.summary?.text) {
    return payload.summary.text;
  }
  if (payload.refinementSummary) {
    return payload.refinementSummary;
  }
  const firstValid =
    payload.globalConstraints.find((c) => c != null) ??
    payload.projectKnowledge.find((c) => c != null);
  return firstValid
    ? `${firstValid.shortcut} (${firstValid.score.toFixed(2)})`
    : 'No results found';
}

export function summarizeRetrievalV2(payload: RetrievalV2Response): string {
  if (payload.summary?.text) {
    return payload.summary.text;
  }
  if (payload.refinementSummary) {
    return payload.refinementSummary;
  }
  const first = payload.capsules[0];
  return first ? `${first.goal} (${first.score.toFixed(2)})` : 'No results found';
}

export function summarizeSkillLookup(payload: SkillLookupResponse): string {
  const first = payload.matches[0];
  return first ? `${first.title} (${first.score.toFixed(2)})` : 'No skills found';
}

function summarizeGraphPlan(payload: GraphPlanSearchResponse): string {
  if (
    payload.plan?.recommendedSkills.some((s) => s != null) ||
    payload.plan?.blockingTraps.some((t) => t != null)
  ) {
    return `${payload.plan?.recommendedSkills.length ?? 0} recommended skill(s), ${payload.plan?.blockingTraps.length ?? 0} blocking trap(s) in graph-plan summary`;
  }
  if (payload.fallback?.routeFamily === 'capsule') {
    return (
      payload.fallback.response.summary?.text ??
      `Fallback to ${payload.fallback.response.capsules.length} capsule result(s)`
    );
  }
  if (payload.fallback?.routeFamily === 'entry') {
    return (
      payload.fallback.response.summary?.text ??
      payload.fallback.response.refinementSummary ??
      `Fallback to ${payload.fallback.response.globalConstraints.length + payload.fallback.response.projectKnowledge.length} entry result(s)`
    );
  }
  return 'No plan available';
}

function padNumber(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

function buildExecutionOrder(
  payload: GraphPlanSearchResponse,
  nodeIdToNum?: Map<string, string>,
): string[] {
  const executionPlan = payload.plan?.executionPlan ?? [];
  if (executionPlan.length === 0) {
    return [];
  }

  return executionPlan.map((step) => {
    if (nodeIdToNum) {
      const num = nodeIdToNum.get(step.nodeId) ?? '?';
      const blocked =
        step.blockedBy.length === 0
          ? '-'
          : step.blockedBy.map((id) => `[${nodeIdToNum.get(id) ?? '?'}]`).join(', ');
      return `[${num}] ${step.label} (rank ${step.rank}, blockedBy: ${blocked})`;
    }
    return step.label;
  });
}

function buildNodeNumberMap(payload: GraphPlanSearchResponse): Map<string, string> {
  const plan = payload.plan;
  if (!plan) return new Map();
  const rawIds: string[] = [];
  const graphNodes = (plan.graph?.nodes ?? []).filter((n): n is NonNullable<typeof n> => n != null);
  if (graphNodes.length > 0) {
    for (const n of graphNodes) {
      if (n?.nodeId) rawIds.push(n.nodeId);
    }
  } else {
    for (const t of plan.blockingTraps ?? []) {
      if (t?.nodeId) rawIds.push(t.nodeId);
    }
    for (const s of plan.recommendedSkills ?? []) {
      if (s?.nodeId) rawIds.push(s.nodeId);
    }
  }
  const rankById = new Map<string, number>();
  for (const s of plan.executionPlan ?? []) {
    if (s?.nodeId) rankById.set(s.nodeId, s.rank);
  }
  rawIds.sort((a, b) => {
    const ra = rankById.get(a);
    const rb = rankById.get(b);
    if (ra !== undefined && rb !== undefined) return ra - rb;
    if (ra !== undefined) return -1;
    if (rb !== undefined) return 1;
    return 0;
  });
  const width = Math.max(3, String(rawIds.length).length);
  const map = new Map<string, string>();
  rawIds.forEach((id, idx) => {
    map.set(id, padNumber(idx + 1, width));
  });
  return map;
}

export function buildGraphPlanSummaryView(
  envelope: RenderEnvelope<GraphPlanSearchResponse>,
): GraphPlanSummaryView {
  const { payload, context } = envelope;
  const plan = payload.plan;
  const detailed = context.verbosity === 'detailed';
  const compact = context.verbosity === 'compact';
  const trapLimit = compact ? 2 : 3;
  const skillLimit = compact ? 2 : 3;
  const referenceLimit = compact ? 1 : 2;
  const assetLimit = compact ? 1 : 2;

  const selectedPath: GraphPlanSummaryView['selectedPath'] = plan
    ? 'graph-plan'
    : payload.fallback?.routeFamily === 'capsule'
      ? 'capsule-fallback'
      : 'entry-fallback';

  const nodeIdToNum = buildNodeNumberMap(payload);

  const blockingTraps =
    plan?.blockingTraps
      .filter((t) => t != null)
      .slice(0, trapLimit)
      .map((trap) => ({
        num: nodeIdToNum.get(trap.nodeId) ?? '?',
        nodeId: trap.nodeId,
        label: trap.label,
        severity: trap.severity,
        sourceId: trap.sourceId,
        ...(detailed || context.graphPlanMode === 'full' ? { evidence: trap.evidence } : {}),
      })) ?? [];

  const recommendedSkills =
    plan?.recommendedSkills
      .filter((s) => s != null)
      .slice(0, skillLimit)
      .map((skill) => ({
        num: nodeIdToNum.get(skill.nodeId) ?? '?',
        nodeId: skill.nodeId,
        artifactId: skill.artifactId,
        label: skill.label,
        score: skill.score,
        ...(detailed ? { situation: skill.situation, goal: skill.goal } : {}),
      })) ??
    (payload.fallback?.routeFamily === 'capsule'
      ? payload.fallback.response.capsules.slice(0, skillLimit).map((capsule) => ({
          num: '?',
          nodeId: capsule.artifactId,
          artifactId: capsule.artifactId,
          label: capsule.goal,
          score: capsule.score,
          ...(detailed ? { situation: capsule.situation, goal: capsule.goal } : {}),
        }))
      : []);

  const activationHints =
    plan?.recommendedSkills
      .filter((s) => s != null)
      .slice(0, skillLimit)
      .map((skill) => ({
        artifactId: skill.artifactId,
        num: nodeIdToNum.get(skill.nodeId) ?? '?',
        references: skill.activationRefs.references.slice(0, referenceLimit).map((ref) => ref.path),
        assets: skill.activationRefs.assets.slice(0, assetLimit).map((asset) => asset.path),
        scripts: skill.activationRefs.scripts.slice(0, 1).map((script) => script.path),
      })) ?? [];

  const labelById = new Map<string, string>();
  for (const t of plan?.blockingTraps ?? []) if (t?.nodeId) labelById.set(t.nodeId, t.label);
  for (const s of plan?.recommendedSkills ?? []) if (s?.nodeId) labelById.set(s.nodeId, s.label);
  for (const g of plan?.graph?.nodes ?? [])
    if ((g as any)?.nodeId) labelById.set((g as any).nodeId, (g as any).label);

  const planEdgesWidth = Math.max(3, String(plan?.edges.length ?? 0).length);

  return {
    summary: summarizeGraphPlan(payload),
    mode: context.graphPlanMode,
    confidence: payload.routingTrace.confidenceBucket,
    selectedPath,
    ...(selectedPath === 'graph-plan'
      ? {}
      : {
          fallbackNotice:
            selectedPath === 'capsule-fallback'
              ? 'Plan was not selected; using capsule fallback guidance.'
              : 'Plan was not selected; using entry fallback guidance.',
        }),
    blockingTraps,
    recommendedSkills,
    executionOrder:
      selectedPath === 'graph-plan'
        ? buildExecutionOrder(payload, nodeIdToNum).slice(0, skillLimit)
        : recommendedSkills.map((skill) => String(skill.label)),
    activationHints,
    planEdges:
      detailed || context.graphPlanMode === 'full'
        ? (plan?.edges ?? [])
            .filter((e): e is NonNullable<typeof e> => e != null)
            .map((edge, idx) => ({
              edgeNum: `E${padNumber(idx + 1, planEdgesWidth)}`,
              id: edge.id,
              sourceNodeId: edge.sourceNodeId,
              targetNodeId: edge.targetNodeId,
              sourceNum: nodeIdToNum.get(edge.sourceNodeId) ?? '?',
              targetNum: nodeIdToNum.get(edge.targetNodeId) ?? '?',
              sourceLabel: labelById.get(edge.sourceNodeId) ?? edge.sourceNodeId,
              targetLabel: labelById.get(edge.targetNodeId) ?? edge.targetNodeId,
              type: edge.type,
              strength: edge.strength,
              arrow: `--${edge.type}[${edge.strength}]-->`,
            }))
        : [],
  };
}
