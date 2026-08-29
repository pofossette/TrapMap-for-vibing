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
  /** Whether to render numbered Edges section (default: true) */
  showEdges?: boolean;
  /** Whether to render Execution Plan section (default: true) */
  showExecutionPlan?: boolean;
  /** Minimum width for zero-padded numbers, e.g. 3 => 001 (default: 3) */
  numberPadWidth?: number;
}

const DEFAULT_OPTIONS: Required<LoadFormatOptions> = {
  maxContentLength: 2000,
  maxTraps: 10,
  maxSkills: 5,
  showEdges: true,
  showExecutionPlan: true,
  numberPadWidth: 3,
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
 * Format a single trap node as markdown (legacy helper kept for single-node rendering).
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
 * Format a single skill node as markdown (legacy helper kept for single-node rendering).
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

// ---------------------------------------------------------------------------
// Numbered graph helpers — global [001] indexing for nodes / [E001] for edges
// ---------------------------------------------------------------------------

type NumberedNode =
  | {
      kind: 'trap';
      num: string;
      nodeId: string;
      label: string;
      severity: string;
      scope: string;
      requiredLevel: number;
      score: number;
      evidence: string;
      sourceId: string;
    }
  | {
      kind: 'skill';
      num: string;
      nodeId: string;
      label: string;
      scope: string;
      requiredLevel: number;
      score: number;
      situation: string;
      problem: string;
      goal: string;
      artifactId: string;
      capsuleId?: string | undefined;
      activationRefs: PlanSkillNode['activationRefs'];
    };

function padNumber(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

function resolveNumberWidth(total: number, configured: number): number {
  return Math.max(configured, String(total).length);
}

function collectNumberedNodes(
  response: GraphPlanSearchResponse,
  opts: Required<LoadFormatOptions>,
): { numberedNodes: NumberedNode[]; nodeIdToNum: Map<string, string>; truncated: boolean } {
  const plan = response.plan;
  if (!plan) return { numberedNodes: [], nodeIdToNum: new Map(), truncated: false };

  // Prefer unified graph.nodes when available — it is the authoritative additive view.
  // Fallback to the split arrays.
  const rawNodes: Array<{ kind: 'trap' | 'skill'; nodeId: string; raw: unknown }> = [];
  const graphNodes = (plan.graph?.nodes ?? []).filter((n): n is NonNullable<typeof n> => n != null);
  if (graphNodes.length > 0) {
    for (const n of graphNodes) {
      if (n?.nodeId) rawNodes.push({ kind: n.kind, nodeId: n.nodeId, raw: n });
    }
  } else {
    for (const t of (plan.blockingTraps ?? []).filter((x): x is NonNullable<typeof x> => x != null))
      if (t?.nodeId) rawNodes.push({ kind: 'trap', nodeId: t.nodeId, raw: t });
    for (const s of (plan.recommendedSkills ?? []).filter(
      (x): x is NonNullable<typeof x> => x != null,
    ))
      if (s?.nodeId) rawNodes.push({ kind: 'skill', nodeId: s.nodeId, raw: s });
  }

  // Determine display order: executionPlan rank is the canonical topological order.
  const rankByNodeId = new Map<string, number>();
  for (const step of (plan.executionPlan ?? []).filter(
    (x): x is NonNullable<typeof x> => x != null,
  ))
    if (step?.nodeId) rankByNodeId.set(step.nodeId, step.rank);
  const scoreByNodeId = new Map<string, number>();
  for (const t of (plan.blockingTraps ?? []).filter((x): x is NonNullable<typeof x> => x != null))
    if (t?.nodeId) scoreByNodeId.set(t.nodeId, t.score);
  for (const s of (plan.recommendedSkills ?? []).filter(
    (x): x is NonNullable<typeof x> => x != null,
  ))
    if (s?.nodeId) scoreByNodeId.set(s.nodeId, s.score);
  for (const g of graphNodes) if (g?.nodeId) scoreByNodeId.set(g.nodeId, g.score);

  rawNodes.sort((a, b) => {
    const ra = rankByNodeId.get(a.nodeId);
    const rb = rankByNodeId.get(b.nodeId);
    if (ra !== undefined && rb !== undefined) return ra - rb;
    if (ra !== undefined) return -1;
    if (rb !== undefined) return 1;
    // No rank: traps first, then higher score.
    if (a.kind !== b.kind) return a.kind === 'trap' ? -1 : 1;
    return (scoreByNodeId.get(b.nodeId) ?? 0) - (scoreByNodeId.get(a.nodeId) ?? 0);
  });

  // Apply per-kind limits globally but keep a unified count for numbering.
  // Slice traps/skills separately to preserve backward-compatible limits, then
  // re-interleave in the chosen order.
  const trapsFiltered = (plan.blockingTraps ?? []).filter(
    (x): x is NonNullable<typeof x> => x != null,
  );
  const skillsFiltered = (plan.recommendedSkills ?? []).filter(
    (x): x is NonNullable<typeof x> => x != null,
  );
  const trapIdsLimited = new Set(trapsFiltered.slice(0, opts.maxTraps).map((t) => t.nodeId));
  const skillIdsLimited = new Set(skillsFiltered.slice(0, opts.maxSkills).map((s) => s.nodeId));
  const usingGraph = graphNodes.length > 0;
  // When using graph, apply unified cap = maxTraps + maxSkills but still respect kind quotas
  // by filtering afterwards.
  let filtered = rawNodes;
  if (!usingGraph) {
    // rawNodes already limited via quotas above
    filtered = rawNodes.filter((n) => {
      if (n.kind === 'trap') return trapIdsLimited.has(n.nodeId);
      return skillIdsLimited.has(n.nodeId);
    });
  } else {
    // Graph mode: enforce the same quotas but on graph nodes
    const allowed = new Set<string>([...trapIdsLimited, ...skillIdsLimited]);
    // If graph contains nodes not in the split arrays (e.g. co-occurs only), keep them
    // up to the unified budget to avoid hiding structure.
    const unifiedBudget = opts.maxTraps + opts.maxSkills;
    filtered = rawNodes.filter((n) => allowed.has(n.nodeId) || filtered.length <= unifiedBudget);
    // Hard cap by unified budget after quota filtering
    const quotaFiltered = rawNodes.filter((n) => allowed.has(n.nodeId));
    const extra = rawNodes
      .filter((n) => !allowed.has(n.nodeId))
      .slice(0, Math.max(0, unifiedBudget - quotaFiltered.length));
    filtered = [...quotaFiltered, ...extra].sort((a, b) => {
      const ra = rankByNodeId.get(a.nodeId);
      const rb = rankByNodeId.get(b.nodeId);
      if (ra !== undefined && rb !== undefined) return ra - rb;
      if (ra !== undefined) return -1;
      if (rb !== undefined) return 1;
      if (a.kind !== b.kind) return a.kind === 'trap' ? -1 : 1;
      return (scoreByNodeId.get(b.nodeId) ?? 0) - (scoreByNodeId.get(a.nodeId) ?? 0);
    });
    if (filtered.length > unifiedBudget) filtered = filtered.slice(0, unifiedBudget);
  }

  const totalOriginal = graphNodes.length > 0 ? graphNodes.length : rawNodes.length;
  const truncated = filtered.length < totalOriginal;

  const width = resolveNumberWidth(filtered.length, opts.numberPadWidth);
  const numberedNodes: NumberedNode[] = [];
  const nodeIdToNum = new Map<string, string>();

  for (let i = 0; i < filtered.length; i++) {
    const entry = filtered[i];
    if (!entry) continue;
    const num = padNumber(i + 1, width);
    nodeIdToNum.set(entry.nodeId, num);
    if (entry.kind === 'trap') {
      const raw = entry.raw as PlanTrapNode & { kind?: string };
      numberedNodes.push({
        kind: 'trap',
        num,
        nodeId: raw.nodeId,
        label: raw.label,
        severity: raw.severity,
        scope: raw.scope,
        requiredLevel: raw.requiredLevel,
        score: raw.score,
        evidence: raw.evidence,
        sourceId: raw.sourceId,
      });
    } else {
      const raw = entry.raw as PlanSkillNode & { kind?: string };
      numberedNodes.push({
        kind: 'skill',
        num,
        nodeId: raw.nodeId,
        label: raw.label,
        scope: raw.scope,
        requiredLevel: raw.requiredLevel,
        score: raw.score,
        situation: raw.situation,
        problem: raw.problem,
        goal: raw.goal,
        artifactId: raw.artifactId,
        capsuleId: raw.capsuleId,
        activationRefs: raw.activationRefs,
      });
    }
  }

  return { numberedNodes, nodeIdToNum, truncated };
}

function formatNumberedTrap(node: NumberedNode & { kind: 'trap' }, maxLen: number): string {
  const severityLabel = node.severity === 'hard' ? '[HARD]' : '[SOFT]';
  const evidence = truncate(escapeMarkdown(node.evidence), maxLen);
  const header = `[${node.num}] [trap]${severityLabel} ${escapeMarkdown(node.label)} (score: ${node.score.toFixed(2)})`;
  const lines = [
    `**${header}**`,
    `> ${evidence}`,
    `- Node: \`${node.nodeId}\` | Source: \`${node.sourceId}\` | Scope: \`${node.scope}\` | Level: ${node.requiredLevel}`,
  ];
  return lines.join('\n');
}

function formatNumberedSkill(node: NumberedNode & { kind: 'skill' }, maxLen: number): string {
  const situation = truncate(escapeMarkdown(node.situation), maxLen);
  const problem = truncate(escapeMarkdown(node.problem), maxLen);
  const goal = truncate(escapeMarkdown(node.goal), maxLen);
  const header = `[${node.num}] [skill] ${escapeMarkdown(node.label)} (score: ${node.score.toFixed(2)})`;
  const lines = [
    `**${header}**`,
    `- Node: \`${node.nodeId}\` | Source: \`${node.artifactId}\`${node.capsuleId ? ` | Capsule: \`${node.capsuleId}\`` : ''} | Scope: \`${node.scope}\` | Level: ${node.requiredLevel}`,
    `- Situation: ${situation}`,
    `- Problem: ${problem}`,
    `- Goal: ${goal}`,
  ];
  const refs = node.activationRefs;
  if (refs.references.length > 0) {
    lines.push(`- References: ${refs.references.map((r) => `\`${r.path}\``).join(', ')}`);
  }
  if (refs.assets.length > 0) {
    lines.push(`- Assets: ${refs.assets.map((a) => `\`${a.path}\``).join(', ')}`);
  }
  if (refs.scripts.length > 0) {
    lines.push(
      `- Scripts: ${refs.scripts.map((s) => `\`${s.path}\` (${s.defaultPolicy})`).join(', ')}`,
    );
  }
  return lines.join('\n');
}

function formatEdgesSection(
  response: GraphPlanSearchResponse,
  nodeIdToNum: Map<string, string>,
  opts: Required<LoadFormatOptions>,
): string | null {
  const plan = response.plan;
  const edges = (plan?.edges ?? []).filter((e): e is NonNullable<typeof e> => e != null);
  if (!plan || edges.length === 0) return null;
  // Prefer plan.edges but also include graph.edges if it carries extra types like co-occurs-with
  const edgeCount = edges.length;
  const width = resolveNumberWidth(edgeCount, opts.numberPadWidth);
  // Build a quick label lookup for "content xxxx"
  const labelById = new Map<string, string>();
  for (const t of (plan.blockingTraps ?? []).filter((x): x is NonNullable<typeof x> => x != null))
    if (t?.nodeId) labelById.set(t.nodeId, t.label);
  for (const s of (plan.recommendedSkills ?? []).filter(
    (x): x is NonNullable<typeof x> => x != null,
  ))
    if (s?.nodeId) labelById.set(s.nodeId, s.label);
  for (const g of (plan.graph?.nodes ?? []).filter((x): x is NonNullable<typeof x> => x != null))
    if ((g as any)?.nodeId) labelById.set((g as any).nodeId, (g as any).label);

  const lines = edges.map((edge, idx) => {
    const num = `E${padNumber(idx + 1, width)}`;
    const srcNum = nodeIdToNum.get(edge.sourceNodeId) ?? '?';
    const tgtNum = nodeIdToNum.get(edge.targetNodeId) ?? '?';
    const srcLabel = truncate(
      escapeMarkdown(labelById.get(edge.sourceNodeId) ?? edge.sourceNodeId),
      80,
    );
    const tgtLabel = truncate(
      escapeMarkdown(labelById.get(edge.targetNodeId) ?? edge.targetNodeId),
      80,
    );
    const arrow = `--${edge.type}[${edge.strength}]-->`;
    // 形如：- [E001] [001] --mitigates[hard]--> [003] : "源内容 xxxx" → "目标内容 xxxx"
    return `- [${num}] [${srcNum}] ${arrow} [${tgtNum}] : "${srcLabel}" → "${tgtLabel}" | id: \`${edge.id}\``;
  });
  return lines.join('\n');
}

function formatExecutionPlanSection(
  response: GraphPlanSearchResponse,
  nodeIdToNum: Map<string, string>,
): string | null {
  const plan = response.plan;
  const steps = (plan?.executionPlan ?? []).filter((x): x is NonNullable<typeof x> => x != null);
  if (!plan || steps.length === 0) return null;
  const lines = [...steps]
    .sort((a, b) => a.rank - b.rank)
    .map((step, idx) => {
      const num = nodeIdToNum.get(step.nodeId) ?? '?';
      const blocked =
        (step.blockedBy ?? []).length === 0
          ? '-'
          : (step.blockedBy ?? []).map((id) => `[${nodeIdToNum.get(id) ?? '?'}]`).join(', ');
      const kindLabel = step.kind === 'trap-mitigation' ? 'trap-mitigation' : 'skill';
      return `${idx + 1}. [${num}] ${kindLabel} (rank ${step.rank}, blockedBy: ${blocked}) — ${escapeMarkdown(step.label)} — \`${step.nodeId}\``;
    });
  return lines.join('\n');
}

function formatCitationsSection(
  response: GraphPlanSearchResponse,
  _opts: Required<LoadFormatOptions>,
): string | null {
  const plan = response.plan;
  const cites = (plan?.citations ?? []).filter((x): x is NonNullable<typeof x> => x != null);
  if (!plan || cites.length === 0) return null;
  const lines = cites.map((c, i) => {
    const label = truncate(escapeMarkdown(c.label), 120);
    return `${i + 1}. [${c.sourceKind}] "${label}" — \`${c.sourceId}\` | Scope: \`${c.scope}\` | score: ${c.score.toFixed(2)}`;
  });
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
 *
 * New structure (numbered graph):
 *   - Nodes (001..) — unified, globally numbered, with content xxxx
 *   - Edges [E001] [001] --type[strength]--> [002] : "src xxxx" → "tgt xxxx"
 *   - Execution Plan — topo rank with [num] and blockedBy → [num]
 * Keeps full backward compatibility for --json and fallback modes.
 */
export function formatLoadContext(
  response: GraphPlanSearchResponse,
  options: LoadFormatOptions = {},
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const sections: string[] = ['<!-- trapmap-load-context -->', '## TrapMap Context'];

  const hasPlanNodes =
    response.plan != null &&
    ((response.plan.blockingTraps?.length ?? 0) > 0 ||
      (response.plan.recommendedSkills?.length ?? 0) > 0 ||
      (response.plan.graph?.nodes?.length ?? 0) > 0 ||
      (response.plan.edges?.length ?? 0) > 0 ||
      (response.plan.executionPlan?.length ?? 0) > 0);

  if (hasPlanNodes && response.plan) {
    const { numberedNodes, nodeIdToNum, truncated } = collectNumberedNodes(response, opts);

    // --- Nodes: unified numbered view where 1 编号为 001, 内容为 xxxx ---
    if (numberedNodes.length > 0) {
      sections.push('');
      sections.push(`### Nodes (${numberedNodes.length})`);
      const nodeLines = numberedNodes.map((node) => {
        if (node.kind === 'trap') return formatNumberedTrap(node, opts.maxContentLength);
        return formatNumberedSkill(node, opts.maxContentLength);
      });
      sections.push(nodeLines.join('\n\n'));
      if (truncated) {
        const graphLen = response.plan.graph?.nodes?.length ?? 0;
        const total =
          graphLen > 0
            ? graphLen
            : (response.plan.blockingTraps?.length ?? 0) +
              (response.plan.recommendedSkills?.length ?? 0);
        sections.push(
          `_...and ${Math.max(0, total - numberedNodes.length)} more nodes (use --max-traps/--skill-budget to expand)_`,
        );
      }
    }

    // --- Edges: 指向更清晰的显式箭头，内容为 xxxx ---
    if (opts.showEdges) {
      const edgeSection = formatEdgesSection(response, nodeIdToNum, opts);
      if (edgeSection) {
        sections.push('');
        sections.push(`### Edges (${response.plan.edges.length})`);
        sections.push(edgeSection);
      }
    }

    // --- Execution Plan: rank + blockedBy 指向编号 ---
    if (opts.showExecutionPlan) {
      const execSection = formatExecutionPlanSection(response, nodeIdToNum);
      if (execSection) {
        sections.push('');
        sections.push('### Execution Plan');
        sections.push(execSection);
      }
    }

    // --- Citations (supporting evidence not promoted to nodes) ---
    const citationSection = formatCitationsSection(response, opts);
    if (citationSection) {
      sections.push('');
      sections.push('### Citations');
      sections.push(citationSection);
    }
  } else {
    // Legacy fallback when no graph plan (kept for empty-plan / no-plan cases)
    // Keep old per-kind lists only for truly empty graph to avoid surprise.
    const legacyTraps = (response.plan?.blockingTraps ?? []).filter(
      (x): x is NonNullable<typeof x> => x != null,
    );
    const legacySkills = (response.plan?.recommendedSkills ?? []).filter(
      (x): x is NonNullable<typeof x> => x != null,
    );
    if (legacyTraps.length > 0) {
      sections.push('');
      sections.push('### Blocking Traps');
      const traps = legacyTraps.slice(0, opts.maxTraps);
      sections.push(traps.map((t) => formatTrapNode(t, opts.maxContentLength)).join('\n\n'));
      if (legacyTraps.length > opts.maxTraps) {
        sections.push(`_...and ${Math.max(0, legacyTraps.length - opts.maxTraps)} more traps_`);
      }
    }
    if (legacySkills.length > 0) {
      sections.push('');
      sections.push('### Recommended Skills');
      const skills = legacySkills.slice(0, opts.maxSkills);
      sections.push(skills.map((s) => formatSkillNode(s, opts.maxContentLength)).join('\n\n'));
      if (legacySkills.length > opts.maxSkills) {
        sections.push(`_...and ${Math.max(0, legacySkills.length - opts.maxSkills)} more skills_`);
      }
    }
  }

  // Format fallback if no plan or plan is empty
  if (
    response.fallback &&
    (!response.plan ||
      ((response.plan.blockingTraps?.length ?? 0) === 0 &&
        (response.plan.recommendedSkills?.length ?? 0) === 0 &&
        (response.plan.graph?.nodes?.length ?? 0) === 0))
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
