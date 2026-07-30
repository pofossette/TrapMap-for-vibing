/**
 * Build a complete skill graph document from an approved skill artifact.
 *
 * This module provides buildSkillGraphDocument, which reads derived.profile
 * and derived.capsules from an artifact, extracts graph nodes/edges via LLM
 * or rule-based path, and returns a GraphIndexDocumentRecord.
 *
 * Extracted from skill-events.ts during refactor to reduce file complexity.
 *
 * T-36-09: Build graph text only from derived.profile and derived.capsules
 * T-36-10: Persist teamId, scope, requiredLevel from artifact root
 * Security note: This module reads only derived outputs, never raw asset/script bodies.
 */

import { createHash } from 'node:crypto';

import type {
  ArtifactIndexingEntry,
  GraphEdgeRecord,
  GraphIndexDocumentRecord,
  GraphNodeRecord,
} from '@trapmap/contracts';
import type { ChatProvider } from '@trapmap/ai-providers';
import type { Pool } from 'pg';
import { createLabelReadProjection } from '@trapmap/server/lib/labels/repository.js';
import { type SkillArtifactRecord } from '@trapmap/server/lib/store.js';
import {
  type SkillGraphDocumentInput,
  buildSkillGraphDocument as buildSkillGraphDocumentRecord,
  extractGraphEntitiesWithLLM,
} from './graph-lite/index.js';
import { extractSkillGraphPrimitives } from './skill-extract.js';

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
  artifact: SkillArtifactRecord | ArtifactIndexingEntry,
  chat?: ChatProvider,
  pool?: Pool | null,
): Promise<GraphIndexDocumentRecord | null> {
  // Legacy artifacts expose `latestRevision.derived`; owner projections expose
  // the same derived revision as a flat, intentionally minimal index payload.
  const indexingEntry: ArtifactIndexingEntry =
    'latestRevision' in artifact
      ? {
          id: artifact.id,
          teamId: artifact.teamId,
          scope: artifact.scope,
          labels: artifact.labels,
          title: artifact.title,
          requiredLevel: artifact.requiredLevel,
          lifecycleState: artifact.lifecycleState,
          revision: artifact.latestRevision.revision,
          derived: artifact.latestRevision.derived,
        }
      : artifact;
  const derived = indexingEntry.derived;

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

  // Build canonical text for LLM extraction from approved derived skill text.
  const canonicalText = [
    profile?.summary ?? '',
    ...(profile?.keywords ?? []),
    ...capsules.flatMap((c) =>
      [c.situation, c.problem, c.goal, c.content, ...c.labels].filter(
        (value): value is string => typeof value === 'string' && value.length > 0,
      ),
    ),
  ].join('\n');

  let nodes: GraphNodeRecord[];
  let edges: GraphEdgeRecord[];

  if (chat?.isConfigured) {
    // LLM extraction path
    const llmResult = await extractGraphEntitiesWithLLM(chat, canonicalText, {
      llmEnabled: true,
      alignmentService: pool
        ? {
            chat,
            repository: createLabelReadProjection({ pool }),
            sourceContext: 'skill-extraction',
          }
        : null,
    });
    nodes = llmResult.nodes;
    edges = llmResult.edges;
  } else {
    // Rule-based extraction
    const primitives = extractSkillGraphPrimitives({
      artifactId: indexingEntry.id,
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
  const skillNodeId = `skill:${indexingEntry.id}`;
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
    artifactId: indexingEntry.id,
    revision: indexingEntry.revision,
    teamId: indexingEntry.teamId,
    scope: indexingEntry.scope,
    requiredLevel: indexingEntry.requiredLevel,
    nodes,
    edges,
    derivedTextHash,
  };

  return buildSkillGraphDocumentRecord(input);
}
