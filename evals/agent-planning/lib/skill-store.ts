import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface SkillRecord {
  id: string;
  title: string;
  summary: string;
  keywords: string[];
  labels: string[];
  source: 'repo' | 'oss';
  body?: string;
}

const repoSkillsDir = resolve('evals/fixtures/skills/repo');
const ossSkillsDir = resolve('evals/fixtures/skills/oss');
const trapSkillFormatDir = resolve('evals/fixtures/traps/skill-format');

function loadRepoSkills(): SkillRecord[] {
  if (!existsSync(repoSkillsDir)) return [];
  return readdirSync(repoSkillsDir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const data = JSON.parse(readFileSync(resolve(repoSkillsDir, f), 'utf8'));
      return {
        id: data.id,
        title: data.title,
        summary: data.summary,
        keywords: data.keywords ?? [],
        labels: data.labels ?? [],
        source: 'repo' as const,
      };
    });
}

function loadOssSkills(): SkillRecord[] {
  if (!existsSync(ossSkillsDir)) return [];
  return readdirSync(ossSkillsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => {
      const metaPath = resolve(ossSkillsDir, d.name, 'meta.json');
      const skillPath = resolve(ossSkillsDir, d.name, 'SKILL.md');
      if (!existsSync(metaPath)) return null;
      const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
      const body = existsSync(skillPath) ? readFileSync(skillPath, 'utf8') : undefined;
      return {
        id: meta.id ?? `oss-${d.name}`,
        title: meta.title ?? d.name,
        summary: meta.summary ?? '',
        keywords: meta.keywords ?? [],
        labels: meta.labels ?? [],
        source: 'oss' as const,
        body,
      };
    })
    .filter((s): s is SkillRecord => s !== null);
}

function loadTrapSkills(): SkillRecord[] {
  if (!existsSync(trapSkillFormatDir)) return [];
  return readdirSync(trapSkillFormatDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => {
      const skillPath = resolve(trapSkillFormatDir, d.name, 'SKILL.md');
      if (!existsSync(skillPath)) return null;
      const raw = readFileSync(skillPath, 'utf8');
      // Parse frontmatter
      const fmMatch = raw.match(/^---\n([\s\S]*?)\n---/);
      let name = d.name;
      let description = '';
      let labels: string[] = [];
      if (fmMatch) {
        const fm = fmMatch[1];
        const nameMatch = fm.match(/^name:\s*(.+)$/m);
        const descMatch = fm.match(/^description:\s*(.+)$/m);
        const labelsMatch = fm.match(/^labels:\s*\n((?:\s+-\s+.+\n?)*)/m);
        if (nameMatch) name = nameMatch[1].trim();
        if (descMatch) description = descMatch[1].trim();
        if (labelsMatch) {
          labels = labelsMatch[1]
            .split('\n')
            .map((l) => l.replace(/^\s+-\s+/, '').trim())
            .filter(Boolean);
        }
      }
      const body = raw.replace(/^---\n[\s\S]*?\n---\n?/, '').trim();
      return {
        id: `trap-${d.name}`,
        title: name,
        summary: description || body.slice(0, 200),
        keywords: labels,
        labels,
        source: 'repo' as const,
        body,
      };
    })
    .filter((s): s is SkillRecord => s !== null);
}

let _store: SkillRecord[] | null = null;

export function getSkillStore(): SkillRecord[] {
  if (_store) return _store;
  _store = [...loadRepoSkills(), ...loadOssSkills(), ...loadTrapSkills()];
  return _store;
}
