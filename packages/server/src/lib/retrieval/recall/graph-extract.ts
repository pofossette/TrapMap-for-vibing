/**
 * TrapMap-specific graph entity extraction module.
 *
 * This module provides:
 * - Deterministic extraction of trap-specific entities from knowledge entries
 * - Classification into locked node kinds: trap, cue, tool, environment, prerequisite, mitigation
 * - Extraction of typed relations from locked vocabulary: mitigates, requires, order, risk-blocks, co-occurs-with
 * - Edge strength classification (hard vs soft) for DAG projection
 *
 * The extractor uses concrete rule inputs from shortcut, detail, labels.
 * It normalizes aliases, removes obvious noise, preserves field provenance, and keeps the output
 * deterministic so the graph adapter and query-time graph recall can share the same extraction behavior.
 *
 * Security note: This module operates on already-approved entries.
 * The pipeline is responsible for gating on lifecycleState before calling extract.
 */

import type {
  GraphNodeKind,
  GraphRelationStrength,
  GraphRelationType,
} from '../../indexing/graph-lite/documents.js';
import type { NormalizedIndexDocument } from '../../indexing/types.js';

// Types are imported for internal use; consumers should import from documents.js directly

/**
 * Extracted graph node with kind and value.
 */
interface GraphNode {
  kind: GraphNodeKind;
  id: string;
  label: string;
  evidence: string;
}

/**
 * Graph relation between nodes.
 */
interface GraphRelation {
  relationType: GraphRelationType;
  sourceNodeId: string;
  targetNodeId: string;
  strength: GraphRelationStrength;
  evidence: string;
}

/**
 * Result of trap graph extraction from a normalized document.
 */
interface TrapGraphExtractionResult {
  nodes: GraphNode[];
  edges: GraphRelation[];
}

/**
 * Noise words to exclude from entity extraction.
 */
const NOISE_WORDS = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'but',
  'in',
  'on',
  'at',
  'to',
  'for',
  'of',
  'with',
  'by',
  'from',
  'as',
  'into',
  'through',
  'during',
  'before',
  'after',
  'above',
  'below',
  'it',
  'its',
  'this',
  'that',
  'these',
  'those',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'should',
  'could',
  'may',
  'might',
  'can',
  'need',
  'must',
  'use',
  'when',
  'ensure',
  'provide',
  'require',
  'allow',
  'make',
  'get',
  'set',
  'call',
  'check',
  'find',
  'help',
  'work',
  'way',
  'issue',
  'problem',
  'thing',
  'item',
  'object',
  'value',
  'result',
  'example',
  'case',
  'point',
  'part',
  'also',
  'may',
  'sometimes',
  'often',
  'usually',
  'could',
]);

/**
 * Hard edge trigger phrases indicating mandatory dependencies.
 */
const HARD_TRIGGER_PHRASES = [
  'must',
  'requires',
  'required',
  'blocked',
  'blocked by',
  'depends on',
  'before',
  'prerequisite',
  'necessary',
  'mandatory',
  'needs to',
];

/**
 * Normalize entity value for deduplication.
 */
function normalizeValue(value: string): string {
  return value.toLowerCase().trim().replace(/\s+/g, '-');
}

/**
 * Check if text contains any hard trigger phrase.
 */
function containsHardTrigger(text: string): boolean {
  const lower = text.toLowerCase();
  return HARD_TRIGGER_PHRASES.some((phrase) => lower.includes(phrase));
}

/**
 * Check if mitigation is phrased as mandatory.
 */
function isMandatoryMitigation(text: string): boolean {
  const lower = text.toLowerCase();
  // "to mitigate, you must" or "must ... to mitigate" patterns
  if (lower.includes('to mitigate') && containsHardTrigger(lower)) {
    return true;
  }
  if (lower.includes('mitigate') && (lower.includes('must') || lower.includes('required'))) {
    return true;
  }
  return false;
}

/**
 * Extract the primary trap node from the document.
 */
function extractTrapNode(document: NormalizedIndexDocument): GraphNode {
  return {
    kind: 'trap',
    id: `trap:${document.entryId}`,
    label: document.shortcut.slice(0, 100),
    evidence: `shortcut: ${document.shortcut}`,
  };
}

/**
 * Extract tool nodes from the document.
 */
function extractToolNodes(document: NormalizedIndexDocument): GraphNode[] {
  const nodes: GraphNode[] = [];
  const text = document.canonicalText.toLowerCase();
  const labelsLower = document.labels.map((l) => l.toLowerCase());

  const toolKeywords = [
    'npm',
    'pnpm',
    'yarn',
    'bun',
    'docker',
    'podman',
    'kubernetes',
    'k8s',
    'git',
    'github',
    'gitlab',
    'vitest',
    'jest',
    'mocha',
    'typescript',
    'javascript',
    'ts',
    'js',
    'node',
    'deno',
    'webpack',
    'vite',
    'rollup',
    'esbuild',
    'eslint',
    'prettier',
    'biome',
    'redis',
    'postgres',
    'postgresql',
    'mysql',
    'mongodb',
    'sqlite',
    'aws',
    'azure',
    'gcp',
    'linux',
    'macos',
    'windows',
    'bash',
    'zsh',
    'shell',
    'ssh',
    'curl',
    'wget',
    'nginx',
    'apache',
  ];

  for (const tool of toolKeywords) {
    if (text.includes(tool) || labelsLower.some((l) => l.includes(tool))) {
      nodes.push({
        kind: 'tool',
        id: `tool:${tool}`,
        label: tool,
        evidence: `tool keyword: ${tool}`,
      });
    }
  }

  return nodes;
}

/**
 * Extract cue nodes (error symptoms, warning signs) from the document.
 */
function extractCueNodes(document: NormalizedIndexDocument): GraphNode[] {
  const nodes: GraphNode[] = [];
  const text = document.canonicalText.toLowerCase();

  const cuePatterns = [
    'error',
    'exception',
    'fail',
    'failure',
    'timeout',
    'crash',
    'cannot',
    'could not',
    'unable',
    'undefined',
    'null',
    'nan',
    'leak',
    'overflow',
    'underflow',
    'infinite',
    'deadlock',
    'corrupt',
    'invalid',
    'missing',
    'not found',
    '404',
    '500',
    'denied',
    'refused',
    'rejected',
  ];

  for (const pattern of cuePatterns) {
    if (text.includes(pattern)) {
      nodes.push({
        kind: 'cue',
        id: `cue:${normalizeValue(pattern)}`,
        label: pattern,
        evidence: `cue pattern: ${pattern}`,
      });
    }
  }

  return nodes;
}

/**
 * Extract environment nodes from the document.
 */
function extractEnvironmentNodes(document: NormalizedIndexDocument): GraphNode[] {
  const nodes: GraphNode[] = [];
  const text = document.canonicalText.toLowerCase();

  const envPatterns = [
    'ci',
    'cd',
    'local',
    'localhost',
    'production',
    'prod',
    'staging',
    'stage',
    'development',
    'dev',
    'test',
    'testing',
    'container',
    'vm',
  ];

  for (const env of envPatterns) {
    if (text.includes(env)) {
      nodes.push({
        kind: 'environment',
        id: `env:${env}`,
        label: env,
        evidence: `environment: ${env}`,
      });
    }
  }

  // Extract version patterns
  const versionPattern = /\b(node|python|java|golang|rust|npm|pnpm)\s*(\d+\.?\d*)\b/gi;
  const versionMatches = document.canonicalText.matchAll(versionPattern);

  for (const match of versionMatches) {
    const tool = match[1];
    const version = match[2];
    const value = `${tool}-${version}`;
    nodes.push({
      kind: 'environment',
      id: `env:${normalizeValue(value)}`,
      label: `${tool} ${version}`,
      evidence: `version constraint: ${tool} ${version}`,
    });
  }

  return nodes;
}

/**
 * Extract prerequisite nodes from the document.
 * Prerequisites are indicated by phrases like "prerequisite:", "requires", "before", etc.
 */
function extractPrerequisiteNodes(document: NormalizedIndexDocument): GraphNode[] {
  const nodes: GraphNode[] = [];
  const text = document.canonicalText.toLowerCase();

  // Look for prerequisite patterns
  const prereqPattern = /prerequisite[:\s]+([^.!\n]+)/gi;
  const requiresPattern = /requires?\s+([^.!\n]+)/gi;

  let match: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: Standard regex exec pattern
  while ((match = prereqPattern.exec(text)) !== null) {
    const prereqText = match[1]?.trim();
    if (prereqText && prereqText.length > 3 && !NOISE_WORDS.has(prereqText.toLowerCase())) {
      nodes.push({
        kind: 'prerequisite',
        id: `prereq:${normalizeValue(prereqText)}`,
        label: prereqText.slice(0, 50),
        evidence: `prerequisite: ${prereqText}`,
      });
    }
  }

  // biome-ignore lint/suspicious/noAssignInExpressions: Standard regex exec pattern
  while ((match = requiresPattern.exec(text)) !== null) {
    const reqText = match[1]?.trim();
    if (reqText && reqText.length > 3 && !NOISE_WORDS.has(reqText.toLowerCase())) {
      nodes.push({
        kind: 'prerequisite',
        id: `prereq:${normalizeValue(reqText)}`,
        label: reqText.slice(0, 50),
        evidence: `requires: ${reqText}`,
      });
    }
  }

  return nodes;
}

/**
 * Extract mitigation nodes from the document.
 * Mitigations are fix/solution phrases.
 */
function extractMitigationNodes(document: NormalizedIndexDocument): GraphNode[] {
  const nodes: GraphNode[] = [];
  const text = document.canonicalText.toLowerCase();

  // Look for mitigation patterns
  const mitigatePattern = /(?:to\s+)?mitigate[,:\s]+([^.!\n]+)/gi;
  const fixPattern = /fix[:\s]+([^.!\n]+)/gi;

  let match: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: Standard regex exec pattern
  while ((match = mitigatePattern.exec(text)) !== null) {
    const mitText = match[1]?.trim();
    if (mitText && mitText.length > 3 && !NOISE_WORDS.has(mitText.toLowerCase())) {
      nodes.push({
        kind: 'mitigation',
        id: `mit:${normalizeValue(mitText)}`,
        label: mitText.slice(0, 50),
        evidence: `mitigation: ${mitText}`,
      });
    }
  }

  // biome-ignore lint/suspicious/noAssignInExpressions: Standard regex exec pattern
  while ((match = fixPattern.exec(text)) !== null) {
    const fixText = match[1]?.trim();
    if (fixText && fixText.length > 3 && !NOISE_WORDS.has(fixText.toLowerCase())) {
      nodes.push({
        kind: 'mitigation',
        id: `mit:${normalizeValue(fixText)}`,
        label: fixText.slice(0, 50),
        evidence: `fix: ${fixText}`,
      });
    }
  }

  return nodes;
}

/**
 * Extract relations between nodes based on TrapMap semantics.
 */
function extractRelations(
  trapNode: GraphNode,
  toolNodes: GraphNode[],
  cueNodes: GraphNode[],
  envNodes: GraphNode[],
  prereqNodes: GraphNode[],
  mitNodes: GraphNode[],
  document: NormalizedIndexDocument,
): GraphRelation[] {
  const relations: GraphRelation[] = [];
  const text = document.canonicalText.toLowerCase();
  const hasHardTriggers = containsHardTrigger(text);

  // Trap -> Cue relations (risk-blocks): trap triggers cue
  for (const cue of cueNodes) {
    relations.push({
      relationType: 'risk-blocks',
      sourceNodeId: trapNode.id,
      targetNodeId: cue.id,
      strength: hasHardTriggers ? 'hard' : 'soft',
      evidence: `trap triggers ${cue.label}`,
    });
  }

  // Trap -> Tool relations (co-occurs-with): trap involves tool
  for (const tool of toolNodes) {
    relations.push({
      relationType: 'co-occurs-with',
      sourceNodeId: trapNode.id,
      targetNodeId: tool.id,
      strength: 'soft',
      evidence: `trap involves ${tool.label}`,
    });
  }

  // Trap -> Environment relations (co-occurs-with): trap occurs in environment
  for (const env of envNodes) {
    relations.push({
      relationType: 'co-occurs-with',
      sourceNodeId: trapNode.id,
      targetNodeId: env.id,
      strength: 'soft',
      evidence: `trap occurs in ${env.label}`,
    });
  }

  // Trap -> Prerequisite relations (requires): trap requires prerequisite
  for (const prereq of prereqNodes) {
    relations.push({
      relationType: 'requires',
      sourceNodeId: trapNode.id,
      targetNodeId: prereq.id,
      strength: 'hard', // Prerequisites are always hard dependencies
      evidence: `trap requires ${prereq.label}`,
    });
  }

  // Mitigation -> Trap relations (mitigates): mitigation addresses trap
  const isMandatory = isMandatoryMitigation(text);
  for (const mit of mitNodes) {
    relations.push({
      relationType: 'mitigates',
      sourceNodeId: mit.id,
      targetNodeId: trapNode.id,
      strength: isMandatory ? 'hard' : 'soft',
      evidence: 'mitigation addresses trap',
    });
  }

  // Mitigation -> Tool relations (requires): mitigation requires tool
  for (const mit of mitNodes) {
    for (const tool of toolNodes) {
      // Check if the mitigation text mentions the tool
      if (mit.evidence.toLowerCase().includes(tool.label)) {
        relations.push({
          relationType: 'requires',
          sourceNodeId: mit.id,
          targetNodeId: tool.id,
          strength: hasHardTriggers ? 'hard' : 'soft',
          evidence: `mitigation uses ${tool.label}`,
        });
      }
    }
  }

  // Prerequisite -> Prerequisite ordering (order): temporal precedence
  for (let i = 0; i < prereqNodes.length - 1; i++) {
    relations.push({
      relationType: 'order',
      sourceNodeId: prereqNodes[i]!.id,
      targetNodeId: prereqNodes[i + 1]!.id,
      strength: 'soft',
      evidence: 'prerequisite ordering',
    });
  }

  return relations;
}

/**
 * Deduplicate nodes by id.
 */
function deduplicateNodes(nodes: GraphNode[]): GraphNode[] {
  const seen = new Set<string>();
  return nodes.filter((node) => {
    if (seen.has(node.id)) {
      return false;
    }
    seen.add(node.id);
    return true;
  });
}

/**
 * Extract trap-specific graph entities and relations from a normalized index document.
 *
 * This function:
 * - Uses deterministic rule-based extraction from shortcut, detail, labels
 * - Emits only the locked TrapMap node kind vocabulary
 * - Emits only the locked TrapMap relation type vocabulary
 * - Classifies edge strength as hard or soft for DAG projection
 * - Returns stable, deterministic results for identical inputs
 *
 * @param document - The normalized index document to extract from
 * @returns Extracted nodes and relations with TrapMap-specific semantics
 */
export function extractTrapGraphEntities(
  document: NormalizedIndexDocument,
): TrapGraphExtractionResult {
  // Extract all node types
  const trapNode = extractTrapNode(document);
  const toolNodes = extractToolNodes(document);
  const cueNodes = extractCueNodes(document);
  const envNodes = extractEnvironmentNodes(document);
  const prereqNodes = extractPrerequisiteNodes(document);
  const mitNodes = extractMitigationNodes(document);

  // Combine and deduplicate nodes
  const allNodes = deduplicateNodes([
    trapNode,
    ...toolNodes,
    ...cueNodes,
    ...envNodes,
    ...prereqNodes,
    ...mitNodes,
  ]);

  // Extract relations between nodes
  const edges = extractRelations(
    trapNode,
    toolNodes,
    cueNodes,
    envNodes,
    prereqNodes,
    mitNodes,
    document,
  );

  return { nodes: allNodes, edges };
}

// ---------------------------------------------------------------------------
// Backward-compatible legacy interface
// ---------------------------------------------------------------------------

/**
 * Legacy entity types from the old generic extractor.
 * Kept for backward compatibility with existing callers during migration.
 * @deprecated Use extractTrapGraphEntities instead.
 */
type LegacyGraphEntityType = 'service' | 'tool' | 'symptom' | 'root-cause' | 'fix' | 'environment';

/**
 * Legacy relation types from the old generic extractor.
 * @deprecated Use TrapGraphExtractionResult instead.
 */
type LegacyGraphRelationType =
  | 'mentions'
  | 'causes'
  | 'fixed-by'
  | 'observed-in'
  | 'uses-tool'
  | 'runs-in';

/**
 * Legacy graph entity shape.
 * @deprecated Use GraphNode instead.
 */
interface GraphEntity {
  type: LegacyGraphEntityType;
  value: string;
  normalizedValue: string;
}

/**
 * Legacy graph relation shape.
 * @deprecated Use GraphRelation instead.
 */
interface LegacyGraphRelation {
  type: LegacyGraphRelationType;
  fromEntity: string;
  toEntity: string;
  weight: number;
}

/**
 * Legacy extraction result shape.
 * @deprecated Use TrapGraphExtractionResult instead.
 */
interface GraphExtractionResult {
  entities: GraphEntity[];
  relations: LegacyGraphRelation[];
}

/**
 * Map TrapMap node kinds to legacy entity types for backward compatibility.
 */
function mapKindToLegacyType(kind: GraphNodeKind): LegacyGraphEntityType {
  switch (kind) {
    case 'trap':
    case 'cue':
      return 'symptom';
    case 'tool':
      return 'tool';
    case 'environment':
      return 'environment';
    case 'prerequisite':
      return 'root-cause';
    case 'mitigation':
      return 'fix';
    case 'skill':
      return 'service';
    case 'boundary-context':
    case 'boundary-version':
    case 'boundary-platform':
      return 'environment';
  }
}

/**
 * Backward-compatible extraction function that returns the legacy entity format.
 *
 * Internally delegates to extractTrapGraphEntities and maps the new vocabulary
 * to the old format so existing callers continue to work during migration.
 *
 * @deprecated Use extractTrapGraphEntities for new code.
 */
export function extractGraphEntities(document: NormalizedIndexDocument): GraphExtractionResult {
  const result = extractTrapGraphEntities(document);

  // Extract service entities from PascalCase patterns FIRST (backward compat)
  // These take priority over tool entities for the same normalized value
  const serviceEntities: GraphEntity[] = [];
  const servicePattern = /\b([A-Z][a-z0-9]+(?:[A-Z][a-z0-9]+)*)\b/g;
  for (const label of document.labels) {
    const matches = label.matchAll(servicePattern);
    for (const match of matches) {
      const value = match[1];
      if (value && value.length > 2 && !NOISE_WORDS.has(value.toLowerCase())) {
        const normalizedValue = normalizeValue(value);
        if (!serviceEntities.some((e) => e.normalizedValue === normalizedValue)) {
          serviceEntities.push({ type: 'service', value, normalizedValue });
        }
      }
    }
  }
  for (const match of document.shortcut.matchAll(servicePattern)) {
    const value = match[1];
    if (value && value.length > 2 && !NOISE_WORDS.has(value.toLowerCase())) {
      const normalizedValue = normalizeValue(value);
      if (!serviceEntities.some((e) => e.normalizedValue === normalizedValue)) {
        serviceEntities.push({ type: 'service', value, normalizedValue });
      }
    }
  }

  // Map new node types to legacy, but skip tool nodes that conflict with service entities
  const serviceNormalizedValues = new Set(serviceEntities.map((e) => e.normalizedValue));
  const mappedEntities: GraphEntity[] = result.nodes
    .filter((node) => {
      // Skip tool nodes that would conflict with service entities
      if (node.kind === 'tool' && serviceNormalizedValues.has(normalizeValue(node.label))) {
        return false;
      }
      return true;
    })
    .map((node) => ({
      type: mapKindToLegacyType(node.kind),
      value: node.label,
      normalizedValue: node.label.toLowerCase().trim().replace(/\s+/g, '-'),
    }));

  const entities: GraphEntity[] = [...serviceEntities, ...mappedEntities];

  // Also extract root-cause entities from causal phrases (backward compat)
  const text = document.canonicalText.toLowerCase();
  const causalPhrases = ['because', 'caused by', 'due to', 'root cause', 'reason'];
  for (const phrase of causalPhrases) {
    if (text.includes(phrase)) {
      const normalizedValue = normalizeValue(phrase);
      if (!entities.some((e) => e.normalizedValue === normalizedValue)) {
        entities.push({
          type: 'root-cause',
          value: phrase,
          normalizedValue,
        });
      }
    }
  }

  // Deduplicate by normalizedValue
  const seen = new Set<string>();
  const dedupedEntities: GraphEntity[] = [];
  for (const entity of entities) {
    if (!seen.has(entity.normalizedValue)) {
      seen.add(entity.normalizedValue);
      dedupedEntities.push(entity);
    }
  }

  // Map new relation types to legacy types for backward compat
  const relationTypeMap: Partial<Record<GraphRelationType, LegacyGraphRelationType>> = {
    mitigates: 'fixed-by',
    requires: 'uses-tool',
    'risk-blocks': 'observed-in',
    'co-occurs-with': 'mentions',
    order: 'mentions',
  };

  const relations: LegacyGraphRelation[] = result.edges.map((edge) => ({
    type: relationTypeMap[edge.relationType] ?? 'mentions',
    fromEntity: edge.sourceNodeId,
    toEntity: edge.targetNodeId,
    weight: edge.strength === 'hard' ? 2 : 1,
  }));

  return { entities: dedupedEntities, relations };
}
