import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type {
  AgentPlanningContextEntry,
  AgentPlanningEvalCase,
  AgentPlanningEvalScenario,
} from '@trapmap/contracts/evals';

function loadEntryBody(entry: AgentPlanningContextEntry): string {
  if (entry.body) {
    return entry.body;
  }

  if (!entry.sourcePath) {
    throw new Error(`Context entry ${entry.id} is missing body and sourcePath`);
  }

  return readFileSync(resolve(entry.sourcePath), 'utf8').trim();
}

function renderEntry(entry: AgentPlanningContextEntry): string {
  const body = loadEntryBody(entry);
  const summary = entry.summary ? ` (${entry.summary})` : '';

  return `- [${entry.kind}] ${entry.title}${summary}\n${body}`;
}

export function renderScenarioContext(
  caseDefinition: AgentPlanningEvalCase,
  scenario: AgentPlanningEvalScenario,
): string {
  let required: AgentPlanningContextEntry[];

  if (caseDefinition.contextSetKind === 'plan-graph-set') {
    required = scenario.context.required.filter(
      (entry) => entry.kind === 'plan-node' || entry.kind === 'note',
    );
  } else if (caseDefinition.contextSetKind === 'capsule-match-set') {
    required = scenario.context.required.filter(
      (entry) => entry.kind === 'capsule-card' || entry.kind === 'note',
    );
  } else if (caseDefinition.contextSetKind === 'skill-summary-set') {
    required = scenario.context.required.filter(
      (entry) => entry.kind === 'skill-profile' || entry.kind === 'note',
    );
  } else {
    // skill-set (backward compatible)
    required = scenario.context.required.filter(
      (entry) => entry.kind === 'skill' || entry.kind === 'note',
    );
  }

  const optional = scenario.context.optional;
  let interferenceSource: AgentPlanningContextEntry[];

  if (caseDefinition.contextSetKind === 'capsule-match-set') {
    interferenceSource = scenario.context.interference.filter(
      (entry) => entry.kind === 'capsule-card' || entry.kind === 'note',
    );
  } else if (caseDefinition.contextSetKind === 'skill-summary-set') {
    interferenceSource = scenario.context.interference.filter(
      (entry) => entry.kind === 'skill-profile' || entry.kind === 'note',
    );
  } else {
    interferenceSource = scenario.context.interference;
  }

  const interference =
    caseDefinition.interferenceLevel === 'none'
      ? []
      : interferenceSource.slice(
          0,
          caseDefinition.interferenceLevel === 'low'
            ? 7
            : caseDefinition.interferenceLevel === 'medium'
              ? 14
              : 21,
        );

  return [
    'Required:',
    ...required.map(renderEntry),
    optional.length > 0 ? '\nOptional:' : '',
    ...optional.map(renderEntry),
    interference.length > 0 ? '\nInterference:' : '',
    ...interference.map(renderEntry),
  ]
    .filter(Boolean)
    .join('\n');
}
