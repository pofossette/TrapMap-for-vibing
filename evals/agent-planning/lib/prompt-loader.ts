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

export interface PromptLoadOptions {
  promptTemplateId: string;
  promptTemplatePath?: string;
}

export interface PromptRenderInput {
  taskPrompt: string;
  context: string;
}

export function loadPromptTemplate(options: PromptLoadOptions): string {
  if (options.promptTemplatePath) {
    return readFileSync(resolve(options.promptTemplatePath), 'utf8');
  }

  const template = defaultTemplates[options.promptTemplateId];
  if (!template) {
    throw new Error(`Unknown prompt template: ${options.promptTemplateId}`);
  }

  return template;
}

export function renderPromptTemplate(template: string, input: PromptRenderInput): string {
  return template.replace('{{taskPrompt}}', input.taskPrompt).replace('{{context}}', input.context);
}
