/**
 * Tests for CLI operations commands (Phase 13: Wave 0).
 *
 * This module covers:
 * - Directory detection and canonical payload emission (IMEX-01)
 * - Single SKILL.md compatibility import (IMEX-03)
 * - Path validation and file classification (T-13-01, T-13-02)
 * - Stable output routing (COMP-01)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Mock dependencies before importing
vi.mock('../lib/http.js', () => ({
  apiRequest: vi.fn(),
  requireSessionToken: vi.fn(),
}));

vi.mock('../lib/config.js', () => ({
  loadCliState: vi.fn(),
}));

// Import after mocking
import { Command } from 'commander';
import { registerOperationsCommands } from './operations.js';
import { apiRequest } from '../lib/http.js';
import { loadCliState } from '../lib/config.js';

describe('CLI operations commands (Phase 13)', () => {
  let program: Command;
  let testDir: string;
  const mockState = {
    serverUrl: 'http://localhost:3000',
    sessionToken: 'test-token',
    session: null,
  };

  beforeEach(async () => {
    // Create test directory
    testDir = join(tmpdir(), `skill-shareer-test-${Date.now()}-${Math.random()}`);
    await mkdir(testDir, { recursive: true });

    // Setup mocks
    vi.mocked(loadCliState).mockResolvedValue(mockState);
    vi.mocked(apiRequest).mockResolvedValue({
      data: {
        results: [
          {
            success: true,
            artifactId: 'artifact_1',
            title: 'Test Skill',
            error: null,
            sourceKind: 'skill-directory',
          },
        ],
        importedCount: 1,
        failedCount: 0,
      },
      sessionToken: 'test-token',
    } as any);

    // Create program and register commands
    program = new Command();
    registerOperationsCommands(program, {
      allowImport: true,
      allowExport: true,
      allowEdit: false,
      allowDeactivate: false,
    });
  });

  afterEach(async () => {
    // Clean up test directory
    await rm(testDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  describe('Directory detection (IMEX-01)', () => {
    it('should detect directory input and emit canonical artifact bundle', async () => {
      // Create a skill directory structure
      await writeFile(join(testDir, 'SKILL.md'), '# Test Skill\n\nTest content');
      await mkdir(join(testDir, 'references'), { recursive: true });
      await writeFile(join(testDir, 'references/docker.md'), '# Docker\n\nDocker tips');
      await mkdir(join(testDir, 'assets'), { recursive: true });
      await writeFile(join(testDir, 'assets/docker-compose.yml'), 'version: "3.8"');
      await mkdir(join(testDir, 'scripts'), { recursive: true });
      await writeFile(join(testDir, 'scripts/setup.sh'), '#!/bin/bash\necho "setup"');

      // Mock successful API response
      vi.mocked(apiRequest).mockResolvedValue({
        data: {
          results: [
            {
              success: true,
              artifactId: 'artifact_1',
              title: 'Test Skill',
              error: null,
              sourceKind: 'skill-directory',
            },
          ],
          importedCount: 1,
          failedCount: 0,
        },
        sessionToken: 'test-token',
      });

      // Execute import command
      await program.parseAsync(['node', 'test', 'import', '--file', testDir, '--level', '3']);

      // Verify API was called with artifact bundle
      expect(apiRequest).toHaveBeenCalledWith(
        mockState,
        expect.objectContaining({
          method: 'POST',
          path: '/v1/operations/artifacts/import',
        }),
      );
    });

    it('should reject directory without SKILL.md for skill-directory import', async () => {
      // Create directory without SKILL.md
      await mkdir(join(testDir, 'references'), { recursive: true });
      await writeFile(join(testDir, 'references/test.md'), '# Test');

      // Execute import command and expect error
      await expect(
        program.parseAsync(['node', 'test', 'import', '--file', testDir, '--level', '3']),
      ).rejects.toThrow('SKILL.md not found in directory');
    });
  });

  describe('File classification (T-13-01, T-13-02)', () => {
    beforeEach(async () => {
      // Create skill directory with all file types
      await writeFile(join(testDir, 'SKILL.md'), '# Test Skill\n\nname: Test Skill');
      await mkdir(join(testDir, 'references'), { recursive: true });
      await writeFile(join(testDir, 'references/docker.md'), '# Docker\n\nDocker tips');
      await mkdir(join(testDir, 'assets'), { recursive: true });
      await writeFile(join(testDir, 'assets/docker-compose.yml'), 'version: "3.8"');
      await mkdir(join(testDir, 'scripts'), { recursive: true });
      await writeFile(join(testDir, 'scripts/setup.sh'), '#!/bin/bash\necho "setup"');
    });

    it('should classify SKILL.md as skill-markdown', async () => {
      vi.mocked(apiRequest).mockResolvedValue({
        data: {
          results: [
            {
              success: true,
              artifactId: 'artifact_1',
              title: 'Test Skill',
              error: null,
              sourceKind: 'skill-directory',
            },
          ],
          importedCount: 1,
          failedCount: 0,
        },
        sessionToken: 'test-token',
      });

      await program.parseAsync(['node', 'test', 'import', '--file', testDir, '--level', '3']);

      const callArgs = vi.mocked(apiRequest).mock.calls[0];
      const bundle = callArgs[1].body.bundles[0];

      const skillMdFile = bundle.files.find((f: { path: string }) => f.path === 'SKILL.md');
      expect(skillMdFile).toBeDefined();
      expect(skillMdFile.kind).toBe('skill-markdown');
      expect(skillMdFile.includeInDerivation).toBe(true);
      expect(skillMdFile.activationOnly).toBe(false);
    });

    it('should classify references/ as reference with derivation eligibility', async () => {
      vi.mocked(apiRequest).mockResolvedValue({
        data: {
          results: [
            {
              success: true,
              artifactId: 'artifact_1',
              title: 'Test Skill',
              error: null,
              sourceKind: 'skill-directory',
            },
          ],
          importedCount: 1,
          failedCount: 0,
        },
        sessionToken: 'test-token',
      });

      await program.parseAsync(['node', 'test', 'import', '--file', testDir, '--level', '3']);

      const callArgs = vi.mocked(apiRequest).mock.calls[0];
      const bundle = callArgs[1].body.bundles[0];

      const refFile = bundle.files.find((f: { path: string }) => f.path === 'references/docker.md');
      expect(refFile).toBeDefined();
      expect(refFile.kind).toBe('reference');
      expect(refFile.includeInDerivation).toBe(true);
      expect(refFile.activationOnly).toBe(false);
    });

    it('should classify assets/ as asset with activation-only flag', async () => {
      vi.mocked(apiRequest).mockResolvedValue({
        data: {
          results: [
            {
              success: true,
              artifactId: 'artifact_1',
              title: 'Test Skill',
              error: null,
              sourceKind: 'skill-directory',
            },
          ],
          importedCount: 1,
          failedCount: 0,
        },
        sessionToken: 'test-token',
      });

      await program.parseAsync(['node', 'test', 'import', '--file', testDir, '--level', '3']);

      const callArgs = vi.mocked(apiRequest).mock.calls[0];
      const bundle = callArgs[1].body.bundles[0];

      const assetFile = bundle.files.find((f: { path: string }) => f.path === 'assets/docker-compose.yml');
      expect(assetFile).toBeDefined();
      expect(assetFile.kind).toBe('asset');
      expect(assetFile.includeInDerivation).toBe(false);
      expect(assetFile.activationOnly).toBe(true);
    });

    it('should classify scripts/ as script with activation-only flag', async () => {
      vi.mocked(apiRequest).mockResolvedValue({
        data: {
          results: [
            {
              success: true,
              artifactId: 'artifact_1',
              title: 'Test Skill',
              error: null,
              sourceKind: 'skill-directory',
            },
          ],
          importedCount: 1,
          failedCount: 0,
        },
        sessionToken: 'test-token',
      });

      await program.parseAsync(['node', 'test', 'import', '--file', testDir, '--level', '3']);

      const callArgs = vi.mocked(apiRequest).mock.calls[0];
      const bundle = callArgs[1].body.bundles[0];

      const scriptFile = bundle.files.find((f: { path: string }) => f.path === 'scripts/setup.sh');
      expect(scriptFile).toBeDefined();
      expect(scriptFile.kind).toBe('script');
      expect(scriptFile.includeInDerivation).toBe(false);
      expect(scriptFile.activationOnly).toBe(true);
    });
  });

  describe('Single SKILL.md compatibility (IMEX-03)', () => {
    it('should detect single SKILL.md file and use legacy import', async () => {
      // Create single SKILL.md file
      await writeFile(join(testDir, 'skill.md'), '# Test Skill\n\nname: Test Skill\n\nTest content');

      vi.mocked(apiRequest).mockResolvedValue({
        data: {
          results: [
            {
              success: true,
              entry: {
                id: 'knowledge_1',
                shortcut: 'Test Skill',
                detail: 'Test content',
              },
              error: null,
              source: 'claude-skill',
            },
          ],
          importedCount: 1,
          failedCount: 0,
        },
        sessionToken: 'test-token',
      });

      await program.parseAsync(['node', 'test', 'import', '--file', join(testDir, 'skill.md'), '--level', '3']);

      // Verify legacy import endpoint was called
      expect(mockApiRequest).toHaveBeenCalledWith(
        mockState,
        expect.objectContaining({
          method: 'POST',
          path: '/v1/operations/import',
        }),
      );
    });
  });

  describe('Path validation (T-13-01)', () => {
    it('should skip hidden files and node_modules during directory scan', async () => {
      // Create directory with hidden files and node_modules
      await writeFile(join(testDir, 'SKILL.md'), '# Test Skill\n\nname: Test Skill');
      await writeFile(join(testDir, '.env'), 'SECRET_KEY=secret');
      await mkdir(join(testDir, 'node_modules'), { recursive: true });
      await writeFile(join(testDir, 'node_modules', 'package.json'), '{}');

      vi.mocked(apiRequest).mockResolvedValue({
        data: {
          results: [
            {
              success: true,
              artifactId: 'artifact_1',
              title: 'Test Skill',
              error: null,
              sourceKind: 'skill-directory',
            },
          ],
          importedCount: 1,
          failedCount: 0,
        },
        sessionToken: 'test-token',
      });

      await program.parseAsync(['node', 'test', 'import', '--file', testDir, '--level', '3']);

      const callArgs = vi.mocked(apiRequest).mock.calls[0];
      const bundle = callArgs[1].body.bundles[0];

      // Should only have SKILL.md, not .env or node_modules files
      expect(bundle.files.length).toBe(1);
      expect(bundle.files[0].path).toBe('SKILL.md');
    });
  });

  describe('Output routing (COMP-01)', () => {
    it('should provide stable human-readable output for successful import', async () => {
      await writeFile(join(testDir, 'SKILL.md'), '# Test Skill\n\nname: Test Skill');

      vi.mocked(apiRequest).mockResolvedValue({
        data: {
          results: [
            {
              success: true,
              artifactId: 'artifact_1',
              title: 'Test Skill',
              error: null,
              sourceKind: 'skill-directory',
            },
          ],
          importedCount: 1,
          failedCount: 0,
        },
        sessionToken: 'test-token',
      });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await program.parseAsync(['node', 'test', 'import', '--file', testDir, '--level', '3']);

      const output = consoleSpy.mock.calls[0][0];
      expect(output).toContain('Imported 1 artifacts');
      expect(output).toContain('✓ Test Skill: OK');

      consoleSpy.mockRestore();
    });

    it('should provide stable JSON output when --json flag is used', async () => {
      await writeFile(join(testDir, 'SKILL.md'), '# Test Skill\n\nname: Test Skill');

      vi.mocked(apiRequest).mockResolvedValue({
        data: {
          results: [
            {
              success: true,
              artifactId: 'artifact_1',
              title: 'Test Skill',
              error: null,
              sourceKind: 'skill-directory',
            },
          ],
          importedCount: 1,
          failedCount: 0,
        },
        sessionToken: 'test-token',
      });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await program.parseAsync(['node', 'test', 'import', '--file', testDir, '--level', '3', '--json']);

      const output = consoleSpy.mock.calls[0][0];
      const parsed = JSON.parse(output);
      expect(parsed.importedCount).toBe(1);
      expect(parsed.results[0].artifactId).toBe('artifact_1');

      consoleSpy.mockRestore();
    });
  });
});
