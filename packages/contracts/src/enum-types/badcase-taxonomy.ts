import { z } from 'zod';

export const BADCASE_TAXONOMY_VALUES = [
  'recall-miss',
  'ranking-error',
  'summary-hallucination',
  'governance-leak',
  'stale-content',
] as const;

export const badcaseTaxonomySchema = z.enum(BADCASE_TAXONOMY_VALUES);

export type BadcaseTaxonomy = z.infer<typeof badcaseTaxonomySchema>;

const BADCASE_TAXONOMY_LEGACY_ALIASES = {
  'missing-recall': 'recall-miss',
  'outdated-content': 'stale-content',
} as const satisfies Record<string, BadcaseTaxonomy>;

export function normalizeBadcaseTaxonomy(
  value: string | null | undefined,
): BadcaseTaxonomy | null {
  if (!value) {
    return null;
  }

  if (value in BADCASE_TAXONOMY_LEGACY_ALIASES) {
    return BADCASE_TAXONOMY_LEGACY_ALIASES[value as keyof typeof BADCASE_TAXONOMY_LEGACY_ALIASES];
  }

  const parsed = badcaseTaxonomySchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
