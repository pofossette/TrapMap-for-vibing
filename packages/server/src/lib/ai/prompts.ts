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
  'graph-extraction': 'Graph Entity Extraction',
  'graph-extraction-planner': 'Graph Extraction Planning',
};

function isPromptTaskType(value: string): value is AiPromptTaskType {
  return (
    value === 'boundary-extraction' ||
    value === 'knowledge-refinement' ||
    value === 'claim-verification' ||
    value === 'graph-extraction' ||
    value === 'graph-extraction-planner'
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

/**
 * Phase 1 planner: divides input text into segments for parallel extraction.
 * Used only when text exceeds CHUNK_THRESHOLD (2000 chars).
 */
function buildGraphExtractionPlannerSlots(): PromptSlots {
  return {
    role: 'a text segmentation assistant for knowledge graph extraction',
    task: `Divide the input text into segments that are optimal for entity extraction.

Each segment should be a coherent unit — a paragraph, section, or logical group of related statements.
Avoid splitting in the middle of a sentence or breaking apart related concepts.`,
    outputInstructions: [
      `Return a JSON object with this structure:
{
  "segments": [
    { "text": "segment text", "contextHint": "brief context", "priority": 1 }
  ]
}`,
      'Priority 1 = extract first, higher numbers = lower priority.',
      'Maximum 10 segments.',
    ],
    constraints: [
      'Preserve the original text exactly — do not paraphrase or summarize.',
      'Each segment must contain at least one extractable entity or relation.',
      'Prefer fewer, larger segments over many small ones.',
    ],
    metadata: {
      taskType: 'graph-extraction-planner',
      title: TASK_TITLES['graph-extraction-planner'],
      outputFormatHint: 'json-object',
    },
  };
}

/**
 * Phase 2: extracts graph entities (nodes + edges) from a text segment.
 */
function buildGraphExtractionSlots(): PromptSlots {
  return {
    role: 'a knowledge graph entity extraction assistant',
    task: `Extract structured graph entities from the input text about software development traps, skills, and technical knowledge.

Identify:
- TRAP nodes: problems, anti-patterns, failure modes, pitfalls
- SKILL nodes: solutions, techniques, best practices, mitigations
- CUE nodes: error patterns, symptoms, signals that indicate a trap
- TOOL nodes: technologies, libraries, frameworks, CLI tools mentioned
- ENVIRONMENT nodes: deployment contexts (CI/CD, production, staging, local)
- PREREQUISITE nodes: conditions that must be true before applying knowledge
- MITIGATION NODES: specific fix steps or workarounds

Identify relations between nodes with a strength classification:
- HARD = mandatory, blocking (e.g., "requires X", "must do Y", "will fail without Z")
- SOFT = optional, co-occurrence (e.g., "often used with X", "may need Y", "consider Z")`,
    outputInstructions: [
      `Return a JSON object with this structure:
{
  "nodes": [
    { "kind": "trap|skill|cue|tool|environment|prerequisite|mitigation", "label": "short label", "description": "optional detail" }
  ],
  "edges": [
    { "sourceLabel": "node label", "targetLabel": "node label", "relationType": "mitigates|requires|order|risk-blocks|co-occurs-with", "strength": "hard|soft", "description": "optional" }
  ]
}`,
    ],
    constraints: [
      'Maximum 15 nodes and 20 edges per extraction.',
      'Node labels must be concise (1-128 chars), lowercase preferred, no duplicates.',
      'Only extract entities explicitly stated or clearly implied by the text.',
      'Handle negation correctly: "does NOT require X" means no requires edge.',
      'Edge source/target must reference a label that exists in the nodes array.',
      'Do not extract trap/skill nodes themselves — they are injected separately.',
    ],
    examples: [
      `Input: "When deploying to Docker, the container may timeout if the health check is too aggressive. Set HEALTHCHECK --interval=30s to fix."
Output: {
  "nodes": [
    { "kind": "tool", "label": "docker" },
    { "kind": "cue", "label": "container-timeout", "description": "Container fails to start within health check window" },
    { "kind": "mitigation", "label": "set-healthcheck-interval", "description": "Set HEALTHCHECK --interval=30s" }
  ],
  "edges": [
    { "sourceLabel": "docker", "targetLabel": "container-timeout", "relationType": "co-occurs-with", "strength": "soft" },
    { "sourceLabel": "set-healthcheck-interval", "targetLabel": "container-timeout", "relationType": "mitigates", "strength": "hard" },
    { "sourceLabel": "set-healthcheck-interval", "targetLabel": "docker", "relationType": "requires", "strength": "hard" }
  ]
}`,
      `Input: "This does NOT require TypeScript. However, you must have Node.js >= 18 installed first. npm install && npm run build will produce the artifact."
Output: {
  "nodes": [
    { "kind": "prerequisite", "label": "nodejs-18-plus", "description": "Node.js version 18 or higher" },
    { "kind": "tool", "label": "npm" }
  ],
  "edges": [
    { "sourceLabel": "npm", "targetLabel": "nodejs-18-plus", "relationType": "requires", "strength": "hard" }
  ]
}`,
    ],
    metadata: {
      taskType: 'graph-extraction',
      title: TASK_TITLES['graph-extraction'],
      outputFormatHint: 'json-object',
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

/**
 * Cache-aware variants that return PromptBlock[] with cache_control headers.
 * The static prefix of the system prompt is marked with
 * { type: 'ephemeral', scope: 'global' } for provider-level prompt caching.
 */

export function buildBoundaryExtractionSystemPromptBlocks(): PromptBlock[] {
  const sections = buildPromptWithCacheControl(
    'boundary-extraction',
    buildBoundaryExtractionSlots(),
  );
  return buildSystemPromptBlocks(sections);
}

export function buildKnowledgeRefinementSystemPromptBlocks(config?: {
  maxSentences?: number;
}): PromptBlock[] {
  const sections = buildPromptWithCacheControl(
    'knowledge-refinement',
    buildKnowledgeRefinementSlots(config),
  );
  return buildSystemPromptBlocks(sections);
}

// ---------------------------------------------------------------------------
// Graph extraction prompt builders
// ---------------------------------------------------------------------------

/**
 * Build system prompt for Phase 1 graph extraction planning (text segmentation).
 * Returns CacheSection[] for cache control integration.
 */
export function buildGraphExtractionPlannerSlots_default(): PromptSlots {
  return buildGraphExtractionPlannerSlots();
}

/**
 * Build system prompt for Phase 2 graph entity extraction.
 * Returns CacheSection[] for cache control integration.
 */
export function buildGraphExtractionSlots_default(): PromptSlots {
  return buildGraphExtractionSlots();
}

/**
 * Cache-aware system prompt blocks for graph extraction planning.
 */
export function buildGraphExtractionPlannerSystemPromptBlocks(): PromptBlock[] {
  const sections = buildPromptWithCacheControl(
    'graph-extraction-planner',
    buildGraphExtractionPlannerSlots(),
  );
  return buildSystemPromptBlocks(sections);
}

/**
 * Cache-aware system prompt blocks for graph entity extraction.
 */
export function buildGraphExtractionSystemPromptBlocks(): PromptBlock[] {
  const sections = buildPromptWithCacheControl('graph-extraction', buildGraphExtractionSlots());
  return buildSystemPromptBlocks(sections);
}
