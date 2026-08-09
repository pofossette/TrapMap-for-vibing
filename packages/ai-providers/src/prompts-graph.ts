/**
 * Graph extraction prompt slots and exported prompt builders.
 */

import { type PromptBlock, buildSystemPromptBlocks } from './ai-cache/api-integration.js';
import type { PromptSlots } from './ai-providers/types.js';
import { buildPromptWithCacheControl } from './prompt-builder.js';

// ---------------------------------------------------------------------------
// Slot definitions
// ---------------------------------------------------------------------------

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
      title: 'Graph Extraction Planning',
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
      title: 'Graph Entity Extraction',
      outputFormatHint: 'json-object',
    },
  };
}

// ---------------------------------------------------------------------------
// Exported prompt builders
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
