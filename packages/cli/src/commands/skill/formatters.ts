import type {
  ApplyResolutionResponse,
  CandidateListResponse,
  DuplicateJobBundleResponse,
  ManualResultResponse,
  SkillEditResponse,
  SkillHistoryResponse,
  SkillLookupResponse,
  SkillReviewDecisionResponse,
  SkillReviewQueueResponse,
} from '@trapmap/contracts';

import { stripNewlines } from '@trapmap/cli/lib/sanitize.js';
import { formatCandidateTable } from '@trapmap/cli/lib/skill-utils.js';

/**
 * Format a skill lookup match for text output (Phase 18 SKED-01).
 * Renders artifact-first results without capsule content.
 */
export function formatSkillMatch(match: {
  artifactId: string;
  title: string;
  slug: string;
  labels: string[];
  scope: string;
  requiredLevel: number;
  sourceKind: string;
  score: number;
  reason: string;
}): string {
  const lines = [
    `${match.artifactId}`,
    `Title: ${stripNewlines(match.title)}`,
    `Slug: ${match.slug}`,
    `Labels: ${match.labels.join(', ')}`,
    `Scope: ${match.scope} (level ${match.requiredLevel})`,
    `Source: ${match.sourceKind}`,
    `Score: ${match.score.toFixed(2)}`,
    `Reason: ${stripNewlines(match.reason)}`,
  ];

  return lines.join('\n');
}

/**
 * Format skill lookup response for text output.
 */
export function formatSkillLookupResponse(response: SkillLookupResponse): string {
  if (response.matches.length === 0) {
    return 'No skills found';
  }

  return response.matches.map(formatSkillMatch).join('\n\n');
}

/**
 * Format skill edit response for text output (Phase 19 SKED-02).
 */
export function formatSkillEditResponse(response: SkillEditResponse): string {
  const lines = [
    `Artifact ID: ${response.artifact.id}`,
    `Title: ${response.artifact.title}`,
    `Previous Revision: ${response.previousRevision}`,
    `New Revision: ${response.artifact.latestRevision}`,
    `Lifecycle State: ${response.artifact.lifecycleState}`,
  ];

  if (response.lifecycleTransition) {
    lines.push(
      `Transition: ${response.lifecycleTransition.from} → ${response.lifecycleTransition.to}`,
    );
  }

  return lines.join('\n');
}

/**
 * Format skill history response for text output (Phase 19 SKED-04).
 */
export function formatSkillHistoryResponse(response: SkillHistoryResponse): string {
  const header = [
    `Artifact ID: ${response.artifactId}`,
    `Title: ${response.title}`,
    `Current Revision: ${response.currentRevision}`,
    `Lifecycle State: ${response.lifecycleState}`,
    '',
    'Revision History:',
  ];

  const revisions = response.revisions.map((r) => {
    const submitter = r.submittedBy.handle ?? r.submittedBy.id;
    return `${r.revision}. ${r.submittedAt} by ${submitter} [${r.lifecycleState}]${r.summary ? ` - ${r.summary}` : ''}`;
  });

  return [...header, ...revisions].join('\n');
}

/**
 * Format duplicate job bundle for text output (Phase 34).
 */
export function formatDuplicateJobBundle(response: DuplicateJobBundleResponse): string {
  const lines = [
    `Candidate ID: ${response.candidate.id}`,
    `Source Type: ${response.candidate.sourceType}`,
    `Status: ${response.candidate.status}`,
    `Received: ${response.candidate.receivedAt}`,
    '',
    '=== ORIGINAL PAYLOAD ===',
  ];

  if (response.originalPayload.trap) {
    const trap = response.originalPayload.trap;
    lines.push(
      'Type: Trap',
      `Shortcut: ${trap.shortcut}`,
      `Detail: ${trap.detail.slice(0, 200)}${trap.detail.length > 200 ? '...' : ''}`,
      `Labels: ${trap.labels.join(', ')}`,
    );
  } else if (response.originalPayload.skill) {
    const skill = response.originalPayload.skill;
    lines.push(
      'Type: Skill',
      `Files: ${skill.files.length} file(s)`,
      `Labels: ${skill.metadata.labels.join(', ')}`,
    );
    for (const file of skill.files) {
      lines.push(`  - ${file.path} (${file.sizeBytes} bytes)`);
    }
  }

  lines.push('', '=== MATCHES ===');
  for (const entry of response.matches) {
    const m = entry.match;
    const e = entry.entity;
    lines.push(
      '',
      `Match: ${e.title}`,
      `  ID: ${e.entityId}`,
      `  Type: ${e.entityType}`,
      `  Similarity: ${(m.similarityScore * 100).toFixed(1)}%`,
      `  Match Type: ${m.matchType}`,
    );
    if (e.entityType === 'trap' && e.detail != null) {
      lines.push(`  Detail: ${e.detail.slice(0, 150)}${e.detail.length > 150 ? '...' : ''}`);
    }
  }

  lines.push('', '=== EXPECTED MANUAL RESULT SCHEMA ===');
  for (const field of response.expectedResultSchema.fields) {
    const req = field.required ? 'required' : 'optional';
    lines.push(`  ${field.name} (${field.type}, ${req}): ${field.description}`);
  }

  lines.push(
    '',
    '=== FETCH COMMAND ===',
    `trapmap skill duplicate-job fetch ${response.candidate.id}`,
  );

  return lines.join('\n');
}

/**
 * Format manual result response for text output (Phase 34).
 */
export function formatManualResultResponse(response: ManualResultResponse): string {
  const lines = [
    `Candidate ID: ${stripNewlines(response.candidateId)}`,
    `Decision: ${response.decision}`,
    `Reviewed At: ${response.reviewedAt}`,
    `Next State: ${response.nextState}`,
    '',
    'To fetch this job again:',
    `  trapmap skill duplicate-job fetch ${stripNewlines(response.candidateId)}`,
  ];
  return lines.join('\n');
}

/**
 * Format apply-resolution response for text output (Phase 35).
 */
export function formatApplyResolutionResponse(response: ApplyResolutionResponse): string {
  const lines = [
    `Candidate: ${response.candidateId}`,
    '✅ Resolution applied successfully',
    `Status: ${response.status}`,
    `Decision: ${response.outcome.decision}`,
  ];

  if (response.outcome.decision === 'independent') {
    lines.push(
      `Published as: ${response.outcome.entityType} (${response.outcome.publishedEntityId})`,
    );
  } else {
    lines.push(
      `Merged into: ${response.outcome.entityType} (${response.outcome.mergedIntoEntityId})`,
    );
  }

  if (response.lineage) {
    lines.push(`Lineage ID: ${response.lineage.id}`);
  }

  return lines.join('\n');
}

/**
 * Format skill review queue for text output.
 */
export function formatSkillReviewQueue(response: SkillReviewQueueResponse): string {
  if (response.items.length === 0) {
    return 'Review queue is empty';
  }

  return response.items
    .map(({ artifact, agentReview, lastDecision }) => {
      const lines = [
        `${artifact.id} [${artifact.lifecycleState}]`,
        `Title: ${artifact.title}`,
        `Required level: ${artifact.requiredLevel}`,
        `Owner: ${artifact.owner.handle}`,
        `Agent review: ${agentReview?.status ?? 'none'}`,
        `Last decision: ${lastDecision ? `${lastDecision.decision} (${lastDecision.notes})` : 'none'}`,
      ];
      return lines.join('\n');
    })
    .join('\n\n');
}

/**
 * Format skill review decision response for text output.
 */
export function formatSkillReviewDecisionResponse(response: SkillReviewDecisionResponse): string {
  const lines = [
    `Artifact ID: ${response.artifact.id}`,
    `Title: ${response.artifact.title}`,
    `Previous State: ${response.previousState}`,
    `New State: ${response.newState}`,
  ];
  return lines.join('\n');
}

/**
 * Re-export formatCandidateTable for backward compatibility.
 */
export { formatCandidateTable } from '@trapmap/cli/lib/skill-utils.js';
