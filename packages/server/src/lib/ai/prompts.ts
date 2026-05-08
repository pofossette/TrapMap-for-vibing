/**
 * Shared system prompt builders for server and evaluation flows.
 *
 * Prompts are composed from task-specific slot definitions and rendered into
 * markdown, XML, or JSON based on environment configuration.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

export type AiPromptFormat = 'json' | 'markdown' | 'xml';

export type AiPromptTaskType =
  | 'boundary-extraction'
  | 'knowledge-refinement'
  | 'claim-verification';

export interface PromptSlots {
  role?: string;
  task?: string;
  corePrinciples?: string[];
  outputInstructions?: string[];
  constraints?: string[];
  examples?: string[];
  metadata?: {
    taskType: AiPromptTaskType;
    title: string;
    outputFormatHint?: string;
  };
}

interface PromptTemplateOverride {
  role?: string;
  task?: string;
  corePrinciples?: string[];
  outputInstructions?: string[];
  constraints?: string[];
  examples?: string[];
}

type PromptTemplateOverrideFile = Partial<Record<AiPromptTaskType, PromptTemplateOverride>>;

interface PromptSettings {
  formatByTask: Record<AiPromptTaskType, AiPromptFormat>;
  templateFile: string | null;
}

const DEFAULT_PROMPT_SETTINGS: PromptSettings = {
  formatByTask: {
    'boundary-extraction': 'xml',
    'knowledge-refinement': 'markdown',
    'claim-verification': 'json',
  },
  templateFile: null,
};

const DEFAULT_TEMPLATE_FILE = path.resolve(
  process.cwd(),
  'docs/reference/system-prompt-slots.default.json',
);

const TASK_TITLES: Record<AiPromptTaskType, string> = {
  'boundary-extraction': 'Boundary Extraction',
  'knowledge-refinement': 'Knowledge Refinement',
  'claim-verification': 'Claim Verification',
};

function isPromptTaskType(value: string): value is AiPromptTaskType {
  return (
    value === 'boundary-extraction' ||
    value === 'knowledge-refinement' ||
    value === 'claim-verification'
  );
}

function isPromptFormat(value: string): value is AiPromptFormat {
  return value === 'json' || value === 'markdown' || value === 'xml';
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function filterStrings(values: unknown, field: string): string[] | undefined {
  if (values === undefined) {
    return undefined;
  }
  if (!Array.isArray(values) || !values.every((value) => typeof value === 'string')) {
    throw new Error(`Prompt template field "${field}" must be an array of strings`);
  }
  return values.map((value) => value.trim()).filter((value) => value.length > 0);
}

function parseOverrideEntry(
  taskType: AiPromptTaskType,
  value: unknown,
): PromptTemplateOverride | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Prompt template override for "${taskType}" must be an object`);
  }

  const record = value as Record<string, unknown>;

  if (record.role !== undefined && typeof record.role !== 'string') {
    throw new Error(`Prompt template field "${taskType}.role" must be a string`);
  }
  if (record.task !== undefined && typeof record.task !== 'string') {
    throw new Error(`Prompt template field "${taskType}.task" must be a string`);
  }

  return {
    role: typeof record.role === 'string' ? record.role.trim() : undefined,
    task: typeof record.task === 'string' ? record.task.trim() : undefined,
    corePrinciples: filterStrings(record.corePrinciples, `${taskType}.corePrinciples`),
    outputInstructions: filterStrings(record.outputInstructions, `${taskType}.outputInstructions`),
    constraints: filterStrings(record.constraints, `${taskType}.constraints`),
    examples: filterStrings(record.examples, `${taskType}.examples`),
  };
}

function parsePromptTemplateOverrideFile(raw: string, filePath: string): PromptTemplateOverrideFile {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `Failed to parse prompt template file "${filePath}": ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Prompt template file "${filePath}" must contain a JSON object`);
  }

  const record = parsed as Record<string, unknown>;
  const overrides: PromptTemplateOverrideFile = {};

  for (const [key, value] of Object.entries(record)) {
    if (!isPromptTaskType(key)) {
      throw new Error(`Prompt template file "${filePath}" contains unknown task "${key}"`);
    }
    overrides[key] = parseOverrideEntry(key, value);
  }

  return overrides;
}

function loadPromptTemplateOverrides(templateFile: string | null): PromptTemplateOverrideFile {
  const filePath = templateFile ?? DEFAULT_TEMPLATE_FILE;
  const raw = readFileSync(filePath, 'utf8');
  return parsePromptTemplateOverrideFile(raw, filePath);
}

function resolvePromptSettings(): PromptSettings {
  const boundaryFormat = process.env.AI_PROMPT_FORMAT_BOUNDARY_EXTRACTION;
  const refinementFormat = process.env.AI_PROMPT_FORMAT_KNOWLEDGE_REFINEMENT;
  const claimFormat = process.env.AI_PROMPT_FORMAT_CLAIM_VERIFICATION;

  if (boundaryFormat !== undefined && !isPromptFormat(boundaryFormat)) {
    throw new Error(
      'Invalid AI_PROMPT_FORMAT_BOUNDARY_EXTRACTION. Expected one of: json, markdown, xml.',
    );
  }
  if (refinementFormat !== undefined && !isPromptFormat(refinementFormat)) {
    throw new Error(
      'Invalid AI_PROMPT_FORMAT_KNOWLEDGE_REFINEMENT. Expected one of: json, markdown, xml.',
    );
  }
  if (claimFormat !== undefined && !isPromptFormat(claimFormat)) {
    throw new Error(
      'Invalid AI_PROMPT_FORMAT_CLAIM_VERIFICATION. Expected one of: json, markdown, xml.',
    );
  }

  return {
    formatByTask: {
      'boundary-extraction':
        boundaryFormat ?? DEFAULT_PROMPT_SETTINGS.formatByTask['boundary-extraction'],
      'knowledge-refinement':
        refinementFormat ?? DEFAULT_PROMPT_SETTINGS.formatByTask['knowledge-refinement'],
      'claim-verification':
        claimFormat ?? DEFAULT_PROMPT_SETTINGS.formatByTask['claim-verification'],
    },
    templateFile: process.env.AI_PROMPT_TEMPLATE_FILE ?? DEFAULT_PROMPT_SETTINGS.templateFile,
  };
}

function mergeSlots(base: PromptSlots, override?: PromptTemplateOverride): PromptSlots {
  if (!override) {
    return base;
  }

  return {
    ...base,
    role: override.role ?? base.role,
    task: override.task ?? base.task,
    corePrinciples: override.corePrinciples ?? base.corePrinciples,
    outputInstructions: override.outputInstructions ?? base.outputInstructions,
    constraints: override.constraints ?? base.constraints,
    examples: override.examples ?? base.examples,
  };
}

function normalizeSlots(slots: PromptSlots): PromptSlots {
  return {
    ...slots,
    role: slots.role?.trim(),
    task: slots.task?.trim(),
    corePrinciples: slots.corePrinciples?.map((item) => item.trim()).filter(Boolean),
    outputInstructions: slots.outputInstructions?.map((item) => item.trim()).filter(Boolean),
    constraints: slots.constraints?.map((item) => item.trim()).filter(Boolean),
    examples: slots.examples?.map((item) => item.trim()).filter(Boolean),
  };
}

function renderMarkdownPrompt(slots: PromptSlots): string {
  const sections: string[] = [];

  if (slots.role) {
    sections.push(`You are ${slots.role}.`);
  }
  if (slots.task) {
    sections.push(slots.task);
  }
  if (slots.corePrinciples && slots.corePrinciples.length > 0) {
    sections.push(slots.corePrinciples.map((item, index) => `${index + 1}. ${item}`).join('\n'));
  }
  if (slots.outputInstructions && slots.outputInstructions.length > 0) {
    sections.push(slots.outputInstructions.map((item) => `- ${item}`).join('\n'));
  }
  if (slots.constraints && slots.constraints.length > 0) {
    sections.push(slots.constraints.map((item) => `- ${item}`).join('\n'));
  }
  if (slots.examples && slots.examples.length > 0) {
    sections.push(slots.examples.map((item) => `Example:\n${item}`).join('\n\n'));
  }

  return sections.filter((section) => section.trim().length > 0).join('\n\n');
}

function renderXmlList(tagName: string, values?: string[]): string {
  if (!values || values.length === 0) {
    return '';
  }

  const items = values.map((value) => `    <item>${escapeXml(value)}</item>`).join('\n');
  return `  <${tagName}>\n${items}\n  </${tagName}>`;
}

function renderXmlPrompt(slots: PromptSlots): string {
  const lines: string[] = ['<system_instructions>'];

  if (slots.role) {
    lines.push(`  <role>${escapeXml(slots.role)}</role>`);
  }
  if (slots.task) {
    lines.push(`  <task>${escapeXml(slots.task)}</task>`);
  }

  const corePrinciples = renderXmlList('core_principles', slots.corePrinciples);
  if (corePrinciples) {
    lines.push(corePrinciples);
  }

  const outputInstructions = renderXmlList('output_format', slots.outputInstructions);
  if (outputInstructions) {
    lines.push(outputInstructions);
  }

  const constraints = renderXmlList('constraints', slots.constraints);
  if (constraints) {
    lines.push(constraints);
  }

  const examples = renderXmlList('examples', slots.examples);
  if (examples) {
    lines.push(examples);
  }

  lines.push('</system_instructions>');
  return lines.join('\n');
}

function renderJsonPrompt(slots: PromptSlots): string {
  const payload: Record<string, unknown> = {};

  if (slots.role) {
    payload.role = slots.role;
  }
  if (slots.task) {
    payload.task = slots.task;
  }
  if (slots.corePrinciples && slots.corePrinciples.length > 0) {
    payload.corePrinciples = slots.corePrinciples;
  }
  if (slots.outputInstructions && slots.outputInstructions.length > 0) {
    payload.outputInstructions = slots.outputInstructions;
  }
  if (slots.constraints && slots.constraints.length > 0) {
    payload.constraints = slots.constraints;
  }
  if (slots.examples && slots.examples.length > 0) {
    payload.examples = slots.examples;
  }

  return JSON.stringify(payload, null, 2);
}

function renderPrompt(slots: PromptSlots, format: AiPromptFormat): string {
  if (format === 'xml') {
    return renderXmlPrompt(slots);
  }
  if (format === 'json') {
    return renderJsonPrompt(slots);
  }
  return renderMarkdownPrompt(slots);
}

function buildBoundaryExtractionSlots(): PromptSlots {
  return {
    role: 'a boundary extraction assistant',
    task: `Analyze the knowledge entry and extract structured boundary constraints.

A boundary defines when knowledge is applicable. Extract the following layers:

1. context: Situational context labels (for example frontend, production, testing)
2. versions: Version constraints for tools or libraries
3. prerequisites: Conditions that must be true before applying
4. signals: Patterns indicating this knowledge is relevant
5. exclusions: Conditions that make this knowledge not applicable
6. evidence: Supporting references such as issues, incidents, or CVEs`,
    outputInstructions: [
      `Return a JSON object with this structure:
{
  "context": ["label1", "label2"],
  "versions": [{"package": "name", "range": ">=1.0.0"}],
  "prerequisites": [{"description": "condition"}],
  "signals": [{"pattern": "pattern", "kind": "keyword"}],
  "exclusions": [{"description": "exclusion"}],
  "evidence": [{"kind": "issue", "identifier": "123"}]
}`,
    ],
    constraints: [
      'All fields are optional and default to empty arrays.',
      'Only include information that is explicitly stated or clearly implied by the input. When in doubt, omit it.',
    ],
    metadata: {
      taskType: 'boundary-extraction',
      title: TASK_TITLES['boundary-extraction'],
      outputFormatHint: 'json-object',
    },
  };
}

function buildKnowledgeRefinementSlots(config?: { maxSentences?: number }): PromptSlots {
  const maxSentences = config?.maxSentences ?? 3;

  return {
    role: 'a knowledge refinement assistant',
    task: 'Given search results, produce a concise summary that highlights the most relevant information.',
    corePrinciples: [
      'Prioritize the most actionable or constraining facts.',
      'Avoid repeating the search results verbatim unless necessary for clarity.',
    ],
    constraints: [`Keep the response under ${maxSentences} sentences.`],
    metadata: {
      taskType: 'knowledge-refinement',
      title: TASK_TITLES['knowledge-refinement'],
    },
  };
}

function buildClaimVerificationSlots(config?: { strict?: boolean }): PromptSlots {
  const strict = config?.strict ?? true;

  return {
    role: 'a claim verification assistant',
    task: 'Verify whether claims from a summary are supported by the provided context and provide evidence when available.',
    corePrinciples: [
      strict
        ? 'Be strict: only mark a claim as supported if the context directly supports it.'
        : 'Mark a claim as supported only when the context supports it.',
      'Do not rely on outside knowledge.',
    ],
    metadata: {
      taskType: 'claim-verification',
      title: TASK_TITLES['claim-verification'],
    },
  };
}

function buildPrompt(taskType: AiPromptTaskType, slots: PromptSlots): string {
  const settings = resolvePromptSettings();
  const overrides = loadPromptTemplateOverrides(settings.templateFile);
  const mergedSlots = normalizeSlots(mergeSlots(slots, overrides[taskType]));
  return renderPrompt(mergedSlots, settings.formatByTask[taskType]);
}

export function buildBoundaryExtractionSystemPrompt(): string {
  return buildPrompt('boundary-extraction', buildBoundaryExtractionSlots());
}

export function buildKnowledgeRefinementSystemPrompt(config?: {
  maxSentences?: number;
}): string {
  return buildPrompt('knowledge-refinement', buildKnowledgeRefinementSlots(config));
}

export function buildClaimVerificationSystemPrompt(config?: {
  strict?: boolean;
}): string {
  return buildPrompt('claim-verification', buildClaimVerificationSlots(config));
}
