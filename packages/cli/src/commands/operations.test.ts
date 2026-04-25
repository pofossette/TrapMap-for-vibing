/**
 * Tests for CLI operations commands (Phase 13: Wave 0).
 *
 * This module covers:
 * - Directory detection and canonical payload emission (IMEX-01)
 * - Single SKILL.md compatibility import (IMEX-03)
 * - Path validation and file classification (T-13-01, T-13-02)
 * - Stable output routing (COMP-01)
 */

import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
import { loadCliState } from '../lib/config.js';
import { apiRequest } from '../lib/http.js';
import { registerOperationsCommands } from './operations.js';

// Mock the named import - get a reference to the mock function
const mockedApiRequest = vi.mocked(apiRequest);
const mockedLoadCliState = vi.mocked(loadCliState);

// Type for mock API call arguments
interface MockCallArgs {
  body: {
    bundles: Array<{
      sourceKind: string;
      files: Array<{
        path: string;
        kind: string;
        includeInDerivation: boolean;
        activationOnly: boolean;
      }>;
    }>;
  };
}

describe('CLI operations commands (Phase 13)', () => {
  let program: Command;
  let testDir: string;
  const mockState = {
    serverUrl: 'http://localhost:3000',
    sessionToken: 'test-token',
    session: null,
  };

  const mockArtifactImportResponse = {
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
  };

  beforeEach(async () => {
    // Create test directory
    testDir = join(tmpdir(), `trapmap-test-${Date.now()}-${Math.random()}`);
    await mkdir(testDir, { recursive: true });

    // Setup mocks - reset and set implementation
    mockedApiRequest.mockReset();
    mockedLoadCliState.mockReset();

    mockedLoadCliState.mockResolvedValue(mockState);
    mockedApiRequest.mockResolvedValue(mockArtifactImportResponse);

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

      // Execute import command
      await program.parseAsync(['node', 'test', 'import', '--file', testDir, '--level', '3']);

      // Verify API was called with artifact bundle
      expect(mockedApiRequest).toHaveBeenCalledWith(
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
      await program.parseAsync(['node', 'test', 'import', '--file', testDir, '--level', '3']);

      const callArgs = mockedApiRequest.mock.calls[0];
      expect(callArgs).toBeDefined();
      const args = callArgs?.[1] as MockCallArgs;
      // biome-ignore lint/style/noNonNullAssertion: Test ensures bundle exists
      const bundle = args.body.bundles[0]!;

      const skillMdFile = bundle.files.find((f) => f.path === 'SKILL.md');
      expect(skillMdFile).toBeDefined();
      expect(skillMdFile?.kind).toBe('skill-markdown');
      expect(skillMdFile?.includeInDerivation).toBe(true);
      expect(skillMdFile?.activationOnly).toBe(false);
    });

    it('should classify references/ as reference with derivation eligibility', async () => {
      await program.parseAsync(['node', 'test', 'import', '--file', testDir, '--level', '3']);

      const callArgs = mockedApiRequest.mock.calls[0];
      expect(callArgs).toBeDefined();
      const args = callArgs?.[1] as MockCallArgs;
      // biome-ignore lint/style/noNonNullAssertion: Test ensures bundle exists
      const bundle = args.body.bundles[0]!;

      const refFile = bundle.files.find((f) => f.path === 'references/docker.md');
      expect(refFile).toBeDefined();
      expect(refFile?.kind).toBe('reference');
      expect(refFile?.includeInDerivation).toBe(true);
      expect(refFile?.activationOnly).toBe(false);
    });

    it('should classify assets/ as asset with activation-only flag', async () => {
      await program.parseAsync(['node', 'test', 'import', '--file', testDir, '--level', '3']);

      const callArgs = mockedApiRequest.mock.calls[0];
      expect(callArgs).toBeDefined();
      const args = callArgs?.[1] as MockCallArgs;
      // biome-ignore lint/style/noNonNullAssertion: Test ensures bundle exists
      const bundle = args.body.bundles[0]!;

      const assetFile = bundle.files.find((f) => f.path === 'assets/docker-compose.yml');
      expect(assetFile).toBeDefined();
      expect(assetFile?.kind).toBe('asset');
      expect(assetFile?.includeInDerivation).toBe(false);
      expect(assetFile?.activationOnly).toBe(true);
    });

    it('should classify scripts/ as script with activation-only flag', async () => {
      await program.parseAsync(['node', 'test', 'import', '--file', testDir, '--level', '3']);

      const callArgs = mockedApiRequest.mock.calls[0];
      expect(callArgs).toBeDefined();
      const args = callArgs?.[1] as MockCallArgs;
      // biome-ignore lint/style/noNonNullAssertion: Test ensures bundle exists
      const bundle = args.body.bundles[0]!;

      const scriptFile = bundle.files.find((f) => f.path === 'scripts/setup.sh');
      expect(scriptFile).toBeDefined();
      expect(scriptFile?.kind).toBe('script');
      expect(scriptFile?.includeInDerivation).toBe(false);
      expect(scriptFile?.activationOnly).toBe(true);
    });
  });

  describe('Single SKILL.md compatibility (IMEX-03)', () => {
    it('should detect single SKILL.md file and use artifact import', async () => {
      // Create single SKILL.md file with YAML frontmatter
      await writeFile(
        join(testDir, 'skill.md'),
        '---\nname: Test Skill\ndescription: Test description\n---\n\nTest content',
      );

      // Note: mockArtifactImportResponse is already set up in beforeEach
      // The single SKILL.md should route to artifact import endpoint

      await program.parseAsync([
        'node',
        'test',
        'import',
        '--file',
        join(testDir, 'skill.md'),
        '--level',
        '3',
      ]);

      // Verify artifact import endpoint was called (not legacy import)
      expect(mockedApiRequest).toHaveBeenCalledWith(
        mockState,
        expect.objectContaining({
          method: 'POST',
          path: '/v1/operations/artifacts/import',
        }),
      );

      // Verify the bundle has single-skill-md source kind
      const callArgs = mockedApiRequest.mock.calls[0];
      expect(callArgs).toBeDefined();
      const args = callArgs?.[1] as MockCallArgs;
      // biome-ignore lint/style/noNonNullAssertion: Test ensures bundle exists
      const bundle = args.body.bundles[0]!;
      expect(bundle.sourceKind).toBe('single-skill-md');
      expect(bundle.files.length).toBe(1);
      expect(bundle.files[0]?.path).toBe('SKILL.md');
    });

    it('should preserve YAML list labels from SKILL.md metadata', async () => {
      await writeFile(
        join(testDir, 'skill.md'),
        [
          '---',
          'name: "Quoted Skill"',
          'labels:',
          '  - parsing',
          '  - mime',
          '---',
          '',
          'Body content',
        ].join('\n'),
      );

      await program.parseAsync([
        'node',
        'test',
        'import',
        '--file',
        join(testDir, 'skill.md'),
        '--level',
        '3',
      ]);

      const callArgs = mockedApiRequest.mock.calls[0];
      expect(callArgs).toBeDefined();
      const args = callArgs?.[1] as MockCallArgs;
      const bundle = args.body.bundles[0];

      expect(bundle).toBeDefined();
      expect(bundle?.title).toBe('Quoted Skill');
      expect(bundle?.labels).toEqual(['parsing', 'mime']);
    });
  });

  describe('Path validation (T-13-01)', () => {
    it('should skip hidden files and node_modules during directory scan', async () => {
      // Create directory with hidden files and node_modules
      await writeFile(join(testDir, 'SKILL.md'), '# Test Skill\n\nname: Test Skill');
      await writeFile(join(testDir, '.env'), 'SECRET_KEY=secret');
      await mkdir(join(testDir, 'node_modules'), { recursive: true });
      await writeFile(join(testDir, 'node_modules', 'package.json'), '{}');

      await program.parseAsync(['node', 'test', 'import', '--file', testDir, '--level', '3']);

      const callArgs = mockedApiRequest.mock.calls[0];
      expect(callArgs).toBeDefined();
      const args = callArgs?.[1] as MockCallArgs;
      // biome-ignore lint/style/noNonNullAssertion: Test ensures bundle exists
      const bundle = args.body.bundles[0]!;

      // Should only have SKILL.md, not .env or node_modules files
      expect(bundle.files.length).toBe(1);
      expect(bundle.files[0]?.path).toBe('SKILL.md');
    });
  });

  describe('Output routing (COMP-01)', () => {
    it('should provide stable human-readable output for successful import', async () => {
      await writeFile(join(testDir, 'SKILL.md'), '# Test Skill\n\nname: Test Skill');

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await program.parseAsync(['node', 'test', 'import', '--file', testDir, '--level', '3']);

      const calls = consoleSpy.mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      const output = calls[0]?.[0] as string;
      expect(output).toContain('Imported 1 artifacts');
      expect(output).toContain('✓ Test Skill: OK');

      consoleSpy.mockRestore();
    });

    it('should provide stable JSON output when --json flag is used', async () => {
      await writeFile(join(testDir, 'SKILL.md'), '# Test Skill\n\nname: Test Skill');

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await program.parseAsync([
        'node',
        'test',
        'import',
        '--file',
        testDir,
        '--level',
        '3',
        '--json',
      ]);

      const calls = consoleSpy.mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      const output = calls[0]?.[0] as string;
      const parsed = JSON.parse(output);
      expect(parsed.importedCount).toBe(1);
      expect(parsed.results[0].artifactId).toBe('artifact_1');

      consoleSpy.mockRestore();
    });
  });

  describe('CLI activation commands (Phase 15-03)', () => {
    let activationProgram: Command;

    beforeEach(async () => {
      // Setup mocks for activation tests
      mockedApiRequest.mockReset();
      mockedLoadCliState.mockReset();

      mockedLoadCliState.mockResolvedValue(mockState);

      // Create program with activation commands enabled
      activationProgram = new Command();
      registerOperationsCommands(activationProgram, {
        allowImport: true,
        allowExport: true,
        allowEdit: false,
        allowDeactivate: false,
      });
    });

    it('should call activation endpoint with selected paths', async () => {
      const mockActivationResponse = {
        data: {
          artifactId: 'artifact_1',
          title: 'Test Skill',
          revision: 1,
          requiredLevel: 3,
          files: [
            {
              path: 'references/docker.md',
              kind: 'reference',
              sha256: 'a'.repeat(64),
              sizeBytes: 1024,
              mediaType: 'text/markdown',
              source: 'references/',
              content: '# Docker content',
            },
          ],
          scriptDescriptors: [],
          activatedAt: '2024-01-01T00:00:00Z',
          activatedBy: {
            id: 'user_1',
            handle: 'testuser',
            securityLevel: 5,
          },
        },
        sessionToken: 'test-token',
      };

      mockedApiRequest.mockResolvedValue(mockActivationResponse);

      await activationProgram.parseAsync([
        'node',
        'test',
        'activate',
        '--artifact',
        'artifact_1',
        '--paths',
        'references/docker.md,assets/docker-compose.yml',
        '--output',
        testDir,
      ]);

      expect(mockedApiRequest).toHaveBeenCalledWith(
        mockState,
        expect.objectContaining({
          method: 'POST',
          path: '/v1/operations/artifacts/activate',
        }),
      );

      const callArgs = mockedApiRequest.mock.calls[0];
      expect(callArgs).toBeDefined();
      const args = callArgs?.[1] as { body: { selectedPaths: string[] } };
      expect(args.body.selectedPaths).toEqual([
        'references/docker.md',
        'assets/docker-compose.yml',
      ]);
    });

    it('should materialize fetched files locally using safe path validation', async () => {
      const mockActivationResponse = {
        data: {
          artifactId: 'artifact_1',
          title: 'Test Skill',
          revision: 1,
          requiredLevel: 3,
          files: [
            {
              path: 'SKILL.md',
              kind: 'skill-markdown',
              sha256: 'a'.repeat(64),
              sizeBytes: 100,
              mediaType: 'text/markdown',
              source: 'SKILL.md',
              content: '# Test Skill',
            },
          ],
          scriptDescriptors: [],
          activatedAt: '2024-01-01T00:00:00Z',
          activatedBy: {
            id: 'user_1',
            handle: 'testuser',
            securityLevel: 5,
          },
        },
        sessionToken: 'test-token',
      };

      mockedApiRequest.mockResolvedValue(mockActivationResponse);

      await activationProgram.parseAsync([
        'node',
        'test',
        'activate',
        '--artifact',
        'artifact_1',
        '--paths',
        'SKILL.md',
        '--output',
        testDir,
      ]);

      // Verify file was written
      const { readFile } = await import('node:fs/promises');
      const content = await readFile(join(testDir, 'SKILL.md'), 'utf8');
      expect(content).toBe('# Test Skill');
    });

    it('should enforce effective policy before staging scripts (T-15-09 mitigation)', async () => {
      const mockActivationResponse = {
        data: {
          artifactId: 'artifact_1',
          title: 'Test Skill',
          revision: 1,
          requiredLevel: 3,
          files: [
            {
              path: 'scripts/setup.sh',
              kind: 'script',
              sha256: 'b'.repeat(64),
              sizeBytes: 512,
              mediaType: 'text/x-shellscript',
              source: 'scripts/',
              content: '#!/bin/bash\necho setup',
            },
          ],
          scriptDescriptors: [
            {
              path: 'scripts/setup.sh',
              sha256: 'b'.repeat(64),
              capability: 'Environment setup',
              argsSchemaSummary: 'None',
              sideEffectSummary: 'Creates config files',
              defaultPolicy: 'blocked',
            },
          ],
          activatedAt: '2024-01-01T00:00:00Z',
          activatedBy: {
            id: 'user_1',
            handle: 'testuser',
            securityLevel: 5,
          },
        },
        sessionToken: 'test-token',
      };

      mockedApiRequest.mockResolvedValue(mockActivationResponse);

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await activationProgram.parseAsync([
        'node',
        'test',
        'activate',
        '--artifact',
        'artifact_1',
        '--paths',
        'scripts/setup.sh',
        '--output',
        testDir,
      ]);

      const calls = consoleSpy.mock.calls;
      expect(calls.length).toBeGreaterThan(0);

      // Check stdout for success message
      const stdout = calls.map((c) => c[0]).join('\n');
      expect(stdout).toContain('Activated');

      // Verify console.warn was called for blocked policy (T-15-09 mitigation)
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      // Re-run to capture warn output
      await activationProgram.parseAsync([
        'node',
        'test',
        'activate',
        '--artifact',
        'artifact_1',
        '--paths',
        'scripts/setup.sh',
        '--output',
        testDir,
      ]);
      expect(warnSpy.mock.calls.length).toBeGreaterThan(0);
      const warnOutput = warnSpy.mock.calls.map((c) => c[0]).join('\n');
      expect(warnOutput).toContain('blocked');
      warnSpy.mockRestore();
      consoleSpy.mockRestore();
    });

    it('should provide JSON output matching activation response contract', async () => {
      const mockActivationResponse = {
        data: {
          artifactId: 'artifact_1',
          title: 'Test Skill',
          revision: 1,
          requiredLevel: 3,
          files: [
            {
              path: 'references/docker.md',
              kind: 'reference',
              sha256: 'a'.repeat(64),
              sizeBytes: 1024,
              mediaType: 'text/markdown',
              source: 'references/',
              content: '# Docker content',
            },
          ],
          scriptDescriptors: [],
          activatedAt: '2024-01-01T00:00:00Z',
          activatedBy: {
            id: 'user_1',
            handle: 'testuser',
            securityLevel: 5,
          },
        },
        sessionToken: 'test-token',
      };

      mockedApiRequest.mockResolvedValue(mockActivationResponse);

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await activationProgram.parseAsync([
        'node',
        'test',
        'activate',
        '--artifact',
        'artifact_1',
        '--paths',
        'references/docker.md',
        '--json',
      ]);

      const calls = consoleSpy.mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      const output = calls[0]?.[0] as string;
      const parsed = JSON.parse(output);
      expect(parsed.artifactId).toBe('artifact_1');
      expect(parsed.files).toHaveLength(1);

      consoleSpy.mockRestore();
    });
  });

  describe('CLI migration commands (Phase 16-01)', () => {
    let migrationProgram: Command;

    const mockMigrationResponse = {
      data: {
        results: [
          {
            entryId: 'knowledge_1',
            artifactId: 'artifact_1',
            success: true,
            skipReason: null,
            error: null,
          },
          {
            entryId: 'knowledge_2',
            artifactId: null,
            success: false,
            skipReason: 'already-migrated',
            error: null,
          },
        ],
        migratedCount: 1,
        skippedCount: 1,
        failedCount: 0,
        remainingLegacyCount: 50,
        migratedAt: '2024-01-01T00:00:00Z',
      },
      sessionToken: 'test-token',
    };

    const mockStatusResponse = {
      data: {
        totalLegacyEntries: 100,
        migratedEntriesCount: 50,
        unmigratedEntriesCount: 50,
        totalArtifacts: 60,
        artifactsBySourceKind: {
          'skill-directory': 5,
          'single-skill-md': 5,
          'legacy-knowledge': 50,
        },
        unmigratedEntryIds: ['knowledge_10', 'knowledge_11'],
        coexistenceActive: true,
        sunsetReady: false,
        sunsetBlockers: ['50 unmigrated entries remaining'],
        reportedAt: '2024-01-01T00:00:00Z',
      },
      sessionToken: 'test-token',
    };

    beforeEach(async () => {
      mockedApiRequest.mockReset();
      mockedLoadCliState.mockReset();
      mockedLoadCliState.mockResolvedValue(mockState);
      mockedApiRequest.mockResolvedValue(mockMigrationResponse);

      migrationProgram = new Command();
      registerOperationsCommands(migrationProgram, {
        allowImport: true,
        allowExport: true,
        allowEdit: false,
        allowDeactivate: false,
      });
    });

    describe('migrate command', () => {
      it('should call migration endpoint with explicit entry IDs', async () => {
        await migrationProgram.parseAsync([
          'node',
          'test',
          'migrate',
          '--entries',
          'knowledge_1,knowledge_2',
        ]);

        expect(mockedApiRequest).toHaveBeenCalledWith(
          mockState,
          expect.objectContaining({
            method: 'POST',
            path: '/v1/operations/migrate',
          }),
        );

        const callArgs = mockedApiRequest.mock.calls[0];
        expect(callArgs).toBeDefined();
        const args = callArgs?.[1] as { body: { mode: string; entryIds: string[] } };
        expect(args.body.mode).toBe('explicit');
        expect(args.body.entryIds).toEqual(['knowledge_1', 'knowledge_2']);
      });

      it('should call migration endpoint with all-approved mode', async () => {
        await migrationProgram.parseAsync([
          'node',
          'test',
          'migrate',
          '--all-approved',
          '--limit',
          '25',
        ]);

        expect(mockedApiRequest).toHaveBeenCalledWith(
          mockState,
          expect.objectContaining({
            method: 'POST',
            path: '/v1/operations/migrate',
          }),
        );

        const callArgs = mockedApiRequest.mock.calls[0];
        expect(callArgs).toBeDefined();
        const args = callArgs?.[1] as { body: { mode: string; limit: number } };
        expect(args.body.mode).toBe('all-approved');
        expect(args.body.limit).toBe(25);
      });

      it('should call migration endpoint with all-team mode', async () => {
        await migrationProgram.parseAsync(['node', 'test', 'migrate', '--all-team', 'team_1']);

        const callArgs = mockedApiRequest.mock.calls[0];
        expect(callArgs).toBeDefined();
        const args = callArgs?.[1] as { body: { mode: string; teamId: string } };
        expect(args.body.mode).toBe('all-team');
        expect(args.body.teamId).toBe('team_1');
      });

      it('should provide human-readable output with migrated artifact IDs', async () => {
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

        await migrationProgram.parseAsync([
          'node',
          'test',
          'migrate',
          '--entries',
          'knowledge_1,knowledge_2',
        ]);

        const calls = consoleSpy.mock.calls;
        expect(calls.length).toBeGreaterThan(0);
        const output = calls[0]?.[0] as string;
        expect(output).toContain('Migrated 1 entries');
        expect(output).toContain('skipped 1');
        expect(output).toContain('Remaining legacy entries: 50');

        consoleSpy.mockRestore();
      });

      it('should provide stable JSON output with migration result fields', async () => {
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

        await migrationProgram.parseAsync([
          'node',
          'test',
          'migrate',
          '--entries',
          'knowledge_1',
          '--json',
        ]);

        const calls = consoleSpy.mock.calls;
        expect(calls.length).toBeGreaterThan(0);
        const output = calls[0]?.[0] as string;
        const parsed = JSON.parse(output);
        expect(parsed.migratedCount).toBe(1);
        expect(parsed.skippedCount).toBe(1);
        expect(parsed.results).toHaveLength(2);
        expect(parsed.results[0].entryId).toBe('knowledge_1');
        expect(parsed.results[0].artifactId).toBe('artifact_1');

        consoleSpy.mockRestore();
      });

      it('should require one of --entries, --all-approved, or --all-team', async () => {
        await expect(migrationProgram.parseAsync(['node', 'test', 'migrate'])).rejects.toThrow();
      });
    });

    describe('status command', () => {
      beforeEach(() => {
        mockedApiRequest.mockResolvedValue(mockStatusResponse);
      });

      it('should call status endpoint', async () => {
        await migrationProgram.parseAsync(['node', 'test', 'status']);

        expect(mockedApiRequest).toHaveBeenCalledWith(
          mockState,
          expect.objectContaining({
            path: '/v1/operations/status',
          }),
        );
      });

      it('should call status endpoint with team filter', async () => {
        await migrationProgram.parseAsync(['node', 'test', 'status', '--team', 'team_1']);

        expect(mockedApiRequest).toHaveBeenCalledWith(
          mockState,
          expect.objectContaining({
            path: '/v1/operations/status?teamId=team_1',
          }),
        );
      });

      it('should provide human-readable output with migration status', async () => {
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

        await migrationProgram.parseAsync(['node', 'test', 'status']);

        const calls = consoleSpy.mock.calls;
        expect(calls.length).toBeGreaterThan(0);
        const output = calls[0]?.[0] as string;
        expect(output).toContain('Legacy entries: 100');
        expect(output).toContain('Migrated: 50');
        expect(output).toContain('Unmigrated: 50');
        expect(output).toContain('Total artifacts: 60');
        expect(output).toContain('Sunset ready: false');

        consoleSpy.mockRestore();
      });

      it('should provide stable JSON output with status fields', async () => {
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

        await migrationProgram.parseAsync(['node', 'test', 'status', '--json']);

        const calls = consoleSpy.mock.calls;
        expect(calls.length).toBeGreaterThan(0);
        const output = calls[0]?.[0] as string;
        const parsed = JSON.parse(output);
        expect(parsed.totalLegacyEntries).toBe(100);
        expect(parsed.migratedEntriesCount).toBe(50);
        expect(parsed.unmigratedEntriesCount).toBe(50);
        expect(parsed.totalArtifacts).toBe(60);
        expect(parsed.sunsetReady).toBe(false);
        expect(parsed.sunsetBlockers).toHaveLength(1);

        consoleSpy.mockRestore();
      });
    });
  });
});
