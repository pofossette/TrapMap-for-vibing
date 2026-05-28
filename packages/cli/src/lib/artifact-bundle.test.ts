/**
 * Tests for artifact bundle utilities.
 *
 * Covers:
 * - File path detection and classification
 * - Bundle construction from SKILL.md and directories
 * - Metadata extraction and parsing
 */

import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  buildArtifactBundle,
  buildSingleSkillMdBundle,
  computeFileHash,
  formatListResponse,
  isSkillMdFile,
  parseClaudeSkill,
  parseSkillMetadata,
  readFileContent,
  scanSkillDirectory,
} from './artifact-bundle.js';

describe('artifact-bundle utilities', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `trapmap-bundle-test-${Date.now()}-${Math.random()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('isSkillMdFile', () => {
    it('should detect lowercase skill.md', () => {
      expect(isSkillMdFile('/path/to/skill.md')).toBe(true);
    });

    it('should detect uppercase SKILL.MD', () => {
      expect(isSkillMdFile('/path/to/SKILL.MD')).toBe(true);
    });

    it('should detect mixed case Skill.md', () => {
      expect(isSkillMdFile('/path/to/Skill.md')).toBe(true);
    });

    it('should reject non-skill.md files', () => {
      expect(isSkillMdFile('/path/to/readme.md')).toBe(false);
    });

    it('should reject files that merely end with skill.md', () => {
      expect(isSkillMdFile('/path/to/myskill.md')).toBe(false);
    });
  });

  describe('computeFileHash', () => {
    it('should produce deterministic SHA-256 hash', () => {
      const content = Buffer.from('hello world');
      const hash1 = computeFileHash(content);
      const hash2 = computeFileHash(content);
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
    });

    it('should produce different hashes for different content', () => {
      const hash1 = computeFileHash(Buffer.from('content a'));
      const hash2 = computeFileHash(Buffer.from('content b'));
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('parseSkillMetadata', () => {
    it('should extract title from name field when title absent', () => {
      const content = '---\nname: My Skill\n---\n\nBody';
      const result = parseSkillMetadata(content);
      expect(result).not.toBeNull();
      expect(result?.title).toBe('My Skill');
      expect(result?.labels).toEqual(['imported']);
    });

    it('should extract title from title field', () => {
      const content = '---\ntitle: Skill Title\nname: skill-name\n---\n\nBody';
      const result = parseSkillMetadata(content);
      expect(result).not.toBeNull();
      expect(result?.title).toBe('Skill Title');
    });

    it('should extract labels from frontmatter', () => {
      const content = '---\nname: Skill\nlabels:\n  - docker\n  - devops\n---\n\nBody';
      const result = parseSkillMetadata(content);
      expect(result).not.toBeNull();
      expect(result?.labels).toEqual(['docker', 'devops']);
    });

    it('should return null for content without frontmatter', () => {
      const result = parseSkillMetadata('Just some text without frontmatter');
      expect(result).toBeNull();
    });

    it('should return null when no name or title in frontmatter', () => {
      const content = '---\ndescription: No name or title\n---\n\nBody';
      const result = parseSkillMetadata(content);
      expect(result).toBeNull();
    });
  });

  describe('parseClaudeSkill', () => {
    it('should parse valid SKILL.md content', () => {
      const content = '---\nname: Test Skill\ndescription: A test skill\n---\n\nDetailed body';
      const result = parseClaudeSkill(content);
      expect(result).not.toBeNull();
      expect(result?.shortcut).toBe('Test Skill');
      expect(result?.detail).toBe('Detailed body');
      expect(result?.scope).toBe('project');
      expect(result?.labels).toEqual(['imported', 'skill']);
    });

    it('should use description when body is empty', () => {
      const content = '---\nname: Skill\ndescription: Fallback desc\n---\n';
      const result = parseClaudeSkill(content);
      expect(result).not.toBeNull();
      expect(result?.detail).toBe('Fallback desc');
    });

    it('should return null for content without frontmatter', () => {
      const result = parseClaudeSkill('No frontmatter here');
      expect(result).toBeNull();
    });

    it('should return null when name is missing', () => {
      const content = '---\ndescription: Has desc but no name\n---\n\nBody';
      const result = parseClaudeSkill(content);
      expect(result).toBeNull();
    });
  });

  describe('scanSkillDirectory', () => {
    it('should detect SKILL.md at root', async () => {
      await writeFile(join(testDir, 'SKILL.md'), '# Test Skill');
      const result = await scanSkillDirectory(testDir);
      expect(result.skillMd).toBe(join(testDir, 'SKILL.md'));
    });

    it('should return null skillMd when no SKILL.md present', async () => {
      await mkdir(join(testDir, 'references'), { recursive: true });
      await writeFile(join(testDir, 'references', 'guide.md'), '# Guide');
      const result = await scanSkillDirectory(testDir);
      expect(result.skillMd).toBeNull();
    });

    it('should classify files into correct categories', async () => {
      await writeFile(join(testDir, 'SKILL.md'), '# Test');
      await mkdir(join(testDir, 'references'), { recursive: true });
      await writeFile(join(testDir, 'references', 'guide.md'), '# Guide');
      await mkdir(join(testDir, 'assets'), { recursive: true });
      await writeFile(join(testDir, 'assets', 'logo.png'), 'fake-png');
      await mkdir(join(testDir, 'scripts'), { recursive: true });
      await writeFile(join(testDir, 'scripts', 'setup.sh'), '#!/bin/bash');

      const result = await scanSkillDirectory(testDir);
      expect(result.references).toEqual(['references/guide.md']);
      expect(result.assets).toEqual(['assets/logo.png']);
      expect(result.scripts).toEqual(['scripts/setup.sh']);
    });

    it('should find skill.md (lowercase)', async () => {
      await writeFile(join(testDir, 'skill.md'), '# Test Skill');
      const result = await scanSkillDirectory(testDir);
      expect(result.skillMd).toBe(join(testDir, 'skill.md'));
    });

    it('should find Skill.md (mixed case)', async () => {
      await writeFile(join(testDir, 'Skill.md'), '# Test Skill');
      const result = await scanSkillDirectory(testDir);
      expect(result.skillMd).toBe(join(testDir, 'Skill.md'));
    });

    it('should skip hidden files and node_modules', async () => {
      await writeFile(join(testDir, 'SKILL.md'), '# Test');
      await writeFile(join(testDir, '.env'), 'SECRET=123');
      await mkdir(join(testDir, 'node_modules', 'pkg'), { recursive: true });
      await writeFile(join(testDir, 'node_modules', 'pkg', 'index.js'), 'module.exports = {}');
      await mkdir(join(testDir, 'references'), { recursive: true });
      await writeFile(join(testDir, 'references', 'visible.md'), '# Visible');

      const result = await scanSkillDirectory(testDir);
      expect(result.references).toEqual(['references/visible.md']);
    });
  });

  describe('readFileContent', () => {
    it('should read text file as UTF-8 string', async () => {
      const filePath = join(testDir, 'test.md');
      await writeFile(filePath, 'Hello World');
      const result = await readFileContent(filePath);
      expect(result.content).toBe('Hello World');
      expect(result.isBinary).toBe(false);
    });

    it('should read binary file as base64 string', async () => {
      const filePath = join(testDir, 'image.png');
      // Write a minimal PNG-like binary file
      await writeFile(filePath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
      const result = await readFileContent(filePath);
      expect(result.isBinary).toBe(true);
      expect(result.content).toBeTruthy();
    });
  });

  describe('buildSingleSkillMdBundle', () => {
    it('should build a bundle from a single SKILL.md', async () => {
      const skillPath = join(testDir, 'SKILL.md');
      await writeFile(skillPath, '---\nname: Test Skill\nlabels:\n  - test\n---\n\nBody content');

      const bundle = await buildSingleSkillMdBundle({
        filePath: skillPath,
        requestedLevel: 5,
      });

      expect(bundle.sourceKind).toBe('single-skill-md');
      expect(bundle.title).toBe('Test Skill');
      expect(bundle.labels).toEqual(['test']);
      expect(bundle.requiredLevel).toBe(5);
      expect(bundle.files).toHaveLength(1);
      expect(bundle.files[0]?.path).toBe('SKILL.md');
      expect(bundle.files[0]?.kind).toBe('skill-markdown');
      expect(bundle.files[0]?.mediaType).toBe('text/markdown');
      expect(bundle.files[0]?.includeInDerivation).toBe(true);
      expect(bundle.files[0]?.activationOnly).toBe(false);
      expect(bundle.scriptDescriptors).toHaveLength(0);
    });

    it('should produce scope: global', async () => {
      const skillPath = join(testDir, 'SKILL.md');
      await writeFile(skillPath, '---\nname: Test Skill\n---\n\nBody');

      const bundle = await buildSingleSkillMdBundle({
        filePath: skillPath,
        requestedLevel: 1,
      });

      expect(bundle.scope).toBe('global');
    });

    it('should use defaults when no frontmatter metadata', async () => {
      const skillPath = join(testDir, 'SKILL.md');
      await writeFile(skillPath, 'Just some plain text');

      const bundle = await buildSingleSkillMdBundle({
        filePath: skillPath,
        requestedLevel: 3,
      });

      expect(bundle.title).toBe('Untitled Skill');
      expect(bundle.labels).toEqual(['imported']);
    });
  });

  describe('formatListResponse', () => {
    it('should return "No knowledge entries found" for empty list', () => {
      const response = { items: [] };
      const result = formatListResponse(response as { items: never[] });
      expect(result).toBe('No knowledge entries found');
    });

    it('should format single entry with all fields', () => {
      const response = {
        items: [
          {
            id: 'knowledge_1',
            lifecycleState: 'approved',
            scope: 'project',
            requiredLevel: 5,
            shortcut: 'my-shortcut',
          },
        ],
      };
      const result = formatListResponse(response as { items: unknown[] });
      expect(result).toContain('knowledge_1 [approved]');
      expect(result).toContain('Scope: project');
      expect(result).toContain('Required level: 5');
      expect(result).toContain('Shortcut: my-shortcut');
    });

    it('should format multiple entries separated by blank lines', () => {
      const response = {
        items: [
          {
            id: 'knowledge_1',
            lifecycleState: 'approved',
            scope: 'project',
            requiredLevel: 5,
            shortcut: 'shortcut-1',
          },
          {
            id: 'knowledge_2',
            lifecycleState: 'pending',
            scope: 'global',
            requiredLevel: 3,
            shortcut: 'shortcut-2',
          },
        ],
      };
      const result = formatListResponse(response as { items: unknown[] });
      expect(result).toContain('knowledge_1 [approved]');
      expect(result).toContain('knowledge_2 [pending]');
      // Entries should be separated by double newline
      expect(result).toContain('\n\n');
    });
  });

  describe('buildArtifactBundle', () => {
    it('should build a canonical bundle from a skill directory', async () => {
      await writeFile(
        join(testDir, 'SKILL.md'),
        '---\nname: Dir Skill\nlabels:\n  - dir\n---\n\nSkill body',
      );
      await mkdir(join(testDir, 'references'), { recursive: true });
      await writeFile(join(testDir, 'references', 'guide.md'), '# Guide');
      await mkdir(join(testDir, 'assets'), { recursive: true });
      await writeFile(join(testDir, 'assets', 'data.yml'), 'key: value');
      await mkdir(join(testDir, 'scripts'), { recursive: true });
      await writeFile(join(testDir, 'scripts', 'run.sh'), '#!/bin/bash\necho hi');

      const bundle = await buildArtifactBundle({
        rootPath: testDir,
        requestedLevel: 7,
        sourceKind: 'skill-directory',
      });

      expect(bundle.title).toBe('Dir Skill');
      expect(bundle.labels).toEqual(['dir']);
      expect(bundle.requiredLevel).toBe(7);
      expect(bundle.sourceKind).toBe('skill-directory');
      expect(bundle.scope).toBe('project');
      expect(bundle.files.length).toBe(4);

      const kinds = bundle.files.map((f) => f.kind);
      expect(kinds).toContain('skill-markdown');
      expect(kinds).toContain('reference');
      expect(kinds).toContain('asset');
      expect(kinds).toContain('script');

      expect(bundle.scriptDescriptors).toHaveLength(1);
      expect(bundle.scriptDescriptors[0]?.path).toBe('scripts/run.sh');
      expect(bundle.scriptDescriptors[0]?.defaultPolicy).toBe('manual');
    });

    it('should throw when SKILL.md not found in skill-directory mode', async () => {
      await mkdir(join(testDir, 'references'), { recursive: true });
      await writeFile(join(testDir, 'references', 'doc.md'), '# Doc');

      await expect(
        buildArtifactBundle({
          rootPath: testDir,
          requestedLevel: 3,
          sourceKind: 'skill-directory',
        }),
      ).rejects.toThrow('SKILL.md not found in directory');
    });

    it('should compute correct SHA-256 hashes for all files', async () => {
      const skillContent = '---\nname: Hashed\n---\n\nContent';
      await writeFile(join(testDir, 'SKILL.md'), skillContent);

      const bundle = await buildArtifactBundle({
        rootPath: testDir,
        requestedLevel: 3,
        sourceKind: 'skill-directory',
      });

      const skillFile = bundle.files.find((f) => f.path === 'SKILL.md');
      expect(skillFile?.sha256).toHaveLength(64);
      expect(skillFile?.sha256).toBe(computeFileHash(Buffer.from(skillContent)));
    });
  });
});
