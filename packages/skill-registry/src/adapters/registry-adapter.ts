import type { SkillRegistryEntry, SkillSource } from '../contracts/skill-source.js';

export interface RegistrySearchQuery {
  query: string;
  limit?: number;
  tags?: string[];
}

export interface RegistryFetchOptions {
  version?: string;
  ref?: string;
}

export interface SkillBundle {
  slug: string;
  version?: string;
  source: SkillSource;
  files: Array<{ path: string; content: string; sha256: string; sizeBytes: number }>;
  manifest?: Record<string, unknown>;
}

export interface RegistryAdapter {
  readonly kind: string;
  readonly displayName: string;
  search(query: RegistrySearchQuery): Promise<SkillRegistryEntry[]>;
  fetchBundle(source: SkillSource, options?: RegistryFetchOptions): Promise<SkillBundle>;
  resolveVersion(source: SkillSource, requested?: string): Promise<string | null>;
  getVersions(source: SkillSource): Promise<string[]>;
}
