import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const defaultTemplates: Record<string, string> = {
  'default-agent-planning': [
    'Task:',
    '{{taskPrompt}}',
    '',
    'Context:',
    '{{context}}',
    '',
    'Respond with an ordered plan and a final answer line.',
  ].join('\n'),
};

// File-based template IDs that map to evals/agent-planning/templates/<id>.txt
const fileTemplateIds = [
  'graph-plan-planner',
  'capsule-retrieval-planner',
  'skill-summary-planner',
  'skill-identification',
  'mixed-context-planner',
  'baseline-planner',
  'opencode-style-agent',
] as const;

export type PromptTemplateId = keyof typeof defaultTemplates | (typeof fileTemplateIds)[number];

export interface PromptLoadOptions {
  promptTemplateId: string;
  promptTemplatePath?: string;
}

export interface PromptRenderInput {
  taskPrompt: string;
  context: string;
}

function loadFileTemplate(templateId: string): string {
  const filePath = resolve('evals', 'agent-planning', 'templates', `${templateId}.txt`);
  return readFileSync(filePath, 'utf8');
}

export function loadPromptTemplate(options: PromptLoadOptions): string {
  if (options.promptTemplatePath) {
    return readFileSync(resolve(options.promptTemplatePath), 'utf8');
  }

  // Check built-in templates first
  const template = defaultTemplates[options.promptTemplateId];
  if (template) {
    return template;
  }

  // Check file-based templates
  if ((fileTemplateIds as readonly string[]).includes(options.promptTemplateId)) {
    return loadFileTemplate(options.promptTemplateId);
  }

  throw new Error(`Unknown prompt template: ${options.promptTemplateId}`);
}

export function renderPromptTemplate(template: string, input: PromptRenderInput): string {
  return template.replace('{{taskPrompt}}', input.taskPrompt).replace('{{context}}', input.context);
}
