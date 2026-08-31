import { z } from 'zod';

export const skillManifestEntrySchema = z.object({
  source: z.string().min(1),
  version: z.string().optional(),
  pin: z.string().optional(),
  agent: z.array(z.string()).default([]),
  scope: z.enum(['global', 'project']).default('project'),
});

export type SkillManifestEntry = z.infer<typeof skillManifestEntrySchema>;

export const skillManifestSchema = z.object({
  version: z.literal(1),
  skills: z.record(z.string(), skillManifestEntrySchema),
});

export type SkillManifest = z.infer<typeof skillManifestSchema>;
