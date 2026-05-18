import type {
  ExtractionMetrics,
  ExtractionPlan,
  LlmGraphEdge,
  LlmGraphExtraction,
  LlmGraphNode,
} from '@trapmap/contracts';
import { extractionPlanSchema, llmGraphExtractionSchema } from '@trapmap/contracts';

import {
  buildGraphExtractionPlannerSlots_default,
  buildGraphExtractionSlots_default,
  buildPrompt,
} from '../../ai/prompts.js';
import type { ChatProvider } from '../../ai/types.js';
import { extractTrapGraphEntities } from '../../retrieval/recall/graph-extract.js';
import type { NormalizedIndexDocument } from '../types.js';
import type {
  GraphEdgeRecord,
  GraphNodeKind,
  GraphNodeRecord,
  GraphRelationStrength,
  GraphRelationType,
} from './documents.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Texts longer than this trigger two-phase extraction (Phase 1 planning). */
export const CHUNK_THRESHOLD = 2000;

/** Maximum concurrent segment extractions in Phase 2. */
const MAX_CONCURRENT = 3;

/** Maximum retry attempts per LLM call. */
const MAX_RETRIES = 2;

/** Base delay for exponential backoff (ms). */
const BACKOFF_BASE_MS = 100;

/** Prompt version — bump to invalidate all caches. */
export const PROMPT_VERSION = 'v1';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result of LLM-powered graph extraction. */
export interface LlmExtractionResult {
  nodes: GraphNodeRecord[];
  edges: GraphEdgeRecord[];
  metrics: ExtractionMetrics;
}

/** Options for the extraction orchestrator. */
export interface ExtractGraphOptions {
  /** Disable LLM and fall back to rule engine directly. */
  llmEnabled?: boolean;
  /** Custom prompt version for cache keying. */
  promptVersion?: string;
}

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

/** Normalize a label into a stable, hyphen-delimited ID fragment. */
export function normalizeValue(value: string): string {
  return value.toLowerCase().trim().replace(/\s+/g, '-');
}

/** Build a deterministic node ID from kind and label. */
export function buildNodeId(kind: string, label: string): string {
  return `${kind}:${normalizeValue(label)}`;
}

/** Build a deterministic edge ID from source, target, and relation. */
export function buildEdgeId(
  sourceNodeId: string,
  targetNodeId: string,
  relationType: string,
): string {
  return `${sourceNodeId}-${relationType}-${targetNodeId}`;
}

// ---------------------------------------------------------------------------
// JSON parsing helpers
// ---------------------------------------------------------------------------

/** Strip markdown code fences from LLM response. */
function stripCodeFences(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json)?\n?/, '')
    .replace(/\n?```$/, '');
}

/** Parse LLM JSON response and validate with Zod. Returns null on failure. */
function parseLlmExtraction(raw: string): LlmGraphExtraction | null {
  try {
    const cleaned = stripCodeFences(raw);
    const parsed: unknown = JSON.parse(cleaned);
    const result = llmGraphExtractionSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/** Parse LLM JSON response as an extraction plan. Returns null on failure. */
function parseExtractionPlan(raw: string): ExtractionPlan | null {
  try {
    const cleaned = stripCodeFences(raw);
    const parsed: unknown = JSON.parse(cleaned);
    const result = extractionPlanSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Phase 1: Extraction planning (text segmentation)
// ---------------------------------------------------------------------------

/**
 * Plan text segmentation for extraction.
 * For short text (<= CHUNK_THRESHOLD), returns a single segment without LLM.
 * For longer text, calls the LLM to create a segment plan.
 */
export async function planExtraction(chat: ChatProvider, text: string): Promise<ExtractionPlan> {
  if (text.length <= CHUNK_THRESHOLD) {
    return { segments: [{ text, priority: 1 }] };
  }

  if (!chat.isConfigured) {
    // Fallback: split into fixed-size chunks
    return createFixedChunkPlan(text);
  }

  try {
    const systemPrompt = buildPrompt(
      'graph-extraction-planner',
      buildGraphExtractionPlannerSlots_default(),
    );
    const response = await chat.invoke(systemPrompt, text);
    const plan = parseExtractionPlan(response);
    if (plan && plan.segments.length > 0) {
      return plan;
    }
  } catch {
    // Fall through to fixed chunking
  }

  return createFixedChunkPlan(text);
}

/** Create a simple fixed-size chunk plan as fallback. */
function createFixedChunkPlan(text: string): ExtractionPlan {
  const segments: ExtractionPlan['segments'] = [];
  const chunkSize = CHUNK_THRESHOLD;
  for (let i = 0; i < text.length; i += chunkSize) {
    segments.push({
      text: text.slice(i, i + chunkSize),
      priority: segments.length + 1,
    });
  }
  return { segments };
}

// ---------------------------------------------------------------------------
// Phase 2: Single-segment entity extraction
// ---------------------------------------------------------------------------

/**
 * Extract graph entities from a single text segment via LLM.
 * Returns null if LLM is unavailable or output is invalid.
 */
export async function extractSegmentEntities(
  chat: ChatProvider,
  segment: string,
  maxRetries = MAX_RETRIES,
): Promise<LlmGraphExtraction | null> {
  if (!chat.isConfigured) return null;

  const systemPrompt = buildPrompt('graph-extraction', buildGraphExtractionSlots_default());

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await chat.invoke(systemPrompt, segment);
      const extraction = parseLlmExtraction(response);
      if (extraction) return extraction;
      // Zod validation failed — retry (might be format issue)
    } catch {
      // LLM call failed — retry with backoff
    }
    if (attempt < maxRetries) {
      await new Promise((r) => setTimeout(r, BACKOFF_BASE_MS * 2 ** (attempt * 2)));
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Result merging
// ---------------------------------------------------------------------------

/**
 * Merge multiple segment extractions into a single result.
 * Deduplicates nodes by label (keeping the longer description).
 * Deduplicates edges by source+target+relationType.
 */
export function mergeExtractions(extractions: LlmGraphExtraction[]): LlmGraphExtraction {
  const nodeMap = new Map<string, LlmGraphNode>();
  const edgeSet = new Map<string, LlmGraphEdge>();

  for (const extraction of extractions) {
    for (const node of extraction.nodes) {
      const key = `${node.kind}:${normalizeValue(node.label)}`;
      const existing = nodeMap.get(key);
      if (
        !existing ||
        (node.description &&
          (!existing.description || node.description.length > existing.description.length))
      ) {
        nodeMap.set(key, node);
      }
    }
    for (const edge of extraction.edges) {
      const key = `${normalizeValue(edge.sourceLabel)}-${edge.relationType}-${normalizeValue(edge.targetLabel)}`;
      if (!edgeSet.has(key)) {
        edgeSet.set(key, edge);
      }
    }
  }

  return {
    nodes: [...nodeMap.values()],
    edges: [...edgeSet.values()],
  };
}

// ---------------------------------------------------------------------------
// Convert LLM output to GraphNodeRecord/GraphEdgeRecord
// ---------------------------------------------------------------------------

const LLM_TO_NODE_KIND: Record<string, GraphNodeKind> = {
  trap: 'trap',
  skill: 'skill',
  cue: 'cue',
  tool: 'tool',
  environment: 'environment',
  prerequisite: 'prerequisite',
  mitigation: 'mitigation',
};

const LLM_TO_RELATION_TYPE: Record<string, GraphRelationType> = {
  mitigates: 'mitigates',
  requires: 'requires',
  order: 'order',
  'risk-blocks': 'risk-blocks',
  'co-occurs-with': 'co-occurs-with',
};

/**
 * Convert LLM extraction output to typed GraphNodeRecord[] and GraphEdgeRecord[].
 * Maps LLM labels to node IDs and validates kind/relationType values.
 */
export function toGraphRecords(extraction: LlmGraphExtraction): {
  nodes: GraphNodeRecord[];
  edges: GraphEdgeRecord[];
} {
  const nodeIdByLabel = new Map<string, string>();

  const nodes: GraphNodeRecord[] = [];
  for (const node of extraction.nodes) {
    const kind = LLM_TO_NODE_KIND[node.kind];
    if (!kind) continue;
    const id = buildNodeId(kind, node.label);
    nodeIdByLabel.set(normalizeValue(node.label), id);
    nodes.push({
      id,
      kind,
      label: node.label,
      evidence: node.description ?? 'llm-extracted',
    });
  }

  const edges: GraphEdgeRecord[] = [];
  for (const edge of extraction.edges) {
    const relationType = LLM_TO_RELATION_TYPE[edge.relationType];
    if (!relationType) continue;
    const sourceId = nodeIdByLabel.get(normalizeValue(edge.sourceLabel));
    const targetId = nodeIdByLabel.get(normalizeValue(edge.targetLabel));
    if (!sourceId || !targetId) continue;
    edges.push({
      id: buildEdgeId(sourceId, targetId, relationType),
      sourceNodeId: sourceId,
      targetNodeId: targetId,
      relationType,
      strength: edge.strength as GraphRelationStrength,
      evidence: edge.description ?? 'llm-extracted',
    });
  }

  return { nodes, edges };
}

// ---------------------------------------------------------------------------
// Gleaning prompt (secondary extraction)
// ---------------------------------------------------------------------------

function buildGleaningPrompt(originalText: string, existingNodes: string[]): string {
  return `The following text was already analyzed. These entities were found:
${existingNodes.map((n) => `- ${n}`).join('\n')}

Review the text again and identify any ADDITIONAL entities or relations that were missed.
Do not repeat existing entities. Focus on:
- Implicit prerequisites not explicitly labeled
- Alternative mitigation approaches
- Co-occurring tools/environments not yet captured
- Symptom/error patterns (cues) that signal the trap

Text:
${originalText}`;
}

/**
 * Perform gleaning (secondary extraction) to catch missed entities.
 * Compares the gleaning result with the original and merges.
 */
export async function gleaningExtraction(
  chat: ChatProvider,
  text: string,
  existing: LlmGraphExtraction,
): Promise<LlmGraphExtraction | null> {
  if (!chat.isConfigured) return null;

  const existingNodeLabels = existing.nodes.map((n) => `${n.kind}: ${n.label}`);

  const gleaningUserMsg = buildGleaningPrompt(text, existingNodeLabels);

  try {
    const systemPrompt = buildPrompt('graph-extraction', buildGraphExtractionSlots_default());
    const response = await chat.invoke(systemPrompt, gleaningUserMsg);
    const gleaningResult = parseLlmExtraction(response);
    if (!gleaningResult) return null;
    return mergeExtractions([existing, gleaningResult]);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Fallback: convert rule engine output to LLM-compatible format
// ---------------------------------------------------------------------------

function ruleEngineFallback(document: NormalizedIndexDocument): {
  nodes: GraphNodeRecord[];
  edges: GraphEdgeRecord[];
} {
  const result = extractTrapGraphEntities(document);
  // GraphRelation from graph-extract lacks `id` — add deterministic IDs
  const edges: GraphEdgeRecord[] = result.edges.map((e) => ({
    ...e,
    id: buildEdgeId(e.sourceNodeId, e.targetNodeId, e.relationType),
  }));
  return { nodes: result.nodes as GraphNodeRecord[], edges };
}

// ---------------------------------------------------------------------------
// Main orchestrator: two-phase LLM extraction with fallback
// ---------------------------------------------------------------------------

/**
 * Extract graph entities using the two-phase LLM pipeline.
 *
 * Pipeline:
 * 1. Phase 1 (planning): segment the text (skip if short)
 * 2. Phase 2 (extraction): extract entities from each segment (concurrent)
 * 3. Merge segment results
 * 4. Optional gleaning
 * 5. Convert to GraphNodeRecord/GraphEdgeRecord
 *
 * Fallback chain: LLM → rule engine (extractTrapGraphEntities)
 *
 * @param chat - LLM chat provider
 * @param text - canonical text to extract from
 * @param options - extraction options
 * @param fallbackDocument - document for rule engine fallback (required for trap side)
 */
export async function extractGraphEntitiesWithLLM(
  chat: ChatProvider,
  text: string,
  options?: ExtractGraphOptions,
  fallbackDocument?: NormalizedIndexDocument,
): Promise<LlmExtractionResult> {
  const metrics: ExtractionMetrics = {
    llmSuccessCount: 0,
    cacheHitCount: 0,
    fallbackCount: 0,
    phase1Ms: 0,
    phase2Ms: 0,
    gleaningCount: 0,
  };

  const llmEnabled = options?.llmEnabled !== false;

  // If LLM disabled, go straight to fallback
  if (!llmEnabled || !chat.isConfigured) {
    if (fallbackDocument) {
      const { nodes, edges } = ruleEngineFallback(fallbackDocument);
      metrics.fallbackCount = 1;
      return { nodes, edges, metrics };
    }
    return { nodes: [], edges: [], metrics };
  }

  try {
    // Phase 1: Planning
    const phase1Start = Date.now();
    const plan = await planExtraction(chat, text);
    metrics.phase1Ms = Date.now() - phase1Start;

    // Phase 2: Parallel segment extraction
    const phase2Start = Date.now();
    let extractions: LlmGraphExtraction[];

    if (plan.segments.length === 1) {
      // Single segment — direct extraction
      const segment = plan.segments[0];
      if (segment) {
        const result = await extractSegmentEntities(chat, segment.text);
        extractions = result ? [result] : [];
      } else {
        extractions = [];
      }
    } else {
      // Multiple segments — batched concurrent extraction
      extractions = await extractBatched(
        chat,
        plan.segments.map((s) => s.text),
      );
    }

    metrics.phase2Ms = Date.now() - phase2Start;
    metrics.llmSuccessCount = extractions.length;

    // If all segments failed, fall back
    if (extractions.length === 0) {
      if (fallbackDocument) {
        const { nodes, edges } = ruleEngineFallback(fallbackDocument);
        metrics.fallbackCount = 1;
        return { nodes, edges, metrics };
      }
      return { nodes: [], edges: [], metrics };
    }

    // Merge all segment results
    let merged = mergeExtractions(extractions);

    // Optional: gleaning (only if we had successful extractions)
    if (merged.nodes.length > 0) {
      const gleaned = await gleaningExtraction(chat, text, merged);
      if (gleaned) {
        merged = gleaned;
        metrics.gleaningCount = 1;
      }
    }

    // Convert to typed records
    const { nodes, edges } = toGraphRecords(merged);

    // If LLM produced no usable nodes, fall back to rule engine
    if (nodes.length === 0 && fallbackDocument) {
      const fallback = ruleEngineFallback(fallbackDocument);
      metrics.fallbackCount = 1;
      return { nodes: fallback.nodes, edges: fallback.edges, metrics };
    }

    return { nodes, edges, metrics };
  } catch {
    // Total failure — fall back to rule engine
    if (fallbackDocument) {
      const { nodes, edges } = ruleEngineFallback(fallbackDocument);
      metrics.fallbackCount = 1;
      return { nodes, edges, metrics };
    }
    return { nodes: [], edges: [], metrics };
  }
}

// ---------------------------------------------------------------------------
// Batched concurrent extraction
// ---------------------------------------------------------------------------

/** Process segments in batches with max concurrency. */
async function extractBatched(
  chat: ChatProvider,
  segments: string[],
): Promise<LlmGraphExtraction[]> {
  const results: LlmGraphExtraction[] = [];

  for (let i = 0; i < segments.length; i += MAX_CONCURRENT) {
    const batch = segments.slice(i, i + MAX_CONCURRENT);
    const batchResults = await Promise.all(
      batch.map((segment) => extractSegmentEntities(chat, segment)),
    );
    for (const result of batchResults) {
      if (result) results.push(result);
    }
  }

  return results;
}
