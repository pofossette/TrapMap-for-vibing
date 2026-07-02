/**
 * Core prompt builder primitives: template override system, slot merging,
 * normalization, rendering dispatch, and the two main build functions.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { type PromptBlock, buildSystemPromptBlocks } from './cache/api-integration.js';
import { CACHE_BOUNDARY_MARKER } from './cache/boundary-marker.js';
import { getCachedSection } from './cache/section-cache.js';
import { getDynamicInjections, injectDynamicContent } from './dynamic/index.js';
import { loadProviderTemplate, resolveProvider, selectProvider } from './providers/index.js';
import { renderJsonTemplate } from './providers/json-renderer.js';
import type {
  AiPromptProvider,
  AiPromptTaskType,
  CacheSection,
  PromptSlots,
} from './providers/types.js';
import { renderXmlTemplate } from './providers/xml-renderer.js';

// Re-export types for consumers importing from './prompt-builder.js'
export type { PromptSlots, CacheSection, AiPromptTaskType } from './providers/types.js';

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

const _TASK_TITLES: Record<AiPromptTaskType, string> = {
  'boundary-extraction': 'Boundary Extraction',
  'knowledge-refinement': 'Knowledge Refinement',
  'claim-verification': 'Claim Verification',
  'graph-extraction': 'Graph Entity Extraction',
  'graph-extraction-planner': 'Graph Extraction Planning',
  'label-alignment': 'Label Alignment',
};

function isPromptTaskType(value: string): value is AiPromptTaskType {
  return (
    value === 'boundary-extraction' ||
    value === 'knowledge-refinement' ||
    value === 'claim-verification' ||
    value === 'graph-extraction' ||
    value === 'graph-extraction-planner' ||
    value === 'label-alignment'
  );
}

function filterStrings(values: unknown, field: string): string[] | undefined {
  if (values === undefined) return undefined;
  if (!Array.isArray(values) || !values.every((v) => typeof v === 'string')) {
    throw new Error(`Prompt template field "${field}" must be an array of strings`);
  }
  return values.map((v) => v.trim()).filter((v) => v.length > 0);
}

export function parseOverrideEntry(
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

export function mergeSlots(base: PromptSlots, override?: PromptTemplateOverride): PromptSlots {
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

  const rendered = renderWithTemplate(template, provider.format, mergedSlots);
  const injections = getDynamicInjections(taskType);
  const { injected } = injectDynamicContent(rendered, injections);
  return injected;
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
  // Only insert when there are both static and dynamic sections present
  const injections = getDynamicInjections(taskType);
  const result: CacheSection[] = [];
  let hasSeenStatic = false;
  let boundaryInserted = false;

  for (const section of sections) {
    if (section.cacheScope === 'global') {
      hasSeenStatic = true;
    }

    if (!boundaryInserted && section.cacheScope === null && hasSeenStatic) {
      // First dynamic section after at least one static section — insert boundary marker
      result.push({
        name: '__boundary__',
        content: CACHE_BOUNDARY_MARKER,
        cacheScope: null,
      });
      boundaryInserted = true;
    }

    if (section.cacheScope === 'global') {
      // Static sections: wrap with LRU section cache for global reuse
      result.push({
        ...section,
        content: getCachedSection(`${taskType}:${section.name}`, () => section.content),
      });
    } else {
      // Dynamic sections: resolve runtime placeholders
      const { injected } = injectDynamicContent(section.content, injections);
      result.push({ ...section, content: injected });
    }
  }

  return result;
}

// Re-export PromptBlock from cache/api-integration for sub-module convenience
export type { PromptBlock } from './cache/api-integration.js';
