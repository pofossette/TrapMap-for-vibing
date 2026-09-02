import { readFile } from 'node:fs/promises';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import type { SkillRegistryEntry, SkillSource } from '../contracts/skill-source.js';
import type { RegistryAdapter, RegistrySearchQuery, SkillBundle } from './registry-adapter.js';

/**
 * Local filesystem adapter — copies ccswitch local skill handling.
 * Supports: ./path, /abs/path, ~/path, file://
 */
export class LocalAdapter implements RegistryAdapter {
  readonly kind = 'local-path' as const;
  readonly displayName = 'local';

  async search(_query: RegistrySearchQuery): Promise<SkillRegistryEntry[]> {
    return [];
  }

  async fetchBundle(source: SkillSource): Promise<SkillBundle> {
    const raw = source.raw.replace(/^file:\/\//, '');
    // Support universal .agents/skills and home expansion (copy ccswitch/ai-pkgs agents/targets)
    const resolved = raw.startsWith('~')
      ? path.join(process.env.HOME ?? '', raw.slice(1))
      : path.resolve(raw);
    const st = await stat(resolved);
    const files: SkillBundle['files'] = [];
    const { sha256 } = await import('@trapmap/lib');
    if (st.isDirectory()) {
      // Read SKILL.md + references recursively (shallow copy of ccswitch skill layout)
      const skillMd = path.join(resolved, 'SKILL.md');
      try {
        const content = await readFile(skillMd, 'utf-8');
        files.push({
          path: 'SKILL.md',
          content,
          sha256: await sha256(content),
          sizeBytes: Buffer.byteLength(content),
        });
      } catch {
        throw new Error(`Local skill missing SKILL.md at ${skillMd}`);
      }
      // Try references
      const refDir = path.join(resolved, 'references');
      try {
        const { readdir } = await import('node:fs/promises');
        const entries = await readdir(refDir, { withFileTypes: true });
        for (const e of entries) {
          if (e.isFile()) {
            const fp = path.join(refDir, e.name);
            const content = await readFile(fp, 'utf-8');
            files.push({
              path: `references/${e.name}`,
              content,
              sha256: await sha256(content),
              sizeBytes: Buffer.byteLength(content),
            });
          }
        }
      } catch {
        // no references is ok
      }
    } else {
      const content = await readFile(resolved, 'utf-8');
      const name = path.basename(resolved);
      files.push({
        path: name,
        content,
        sha256: await sha256(content),
        sizeBytes: Buffer.byteLength(content),
      });
    }
    return {
      slug: source.slug ?? path.basename(resolved),
      version: source.version,
      source,
      files,
    };
  }

  async resolveVersion(_source: SkillSource, requested?: string): Promise<string | null> {
    return requested ?? null;
  }

  async getVersions(_source: SkillSource): Promise<string[]> {
    return [];
  }
}
