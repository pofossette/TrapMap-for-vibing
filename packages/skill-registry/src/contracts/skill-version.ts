import { z } from 'zod';

export const semverSchema = z
  .string()
  .regex(
    /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/,
    'must be valid semver',
  );

export const skillVersionSchema = z.object({
  version: semverSchema,
  revision: z.number().int().min(1),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  publishedAt: z.string(),
  changelog: z.string().max(5000).optional(),
  author: z.string().optional(),
});

export type SkillVersion = z.infer<typeof skillVersionSchema>;

export const skillRevisionHistorySchema = z.object({
  skillId: z.string().min(1),
  slug: z.string().min(1),
  currentVersion: semverSchema.optional(),
  currentRevision: z.number().int().min(1),
  versions: z.array(skillVersionSchema),
});

export type SkillRevisionHistory = z.infer<typeof skillRevisionHistorySchema>;
