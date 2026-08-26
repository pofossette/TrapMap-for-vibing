import { z } from 'zod';

export const geneSourceKindSchema = z.enum(['trap', 'skill-artifact', 'skill-capsule']);
export const geneStatusSchema = z.enum([
  'candidate',
  'validated',
  'solidified',
  'stale',
  'deprecated',
]);
export const geneGeneratorKindSchema = z.enum(['rule', 'llm', 'hybrid']);
export const geneIndexStatusSchema = z.enum(['pending', 'ready', 'failed']);
export const geneEventTypeSchema = z.enum([
  'derived',
  'validated',
  'rejected',
  'solidified',
  'staled',
  'deprecated',
  'index-failed',
]);
export const experienceGeneModeSchema = z.enum(['off', 'shadow', 'serve']);

export type GeneSourceKind = z.infer<typeof geneSourceKindSchema>;
export type GeneStatus = z.infer<typeof geneStatusSchema>;
export type GeneGeneratorKind = z.infer<typeof geneGeneratorKindSchema>;
export type GeneIndexStatus = z.infer<typeof geneIndexStatusSchema>;
export type GeneEventType = z.infer<typeof geneEventTypeSchema>;
export type ExperienceGeneMode = z.infer<typeof experienceGeneModeSchema>;
