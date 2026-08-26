import type { ExperienceGene, ValidationIssue } from '@trapmap/contracts';

type SafetyField = keyof Pick<
  ExperienceGene,
  'title' | 'signalsMatch' | 'summary' | 'strategy' | 'avoid' | 'constraints' | 'validation'
>;

const RULES: ReadonlyArray<{
  code: string;
  pattern: RegExp;
  fields: readonly SafetyField[];
}> = [
  {
    code: 'safety-secret',
    pattern: /\b(?:password|passwd|secret|access[-_]?token|api[-_]?key|cookie)\s*[=:]\s*\S+/i,
    fields: ['title', 'signalsMatch', 'summary', 'strategy', 'avoid', 'constraints', 'validation'],
  },
  {
    code: 'safety-bearer-token',
    pattern: /\b(?:authorization\s*:\s*)?bearer\s+[a-z0-9._-]{6,}/i,
    fields: ['signalsMatch', 'summary', 'strategy', 'avoid', 'constraints', 'validation'],
  },
  {
    code: 'safety-chat-transcript',
    pattern: /^\s*(?:system|user|assistant|tool)\s*:/im,
    fields: ['signalsMatch', 'summary', 'strategy', 'avoid', 'constraints', 'validation'],
  },
  {
    code: 'safety-stack-trace',
    pattern: /^\s*at\s+.+\(?.+:\d+:\d+\)?\s*$/im,
    fields: ['signalsMatch', 'summary', 'strategy', 'avoid', 'constraints', 'validation'],
  },
  {
    code: 'safety-executable-body',
    pattern: /(?:\beval\s*\(|\bnew\s+Function\s*\(|<script\b|function\s*\([^)]*\)\s*\{)/i,
    fields: ['strategy', 'avoid', 'constraints', 'validation'],
  },
  {
    code: 'safety-private-key',
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    fields: ['summary', 'strategy', 'avoid', 'constraints', 'validation'],
  },
  {
    code: 'safety-binary-asset',
    pattern: /^(?:\/9j\/|iVBORw0KGgo|JVBERi0x|UEsDBBQ|1f8b08)/,
    fields: ['signalsMatch', 'summary', 'strategy', 'avoid', 'constraints', 'validation'],
  },
  {
    code: 'safety-private-path',
    pattern: /(?:\/(?:Users|home|root)\/[^\s]+|[A-Za-z]:\\Users\\[^\s]+)/,
    fields: ['title', 'signalsMatch', 'summary', 'strategy', 'avoid', 'constraints', 'validation'],
  },
  {
    code: 'safety-tenant-id',
    pattern: /\btenant(?:[_-]?id)?\s*[=:]\s*[\w.-]+/i,
    fields: ['summary', 'strategy', 'avoid', 'constraints', 'validation'],
  },
];

export function scanExperienceGeneSafety(gene: ExperienceGene): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const field of [
    'summary',
    'title',
    'signalsMatch',
    'strategy',
    'avoid',
    'constraints',
    'validation',
  ] as const) {
    for (const rule of RULES) {
      if (!rule.fields.includes(field)) continue;
      const values = Array.isArray(gene[field]) ? gene[field] : [gene[field]];
      if (values.some((value) => typeof value === 'string' && rule.pattern.test(value))) {
        issues.push({
          code: rule.code,
          field,
          message: 'Candidate contains material forbidden by the Gene safety policy',
        });
      }
    }
  }

  return issues;
}
