import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  checkSkillFile,
  compareSemver,
  extractFrontmatterBlock,
  isValidSemver,
  readFieldValue,
  validateSkillMetadata,
} from '../check-skills';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function skillContent(version: string | null, extra = ''): string {
  const versionLine = version === null ? '' : `version: ${version}\n`;
  return `---\nname: demo-skill\ndescription: demo skill\n${versionLine}${extra}---\n\n# Demo Skill\n`;
}

function runGit(dir: string, args: string[]): { status: number; stderr: string } {
  const result = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
  return { status: result.status ?? -1, stderr: result.stderr ?? '' };
}

function makeTempRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'trapmap-check-skills-'));
  tempDirs.push(dir);
  runGit(dir, ['init', '-q']);
  runGit(dir, ['config', 'user.email', 'check-skills@test']);
  runGit(dir, ['config', 'user.name', 'check-skills']);
  return dir;
}

function commitSkill(dir: string, relPath: string, content: string): void {
  writeSkillFile(dir, relPath, content);
  runGit(dir, ['add', relPath]);
  const result = runGit(dir, ['commit', '-q', '-m', 'commit skill']);
  expect(result.status).toBe(0);
}

function writeSkillFile(dir: string, relPath: string, content: string): void {
  mkdirSync(join(dir, dirname(relPath)), { recursive: true });
  writeFileSync(join(dir, relPath), content, 'utf8');
}

describe('extractFrontmatterBlock', () => {
  it('returns the raw frontmatter block', () => {
    expect(extractFrontmatterBlock('---\nversion: 1.0.0\n---\n# Body')).toBe('version: 1.0.0');
    expect(extractFrontmatterBlock('---\r\nversion: 1.0.0\r\n---\r\n# Body')).toBe(
      'version: 1.0.0',
    );
  });

  it('returns null without frontmatter or on malformed delimiters', () => {
    expect(extractFrontmatterBlock('# Only body\n')).toBeNull();
    expect(extractFrontmatterBlock('---\nversion: 1.0.0\n# missing closing delimiter')).toBeNull();
  });
});

describe('readFieldValue', () => {
  it('reads flat key: value lines', () => {
    const block = 'name: demo-skill\ndescription: demo skill\nversion: 1.0.0\ntags: [cli, guide]\n';
    expect(readFieldValue(block, 'version')).toBe('1.0.0');
    expect(readFieldValue(block, 'tags')).toBe('[cli, guide]');
    expect(readFieldValue(block, 'author')).toBeNull();
  });

  it('returns an empty string for a present-but-empty value', () => {
    expect(readFieldValue('author:\nversion: 1.0.0\n', 'author')).toBe('');
  });
});

describe('isValidSemver', () => {
  it.each(['1.0.0', '0.0.0', '10.2.30', '1.2.3-rc.1', '1.2.3+build.5', '1.2.3-rc.1+build.5'])(
    'accepts %s',
    (version) => {
      expect(isValidSemver(version)).toBe(true);
    },
  );

  it.each([
    '1.02.0',
    '01.0.0',
    '00.1.2',
    '1.2',
    '1.0',
    'v1.0.0',
    '1.0.0-',
    '1.0.0-rc..1',
    '1.0.0+',
  ])('rejects %s', (version) => {
    expect(isValidSemver(version)).toBe(false);
  });
});

describe('compareSemver', () => {
  it('compares major.minor.patch numerically', () => {
    expect(compareSemver('1.0.0', '1.0.0')).toBe(0);
    expect(compareSemver('0.9.0', '1.0.0')).toBeLessThan(0);
    expect(compareSemver('1.1.0', '1.0.9')).toBeGreaterThan(0);
    expect(compareSemver('10.0.0', '9.99.99')).toBeGreaterThan(0);
  });
});

describe('validateSkillMetadata', () => {
  it('accepts the full current frontmatter shape', () => {
    const block = [
      'name: workflow-with-trapmap',
      'description: 工作流',
      'version: 1.0.0',
      'author: TrapMap maintainers',
      'license: MIT',
      'compatibility: trapmap >= 0.1.0',
      'tags: [workflow, trapmap, governance]',
    ].join('\n');
    expect(validateSkillMetadata(block)).toEqual([]);
  });

  it('accepts version-only frontmatter (optional fields absent)', () => {
    expect(validateSkillMetadata('version: 1.0.0\n')).toEqual([]);
  });

  it('fails on missing version', () => {
    const errors = validateSkillMetadata('name: demo-skill\ndescription: demo\n');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/version/);
  });

  it('fails when there is no frontmatter at all', () => {
    expect(validateSkillMetadata('')).toHaveLength(1);
  });

  it.each(['1.02.0', '01.0.0', '1.2'])('fails on invalid semver %s', (version) => {
    const errors = validateSkillMetadata(`version: ${version}\n`);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/invalid semver/);
  });

  it('fails on empty optional fields', () => {
    expect(validateSkillMetadata('version: 1.0.0\nauthor: \n')).toHaveLength(1);
    expect(validateSkillMetadata('version: 1.0.0\ntags: []\n')).toHaveLength(1);
    expect(validateSkillMetadata('version: 1.0.0\ncompatibility: \n')).toHaveLength(1);
  });
});

describe('checkSkillFile against git history', () => {
  it('fails on version regression vs the last committed version', () => {
    const repo = makeTempRepo();
    const rel = 'skills/demo/SKILL.md';
    commitSkill(repo, rel, skillContent('1.0.0'));
    writeFileSync(join(repo, rel), skillContent('0.9.0'), 'utf8');
    const report = checkSkillFile(join(repo, rel), repo);
    expect(report.errors).toEqual([
      'version regression: 0.9.0 is older than the last committed 1.0.0',
    ]);
    expect(report.previousVersion).toBe('1.0.0');
  });

  it('passes on first introduction (no previous version in history)', () => {
    const repo = makeTempRepo();
    const rel = 'skills/demo/SKILL.md';
    commitSkill(repo, rel, skillContent(null));
    writeFileSync(join(repo, rel), skillContent('1.0.0'), 'utf8');
    const report = checkSkillFile(join(repo, rel), repo);
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([]);
    expect(report.previousVersion).toBeNull();
  });

  it('passes when the version is unchanged vs history', () => {
    const repo = makeTempRepo();
    const rel = 'skills/demo/SKILL.md';
    commitSkill(repo, rel, skillContent('1.0.0'));
    const report = checkSkillFile(join(repo, rel), repo);
    expect(report.errors).toEqual([]);
    expect(report.previousVersion).toBe('1.0.0');
  });

  it('warns (not fails) when the previous version is not valid semver', () => {
    const repo = makeTempRepo();
    const rel = 'skills/demo/SKILL.md';
    commitSkill(repo, rel, skillContent('1.0'));
    writeFileSync(join(repo, rel), skillContent('2.0.0'), 'utf8');
    const report = checkSkillFile(join(repo, rel), repo);
    expect(report.errors).toEqual([]);
    expect(report.warnings).toHaveLength(1);
    expect(report.warnings[0]).toMatch(/not valid semver/);
  });

  it('warns (not fails) when git history is unavailable', () => {
    const dir = mkdtempSync(join(tmpdir(), 'trapmap-check-skills-'));
    tempDirs.push(dir);
    const rel = 'skills/demo/SKILL.md';
    writeSkillFile(dir, rel, skillContent('1.0.0'));
    const report = checkSkillFile(join(dir, rel), dir);
    expect(report.errors).toEqual([]);
    expect(report.warnings).toHaveLength(1);
    expect(report.warnings[0]).toMatch(/git log failed/);
  });
});
