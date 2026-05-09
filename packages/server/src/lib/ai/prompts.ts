/**
 * Shared system prompt builders for server and evaluation flows.
 *
 * Provider-based template system: loads format-specific templates (XML/JSON),
 * applies slot-level overrides, and renders via format-specific renderers.
 *
 * Template files live in providers/templates/ (anthropic.xml, openai.json, etc.).
 * Slot overrides are loaded from AI_PROMPT_TEMPLATE_FILE env var (JSON).
 *
 * 四层架构中的内容标记层（XML 语义标记）：
 * - JSON  = 传输协议（API 层）：消息结构、tool_use/tool_result
 * - XML   = 语义标记（内容层）：系统指令、环境信息、技能列表
 * - YAML  = 配置文件（Skill 文件头）：Frontmatter 元数据
 * - MD    = 内容载体（Skill 正文）
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { CACHE_BOUNDARY_MARKER } from './cache/boundary-marker.js';
import { loadProviderTemplate, resolveProvider, selectProvider } from './providers/index.js';
import { renderJsonTemplate } from './providers/json-renderer.js';
import type {
  AiPromptProvider,
  AiPromptTaskType,
  CacheSection,
  PromptSlots,
} from './providers/types.js';
import { renderXmlTemplate } from './providers/xml-renderer.js';

// Re-export types for consumers importing from './prompts.js'
export type { AiPromptTaskType, PromptSlots, CacheSection } from './providers/types.js';

// ---------------------------------------------------------------------------
// Template override system (backward-compatible with AI_PROMPT_TEMPLATE_FILE)
// ---------------------------------------------------------------------------

interface PromptTemplateOverride {
  role?: string;
  task?: string;
  corePrinciples?: string[];
  outputInstructions?: string[];
  constraints?: string[];
  examples?: string[];
}

type PromptTemplateOverrideFile = Partial<Record<AiPromptTaskType, PromptTemplateOverride>>;

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

function filterStrings(values: unknown, field: string): string[] | undefined {
  if (values === undefined) return undefined;
  if (!Array.isArray(values) || !values.every((v) => typeof v === 'string')) {
    throw new Error(`Prompt template field "${field}" must be an array of strings`);
  }
  return values.map((v) => v.trim()).filter((v) => v.length > 0);
}

function parseOverrideEntry(
  taskType: AiPromptTaskType,
  value: unknown,
): PromptTemplateOverride | undefined {
  if (value === undefined) return undefined;
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

  const result: PromptTemplateOverride = {};
  const role = typeof record.role === 'string' ? record.role.trim() : undefined;
  if (role !== undefined) result.role = role;
  const task = typeof record.task === 'string' ? record.task.trim() : undefined;
  if (task !== undefined) result.task = task;
  const cp = filterStrings(record.corePrinciples, `${taskType}.corePrinciples`);
  if (cp !== undefined) result.corePrinciples = cp;
  const oi = filterStrings(record.outputInstructions, `${taskType}.outputInstructions`);
  if (oi !== undefined) result.outputInstructions = oi;
  const c = filterStrings(record.constraints, `${taskType}.constraints`);
  if (c !== undefined) result.constraints = c;
  const e = filterStrings(record.examples, `${taskType}.examples`);
  if (e !== undefined) result.examples = e;
  return result;
}

function parsePromptTemplateOverrideFile(
  raw: string,
  filePath: string,
): PromptTemplateOverrideFile {
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
    const entry = parseOverrideEntry(key, value);
    if (entry !== undefined) overrides[key] = entry;
  }

  return overrides;
}

function loadPromptTemplateOverrides(templateFile: string | null): PromptTemplateOverrideFile {
  const filePath = templateFile ?? DEFAULT_TEMPLATE_FILE;
  const raw = readFileSync(filePath, 'utf8');
  return parsePromptTemplateOverrideFile(raw, filePath);
}

// ---------------------------------------------------------------------------
// Slot merging and normalization
// ---------------------------------------------------------------------------

function mergeSlots(base: PromptSlots, override?: PromptTemplateOverride): PromptSlots {
  if (!override) return base;
  const result: PromptSlots = { ...base };
  const r = override.role ?? base.role;
  if (r !== undefined) result.role = r;
  const t = override.task ?? base.task;
  if (t !== undefined) result.task = t;
  const cp = override.corePrinciples ?? base.corePrinciples;
  if (cp !== undefined) result.corePrinciples = cp;
  const oi = override.outputInstructions ?? base.outputInstructions;
  if (oi !== undefined) result.outputInstructions = oi;
  const c = override.constraints ?? base.constraints;
  if (c !== undefined) result.constraints = c;
  const e = override.examples ?? base.examples;
  if (e !== undefined) result.examples = e;
  return result;
}

function normalizeSlots(slots: PromptSlots): PromptSlots {
  const result: PromptSlots = {};
  if (slots.metadata !== undefined) result.metadata = slots.metadata;
  const role = slots.role?.trim();
  if (role !== undefined) result.role = role;
  const task = slots.task?.trim();
  if (task !== undefined) result.task = task;
  const cp = slots.corePrinciples?.map((item) => item.trim()).filter(Boolean);
  if (cp !== undefined) result.corePrinciples = cp;
  const oi = slots.outputInstructions?.map((item) => item.trim()).filter(Boolean);
  if (oi !== undefined) result.outputInstructions = oi;
  const c = slots.constraints?.map((item) => item.trim()).filter(Boolean);
  if (c !== undefined) result.constraints = c;
  const e = slots.examples?.map((item) => item.trim()).filter(Boolean);
  if (e !== undefined) result.examples = e;
  return result;
}

// ---------------------------------------------------------------------------
// Template rendering dispatch
// ---------------------------------------------------------------------------

function renderWithTemplate(template: string, format: string, slots: PromptSlots): string {
  if (format === 'json') {
    return JSON.stringify(renderJsonTemplate(template, slots), null, 2);
  }
  // Default to XML rendering
  return renderXmlTemplate(template, slots);
}

// ---------------------------------------------------------------------------
// Section classification helpers
// ---------------------------------------------------------------------------

/** Map slot names to template section identifiers for cache strategy matching. */
const SLOT_SECTION_MAP: Record<string, string> = {
  role: 'role',
  task: 'task',
  corePrinciples: 'core_principles',
  outputInstructions: 'output_instructions',
  constraints: 'constraints',
  examples: 'examples',
};

/**
 * Decompose a rendered prompt into CacheSection[] based on provider
 * cache strategy. Each slot is classified as static (cacheable) or
 * dynamic (per-request) based on the provider's cacheStrategy config.
 */
function classifySlotsIntoSections(
  slots: PromptSlots,
  staticSections: string[],
  _dynamicSections: string[],
): CacheSection[] {
  const sections: CacheSection[] = [];

  for (const [slotKey, sectionName] of Object.entries(SLOT_SECTION_MAP)) {
    const value = slots[slotKey as keyof PromptSlots];
    if (value === undefined) continue;

    const content = Array.isArray(value) ? value.join('\n') : String(value);
    if (!content.trim()) continue;

    const isStatic = staticSections.includes(sectionName);

    let cacheScope: 'global' | 'org' | null = null;
    if (isStatic) cacheScope = 'global';
    // Dynamic sections have null cacheScope (not cached)

    sections.push({ name: sectionName, content, cacheScope });
  }

  // Append metadata as a dynamic section if present
  if (slots.metadata) {
    sections.push({
      name: 'metadata',
      content: JSON.stringify(slots.metadata),
      cacheScope: null,
    });
  }

  return sections;
}

// ---------------------------------------------------------------------------
// Core prompt builder
// ---------------------------------------------------------------------------

/**
 * Build a system prompt using the provider template system.
 *
 * @param taskType - The prompt task type
 * @param slots - Slot values to populate the template
 * @param modelId - Optional model ID for automatic provider selection
 */
export function buildPrompt(
  taskType: AiPromptTaskType,
  slots: PromptSlots,
  modelId?: string,
): string {
  const provider = modelId
    ? selectProvider(modelId)
    : resolveProvider(process.env.AI_PROMPT_PROVIDER as AiPromptProvider | undefined);

  const template = loadProviderTemplate(provider.name);
  const templateFile = process.env.AI_PROMPT_TEMPLATE_FILE ?? null;
  const overrides = loadPromptTemplateOverrides(templateFile);
  const mergedSlots = normalizeSlots(mergeSlots(slots, overrides[taskType]));

  return renderWithTemplate(template, provider.format, mergedSlots);
}

/**
 * Build a system prompt decomposed into CacheSection[] for cache control.
 *
 * Unlike `buildPrompt` which returns a single string, this function
 * returns an array of sections classified as static (cacheable) or
 * dynamic (per-request) based on the provider's cache strategy.
 *
 * A `__CACHE_BOUNDARY__` marker is inserted between the last static
 * section and the first dynamic section.
 *
 * @param taskType - The prompt task type
 * @param slots - Slot values to populate the template
 * @param modelId - Optional model ID for automatic provider selection
 */
export function buildPromptWithCacheControl(
  taskType: AiPromptTaskType,
  slots: PromptSlots,
  modelId?: string,
): CacheSection[] {
  const provider = modelId
    ? selectProvider(modelId)
    : resolveProvider(process.env.AI_PROMPT_PROVIDER as AiPromptProvider | undefined);

  const templateFile = process.env.AI_PROMPT_TEMPLATE_FILE ?? null;
  const overrides = loadPromptTemplateOverrides(templateFile);
  const mergedSlots = normalizeSlots(mergeSlots(slots, overrides[taskType]));

  const { staticSections, dynamicSections } = provider.cacheStrategy;
  const sections = classifySlotsIntoSections(mergedSlots, staticSections, dynamicSections);

  // Insert boundary marker: append a marker section between static and dynamic
  const result: CacheSection[] = [];
  let boundaryInserted = false;

  for (const section of sections) {
    if (!boundaryInserted && section.cacheScope === null) {
      // First dynamic section — insert boundary marker before it
      result.push({
        name: '__boundary__',
        content: CACHE_BOUNDARY_MARKER,
        cacheScope: null,
      });
      boundaryInserted = true;
    }
    result.push(section);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Slot definitions (task-specific defaults)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Exported prompt builders (backward-compatible API)
// ---------------------------------------------------------------------------

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
