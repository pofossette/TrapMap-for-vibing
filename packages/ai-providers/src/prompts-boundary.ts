/**
 * Boundary extraction prompt slots and exported prompt builders.
 */

import { type PromptBlock, buildSystemPromptBlocks } from './ai-cache/api-integration.js';
import { buildPrompt, buildPromptWithCacheControl } from './prompt-builder.js';
import type { PromptSlots } from './ai-providers/types.js';

// ---------------------------------------------------------------------------
// Slot definition
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
      title: 'Boundary Extraction',
      outputFormatHint: 'json-object',
    },
  };
}

// ---------------------------------------------------------------------------
// Exported prompt builders
// ---------------------------------------------------------------------------

export function buildBoundaryExtractionSystemPrompt(): string {
  return buildPrompt('boundary-extraction', buildBoundaryExtractionSlots());
}

export function buildBoundaryExtractionSystemPromptBlocks(): PromptBlock[] {
  const sections = buildPromptWithCacheControl(
    'boundary-extraction',
    buildBoundaryExtractionSlots(),
  );
  return buildSystemPromptBlocks(sections);
}
