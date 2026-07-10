import type {
  RetrievalResponse,
  RetrievalV2Response,
  SkillLookupResponse,
} from '@trapmap/contracts';

import { formatLoadContext } from '@trapmap/cli/lib/markdown-formatter.js';
import type { GraphPlanSearchResponse } from '@trapmap/contracts';
import { buildCodexObject } from './codex-object-builder.js';
import { xmlEscape } from './summarizers.js';
import type { RenderEnvelope, RenderPayload } from './types.js';
import {
  buildCommandResultView,
  buildRetrievalV1View,
  buildRetrievalV2View,
  buildSkillLookupView,
} from './view-builders.js';

function buildClaudeJsonSection(sectionName: string, itemName: string, items: unknown[]): string[] {
  if (items.length === 0) return [];
  return [
    `  <${sectionName}>`,
    ...items.map((item) => `    <${itemName}>${xmlEscape(JSON.stringify(item))}</${itemName}>`),
    `  </${sectionName}>`,
  ];
}

function buildClaudeTextSection(sectionName: string, itemName: string, items: string[]): string[] {
  if (items.length === 0) return [];
  return [
    `  <${sectionName}>`,
    ...items.map((item) => `    <${itemName}>${xmlEscape(item)}</${itemName}>`),
    `  </${sectionName}>`,
  ];
}

function buildClaudeNextStepsSection(nextSteps: unknown[]): string[] {
  return [
    '  <next_steps>',
    ...nextSteps.map(
      (step, index) => `    <step>${xmlEscape(`${index + 1}. ${String(step)}`)}</step>`,
    ),
    '  </next_steps>',
  ];
}

function buildMarkdownListSection(title: string, values: unknown[], emptyValue: string): string[] {
  return [
    title,
    ...(values.length > 0 ? values.map((value) => `- ${JSON.stringify(value)}`) : [emptyValue]),
    '',
  ];
}

export function renderClaude(envelope: RenderEnvelope<RenderPayload>): string {
  if (envelope.kind === 'command-result') {
    const view = buildCommandResultView(envelope.payload as Record<string, unknown>);
    const lines = [
      '<trapmap_command_result>',
      `  <action>${xmlEscape(view.action)}</action>`,
      `  <success>${String(view.success)}</success>`,
      `  <summary>${xmlEscape(view.summary)}</summary>`,
    ];
    lines.push(...buildClaudeJsonSection('artifacts', 'artifact', view.artifacts));
    if (view.transition) {
      lines.push(`  <transition>${xmlEscape(JSON.stringify(view.transition))}</transition>`);
    }
    lines.push(...buildClaudeTextSection('next_steps', 'step', view.nextSteps));
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

  lines.push(...buildClaudeJsonSection('capsule_matches', 'capsule', capsules));

  lines.push(...buildClaudeJsonSection('profile_hints', 'hint', profileHints));

  if (constraints.length > 0 || projectKnowledge.length > 0) {
    lines.push(
      '  <retrieval_matches>',
      ...constraints.map(
        (item) => `    <constraint>${xmlEscape(JSON.stringify(item))}</constraint>`,
      ),
      ...projectKnowledge.map(
        (item) => `    <project_item>${xmlEscape(JSON.stringify(item))}</project_item>`,
      ),
      '  </retrieval_matches>',
    );
  }

  lines.push(...buildClaudeJsonSection('skill_matches', 'match', skillMatches));

  lines.push(...buildClaudeJsonSection('recommended_skills', 'skill', skills));

  lines.push(...buildClaudeJsonSection('blocking_traps', 'trap', traps));

  lines.push(...buildClaudeJsonSection('activation_hints', 'hint', activationHints));

  lines.push(...buildClaudeNextStepsSection(nextSteps));

  if (codexObject.fallback_notice) {
    lines.push(
      `  <fallback_notice>${xmlEscape(String(codexObject.fallback_notice))}</fallback_notice>`,
    );
  }

  lines.push(...buildClaudeJsonSection('plan_edges', 'edge', planEdges));

  if (envelope.context.includeRawHints) {
    lines.push(...buildClaudeJsonSection('raw_hints', 'hint', activationHints));
  }

  lines.push('</trapmap_skill_pack>');

  return lines.join('\n');
}

export function renderCodex(envelope: RenderEnvelope<RenderPayload>): string {
  return JSON.stringify(buildCodexObject(envelope));
}

export function renderOpenCode(envelope: RenderEnvelope<RenderPayload>): string {
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
      ...buildMarkdownListSection('## Recommended Skills', skills, '- None'),
      ...buildMarkdownListSection('## Blocking Traps', traps, '- None'),
      ...buildMarkdownListSection('## Activation Hints', activationHints, '- None'),
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

export function renderGeneric(envelope: RenderEnvelope<RenderPayload>): string {
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
