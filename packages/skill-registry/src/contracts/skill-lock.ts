import { z } from 'zod';
import { skillSourceSchema } from './skill-source.js';
import { semverSchema } from './skill-version.js';

export const skillLockEntrySchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  version: semverSchema,
  resolved: z.string().min(1),
  integrity: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  source: skillSourceSchema,
  installedAt: z.string(),
  installPath: z.string().min(1),
  agentTargets: z.array(z.string()).default([]),
  scope: z.enum(['global', 'project']).default('project'),
});

export type SkillLockEntry = z.infer<typeof skillLockEntrySchema>;

export const skillLockfileSchema = z.object({
  version: z.literal(1),
  generatedAt: z.string(),
  entries: z.record(z.string(), skillLockEntrySchema),
});

export type SkillLockfile = z.infer<typeof skillLockfileSchema>;
