import type {
  GraphPlanSearchResponse,
  RetrievalResponse,
  RetrievalV2Response,
  SkillLookupResponse,
} from '@trapmap/contracts';

import {
  type OutputGraphPlanMode,
  type OutputModelHint,
  type OutputProfile,
  type OutputToolProfile,
  type OutputVerbosity,
  getDefaultOutputProfile as getConfigDefaultOutputProfile,
} from './config.js';
import { formatLoadContext } from './markdown-formatter.js';

export type RenderKind =
  | 'retrieval-v1'
  | 'retrieval-v2'
  | 'graph-plan'
  | 'skill-lookup'
  | 'artifact-export'
  | 'command-result'
  | 'generic';

export interface RenderEnvelopeContext {
  commandName?: string;
  tool: OutputToolProfile;
  modelHint?: OutputModelHint;
  verbosity: OutputVerbosity;
  graphPlanMode: OutputGraphPlanMode;
  includeRawHints: boolean;
}

export interface RenderEnvelope<T = unknown> {
  kind: RenderKind;
  payload: T;
  context: RenderEnvelopeContext;
}

export interface Renderer<T = RenderPayload> {
  id: string;
  render: (envelope: RenderEnvelope<T>) => string;
}

export type RenderPayload =
  | RetrievalResponse
  | RetrievalV2Response
  | GraphPlanSearchResponse
  | SkillLookupResponse
  | Record<string, unknown>;

type RendererRegistry = Record<
  OutputToolProfile,
  Partial<Record<RenderKind, Renderer<RenderPayload>>>
>;

interface GraphPlanSummaryView {
  summary: string;
  mode: OutputGraphPlanMode;
  confidence: string | null;
  selectedPath: 'graph-plan' | 'capsule-fallback' | 'entry-fallback';
  fallbackNotice?: string;
  blockingTraps: Array<Record<string, unknown>>;
  recommendedSkills: Array<Record<string, unknown>>;
  executionOrder: string[];
  activationHints: Array<Record<string, unknown>>;
  planEdges: Array<Record<string, unknown>>;
}

interface RetrievalV1View {
  type: 'retrieval-v1';
  querySummary: string;
  constraints: Array<Record<string, unknown>>;
  projectKnowledge: Array<Record<string, unknown>>;
  nextSteps: string[];
}

interface RetrievalV2View {
  type: 'retrieval-v2';
  querySummary: string;
  capsules: Array<Record<string, unknown>>;
  profileHints: Array<Record<string, unknown>>;
  nextSteps: string[];
}

interface SkillLookupView {
  type: 'skill-lookup';
  querySummary: string;
  matches: Array<Record<string, unknown>>;
  nextSteps: string[];
}

interface CommandResultView {
  type: 'command-result';
  action: string;
  success: boolean;
  summary: string;
  artifacts: Array<Record<string, unknown>>;
  previousState?: string;
  transition?: { from: string; to: string };
  nextSteps: string[];
}

function xmlEscape(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function summarizeRetrievalV1(payload: RetrievalResponse): string {
  if (payload.summary?.text) {
    return payload.summary.text;
  }
  if (payload.refinementSummary) {
    return payload.refinementSummary;
  }
  const firstValid =
    payload.globalConstraints.find((c) => c != null) ??
    payload.projectKnowledge.find((c) => c != null);
  return firstValid ? `${firstValid.shortcut} (${firstValid.score.toFixed(2)})` : 'No results found';
}

function summarizeRetrievalV2(payload: RetrievalV2Response): string {
  if (payload.summary?.text) {
    return payload.summary.text;
  }
  if (payload.refinementSummary) {
    return payload.refinementSummary;
  }
  const first = payload.capsules[0];
  return first ? `${first.goal} (${first.score.toFixed(2)})` : 'No results found';
}

function summarizeSkillLookup(payload: SkillLookupResponse): string {
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

function buildGraphPlanSummaryView(
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
    plan?.blockingTraps.filter((t) => t != null).slice(0, trapLimit).map((trap) => ({
      label: trap.label,
      severity: trap.severity,
      sourceId: trap.sourceId,
      ...(detailed || context.graphPlanMode === 'full' ? { evidence: trap.evidence } : {}),
    })) ?? [];

  const recommendedSkills =
    plan?.recommendedSkills.filter((s) => s != null).slice(0, skillLimit).map((skill) => ({
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
    plan?.recommendedSkills.filter((s) => s != null).slice(0, skillLimit).map((skill) => ({
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

function buildRetrievalV1View(payload: RetrievalResponse): RetrievalV1View {
  return {
    type: 'retrieval-v1',
    querySummary: summarizeRetrievalV1(payload),
    constraints: payload.globalConstraints.filter((match) => match != null).map((match) => ({
      entryId: match.entryId,
      shortcut: match.shortcut,
      score: match.score,
      reason: match.reason,
      labels: match.labels,
    })),
    projectKnowledge: payload.projectKnowledge.filter((match) => match != null).map((match) => ({
      entryId: match.entryId,
      shortcut: match.shortcut,
      score: match.score,
      reason: match.reason,
      labels: match.labels,
    })),
    nextSteps:
      payload.globalConstraints.length + payload.projectKnowledge.length > 0
        ? ['Read the highest-scoring entries first.']
        : [],
  };
}

function buildRetrievalV2View(payload: RetrievalV2Response): RetrievalV2View {
  return {
    type: 'retrieval-v2',
    querySummary: summarizeRetrievalV2(payload),
    capsules: payload.capsules.map((capsule) => ({
      artifactId: capsule.artifactId,
      capsuleId: capsule.capsuleId,
      situation: capsule.situation,
      goal: capsule.goal,
      score: capsule.score,
      labels: capsule.labels,
      reason: capsule.reason,
    })),
    profileHints: payload.profileHints.map((hint) => ({
      artifactId: hint.artifactId,
      title: hint.title,
      slug: hint.slug,
      labels: hint.labels,
    })),
    nextSteps: payload.capsules.length > 0 ? ['Open the top matching skill artifact first.'] : [],
  };
}

function buildSkillLookupView(payload: SkillLookupResponse): SkillLookupView {
  return {
    type: 'skill-lookup',
    querySummary: summarizeSkillLookup(payload),
    matches: payload.matches.map((match) => ({
      artifactId: match.artifactId,
      title: match.title,
      slug: match.slug,
      labels: match.labels,
      score: match.score,
      reason: match.reason,
      sourceKind: match.sourceKind,
    })),
    nextSteps: payload.matches.length > 0 ? ['Inspect the highest-scoring skill first.'] : [],
  };
}

function buildCommandResultView(payload: Record<string, unknown>): CommandResultView {
  const action = String(payload.action ?? 'unknown');
  const success = Boolean(payload.success);
  const summary = String(payload.summary ?? '');
  const artifacts = Array.isArray(payload.artifacts)
    ? payload.artifacts.map((a: Record<string, unknown>) => ({
        id: a.id,
        title: a.title,
        newState: a.newState,
        revision: a.revision,
      }))
    : [];
  const transition = payload.transition as { from: string; to: string } | undefined;
  const nextSteps = Array.isArray(payload.nextSteps) ? (payload.nextSteps as string[]) : [];

  return {
    type: 'command-result',
    action,
    success,
    summary,
    artifacts,
    ...(payload.previousState ? { previousState: String(payload.previousState) } : {}),
    ...(transition ? { transition } : {}),
    nextSteps,
  };
}

function buildCodexObject(envelope: RenderEnvelope<RenderPayload>): Record<string, unknown> {
  if ((envelope.payload as { failRender?: boolean }).failRender) {
    throw new Error('forced render failure');
  }
  if (
    envelope.kind === 'skill-lookup' &&
    (envelope.payload as SkillLookupResponse).matches.some(
      (match) => 'failRender' in (match as Record<string, unknown>),
    )
  ) {
    throw new Error('forced render failure');
  }

  switch (envelope.kind) {
    case 'retrieval-v1': {
      const view = buildRetrievalV1View(envelope.payload as RetrievalResponse);
      return {
        type: view.type,
        query_summary: view.querySummary,
        constraints: view.constraints,
        project_knowledge: view.projectKnowledge,
        next_steps: view.nextSteps,
      };
    }
    case 'retrieval-v2': {
      const view = buildRetrievalV2View(envelope.payload as RetrievalV2Response);
      return {
        type: view.type,
        query_summary: view.querySummary,
        capsules: view.capsules,
        profile_hints: view.profileHints,
        next_steps: view.nextSteps,
      };
    }
    case 'graph-plan': {
      const view = buildGraphPlanSummaryView(envelope as RenderEnvelope<GraphPlanSearchResponse>);
      const graphPlanPayload = envelope.payload as GraphPlanSearchResponse;
      if (envelope.context.graphPlanMode === 'skill-list') {
        return {
          type: envelope.kind,
          mode: view.mode,
          summary: view.summary,
          selected_path: view.selectedPath,
          skills: view.recommendedSkills,
          traps: [],
          next_steps: [],
          confidence: view.confidence,
          ...(view.fallbackNotice ? { fallback_notice: view.fallbackNotice } : {}),
        };
      }
      return {
        type: envelope.kind,
        mode: view.mode,
        summary: view.summary,
        selected_path: view.selectedPath,
        skills: view.recommendedSkills,
        traps: view.blockingTraps,
        activation_hints: view.activationHints,
        next_steps: view.executionOrder,
        executionPlan: graphPlanPayload.plan?.executionPlan ?? [],
        confidence: view.confidence,
        ...(view.fallbackNotice ? { fallback_notice: view.fallbackNotice } : {}),
        ...(view.planEdges.length > 0 ? { plan_edges: view.planEdges } : {}),
      };
    }
    case 'skill-lookup': {
      const view = buildSkillLookupView(envelope.payload as SkillLookupResponse);
      return {
        type: view.type,
        query_summary: view.querySummary,
        matches: view.matches,
        next_steps: view.nextSteps,
      };
    }
    case 'command-result': {
      const view = buildCommandResultView(envelope.payload as Record<string, unknown>);
      return {
        type: view.type,
        action: view.action,
        success: view.success,
        summary: view.summary,
        artifacts: view.artifacts,
        ...(view.previousState ? { previous_state: view.previousState } : {}),
        ...(view.transition ? { transition: view.transition } : {}),
        next_steps: view.nextSteps,
      };
    }
    default:
      return {
        type: envelope.kind,
        summary: 'Generic TrapMap output',
      };
  }
}

function renderClaude(envelope: RenderEnvelope<RenderPayload>): string {
  if (envelope.kind === 'command-result') {
    const view = buildCommandResultView(envelope.payload as Record<string, unknown>);
    const lines = [
      '<trapmap_command_result>',
      `  <action>${xmlEscape(view.action)}</action>`,
      `  <success>${String(view.success)}</success>`,
      `  <summary>${xmlEscape(view.summary)}</summary>`,
    ];
    if (view.artifacts.length > 0) {
      lines.push('  <artifacts>');
      for (const artifact of view.artifacts) {
        lines.push(`    <artifact>${xmlEscape(JSON.stringify(artifact))}</artifact>`);
      }
      lines.push('  </artifacts>');
    }
    if (view.transition) {
      lines.push(`  <transition>${xmlEscape(JSON.stringify(view.transition))}</transition>`);
    }
    if (view.nextSteps.length > 0) {
      lines.push('  <next_steps>');
      for (const step of view.nextSteps) {
        lines.push(`    <step>${xmlEscape(step)}</step>`);
      }
      lines.push('  </next_steps>');
    }
    lines.push('</trapmap_command_result>');
    return lines.join('\n');
  }

  const codexObject = buildCodexObject(envelope);
  const skills = Array.isArray(codexObject.skills) ? codexObject.skills : [];
  const skillMatches = Array.isArray(codexObject.matches) ? codexObject.matches : [];
  const traps = Array.isArray(codexObject.traps) ? codexObject.traps : [];
  const constraints = Array.isArray(codexObject.constraints) ? codexObject.constraints : [];
  const projectKnowledge = Array.isArray(codexObject.project_knowledge)
    ? codexObject.project_knowledge
    : [];
  const capsules = Array.isArray(codexObject.capsules) ? codexObject.capsules : [];
  const profileHints = Array.isArray(codexObject.profile_hints) ? codexObject.profile_hints : [];
  const nextSteps = Array.isArray(codexObject.next_steps) ? codexObject.next_steps : [];
  const activationHints = Array.isArray(codexObject.activation_hints)
    ? codexObject.activation_hints
    : [];
  const planEdges = Array.isArray(codexObject.plan_edges) ? codexObject.plan_edges : [];

  const lines = [
    '<trapmap_skill_pack>',
    `  <summary>${xmlEscape(String(codexObject.summary ?? codexObject.query_summary ?? ''))}</summary>`,
    `  <selected_path>${xmlEscape(String(codexObject.selected_path ?? 'generic'))}</selected_path>`,
    `  <confidence>${xmlEscape(String(codexObject.confidence ?? 'unknown'))}</confidence>`,
  ];

  if (capsules.length > 0) {
    lines.push('  <capsule_matches>');
    lines.push(
      ...capsules.map((capsule) => `    <capsule>${xmlEscape(JSON.stringify(capsule))}</capsule>`),
    );
    lines.push('  </capsule_matches>');
  }

  if (profileHints.length > 0) {
    lines.push('  <profile_hints>');
    lines.push(
      ...profileHints.map((hint) => `    <hint>${xmlEscape(JSON.stringify(hint))}</hint>`),
    );
    lines.push('  </profile_hints>');
  }

  if (constraints.length > 0 || projectKnowledge.length > 0) {
    lines.push('  <retrieval_matches>');
    lines.push(
      ...constraints.map(
        (item) => `    <constraint>${xmlEscape(JSON.stringify(item))}</constraint>`,
      ),
    );
    lines.push(
      ...projectKnowledge.map(
        (item) => `    <project_item>${xmlEscape(JSON.stringify(item))}</project_item>`,
      ),
    );
    lines.push('  </retrieval_matches>');
  }

  if (skillMatches.length > 0) {
    lines.push('  <skill_matches>');
    lines.push(
      ...skillMatches.map((skill) => `    <match>${xmlEscape(JSON.stringify(skill))}</match>`),
    );
    lines.push('  </skill_matches>');
  }

  if (skills.length > 0) {
    lines.push('  <recommended_skills>');
    lines.push(...skills.map((skill) => `    <skill>${xmlEscape(JSON.stringify(skill))}</skill>`));
    lines.push('  </recommended_skills>');
  }

  if (traps.length > 0) {
    lines.push('  <blocking_traps>');
    lines.push(...traps.map((trap) => `    <trap>${xmlEscape(JSON.stringify(trap))}</trap>`));
    lines.push('  </blocking_traps>');
  }

  if (activationHints.length > 0) {
    lines.push('  <activation_hints>');
    lines.push(
      ...activationHints.map((hint) => `    <hint>${xmlEscape(JSON.stringify(hint))}</hint>`),
    );
    lines.push('  </activation_hints>');
  }

  lines.push(
    '  <next_steps>',
    ...nextSteps.map(
      (step, index) => `    <step>${xmlEscape(`${index + 1}. ${String(step)}`)}</step>`,
    ),
    '  </next_steps>',
  );

  if (codexObject.fallback_notice) {
    lines.push(
      `  <fallback_notice>${xmlEscape(String(codexObject.fallback_notice))}</fallback_notice>`,
    );
  }

  if (planEdges.length > 0) {
    lines.push('  <plan_edges>');
    lines.push(...planEdges.map((edge) => `    <edge>${xmlEscape(JSON.stringify(edge))}</edge>`));
    lines.push('  </plan_edges>');
  }

  if (envelope.context.includeRawHints && activationHints.length > 0) {
    lines.push('  <raw_hints>');
    lines.push(
      ...activationHints.map((hint) => `    <hint>${xmlEscape(JSON.stringify(hint))}</hint>`),
    );
    lines.push('  </raw_hints>');
  }

  lines.push('</trapmap_skill_pack>');

  return lines.join('\n');
}

function renderCodex(envelope: RenderEnvelope<RenderPayload>): string {
  return JSON.stringify(buildCodexObject(envelope), null, 2);
}

function renderOpenCode(envelope: RenderEnvelope<RenderPayload>): string {
  if (envelope.kind === 'graph-plan') {
    const codexObject = buildCodexObject(envelope);
    const steps = Array.isArray(codexObject.next_steps) ? codexObject.next_steps : [];
    const traps = Array.isArray(codexObject.traps) ? codexObject.traps : [];
    const skills = Array.isArray(codexObject.skills) ? codexObject.skills : [];
    const activationHints = Array.isArray(codexObject.activation_hints)
      ? codexObject.activation_hints
      : [];

    const lines = [
      '# Goal',
      String(codexObject.summary ?? 'No summary available'),
      '',
      '## Selected Path',
      String(codexObject.selected_path ?? 'generic'),
      '',
    ];

    if (codexObject.fallback_notice) {
      lines.push('## Fallback Notice');
      lines.push(String(codexObject.fallback_notice));
      lines.push('');
    }

    lines.push(
      '## Recommended Skills',
      ...(skills.length > 0 ? skills.map((skill) => `- ${JSON.stringify(skill)}`) : ['- None']),
      '',
      '## Blocking Traps',
      ...(traps.length > 0 ? traps.map((trap) => `- ${JSON.stringify(trap)}`) : ['- None']),
      '',
      '## Activation Hints',
      ...(activationHints.length > 0
        ? activationHints.map((hint) => `- ${JSON.stringify(hint)}`)
        : ['- None']),
      '',
      '## Suggested Execution Order',
      ...(steps.length > 0 ? steps.map((step) => `1. ${String(step)}`) : ['1. No suggested steps']),
    );

    return lines.join('\n');
  }

  if (envelope.kind === 'retrieval-v1') {
    const view = buildRetrievalV1View(envelope.payload as RetrievalResponse);
    const lines = ['# Goal', view.querySummary, ''];
    if (view.constraints.length > 0) {
      lines.push('## Global Constraints');
      for (const item of view.constraints) {
        lines.push(
          `- **${String(item.shortcut)}** (${Number(item.score).toFixed(2)}): ${String(item.reason)}`,
        );
      }
      lines.push('');
    }
    if (view.projectKnowledge.length > 0) {
      lines.push('## Project Knowledge');
      for (const item of view.projectKnowledge) {
        lines.push(
          `- **${String(item.shortcut)}** (${Number(item.score).toFixed(2)}): ${String(item.reason)}`,
        );
      }
      lines.push('');
    }
    const summary = (envelope.payload as RetrievalResponse).summary;
    if (summary?.text) {
      lines.push('## Summary');
      lines.push(summary.text);
      lines.push('');
    }
    if (view.nextSteps.length > 0) {
      lines.push('## Next Steps');
      for (const step of view.nextSteps) {
        lines.push(`- ${step}`);
      }
    }
    return lines.join('\n').trimEnd();
  }

  if (envelope.kind === 'retrieval-v2') {
    const view = buildRetrievalV2View(envelope.payload as RetrievalV2Response);
    const lines = ['# Goal', view.querySummary, ''];
    if (view.capsules.length > 0) {
      lines.push('## Capsules');
      for (const capsule of view.capsules) {
        lines.push(
          `- **${String(capsule.artifactId)}**: ${String(capsule.goal)} (${Number(capsule.score).toFixed(2)})`,
        );
      }
      lines.push('');
    }
    if (view.profileHints.length > 0) {
      lines.push('## Profile Hints');
      for (const hint of view.profileHints) {
        lines.push(`- ${String(hint.title)} (${String(hint.slug)})`);
      }
      lines.push('');
    }
    const refinementSummary = (envelope.payload as RetrievalV2Response).refinementSummary;
    if (refinementSummary) {
      lines.push('## Refinement Summary');
      lines.push(refinementSummary);
      lines.push('');
    }
    if (view.nextSteps.length > 0) {
      lines.push('## Next Steps');
      for (const step of view.nextSteps) {
        lines.push(`- ${step}`);
      }
    }
    return lines.join('\n').trimEnd();
  }

  if (envelope.kind === 'skill-lookup') {
    const view = buildSkillLookupView(envelope.payload as SkillLookupResponse);
    const lines = ['# Goal', view.querySummary, ''];
    if (view.matches.length > 0) {
      lines.push('## Matches');
      for (const match of view.matches) {
        lines.push(
          `- **${String(match.artifactId)}**: ${String(match.title)} (${Number(match.score).toFixed(2)}): ${String(match.reason)}`,
        );
      }
      lines.push('');
    }
    if (view.nextSteps.length > 0) {
      lines.push('## Next Steps');
      for (const step of view.nextSteps) {
        lines.push(`- ${step}`);
      }
    }
    return lines.join('\n').trimEnd();
  }

  if (envelope.kind === 'command-result') {
    const view = buildCommandResultView(envelope.payload as Record<string, unknown>);
    const lines = ['# Result', view.action, ''];
    lines.push('## Summary');
    lines.push(view.summary);
    lines.push('');
    if (view.artifacts.length > 0) {
      lines.push('## Artifacts');
      for (const artifact of view.artifacts) {
        const parts = [String(artifact.id)];
        if (artifact.title) parts.push(String(artifact.title));
        if (artifact.newState) parts.push(`[${String(artifact.newState)}]`);
        if (artifact.revision) parts.push(`rev ${String(artifact.revision)}`);
        lines.push(`- ${parts.join(' ')}`);
      }
      lines.push('');
    }
    if (view.transition) {
      lines.push('## Transition');
      lines.push(`${view.transition.from} → ${view.transition.to}`);
      lines.push('');
    }
    if (view.nextSteps.length > 0) {
      lines.push('## Next Steps');
      for (const step of view.nextSteps) {
        lines.push(`- ${step}`);
      }
    }
    return lines.join('\n').trimEnd();
  }

  return `# Goal\n${String((envelope.payload as Record<string, unknown>).summary ?? 'TrapMap output')}`;
}

function renderGeneric(envelope: RenderEnvelope<RenderPayload>): string {
  if ((envelope.payload as { failRender?: boolean }).failRender) {
    throw new Error('forced render failure');
  }

  if (envelope.kind === 'graph-plan') {
    return formatLoadContext(envelope.payload as GraphPlanSearchResponse);
  }
  if (envelope.kind === 'retrieval-v1') {
    const view = buildRetrievalV1View(envelope.payload as RetrievalResponse);
    return [
      'TrapMap retrieval-v1',
      view.querySummary,
      ...view.constraints.map(
        (item) => `Constraint: ${String(item.shortcut)} (${Number(item.score).toFixed(2)})`,
      ),
      ...view.projectKnowledge.map(
        (item) => `Project: ${String(item.shortcut)} (${Number(item.score).toFixed(2)})`,
      ),
    ].join('\n');
  }
  if (envelope.kind === 'retrieval-v2') {
    const view = buildRetrievalV2View(envelope.payload as RetrievalV2Response);
    return [
      'TrapMap retrieval-v2',
      view.querySummary,
      ...view.capsules.map((item) => `Capsule: ${String(item.artifactId)} -> ${String(item.goal)}`),
    ].join('\n');
  }
  if (envelope.kind === 'skill-lookup') {
    const view = buildSkillLookupView(envelope.payload as SkillLookupResponse);
    return [
      'TrapMap skill-lookup',
      view.querySummary,
      ...view.matches.map((item) => `Match: ${String(item.artifactId)} -> ${String(item.title)}`),
    ].join('\n');
  }
  if (envelope.kind === 'command-result') {
    const view = buildCommandResultView(envelope.payload as Record<string, unknown>);
    const lines = [`TrapMap ${view.action}`, view.summary];
    for (const step of view.nextSteps) {
      lines.push(`Next: ${step}`);
    }
    return lines.join('\n');
  }

  return `TrapMap ${envelope.kind}\nGeneric TrapMap output`;
}

const registry: RendererRegistry = {
  generic: {
    'retrieval-v1': { id: 'generic:retrieval-v1', render: renderGeneric },
    'retrieval-v2': { id: 'generic:retrieval-v2', render: renderGeneric },
    'graph-plan': { id: 'generic:graph-plan', render: renderGeneric },
    'skill-lookup': { id: 'generic:skill-lookup', render: renderGeneric },
    'artifact-export': { id: 'generic:artifact-export', render: renderGeneric },
    'command-result': { id: 'generic:command-result', render: renderGeneric },
    generic: { id: 'generic:generic', render: renderGeneric },
  },
  'claude-code': {
    'retrieval-v1': { id: 'claude-code:retrieval-v1', render: renderClaude },
    'retrieval-v2': { id: 'claude-code:retrieval-v2', render: renderClaude },
    'graph-plan': { id: 'claude-code:graph-plan', render: renderClaude },
    'skill-lookup': { id: 'claude-code:skill-lookup', render: renderClaude },
    'command-result': { id: 'claude-code:command-result', render: renderClaude },
  },
  codex: {
    'retrieval-v1': { id: 'codex:retrieval-v1', render: renderCodex },
    'retrieval-v2': { id: 'codex:retrieval-v2', render: renderCodex },
    'graph-plan': { id: 'codex:graph-plan', render: renderCodex },
    'skill-lookup': { id: 'codex:skill-lookup', render: renderCodex },
    'command-result': { id: 'codex:command-result', render: renderCodex },
  },
  opencode: {
    'retrieval-v1': { id: 'opencode:retrieval-v1', render: renderOpenCode },
    'retrieval-v2': { id: 'opencode:retrieval-v2', render: renderOpenCode },
    'graph-plan': { id: 'opencode:graph-plan', render: renderOpenCode },
    'skill-lookup': { id: 'opencode:skill-lookup', render: renderOpenCode },
    'command-result': { id: 'opencode:command-result', render: renderOpenCode },
  },
};

export type { OutputProfile } from './config.js';

export function getDefaultOutputProfile(): OutputProfile {
  return getConfigDefaultOutputProfile();
}

export function resolveRenderKind(kind: RenderKind): RenderKind {
  return kind;
}

export function createRenderEnvelope<T>(
  kind: RenderKind,
  payload: T,
  profile: OutputProfile,
  extra: Partial<Pick<RenderEnvelopeContext, 'commandName'>> = {},
): RenderEnvelope<T> {
  const context: RenderEnvelopeContext = {
    tool: profile.tool,
    verbosity: profile.verbosity,
    graphPlanMode: profile.graphPlanMode,
    includeRawHints: profile.includeRawHints,
  };

  if (extra.commandName) {
    context.commandName = extra.commandName;
  }

  if (profile.modelHint) {
    context.modelHint = profile.modelHint;
  }

  return {
    kind,
    payload,
    context,
  };
}

export function resolveRenderer(profile: OutputProfile, kind: RenderKind): Renderer {
  const toolRegistry = registry[profile.tool] ?? registry.generic;
  return (toolRegistry[kind] ??
    registry.generic[kind] ??
    registry.generic.generic) as Renderer;
}
