/**
 * Skill graph source builders and lifecycle orchestration for GraphRAG-lite indexing.
 *
 * This module provides:
 * - buildSkillGraphDocument: Build a graph document from an approved skill artifact
 * - extractSkillGraphPrimitives: Extract nodes and edges from profile/capsule text
 * - determineSkillIndexAction: Map lifecycle transitions to index actions
 * - runSkillIndexEvent: Execute indexing through artifact adapter pipeline
 *
 * T-36-09: Build graph text only from derived.profile and derived.capsules
 * T-36-10: Persist teamId, scope, requiredLevel from artifact root
 * T-36-12: Remove graph documents on deactivation
 *
 * Security note: This module reads only derived outputs, never raw asset/script bodies.
 */

import { createHash } from 'node:crypto';

import type { LifecycleState } from '@trapmap/contracts';

import type { ChatProvider } from '@trapmap/server/lib/ai/types.js';
import type { GraphQueryBackend } from '@trapmap/server/lib/graph-query/backend.js';
import type {
  SkillArtifactRecord,
  SkillShareerStore,
  StoreData,
} from '@trapmap/server/lib/store.js';
import type { ArtifactGraphAdapter } from './adapters/artifact-graph.js';
import type {
  GraphEdgeRecord,
  GraphIndexDocumentRecord,
  GraphNodeRecord,
} from './graph-lite/documents.js';
import {
  type SkillGraphDocumentInput,
  buildSkillGraphDocument as buildSkillGraphDocumentRecord,
} from './graph-lite/documents.js';
import { assertNoHardDependencyCycles } from './graph-lite/graphology.js';
import { extractGraphEntitiesWithLLM } from './graph-lite/llm-extract.js';
import { getGraphIndexDocuments } from './graph-lite/store.js';

// ---------------------------------------------------------------------------
// Locked vocabulary from D-04
// ---------------------------------------------------------------------------

/**
 * Node kinds in the TrapMap-specific vocabulary.
 * Locked to skill, cue, tool, environment, prerequisite, mitigation.
 */
export type SkillGraphNodeKind =
  | 'skill'
  | 'cue'
  | 'tool'
  | 'environment'
  | 'prerequisite'
  | 'mitigation';

/**
 * Relation types in the locked vocabulary.
 * Locked to mitigates, requires, order, risk-blocks, co-occurs-with.
 */
export type SkillGraphRelationType =
  | 'mitigates'
  | 'requires'
  | 'order'
  | 'risk-blocks'
  | 'co-occurs-with';

/**
 * Edge strength distinguishing hard dependencies from soft precedence.
 */
export type SkillGraphRelationStrength = 'hard' | 'soft';

// ---------------------------------------------------------------------------
// Graph primitive types
// ---------------------------------------------------------------------------

/**
 * A node primitive extracted from skill profile/capsule text.
 */
export interface SkillGraphNodePrimitive {
  id: string;
  kind: SkillGraphNodeKind;
  label: string;
  evidence: string;
}

/**
 * An edge primitive extracted from skill profile/capsule text.
 */
export interface SkillGraphEdgePrimitive {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  relationType: SkillGraphRelationType;
  strength: SkillGraphRelationStrength;
  evidence: string;
}

/**
 * Result of extracting graph primitives from skill text.
 */
export interface SkillGraphPrimitives {
  nodes: SkillGraphNodePrimitive[];
  edges: SkillGraphEdgePrimitive[];
}

// ---------------------------------------------------------------------------
// Hard/soft language detection
// ---------------------------------------------------------------------------

/**
 * Phrases that indicate hard (mandatory) dependencies.
 * These create edges with strength='hard'.
 */
const HARD_DEPENDENCY_PHRASES: ReadonlySet<string> = new Set([
  'must',
  'required',
  'requires',
  'depends on',
  'blocked',
  'before',
  'mandatory',
  'necessary',
  'essential',
  'prerequisite',
]);

/**
 * Check if text contains mandatory/hard dependency language.
 */
function containsHardLanguage(text: string): boolean {
  const lowerText = text.toLowerCase();
  for (const phrase of HARD_DEPENDENCY_PHRASES) {
    if (lowerText.includes(phrase)) {
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Keyword extraction helpers
// ---------------------------------------------------------------------------

/**
 * Technical terms that map to 'tool' nodes.
 */
const TOOL_KEYWORDS: ReadonlySet<string> = new Set([
  'docker',
  'kubernetes',
  'k8s',
  'node',
  'nodejs',
  'typescript',
  'javascript',
  'python',
  'rust',
  'golang',
  'postgres',
  'postgresql',
  'mysql',
  'mongodb',
  'redis',
  'git',
  'npm',
  'pnpm',
  'yarn',
  'webpack',
  'vite',
  'react',
  'vue',
  'angular',
  'fastify',
  'express',
  'nginx',
  'aws',
  'gcp',
  'azure',
  'terraform',
  'ansible',
  'linux',
  'unix',
  'bash',
  'zsh',
  'make',
  'gradle',
  'maven',
  'pip',
  'cargo',
  'go',
]);

/**
 * Environment keywords that map to 'environment' nodes.
 */
const ENVIRONMENT_KEYWORDS: ReadonlySet<string> = new Set([
  'production',
  'staging',
  'development',
  'dev',
  'prod',
  'stage',
  'test',
  'testing',
  'ci',
  'cd',
  'pipeline',
  'server',
  'container',
  'pod',
  'cluster',
  'local',
  'remote',
  'cloud',
  'on-premise',
  'on-prem',
]);

// ---------------------------------------------------------------------------
// Extraction logic
// ---------------------------------------------------------------------------

/**
 * Extract graph primitives from skill profile and capsules.
 *
 * This function:
 * - Emits a root 'skill' node anchored to the artifact ID
 * - Extracts 'cue', 'tool', 'environment', 'prerequisite', 'mitigation' nodes from text
 * - Emits edges with locked relation types and hard/soft strength
 * - Attaches evidence with field paths and snippets
 *
 * Text sources (D-01, D-02):
 * - profile.summary
 * - profile.keywords
 * - capsules[].situation
 * - capsules[].problem
 * - capsules[].goal
 * - capsules[].content
 * - capsules[].labels
 *
 * NOT used (activation-only):
 * - clientManifest.assets
 * - clientManifest.scripts
 */
export function extractSkillGraphPrimitives(args: {
  artifactId: string;
  profile: {
    title: string;
    summary: string;
    keywords: string[];
  } | null;
  capsules: Array<{
    capsuleId: string;
    situation: string;
    problem: string;
    goal: string;
    content: string;
    labels: string[];
  }>;
}): SkillGraphPrimitives {
  const { artifactId, profile, capsules } = args;

  const nodes: SkillGraphNodePrimitive[] = [];
  const edges: SkillGraphEdgePrimitive[] = [];

  // 1. Always emit root skill node
  const skillNodeId = `skill:${artifactId}`;
  nodes.push({
    id: skillNodeId,
    kind: 'skill',
    label: profile?.title ?? 'Skill',
    evidence: profile?.summary
      ? `profile.summary: ${profile.summary.slice(0, 200)}`
      : 'skill root node',
  });

  // Track extracted entities to avoid duplicates
  const extractedTools = new Set<string>();
  const extractedEnvironments = new Set<string>();
  const extractedPrerequisites = new Set<string>();
  const extractedMitigations = new Set<string>();
  const extractedCues = new Set<string>();

  // 2. Extract from profile summary and keywords
  if (profile) {
    const profileText = `${profile.summary} ${profile.keywords.join(' ')}`;

    // Extract tools
    for (const keyword of profile.keywords) {
      const lowerKeyword = keyword.toLowerCase().replace(/[-_.]/g, '');
      if (TOOL_KEYWORDS.has(lowerKeyword) && !extractedTools.has(lowerKeyword)) {
        const toolNodeId = `tool:${lowerKeyword}`;
        nodes.push({
          id: toolNodeId,
          kind: 'tool',
          label: keyword,
          evidence: `profile.keywords: ${keyword}`,
        });
        extractedTools.add(lowerKeyword);

        // Skill uses tool (soft by default)
        edges.push({
          id: `edge:${skillNodeId}:uses:${toolNodeId}`,
          sourceNodeId: skillNodeId,
          targetNodeId: toolNodeId,
          relationType: 'co-occurs-with',
          strength: 'soft',
          evidence: `profile.keywords: ${keyword}`,
        });
      }
    }

    // Extract environments from profile text
    const words = profileText.toLowerCase().split(/\s+/);
    for (const word of words) {
      const cleanWord = word.replace(/[^a-z]/g, '');
      if (ENVIRONMENT_KEYWORDS.has(cleanWord) && !extractedEnvironments.has(cleanWord)) {
        const envNodeId = `environment:${cleanWord}`;
        nodes.push({
          id: envNodeId,
          kind: 'environment',
          label: cleanWord,
          evidence: `profile.summary: ${cleanWord}`,
        });
        extractedEnvironments.add(cleanWord);
      }
    }

    // Check for hard language in profile
    if (containsHardLanguage(profile.summary)) {
      // The skill has hard requirements mentioned in profile
      const prereqNodeId = `prerequisite:${artifactId}:profile`;
      if (!extractedPrerequisites.has(prereqNodeId)) {
        nodes.push({
          id: prereqNodeId,
          kind: 'prerequisite',
          label: 'Profile prerequisites',
          evidence: 'profile.summary: mandatory requirement detected',
        });
        extractedPrerequisites.add(prereqNodeId);

        edges.push({
          id: `edge:${skillNodeId}:requires:${prereqNodeId}`,
          sourceNodeId: skillNodeId,
          targetNodeId: prereqNodeId,
          relationType: 'requires',
          strength: 'hard',
          evidence: 'profile.summary: contains mandatory language',
        });
      }
    }
  }

  // 3. Extract from capsules
  for (let i = 0; i < capsules.length; i++) {
    const capsule = capsules[i];
    if (!capsule) {
      continue;
    }
    const capsuleText = `${capsule.situation} ${capsule.problem} ${capsule.goal} ${capsule.content} ${capsule.labels.join(' ')}`;
    const capsuleFieldRef = `capsules[${i}]`;

    // Extract cues from problem/situation
    const cueText = capsule.problem || capsule.situation;
    if (cueText && !extractedCues.has(capsule.capsuleId)) {
      const cueNodeId = `cue:${capsule.capsuleId}`;
      nodes.push({
        id: cueNodeId,
        kind: 'cue',
        label: cueText.slice(0, 50),
        evidence: `${capsuleFieldRef}.problem: ${cueText.slice(0, 100)}`,
      });
      extractedCues.add(capsule.capsuleId);

      // Skill has cue (co-occurs-with, soft)
      edges.push({
        id: `edge:${skillNodeId}:cue:${cueNodeId}`,
        sourceNodeId: skillNodeId,
        targetNodeId: cueNodeId,
        relationType: 'co-occurs-with',
        strength: 'soft',
        evidence: `${capsuleFieldRef}: extracted from capsule`,
      });
    }

    // Extract tools from capsule labels
    for (const label of capsule.labels) {
      const lowerLabel = label.toLowerCase().replace(/[-_.]/g, '');
      if (TOOL_KEYWORDS.has(lowerLabel) && !extractedTools.has(lowerLabel)) {
        const toolNodeId = `tool:${lowerLabel}`;
        nodes.push({
          id: toolNodeId,
          kind: 'tool',
          label: label,
          evidence: `${capsuleFieldRef}.labels: ${label}`,
        });
        extractedTools.add(lowerLabel);
      }
    }

    // Extract environments from capsule text
    const capsuleWords = capsuleText.toLowerCase().split(/\s+/);
    for (const word of capsuleWords) {
      const cleanWord = word.replace(/[^a-z]/g, '');
      if (ENVIRONMENT_KEYWORDS.has(cleanWord) && !extractedEnvironments.has(cleanWord)) {
        const envNodeId = `environment:${cleanWord}`;
        nodes.push({
          id: envNodeId,
          kind: 'environment',
          label: cleanWord,
          evidence: `${capsuleFieldRef}: ${cleanWord}`,
        });
        extractedEnvironments.add(cleanWord);
      }
    }

    // Extract mitigation from goal/content
    const goalText = capsule.goal || capsule.content;
    if (goalText) {
      // Check if this is a mitigation (addresses a problem)
      const mitigationNodeId = `mitigation:${capsule.capsuleId}`;
      if (!extractedMitigations.has(mitigationNodeId)) {
        nodes.push({
          id: mitigationNodeId,
          kind: 'mitigation',
          label: goalText.slice(0, 50),
          evidence: `${capsuleFieldRef}.goal: ${goalText.slice(0, 100)}`,
        });
        extractedMitigations.add(mitigationNodeId);

        // Check strength based on language
        const isHard = containsHardLanguage(goalText) || containsHardLanguage(capsule.content);

        edges.push({
          id: `edge:${skillNodeId}:mitigates:${mitigationNodeId}`,
          sourceNodeId: skillNodeId,
          targetNodeId: mitigationNodeId,
          relationType: 'mitigates',
          strength: isHard ? 'hard' : 'soft',
          evidence: `${capsuleFieldRef}: ${isHard ? 'mandatory' : 'optional'} mitigation`,
        });
      }
    }

    // Check for prerequisites in situation/goal
    const prereqText = capsule.situation || capsule.goal;
    if (prereqText && containsHardLanguage(prereqText)) {
      const prereqNodeId = `prerequisite:${capsule.capsuleId}`;
      if (!extractedPrerequisites.has(prereqNodeId)) {
        nodes.push({
          id: prereqNodeId,
          kind: 'prerequisite',
          label: prereqText.slice(0, 50),
          evidence: `${capsuleFieldRef}: prerequisite detected`,
        });
        extractedPrerequisites.add(prereqNodeId);

        edges.push({
          id: `edge:${skillNodeId}:requires:${prereqNodeId}`,
          sourceNodeId: skillNodeId,
          targetNodeId: prereqNodeId,
          relationType: 'requires',
          strength: 'hard',
          evidence: `${capsuleFieldRef}: mandatory prerequisite`,
        });
      }
    }

    // Check for ordering constraints
    if (capsule.situation?.toLowerCase().includes('before')) {
      const orderNodeId = `prerequisite:${capsule.capsuleId}:order`;
      if (!extractedPrerequisites.has(orderNodeId)) {
        nodes.push({
          id: orderNodeId,
          kind: 'prerequisite',
          label: 'Ordering constraint',
          evidence: `${capsuleFieldRef}.situation: before detected`,
        });
        extractedPrerequisites.add(orderNodeId);

        edges.push({
          id: `edge:${skillNodeId}:order:${orderNodeId}`,
          sourceNodeId: skillNodeId,
          targetNodeId: orderNodeId,
          relationType: 'order',
          strength: 'hard',
          evidence: `${capsuleFieldRef}.situation: ordering constraint`,
        });
      }
    }

    // Check for risk-blocks in problem text
    if (capsule.problem && containsHardLanguage(capsule.problem)) {
      const riskNodeId = `prerequisite:${capsule.capsuleId}:risk`;
      if (!extractedPrerequisites.has(riskNodeId)) {
        nodes.push({
          id: riskNodeId,
          kind: 'prerequisite',
          label: 'Risk constraint',
          evidence: `${capsuleFieldRef}.problem: risk detected`,
        });
        extractedPrerequisites.add(riskNodeId);

        edges.push({
          id: `edge:${skillNodeId}:risk-blocks:${riskNodeId}`,
          sourceNodeId: skillNodeId,
          targetNodeId: riskNodeId,
          relationType: 'risk-blocks',
          strength: 'hard',
          evidence: `${capsuleFieldRef}.problem: blocking risk`,
        });
      }
    }
  }

  return { nodes, edges };
}

// ---------------------------------------------------------------------------
// Document building
// ---------------------------------------------------------------------------

/**
 * Build a complete skill graph document from an approved artifact.
 *
 * This function:
 * - Reads only latestRevision.derived.profile and latestRevision.derived.capsules
 * - Does NOT read clientManifest.assets or clientManifest.scripts (D-01, D-02)
 * - Calls extractSkillGraphPrimitives to build nodes and edges
 * - Returns a GraphIndexDocumentRecord ready for persistence
 */
export async function buildSkillGraphDocument(
  artifact: SkillArtifactRecord,
  chat?: ChatProvider,
): Promise<GraphIndexDocumentRecord | null> {
  const derived = artifact.latestRevision.derived;

  // Skip if no derived content
  if (!derived) {
    return null;
  }

  // Extract profile data (D-01: profile.summary, profile.keywords)
  const profile = derived.profile
    ? {
        title: derived.profile.title,
        summary: derived.profile.summary,
        keywords: derived.profile.keywords,
      }
    : null;

  // Extract capsules data (D-01: situation, problem, goal, content, labels)
  const capsules = derived.capsules.map((c) => ({
    capsuleId: c.capsuleId,
    situation: c.situation,
    problem: c.problem,
    goal: c.goal,
    content: c.content,
    labels: c.labels,
  }));

  // Build canonical text for LLM extraction (same sources as rule engine)
  const canonicalText = [
    profile?.summary ?? '',
    ...(profile?.keywords ?? []),
    ...capsules.flatMap((c) => [c.situation, c.problem, c.goal, c.content, ...c.labels]),
  ].join('\n');

  let nodes: GraphNodeRecord[];
  let edges: GraphEdgeRecord[];

  if (chat?.isConfigured) {
    // LLM extraction with rule engine fallback
    const llmResult = await extractGraphEntitiesWithLLM(chat, canonicalText, { llmEnabled: true });
    nodes = llmResult.nodes;
    edges = llmResult.edges;
  } else {
    // Rule-based extraction
    const primitives = extractSkillGraphPrimitives({
      artifactId: artifact.id,
      profile,
      capsules,
    });
    nodes = primitives.nodes.map((n) => ({
      id: n.id,
      kind: n.kind,
      label: n.label,
      evidence: n.evidence,
    }));
    edges = primitives.edges.map((e) => ({
      id: e.id,
      sourceNodeId: e.sourceNodeId,
      targetNodeId: e.targetNodeId,
      relationType: e.relationType,
      strength: e.strength,
      evidence: e.evidence,
    }));
  }

  // Always inject root skill node if not already present
  const skillNodeId = `skill:${artifact.id}`;
  if (!nodes.some((n) => n.id === skillNodeId)) {
    nodes.unshift({
      id: skillNodeId,
      kind: 'skill',
      label: profile?.title ?? 'Skill',
      evidence: profile?.summary
        ? `profile.summary: ${profile.summary.slice(0, 200)}`
        : 'skill root node',
    });
  }

  // Compute derived text hash for verification
  const derivedTextHash = createHash('sha256').update(canonicalText).digest('hex');

  // Build the document input
  const input: SkillGraphDocumentInput = {
    artifactId: artifact.id,
    revision: artifact.latestRevision.revision,
    teamId: artifact.teamId,
    scope: artifact.scope,
    requiredLevel: artifact.requiredLevel,
    nodes,
    edges,
    derivedTextHash,
  };

  return buildSkillGraphDocumentRecord(input);
}

// ---------------------------------------------------------------------------
// Lifecycle mapping
// ---------------------------------------------------------------------------

/**
 * Determine the indexing action for a skill lifecycle transition.
 *
 * @param previousState - The previous lifecycle state
 * @param nextState - The new lifecycle state
 * @returns The index action to perform: 'upsert', 'remove', or 'noop'
 */
export function determineSkillIndexAction(
  _previousState: LifecycleState,
  nextState: LifecycleState,
): 'upsert' | 'remove' | 'noop' {
  // Transition to approved - sync index
  if (nextState === 'approved') {
    return 'upsert';
  }

  // Transition to deactivated - remove index
  if (nextState === 'deactivated') {
    return 'remove';
  }

  // All other transitions are no-ops for indexing
  return 'noop';
}

// ---------------------------------------------------------------------------
// Lifecycle event runner
// ---------------------------------------------------------------------------

/**
 * Run a skill indexing event for a lifecycle transition.
 *
 * This function uses the artifact adapter pipeline for fan-out instead of
 * writing directly to graph-lite/store.
 *
 * Post-commit pattern: Must be called AFTER the transaction commits.
 *
 * @param args - Event arguments
 */
export async function runSkillIndexEvent(args: {
  services: {
    store: SkillShareerStore;
    data: StoreData;
    graphQueryBackend?: GraphQueryBackend;
  };
  artifactId: string;
  previousState: LifecycleState;
  nextState: LifecycleState;
  reason: string;
  adapters: ArtifactGraphAdapter[];
}): Promise<void> {
  const { services, artifactId, previousState, nextState, adapters } = args;
  const { store, data: _data } = services;

  const action = determineSkillIndexAction(previousState, nextState);

  // All modifications must be done within a transaction to persist
  await store.transact(async (txData) => {
    // Find the artifact
    const artifact = txData.skillArtifacts?.find((a) => a.id === artifactId);
    if (!artifact) {
      throw new Error(`Artifact ${artifactId} not found`);
    }

    switch (action) {
      case 'upsert': {
        // Build the graph document
        const doc = await buildSkillGraphDocument(artifact);
        if (!doc) {
          // No derived content, skip indexing
          return;
        }

        // Check for hard dependency cycles before persistence (D-06)
        // Include existing documents excluding this artifact's current document
        const existingDocs = getGraphIndexDocuments(txData).filter(
          (d) => !(d.sourceType === 'skill' && d.sourceId === artifactId),
        );
        const allDocs = [...existingDocs, doc];

        try {
          assertNoHardDependencyCycles(allDocs);
        } catch (error) {
          if (error instanceof Error && error.message === 'hard dependency cycle detected') {
            // Reject the cycle - do not persist
            throw new Error(`Cannot index skill ${artifactId}: hard dependency cycle detected`);
          }
          throw error;
        }

        // Fan out to adapters
        for (const adapter of adapters) {
          await adapter.sync({
            data: txData,
            artifact,
            ...(args.services.graphQueryBackend !== undefined
              ? { graphQueryBackend: args.services.graphQueryBackend }
              : {}),
          });
        }
        break;
      }

      case 'remove': {
        // Remove from all adapters
        for (const adapter of adapters) {
          await adapter.remove({
            data: txData,
            artifactId,
            ...(args.services.graphQueryBackend !== undefined
              ? { graphQueryBackend: args.services.graphQueryBackend }
              : {}),
          });
        }
        break;
      }

      case 'noop':
        // No action needed for this transition
        break;
    }
  });
}
