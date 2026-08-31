import { z } from 'zod';

export const skillSourceKindSchema = z.enum([
  'skills-sh',
  'github',
  'ai-pkgs',
  'git-url',
  'local-path',
  'trapmap-internal',
]);

export type SkillSourceKind = z.infer<typeof skillSourceKindSchema>;

export const skillSourceSchema = z.object({
  kind: skillSourceKindSchema,
  raw: z.string().min(1),
  // Normalized canonical identifier
  canonical: z.string().min(1),
  // For github: owner/repo, subpath
  owner: z.string().optional(),
  repo: z.string().optional(),
  subpath: z.string().optional(),
  // For skills.sh: skill slug
  slug: z.string().optional(),
  // pinned version / ref
  version: z.string().optional(),
  ref: z.string().optional(),
});

export type SkillSource = z.infer<typeof skillSourceSchema>;

export const skillRegistryEntrySchema = z.object({
  name: z.string().min(1).max(128),
  slug: z.string().min(1),
  description: z.string().max(2000).optional(),
  source: skillSourceSchema,
  latestVersion: z.string().optional(),
  versions: z.array(z.string()).default([]),
  author: z.string().optional(),
  tags: z.array(z.string()).default([]),
  homepage: z.string().optional(),
  downloadUrl: z.string().optional(),
});

export type SkillRegistryEntry = z.infer<typeof skillRegistryEntrySchema>;
