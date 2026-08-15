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

function buildExecutionOrder(payload: GraphPlanSearchResponse): string[] {
  const executionPlan = payload.plan?.executionPlan ?? [];
  if (executionPlan.length === 0) {
    return [];
  }

  return executionPlan.map((step) => step.label);
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

  const blockingTraps =
    plan?.blockingTraps
      .filter((t) => t != null)
      .slice(0, trapLimit)
      .map((trap) => ({
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
        artifactId: skill.artifactId,
        label: skill.label,
        score: skill.score,
        ...(detailed ? { situation: skill.situation, goal: skill.goal } : {}),
      })) ??
    (payload.fallback?.routeFamily === 'capsule'
      ? payload.fallback.response.capsules.slice(0, skillLimit).map((capsule) => ({
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
        references: skill.activationRefs.references.slice(0, referenceLimit).map((ref) => ref.path),
        assets: skill.activationRefs.assets.slice(0, assetLimit).map((asset) => asset.path),
        scripts: skill.activationRefs.scripts.slice(0, 1).map((script) => script.path),
      })) ?? [];

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
        ? buildExecutionOrder(payload).slice(0, skillLimit)
        : recommendedSkills.map((skill) => String(skill.label)),
    activationHints,
    planEdges:
      detailed || context.graphPlanMode === 'full'
        ? (plan?.edges ?? []).map((edge) => ({
            id: edge.id,
            sourceNodeId: edge.sourceNodeId,
            targetNodeId: edge.targetNodeId,
            type: edge.type,
            strength: edge.strength,
          }))
        : [],
  };
}
