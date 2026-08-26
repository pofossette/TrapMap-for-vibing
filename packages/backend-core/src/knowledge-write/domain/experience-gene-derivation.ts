import {
  type ExperienceGene,
  type ExperienceGeneSourceSnapshot,
  type GeneratorMetadata,
  type ValidationIssue,
  experienceGeneSchema,
} from '@trapmap/contracts';
import { sha256CanonicalJson } from '@trapmap/lib';
import { normalizeQuery } from '../../knowledge-read/domain/tokenization.js';
import { scanExperienceGeneSafety } from './experience-gene-safety.js';

export const EXPERIENCE_GENE_RULE_PROMPT_VERSION = 'experience-gene-rule-v1';
const RULE_PROMPT_VERSION = EXPERIENCE_GENE_RULE_PROMPT_VERSION;

export type RuleExtractionResult =
  | { gene: ExperienceGene }
  | { status: 'insufficient-structure'; reason: 'insufficient-structure' };

type SectionName = 'MATCH' | 'GOAL' | 'STRATEGY' | 'AVOID' | 'VERIFY';

const SECTION_NAMES: readonly SectionName[] = ['MATCH', 'GOAL', 'STRATEGY', 'AVOID', 'VERIFY'];

const SECTION_PATTERNS = new Map(
  SECTION_NAMES.map((name) => [
    name,
    {
      heading: new RegExp(`^\\s*(?:#{1,6}\\s*)?(?:\\d+[.)]\\s*)?${name}(?:\\s*:|$)`, 'i'),
      inline: new RegExp(`^\\s*(?:#{1,6}\\s*)?(?:\\d+[.)]\\s*)?${name}\\s*:\\s*(.+)$`, 'i'),
    },
  ]),
);

function sectionName(line: string): SectionName | null {
  for (const [name, pattern] of SECTION_PATTERNS) {
    if (pattern.heading.test(line)) return name;
  }
  return null;
}

function cleanListItem(line: string): string {
  return line
    .trim()
    .replace(/^[-*+]\s+/, '')
    .replace(/^\d+[.)]\s+/, '');
}

function sectionHeadingResult(
  rawLine: string,
  target: SectionName,
  active: boolean,
): { stop: boolean; active: boolean; inlineValue: string | null } {
  const nextName = sectionName(rawLine);
  if (nextName === null) return { stop: false, active, inlineValue: null };

  const nowActive = nextName === target;
  const stop = active && !nowActive;
  const inlineValue = nowActive
    ? (SECTION_PATTERNS.get(target)?.inline.exec(rawLine)?.[1] ?? null)
    : null;
  return { stop, active: nowActive, inlineValue };
}

function sectionLines(text: string, name: SectionName): string[] {
  const collected: string[] = [];
  let active = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const heading = sectionHeadingResult(rawLine, name, active);
    if (heading.stop) break;
    active = heading.active;
    if (heading.inlineValue?.trim()) collected.push(heading.inlineValue.trim());
    if (active && rawLine.trim() && sectionName(rawLine) === null) {
      collected.push(cleanListItem(rawLine));
    }
  }

  return collected;
}

function labelledTrapSections(text: string): Partial<Record<SectionName, string[]>> {
  const aliases: ReadonlyArray<[SectionName, RegExp]> = [
    ['MATCH', /^(?:problem|issue|signal)\s*:\s*/i],
    ['GOAL', /^(?:goal|objective)\s*:\s*/i],
    ['STRATEGY', /^(?:fix|strategy|solution)\s*:\s*/i],
    ['AVOID', /^avoid\s*:\s*/i],
    ['VERIFY', /^(?:verify|verification|test)\s*:\s*/i],
  ];
  const sections: Partial<Record<SectionName, string[]>> = {};

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    for (const [name, pattern] of aliases) {
      const match = pattern.exec(line);
      if (match?.[0]) {
        sections[name] = [...(sections[name] ?? []), line.slice(match[0].length).trim()];
      }
    }
  }

  return sections;
}

function firstSentence(value: string): string {
  const sentence = value.split(/(?<=[.!?])\s+/)[0]?.trim() ?? '';
  return sentence || value.trim();
}

function sourceFromSnapshot(snapshot: ExperienceGeneSourceSnapshot): ExperienceGene['source'] {
  return {
    kind: snapshot.kind,
    sourceId: snapshot.sourceId,
    sourceRevision: snapshot.revision,
    sourceHash: snapshot.sourceHash,
    artifactId: snapshot.kind === 'trap' ? null : snapshot.artifactId,
    capsuleId: snapshot.kind === 'skill-capsule' ? snapshot.capsuleId : null,
    artifactRevision: snapshot.kind === 'trap' ? null : snapshot.artifactRevision,
  };
}

type RuleGeneInput = {
  snapshot: ExperienceGeneSourceSnapshot;
  signalsMatch: string[];
  summary: string;
  strategy: string[];
  avoid: string[];
  validation: string[];
  generator: GeneratorMetadata;
  nowIso: string;
};

function contentProjection(input: RuleGeneInput): Record<string, unknown> {
  const snapshot = input.snapshot;
  return {
    schemaVersion: '1',
    title: snapshot.title,
    signalsMatch: input.signalsMatch,
    summary: input.summary,
    strategy: input.strategy,
    avoid: input.avoid,
    constraints: [],
    validation: input.validation,
    labels: snapshot.labels,
    scope: snapshot.scope,
    teamId: snapshot.teamId,
    requiredLevel: snapshot.requiredLevel,
    source: sourceFromSnapshot(snapshot),
    derivationUnitId: snapshot.derivationUnitId,
    generator: input.generator,
  };
}

function makeGene(input: RuleGeneInput): ExperienceGene {
  const projection = contentProjection(input);
  const { derivationUnitId: _ignoredUnitId, ...geneContent } = projection;
  const contentHash = sha256CanonicalJson(projection);
  const source = sourceFromSnapshot(input.snapshot);
  const idempotencyKey = sha256CanonicalJson({
    sourceType: source.kind,
    sourceId: source.sourceId,
    sourceRevision: source.sourceRevision,
    sourceHash: source.sourceHash,
    derivationUnitId: input.snapshot.derivationUnitId,
    generatorKind: 'rule',
    promptVersion: RULE_PROMPT_VERSION,
    contentHash,
  });

  return experienceGeneSchema.parse({
    geneId: `gene_${idempotencyKey.slice(0, 24)}`,
    status: 'candidate',
    ...geneContent,
    lineage: {
      derivationUnitId: input.snapshot.derivationUnitId,
      parentEventId: null,
      promptVersion: RULE_PROMPT_VERSION,
      priorGeneHash: null,
    },
    indexing: { status: 'pending', lastError: null, updatedAt: input.nowIso },
    contentHash,
    createdAt: input.nowIso,
    updatedAt: input.nowIso,
  });
}

export function extractRuleExperienceGene(input: {
  snapshot: ExperienceGeneSourceSnapshot;
  nowIso: string;
}): RuleExtractionResult {
  const trapLabels =
    input.snapshot.kind === 'trap' ? labelledTrapSections(input.snapshot.text) : {};
  const sections = Object.fromEntries(
    SECTION_NAMES.map((name) => [
      name,
      [...sectionLines(input.snapshot.text, name), ...(trapLabels[name] ?? [])],
    ]),
  ) as Record<SectionName, string[]>;

  if (sections.STRATEGY.length === 0) {
    return { status: 'insufficient-structure', reason: 'insufficient-structure' };
  }

  return {
    gene: makeGene({
      snapshot: input.snapshot,
      signalsMatch:
        sections.MATCH.length > 0
          ? sections.MATCH
          : [firstSentence(`${input.snapshot.title}. ${input.snapshot.text}`)],
      summary: sections.GOAL[0] ?? firstSentence(sections.STRATEGY[0] ?? input.snapshot.text),
      strategy: sections.STRATEGY,
      avoid: sections.AVOID,
      validation: sections.VERIFY,
      generator: { kind: 'rule', model: null, promptVersion: RULE_PROMPT_VERSION },
      nowIso: input.nowIso,
    }),
  };
}

export function createExperienceGeneCandidate(
  input: Omit<RuleGeneInput, 'nowIso'> & { nowIso: string },
): ExperienceGene {
  return makeGene(input);
}

export type ExperienceGeneGate =
  | 'schema'
  | 'compactness'
  | 'fidelity'
  | 'safety'
  | 'governance'
  | 'duplicate';

export type ExperienceGeneValidationResult = {
  valid: boolean;
  firstFailingGate: ExperienceGeneGate | null;
  issues: ValidationIssue[];
};

type SourceGovernance = Pick<
  ExperienceGeneSourceSnapshot,
  'labels' | 'scope' | 'teamId' | 'requiredLevel'
>;

type FidelityOptions = {
  sourceText: string;
  embed?: ((text: string) => Promise<number[]>) | undefined;
};

export type ExperienceGeneDuplicateMatch =
  | { sourceId: string }
  | {
      source: { kind: ExperienceGene['source']['kind']; sourceId: string };
      similarity: number;
    };

export function checkExperienceGeneCompactness(candidate: ExperienceGene): ValidationIssue[] {
  const withinBudget =
    candidate.signalsMatch.length <= 20 &&
    candidate.strategy.length <= 7 &&
    candidate.avoid.length <= 7;
  if (withinBudget) return [];

  return [
    {
      code: 'compactness-budget',
      field: 'signalsMatch/strategy/avoid',
      message: 'Candidate exceeds control-array budgets',
    },
  ];
}

function schemaIssues(candidate: ExperienceGene): ValidationIssue[] {
  const result = experienceGeneSchema.safeParse(candidate);
  if (result.success) return [];
  return result.error.issues.slice(0, 20).map((problem) => ({
    code: 'schema-invalid',
    field: problem.path.join('.') || 'gene',
    message: problem.message,
  }));
}

function lexicalCoverage(sourceText: string, gene: ExperienceGene): number {
  const source = new Set(normalizeQuery(sourceText));
  if (source.size === 0) return 1;
  const candidateText = [
    gene.title,
    ...gene.signalsMatch,
    gene.summary,
    ...gene.strategy,
    ...gene.avoid,
    ...gene.constraints,
    ...gene.validation,
  ].join('\n');
  const covered = normalizeQuery(candidateText).filter((token) => source.has(token));
  return covered.length / source.size;
}

async function embeddingSimilarity(
  left: string,
  right: string,
  embed: (text: string) => Promise<number[]>,
): Promise<number> {
  const [leftVector, rightVector] = await Promise.all([embed(left), embed(right)]);
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let index = 0; index < Math.min(leftVector.length, rightVector.length); index += 1) {
    const leftValue = leftVector[index] ?? 0;
    const rightValue = rightVector[index] ?? 0;
    dot += leftValue * rightValue;
    leftMagnitude += leftValue * leftValue;
    rightMagnitude += rightValue * rightValue;
  }
  if (leftMagnitude === 0 || rightMagnitude === 0) return 0;
  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

async function fidelityIssue(
  gene: ExperienceGene,
  options: FidelityOptions,
): Promise<ValidationIssue[]> {
  let coverage = lexicalCoverage(options.sourceText, gene);
  if (coverage < 0.3 && options.embed) {
    coverage = await embeddingSimilarity(gene.summary, options.sourceText, options.embed);
  }
  if (coverage >= (options.embed ? 0.5 : 0.3)) return [];
  return [
    {
      code: 'source-fidelity-low',
      field: 'summary',
      message: 'Candidate is not sufficiently grounded in the source',
    },
  ];
}

function governanceIssues(gene: ExperienceGene, source: SourceGovernance): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (gene.scope !== source.scope) {
    issues.push({
      code: 'governance-scope',
      field: 'scope',
      message: 'Scope must inherit the source scope',
    });
  }
  if (gene.teamId !== source.teamId) {
    issues.push({
      code: 'governance-team',
      field: 'teamId',
      message: 'Team must inherit the source team',
    });
  }
  if (gene.requiredLevel < source.requiredLevel) {
    issues.push({
      code: 'governance-security-level',
      field: 'requiredLevel',
      message: 'Required level may only be raised relative to the source',
    });
  }
  const missingLabels = gene.labels.filter((label) => !source.labels.includes(label));
  if (missingLabels.length > 0) {
    issues.push({
      code: 'governance-label-subset',
      field: 'labels',
      message: 'Gene labels must be a subset of source labels',
    });
  }
  return issues;
}

function firstFailingGate(
  issues: ValidationIssue[],
  safetyCount: number,
): ExperienceGeneGate | null {
  if (issues.some((issue) => issue.code === 'compactness-budget')) return 'compactness';
  if (issues.some((issue) => issue.code === 'source-fidelity-low')) return 'fidelity';
  if (safetyCount > 0) return 'safety';
  if (issues.some((issue) => issue.code.startsWith('governance-'))) return 'governance';
  return null;
}

export async function validateExperienceGeneCandidate(
  candidate: ExperienceGene,
  options: {
    sourceText: string;
    source: SourceGovernance;
    embed?: ((text: string) => Promise<number[]>) | undefined;
    findDuplicate?:
      | ((gene: ExperienceGene) => Promise<ExperienceGeneDuplicateMatch | null>)
      | undefined;
  },
): Promise<ExperienceGeneValidationResult> {
  const issues = schemaIssues(candidate);
  if (issues.length > 0) return { valid: false, firstFailingGate: 'schema', issues };

  issues.push(...checkExperienceGeneCompactness(candidate));
  issues.push(...(await fidelityIssue(candidate, options)));
  const safetyIssues = scanExperienceGeneSafety(candidate);
  issues.push(...safetyIssues);

  const blockedBeforeDuplicate =
    issues.some((issue) => issue.code === 'compactness-budget') ||
    issues.some((issue) => issue.code === 'source-fidelity-low') ||
    safetyIssues.length > 0;
  if (!blockedBeforeDuplicate && options.findDuplicate) {
    const duplicate = await options.findDuplicate(candidate);
    if (duplicate) {
      const duplicateSource =
        'source' in duplicate ? `${duplicate.source.kind}:${duplicate.source.sourceId}` : null;
      issues.push({
        code: 'duplicate-source-pair',
        field: 'contentHash',
        message: duplicateSource
          ? `Candidate duplicates an existing Gene projection from ${duplicateSource}`
          : 'Candidate duplicates an existing Gene projection',
      });
      return { valid: false, firstFailingGate: 'duplicate', issues };
    }
  }

  issues.push(...governanceIssues(candidate, options.source));
  const gate = firstFailingGate(issues, safetyIssues.length);
  return { valid: gate === null, firstFailingGate: gate, issues };
}
