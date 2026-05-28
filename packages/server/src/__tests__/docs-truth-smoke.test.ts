import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();

function readDoc(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), 'utf8');
}

describe('docs truth smoke', () => {
  it('CODE_GUIDE uses current server entry name', () => {
    const guide = readDoc('docs/guides/CODE_GUIDE.md');

    expect(guide).toContain('buildServer()');
    expect(guide).not.toContain('createApp()');
  });

  it('key docs reference SYSTEM_TRUTH_SOURCES.md', () => {
    const docs = ['README.md', 'docs/README.md'];

    for (const doc of docs) {
      const content = readDoc(doc);
      expect(content, `${doc} should link to SYSTEM_TRUTH_SOURCES.md`).toContain(
        'SYSTEM_TRUTH_SOURCES.md',
      );
    }
  });

  it('SYSTEM_TRUTH_SOURCES.md exists', () => {
    const content = readDoc('docs/reference/SYSTEM_TRUTH_SOURCES.md');
    expect(content.length).toBeGreaterThan(0);
  });

  it('non-planned truth source paths exist on disk', () => {
    const content = readDoc('docs/reference/SYSTEM_TRUTH_SOURCES.md');

    // Skip paths on rows annotated with "planned" or "Task"
    const lines = content.split('\n');
    for (const line of lines) {
      if (/planned|Task \d/i.test(line)) continue;
      // Extract paths from this non-planned line
      const linePathPattern = /`([a-z0-9_.-]+\/[a-z0-9_/.-]+\.[a-z]+)`/gi;
      const lineMatches = line.matchAll(linePathPattern);
      for (const pathMatch of lineMatches) {
        const relPath = pathMatch[1];
        const absPath = resolve(ROOT, relPath);
        const serverRelativePath = resolve(ROOT, 'packages/server/src', relPath);
        expect(
          existsSync(absPath) || existsSync(serverRelativePath),
          `truth source path should exist: ${relPath}`,
        ).toBe(true);
      }
    }
  });

  it('DOCS_TRUTH_MATRIX.md exists', () => {
    const content = readDoc('docs/reference/DOCS_TRUTH_MATRIX.md');
    expect(content.length).toBeGreaterThan(0);
  });

  it('SYSTEM_TRUTH_SOURCES.md references DOCS_TRUTH_MATRIX.md', () => {
    const content = readDoc('docs/reference/SYSTEM_TRUTH_SOURCES.md');
    expect(content).toContain('DOCS_TRUTH_MATRIX.md');
  });

  it('guardrail docs mention pnpm check:docs-drift and pnpm check:complexity', () => {
    const guardrailDocs = ['docs/operations/TESTING.md', 'docs/operations/CI_CD.md'];

    for (const doc of guardrailDocs) {
      const content = readDoc(doc);
      expect(content, `${doc} should mention pnpm check:docs-drift`).toContain(
        'pnpm check:docs-drift',
      );
      expect(content, `${doc} should mention pnpm check:complexity`).toContain(
        'pnpm check:complexity',
      );
    }
  });

  it('DATABASE_SCHEMA.md references schema module path', () => {
    const content = readDoc('docs/reference/DATABASE_SCHEMA.md');
    expect(content).toContain('packages/server/src/lib/persistence/schema');
  });

  it('docs/README.md does not advertise JSON as primary runtime', () => {
    const content = readDoc('docs/README.md');
    expect(content).not.toContain('使用 JSON 文件存储');
  });

  it('DEPLOYMENT.md contains PostgreSQL-first posture', () => {
    const content = readDoc('docs/architecture/DEPLOYMENT.md');
    expect(content).toContain('TRAPMAP_DATABASE_URL');
    expect(content).toMatch(/PostgreSQL|pgvector/);
  });

  it('DATABASE_SCHEMA.md contains correct table count', () => {
    const content = readDoc('docs/reference/DATABASE_SCHEMA.md');
    expect(content).toContain('57');
  });

  it('DOCS_TRUTH_MATRIX.md covers expanded drift categories', () => {
    const matrix = readDoc('docs/reference/DOCS_TRUTH_MATRIX.md');
    expect(matrix).toContain('Root workspace commands');
    expect(matrix).toContain('Server-only DB commands');
    expect(matrix).toContain('Runtime env defaults');
    expect(matrix).toContain('AI provider/model defaults');
    expect(matrix).toContain('Eval workflow');
    expect(matrix).toContain('Deep architecture persistence docs');
    expect(matrix).toContain('Deployment defaults');
    expect(matrix).toContain('Health/readiness endpoints');
    expect(matrix).toContain('Deep architecture component docs');
    expect(matrix).toContain('Operator-only internal APIs');
    expect(matrix).toContain('Drift Type');
  });

  it('SYSTEM_TRUTH_SOURCES.md covers expanded drift categories', () => {
    const sources = readDoc('docs/reference/SYSTEM_TRUTH_SOURCES.md');
    expect(sources).toContain('Root workspace commands');
    expect(sources).toContain('Server-only DB commands');
    expect(sources).toContain('Runtime env defaults');
    expect(sources).toContain('AI provider/model defaults');
    expect(sources).toContain('Eval workflow');
    expect(sources).toContain('Deep architecture persistence docs');
    expect(sources).toContain('Deployment defaults');
    expect(sources).toContain('Health/readiness endpoints');
    expect(sources).toContain('Deep architecture component docs');
    expect(sources).toContain('Operator-only internal APIs');
  });

  it('docs/README.md does not contain stale schema counts', () => {
    const content = readDoc('docs/README.md');
    expect(content).not.toContain('48 张表');
    expect(content).not.toContain('54 张表');
  });

  it('GETTING_STARTED uses package-scoped DB commands and current JSON fallback path', () => {
    const content = readDoc('docs/guides/GETTING_STARTED.md');
    expect(content).toContain('pnpm --filter @trapmap/server db:migrate');
    expect(content).toContain('.data/skill-shareer.json');
    expect(content).not.toContain('pnpm run db:migrate');
    expect(content).not.toContain('.data/trapmap.json');
  });

  it('ARCHITECTURE.md uses correct runtime defaults', () => {
    const content = readDoc('docs/architecture/ARCHITECTURE.md');
    expect(content).toContain('127.0.0.1');
    expect(content).toContain('gpt-4o-mini');
    expect(content).not.toContain('| `HOST` | `0.0.0.0`');
    expect(content).not.toContain('| `AI_CHAT_MODEL` | `gpt-4o` |');
  });

  it('PERSISTENCE.md reports correct schema count', () => {
    const content = readDoc('docs/architecture/components/PERSISTENCE.md');
    expect(content).toContain('57 张表');
    expect(content).not.toContain('48 张表');
    expect(content).not.toContain('56 张表');
  });

  it('ENVIRONMENT.md does not describe JSON storage as dev default', () => {
    const content = readDoc('docs/operations/ENVIRONMENT.md');
    expect(content).toContain('.data/skill-shareer.json');
    expect(content).not.toContain('.data/trapmap.json');
  });

  it('CONTRIBUTING.md uses package-scoped DB commands', () => {
    const content = readDoc('docs/guides/CONTRIBUTING.md');
    expect(content).toContain('pnpm --filter @trapmap/server db:generate');
    expect(content).toContain('pnpm --filter @trapmap/server db:migrate');
    expect(content).not.toContain('pnpm run db:generate');
    expect(content).not.toContain('pnpm run db:migrate');
  });

  it('TESTING.md uses current eval entrypoints', () => {
    const content = readDoc('docs/operations/TESTING.md');
    expect(content).toContain('pnpm eval:ci:core');
    expect(content).not.toContain('TIER=core pnpm eval:ci');
  });

  it('ENVIRONMENT.md describes provider auto-detection', () => {
    const content = readDoc('docs/operations/ENVIRONMENT.md');
    expect(content).toMatch(/OPENAI_API_KEY.*GEMINI_API_KEY.*fallback/s);
  });

  it('DEPLOYMENT.md uses correct chat model default', () => {
    const content = readDoc('docs/architecture/DEPLOYMENT.md');
    expect(content).toContain('gpt-4o-mini');
    expect(content).toContain('.data/skill-shareer.json');
  });

  it('PERSISTENCE.md uses PG-first framing', () => {
    const content = readDoc('docs/architecture/components/PERSISTENCE.md');
    expect(content).toContain('.data/skill-shareer.json');
    // Verify it describes PostgreSQL as primary
    expect(content).toMatch(/主要|primary|推荐/);
  });

  it('EVALUATION.md uses current eval commands', () => {
    const content = readDoc('docs/architecture/components/EVALUATION.md');
    expect(content).toContain('pnpm eval:smoke');
    expect(content).toContain('pnpm eval:core');
    expect(content).not.toContain('pnpm eval:governance');
  });

  it('ARCHITECTURE.md Docker Compose uses pgvector image and wget healthcheck', () => {
    const content = readDoc('docs/architecture/ARCHITECTURE.md');
    expect(content).toContain('pgvector/pgvector:pg16');
    expect(content).toContain('wget');
    expect(content).not.toContain('image: postgres:16');
  });

  it('EVALUATION.md uses TS datasets, not YAML cases', () => {
    const content = readDoc('docs/architecture/components/EVALUATION.md');
    expect(content).toContain('datasets/');
    expect(content).toContain('scenarios/');
    expect(content).not.toContain('cases/');
  });

  it('AI_PROVIDER.md uses correct Ollama default model', () => {
    const content = readDoc('docs/architecture/components/AI_PROVIDER.md');
    expect(content).toContain('llama3');
    expect(content).not.toContain('llama2');
  });

  it('ASYNC_INFRASTRUCTURE.md does not reference removed DualWrite repos', () => {
    const content = readDoc('docs/architecture/components/ASYNC_INFRASTRUCTURE.md');
    expect(content).not.toContain('DualWriteKnowledgeRepository');
    expect(content).not.toContain('DualWriteArtifactRepository');
  });

  it('ARTIFACTS.md uses current lifecycle states and record types', () => {
    const content = readDoc('docs/architecture/components/ARTIFACTS.md');
    expect(content).toContain('agent-pass');
    expect(content).toContain('SkillArtifactRecord');
    expect(content).not.toContain('interface SkillArtifact {');
  });

  it('server package has local structure guides', () => {
    expect(existsSync(resolve(ROOT, 'packages/server/src/lib/README.md'))).toBe(true);
    expect(existsSync(resolve(ROOT, 'packages/server/src/routes/README.md'))).toBe(true);

    const codeGuide = readDoc('docs/guides/CODE_GUIDE.md');
    expect(codeGuide).toContain('packages/server/src/lib/README.md');
    expect(codeGuide).toContain('packages/server/src/routes/README.md');
  });
});
