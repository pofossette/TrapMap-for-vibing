import type {
  GraphPlanRoutingTrace,
  GraphPlanSearchResponse,
  PlanSkillNode,
  PlanTrapNode,
  RetrievalMatch,
} from '@trapmap/contracts';
import { truncate } from '@trapmap/lib';

/** Configuration for markdown formatting */
export interface LoadFormatOptions {
  /** Maximum characters for capsule content sections (default: 2000) */
  maxContentLength?: number;
  /** Maximum number of traps to display (default: 10) */
  maxTraps?: number;
  /** Maximum number of skills to display (default: 5) */
  maxSkills?: number;
}

const DEFAULT_OPTIONS: Required<LoadFormatOptions> = {
  maxContentLength: 2000,
  maxTraps: 10,
  maxSkills: 5,
};

/**
 * Escape special markdown characters in text.
 * Prevents accidental formatting injection from knowledge content.
 */
export function escapeMarkdown(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\*/g, '\\*')
    .replace(/_/g, '\\_')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]');
}

/**
 * Format a single trap node as markdown.
 */
function formatTrapNode(trap: PlanTrapNode, maxLen: number): string {
  const severityLabel = trap.severity === 'hard' ? '[HARD]' : '[SOFT]';
  const evidence = truncate(escapeMarkdown(trap.evidence), maxLen);
  const lines = [
    `**${severityLabel} ${escapeMarkdown(trap.label)}**`,
    `> ${evidence}`,
    `- Source: \`${trap.sourceId}\``,
  ];
  return lines.join('\n');
}

/**
 * Format a single skill node as markdown.
 */
function formatSkillNode(skill: PlanSkillNode, maxLen: number): string {
  const situation = truncate(escapeMarkdown(skill.situation), maxLen);
  const problem = truncate(escapeMarkdown(skill.problem), maxLen);
  const goal = truncate(escapeMarkdown(skill.goal), maxLen);

  const lines = [
    `**${escapeMarkdown(skill.label)}** (score: ${skill.score.toFixed(2)})`,
    `- Situation: ${situation}`,
    `- Problem: ${problem}`,
    `- Goal: ${goal}`,
  ];

  // Add activation references if present
  const refs = skill.activationRefs;
  if (refs.references.length > 0) {
    const refPaths = refs.references.map((r) => `\`${r.path}\``).join(', ');
    lines.push(`- References: ${refPaths}`);
  }
  if (refs.assets.length > 0) {
    const assetPaths = refs.assets.map((a) => `\`${a.path}\``).join(', ');
    lines.push(`- Assets: ${assetPaths}`);
  }
  if (refs.scripts.length > 0) {
    const scriptInfo = refs.scripts.map((s) => `\`${s.path}\` (${s.defaultPolicy})`).join(', ');
    lines.push(`- Scripts: ${scriptInfo}`);
  }

  lines.push(`- Source: \`${skill.artifactId}\``);
  return lines.join('\n');
}

/**
 * Format routing trace as markdown section.
 */
function formatRoutingTrace(trace: GraphPlanRoutingTrace): string {
  const channels =
    trace.channelsUsed && trace.channelsUsed.length > 0 ? trace.channelsUsed.join(', ') : 'unknown';
  const lines = [
    `- Mode: ${trace.selectedMode}`,
    `- Confidence: ${trace.confidenceScore.toFixed(2)} (${trace.confidenceBucket})`,
    `- Channels: ${channels}`,
  ];
  if (trace.fallbackTarget) {
    lines.push(`- Fallback: ${trace.fallbackTarget}`);
  }
  return lines.join('\n');
}

/**
 * Format capsule fallback as markdown.
 */
function formatCapsuleFallback(
  fallback: {
    routeFamily: 'capsule';
    response: {
      capsules: Array<{
        capsuleId: string;
        artifactId: string;
        situation: string | null;
        problem: string | null;
        goal: string | null;
        labels: string[];
        scope: string;
        score: number;
        reason: string;
      }>;
    };
  },
  maxLen: number,
  maxCapsules: number,
): string {
  const capsules = fallback.response.capsules.slice(0, maxCapsules);
  if (capsules.length === 0) return 'No capsules found.';

  const lines = capsules.map((cap, i) => {
    const situation = truncate(escapeMarkdown(cap.situation ?? 'n/a'), maxLen);
    const problem = truncate(escapeMarkdown(cap.problem ?? 'n/a'), maxLen);
    const goal = truncate(escapeMarkdown(cap.goal ?? 'n/a'), maxLen);
    return [
      `${i + 1}. **${escapeMarkdown(cap.capsuleId)}** (score: ${cap.score.toFixed(2)})`,
      `   - Situation: ${situation}`,
      `   - Problem: ${problem}`,
      `   - Goal: ${goal}`,
      `   - Labels: ${cap.labels.join(', ')}`,
      `   - Scope: ${cap.scope}`,
    ].join('\n');
  });

  if (fallback.response.capsules.length > maxCapsules) {
    lines.push(
      `_...and ${Math.max(0, fallback.response.capsules.length - maxCapsules)} more capsules_`,
    );
  }

  return lines.join('\n\n');
}

function formatEntryFallback(
  fallback: {
    routeFamily: 'entry';
    response: {
      globalConstraints: RetrievalMatch[];
      projectKnowledge: RetrievalMatch[];
    };
  },
  maxLen: number,
  maxEntries: number,
): string {
  const entries = [
    ...fallback.response.globalConstraints.map((entry) => ({
      ...entry,
      bucket: 'Global Constraint',
    })),
    ...fallback.response.projectKnowledge.map((entry) => ({
      ...entry,
      bucket: 'Project Knowledge',
    })),
  ].slice(0, maxEntries);

  if (entries.length === 0) {
    return 'No entries found.';
  }

  const lines = entries.map((entry, index) => {
    const detail = truncate(escapeMarkdown(entry.detail), maxLen);
    const labels = entry.labels.length > 0 ? entry.labels.join(', ') : 'none';
    return [
      `${index + 1}. **${escapeMarkdown(entry.shortcut)}** (${entry.bucket}, score: ${entry.score.toFixed(2)})`,
      `   - Detail: ${detail}`,
      `   - Labels: ${labels}`,
      `   - Source: \`${entry.entryId}\``,
    ].join('\n');
  });

  const totalEntries =
    fallback.response.globalConstraints.length + fallback.response.projectKnowledge.length;
  if (totalEntries > maxEntries) {
    lines.push(`_...and ${Math.max(0, totalEntries - maxEntries)} more entries_`);
  }

  return lines.join('\n\n');
}

/**
 * Format GraphPlanSearchResponse as markdown context block.
 * This is the main entry point for `trapmap load` output formatting.
 */
export function formatLoadContext(
  response: GraphPlanSearchResponse,
  options: LoadFormatOptions = {},
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const sections: string[] = ['<!-- trapmap-load-context -->', '## TrapMap Context'];

  // Format traps from plan
  if (response.plan && response.plan.blockingTraps.length > 0) {
    sections.push('');
    sections.push('### Blocking Traps');
    const traps = response.plan.blockingTraps.slice(0, opts.maxTraps);
    sections.push(
      traps.map((t, i) => `${i + 1}. ${formatTrapNode(t, opts.maxContentLength)}`).join('\n\n'),
    );
    if (response.plan.blockingTraps.length > opts.maxTraps) {
      sections.push(
        `_...and ${Math.max(0, response.plan.blockingTraps.length - opts.maxTraps)} more traps_`,
      );
    }
  }

  // Format skills from plan
  if (response.plan && response.plan.recommendedSkills.length > 0) {
    sections.push('');
    sections.push('### Recommended Skills');
    const skills = response.plan.recommendedSkills.slice(0, opts.maxSkills);
    sections.push(
      skills.map((s, i) => `${i + 1}. ${formatSkillNode(s, opts.maxContentLength)}`).join('\n\n'),
    );
    if (response.plan.recommendedSkills.length > opts.maxSkills) {
      sections.push(
        `_...and ${Math.max(0, response.plan.recommendedSkills.length - opts.maxSkills)} more skills_`,
      );
    }
  }

  // Format fallback if no plan or plan is empty
  if (
    response.fallback &&
    (!response.plan ||
      (response.plan.blockingTraps.length === 0 && response.plan.recommendedSkills.length === 0))
  ) {
    sections.push('');
    if (response.fallback.routeFamily === 'capsule') {
      sections.push('### Capsules (from fallback)');
      sections.push(
        formatCapsuleFallback(response.fallback, opts.maxContentLength, opts.maxSkills),
      );
    } else {
      sections.push('### Entries (from fallback)');
      sections.push(formatEntryFallback(response.fallback, opts.maxContentLength, opts.maxTraps));
    }
  }

  // Handle completely empty response
  if (!response.plan && !response.fallback) {
    sections.push('');
    sections.push('No matching knowledge found.');
  }

  // Always include routing trace
  sections.push('');
  sections.push('### Routing');
  sections.push(formatRoutingTrace(response.routingTrace));

  sections.push('<!-- /trapmap-load-context -->');
  return sections.join('\n');
}
