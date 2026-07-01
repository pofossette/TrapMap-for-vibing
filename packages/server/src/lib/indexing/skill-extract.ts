/**
 * Graph primitive extraction from skill profile/capsule text.
 *
 * This module provides extractSkillGraphPrimitives and supporting types
 * for the rule-based extraction path (no LLM).
 *
 * Extracted from skill-events.ts during refactor to reduce file complexity.
 *
 * T-36-09: Build graph text only from derived.profile and derived.capsules
 * Security note: This module reads only derived outputs, never raw asset/script bodies.
 */

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
    situation: string | null;
    problem: string | null;
    goal: string | null;
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
    const capsuleText = [
      capsule.situation,
      capsule.problem,
      capsule.goal,
      capsule.content,
      capsule.labels.join(' '),
    ]
      .filter((value): value is string => typeof value === 'string' && value.length > 0)
      .join(' ');
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
