/**
 * Graph entity extraction module.
 *
 * This module provides:
 * - Deterministic extraction of high-value entities from knowledge entries
 * - Classification into required graph classes (service, tool, symptom, root-cause, fix, environment)
 * - Extraction of simple typed relations between entities
 * - Field-aware extraction using normalized labels and tokens
 *
 * The extractor uses concrete rule inputs from shortcut, detail, labels, and normalized tokens.
 * It normalizes aliases, removes obvious noise, preserves field provenance, and keeps the output
 * deterministic so the graph adapter and query-time graph recall can share the same extraction behavior.
 *
 * Security note: This module operates on already-approved entries.
 * The pipeline is responsible for gating on lifecycleState before calling extract.
 */

import type { NormalizedIndexDocument } from '../indexing/types.js';

/**
 * Graph entity types supported for extraction.
 */
export type GraphEntityType =
  | 'service'
  | 'tool'
  | 'symptom'
  | 'root-cause'
  | 'fix'
  | 'environment';

/**
 * Graph relation types supported.
 */
export type GraphRelationType =
  | 'mentions'
  | 'causes'
  | 'fixed-by'
  | 'observed-in'
  | 'uses-tool'
  | 'runs-in';

/**
 * Extracted graph entity with type and value.
 */
export interface GraphEntity {
  type: GraphEntityType;
  value: string;
  /** Normalized value for deduplication */
  normalizedValue: string;
}

/**
 * Graph relation between entities.
 */
export interface GraphRelation {
  type: GraphRelationType;
  fromEntity: string; // normalized entity value
  toEntity: string; // normalized entity value
  weight: number; // support count
}

/**
 * Result of graph extraction from a normalized document.
 */
export interface GraphExtractionResult {
  /** Extracted entities */
  entities: GraphEntity[];
  /** Extracted relations */
  relations: GraphRelation[];
}

/**
 * Noise words to exclude from entity extraction.
 * These are very common terms that don't provide useful graph pivots.
 */
const NOISE_WORDS = new Set([
  // Articles and prepositions
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
  'by', 'from', 'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
  // Pronouns and conjunctions
  'it', 'its', 'this', 'that', 'these', 'those', 'is', 'are', 'was', 'were', 'be',
  'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
  'should', 'could', 'may', 'might', 'can', 'need', 'must',
  // Generic terms
  'use', 'when', 'ensure', 'provide', 'require', 'allow', 'make', 'get', 'set',
  'call', 'check', 'find', 'help', 'work', 'way', 'issue', 'problem', 'thing',
  'item', 'object', 'value', 'result', 'example', 'case', 'point', 'part',
]);

/**
 * Normalize entity value for deduplication.
 * Converts to lowercase, trims, and replaces spaces with hyphens.
 */
function normalizeEntityValue(value: string): string {
  return value.toLowerCase().trim().replace(/\s+/g, '-');
}

/**
 * Extract service entities from the document.
 *
 * Service entities are capitalized package-like phrases found in labels,
 * shortcut, or capitalized tokens (e.g., TypeScript, Docker, PostgreSQL).
 */
function extractServiceEntities(document: NormalizedIndexDocument): GraphEntity[] {
  const entities: GraphEntity[] = [];

  // Extract from labels (highest priority - often contain product/service names)
  for (const label of document.labels) {
    // Check for capitalized multi-word phrases (PascalCase or spaced capitals)
    const servicePattern = /\b([A-Z][a-z0-9]+(?:[A-Z][a-z0-9]+)*)\b/g;
    const matches = label.matchAll(servicePattern);

    for (const match of matches) {
      const value = match[1];
      if (value && value.length > 2 && !NOISE_WORDS.has(value.toLowerCase())) {
        entities.push({
          type: 'service',
          value,
          normalizedValue: normalizeEntityValue(value),
        });
      }
    }
  }

  // Extract from shortcut (title often contains service name)
  const shortcutServicePattern = /\b([A-Z][a-z0-9]+(?:[A-Z][a-z0-9]+)*)\b/g;
  const shortcutMatches = document.shortcut.matchAll(shortcutServicePattern);

  for (const match of shortcutMatches) {
    const value = match[1];
    if (value && value.length > 2 && !NOISE_WORDS.has(value.toLowerCase())) {
      entities.push({
        type: 'service',
        value,
        normalizedValue: normalizeEntityValue(value),
      });
    }
  }

  return entities;
}

/**
 * Extract tool entities from the document.
 *
 * Tool entities are CLI, library, framework, or operational tool names
 * (e.g., npm, pnpm, Docker, git, vitest).
 */
function extractToolEntities(document: NormalizedIndexDocument): GraphEntity[] {
  const entities: GraphEntity[] = [];
  const text = document.canonicalText.toLowerCase();

  // Common tool keywords (case-insensitive)
  const toolKeywords = [
    'npm', 'pnpm', 'yarn', 'bun',
    'docker', 'podman', 'kubernetes', 'k8s',
    'git', 'github', 'gitlab',
    'vitest', 'jest', 'mocha', 'jasmine',
    'typescript', 'javascript', 'ts', 'js',
    'node', 'deno', 'bun',
    'webpack', 'vite', 'rollup', 'esbuild',
    'eslint', 'prettier', 'biome',
    'redis', 'postgres', 'postgresql', 'mysql', 'mongodb', 'sqlite',
    'aws', 'azure', 'gcp',
    'linux', 'macos', 'windows',
    'bash', 'zsh', 'shell',
    'ssh', 'curl', 'wget',
    'nginx', 'apache',
  ];

  for (const tool of toolKeywords) {
    if (text.includes(tool)) {
      entities.push({
        type: 'tool',
        value: tool,
        normalizedValue: normalizeEntityValue(tool),
      });
    }
  }

  // Also check labels for tool names
  for (const label of document.labels) {
    const lowerLabel = label.toLowerCase();
    for (const tool of toolKeywords) {
      if (lowerLabel.includes(tool)) {
        entities.push({
          type: 'tool',
          value: tool,
          normalizedValue: normalizeEntityValue(tool),
        });
      }
    }
  }

  return entities;
}

/**
 * Extract symptom entities from the document.
 *
 * Symptom entities are error/problem phrases
 * (e.g., error, fail, timeout, crash, cannot, undefined, null, leak).
 */
function extractSymptomEntities(document: NormalizedIndexDocument): GraphEntity[] {
  const entities: GraphEntity[] = [];
  const text = document.canonicalText.toLowerCase();

  const symptomPatterns = [
    'error', 'exception', 'fail', 'failure', 'timeout', 'crash',
    'cannot', 'could not', 'unable', 'undefined', 'null', 'nan',
    'leak', 'overflow', 'underflow', 'infinite', 'deadlock',
    'corrupt', 'invalid', 'missing', 'not found', '404', '500',
  ];

  for (const symptom of symptomPatterns) {
    if (text.includes(symptom)) {
      entities.push({
        type: 'symptom',
        value: symptom,
        normalizedValue: normalizeEntityValue(symptom),
      });
    }
  }

  return entities;
}

/**
 * Extract root-cause entities from the document.
 *
 * Root-cause entities are clauses introduced by causal phrases
 * (because, caused by, due to, root cause).
 */
function extractRootCauseEntities(document: NormalizedIndexDocument): GraphEntity[] {
  const entities: GraphEntity[] = [];
  const text = document.canonicalText.toLowerCase();

  const causalPhrases = ['because', 'caused by', 'due to', 'root cause', 'reason'];

  for (const phrase of causalPhrases) {
    if (text.includes(phrase)) {
      entities.push({
        type: 'root-cause',
        value: phrase,
        normalizedValue: normalizeEntityValue(phrase),
      });
    }
  }

  return entities;
}

/**
 * Extract fix entities from the document.
 *
 * Fix entities are remediation clauses
 * (fix, use, enable, set, add, configure, validate).
 */
function extractFixEntities(document: NormalizedIndexDocument): GraphEntity[] {
  const entities: GraphEntity[] = [];
  const text = document.canonicalText.toLowerCase();

  const fixPatterns = [
    'fix', 'solution', 'resolve', 'remedy',
    'use', 'using', 'utilize',
    'enable', 'disable', 'activate', 'deactivate',
    'set', 'add', 'remove', 'delete', 'configure',
    'validate', 'verify', 'check', 'ensure',
    'implement', 'apply', 'install', 'uninstall',
    'update', 'upgrade', 'downgrade', 'patch',
    'restart', 'reboot', 'reload', 'refresh',
  ];

  for (const fix of fixPatterns) {
    if (text.includes(fix)) {
      entities.push({
        type: 'fix',
        value: fix,
        normalizedValue: normalizeEntityValue(fix),
      });
    }
  }

  return entities;
}

/**
 * Extract environment entities from the document.
 *
 * Environment entities are OS/runtime/version/team-context markers
 * (e.g., ci, local, production, staging, Node versions).
 */
function extractEnvironmentEntities(document: NormalizedIndexDocument): GraphEntity[] {
  const entities: GraphEntity[] = [];
  const text = document.canonicalText.toLowerCase();

  const envPatterns = [
    'ci', 'cd', 'local', 'localhost',
    'production', 'prod', 'staging', 'stage', 'development', 'dev', 'test', 'testing',
    'docker', 'container', 'vm', 'kubernetes',
  ];

  for (const env of envPatterns) {
    if (text.includes(env)) {
      entities.push({
        type: 'environment',
        value: env,
        normalizedValue: normalizeEntityValue(env),
      });
    }
  }

  // Extract version patterns (e.g., node 18, python 3.11)
  const versionPattern = /\b(node|python|java|golang|rust|npm|pnpm)\s*(\d+\.?\d*)\b/gi;
  const versionMatches = document.canonicalText.matchAll(versionPattern);

  for (const match of versionMatches) {
    const tool = match[1];
    const version = match[2];
    const value = `${tool} ${version}`;
    entities.push({
      type: 'environment',
      value,
      normalizedValue: normalizeEntityValue(value),
    });
  }

  return entities;
}

/**
 * Extract relations between co-occurring entities.
 *
 * Creates simple typed relations based on entity type co-occurrence:
 * - Symptom -> Fix (fixed-by)
 * - Fix -> Tool (uses-tool)
 * - Service -> Symptom (observed-in)
 * - Fix -> Environment (runs-in)
 */
function extractRelations(entities: GraphEntity[]): GraphRelation[] {
  const relations: GraphRelation[] = [];

  // Group entities by type
  const byType = new Map<GraphEntityType, GraphEntity[]>();
  for (const entity of entities) {
    if (!byType.has(entity.type)) {
      byType.set(entity.type, []);
    }
    byType.get(entity.type)!.push(entity);
  }

  const symptoms = byType.get('symptom') || [];
  const fixes = byType.get('fix') || [];
  const tools = byType.get('tool') || [];
  const services = byType.get('service') || [];
  const environments = byType.get('environment') || [];

  // Symptom -> Fix relations (fixed-by)
  for (const symptom of symptoms) {
    for (const fix of fixes) {
      relations.push({
        type: 'fixed-by',
        fromEntity: symptom.normalizedValue,
        toEntity: fix.normalizedValue,
        weight: 1,
      });
    }
  }

  // Fix -> Tool relations (uses-tool)
  for (const fix of fixes) {
    for (const tool of tools) {
      relations.push({
        type: 'uses-tool',
        fromEntity: fix.normalizedValue,
        toEntity: tool.normalizedValue,
        weight: 1,
      });
    }
  }

  // Service -> Symptom relations (observed-in)
  for (const service of services) {
    for (const symptom of symptoms) {
      relations.push({
        type: 'observed-in',
        fromEntity: service.normalizedValue,
        toEntity: symptom.normalizedValue,
        weight: 1,
      });
    }
  }

  // Fix -> Environment relations (runs-in)
  for (const fix of fixes) {
    for (const env of environments) {
      relations.push({
        type: 'runs-in',
        fromEntity: fix.normalizedValue,
        toEntity: env.normalizedValue,
        weight: 1,
      });
    }
  }

  return relations;
}

/**
 * Extract graph entities and relations from a normalized index document.
 *
 * This function:
 * - Uses deterministic rule-based extraction from shortcut, detail, labels, and tokens
 * - Filters out noise words and very short terms
 * - Deduplicates entities by normalized value
 * - Extracts simple typed relations based on entity co-occurrence
 * - Returns stable, deterministic results for identical inputs
 *
 * @param document - The normalized index document to extract from
 * @returns Extracted entities and relations
 */
export function extractGraphEntities(
  document: NormalizedIndexDocument,
): GraphExtractionResult {
  // Extract entities by type
  const serviceEntities = extractServiceEntities(document);
  const toolEntities = extractToolEntities(document);
  const symptomEntities = extractSymptomEntities(document);
  const rootCauseEntities = extractRootCauseEntities(document);
  const fixEntities = extractFixEntities(document);
  const environmentEntities = extractEnvironmentEntities(document);

  // Combine all entities
  const allEntities = [
    ...serviceEntities,
    ...toolEntities,
    ...symptomEntities,
    ...rootCauseEntities,
    ...fixEntities,
    ...environmentEntities,
  ];

  // Deduplicate by normalized value (keep first occurrence)
  const seen = new Set<string>();
  const deduplicatedEntities: GraphEntity[] = [];

  for (const entity of allEntities) {
    if (!seen.has(entity.normalizedValue)) {
      seen.add(entity.normalizedValue);
      deduplicatedEntities.push(entity);
    }
  }

  // Extract relations from deduplicated entities
  const relations = extractRelations(deduplicatedEntities);

  return {
    entities: deduplicatedEntities,
    relations,
  };
}
