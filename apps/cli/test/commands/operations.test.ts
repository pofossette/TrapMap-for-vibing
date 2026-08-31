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
vi.mock('../../src/lib/http.js', () => ({
  apiRequest: vi.fn(),
  requireSessionToken: vi.fn(),
}));

vi.mock('../../src/lib/config.js', () => ({
  loadCliState: vi.fn(),
}));

import { loadCliState } from '@trapmap/cli/lib/config.js';
import { apiRequest } from '@trapmap/cli/lib/http.js';
// Import after mocking
import { Command } from 'commander';
import { registerOperationsCommands } from '../../src/commands/operations.js';

// Mock the named import - get a reference to the mock function
const mockedApiRequest = vi.mocked(apiRequest);
const mockedLoadCliState = vi.mocked(loadCliState);

function createSilentCommand(): Command {
  return new Command().configureOutput({
    writeErr: () => {},
  });
}

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
    gatewayUrl: 'http://localhost:3000',
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
    testDir = join(process.cwd(), `.trapmap-test-${Date.now()}-${Math.random()}`);
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
      allowList: true,
      allowActivate: true,
      allowStatus: true,
      allowMigrate: true,
      allowCapsuleIndex: true,
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
      const bundle = args.body.bundles[0];

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
      const bundle = args.body.bundles[0];

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
      const bundle = args.body.bundles[0];

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
      const bundle = args.body.bundles[0];

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
      const bundle = args.body.bundles[0];
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
      const bundle = args.body.bundles[0];

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
        allowList: true,
        allowActivate: true,
        allowStatus: true,
        allowMigrate: true,
        allowCapsuleIndex: true,
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
        allowList: true,
        allowActivate: true,
        allowStatus: true,
        allowMigrate: true,
        allowCapsuleIndex: true,
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

// ============================================================================
// Phase 85: CLI Operations Refactoring - Nyquist Validation
// ============================================================================

describe('Phase 85: Permission guards', () => {
  let program: Command;

  beforeEach(() => {
    program = new Command();
  });

  describe('allowExport=false should hide export-dependent commands', () => {
    it('should not register export command when allowExport=false', () => {
      registerOperationsCommands(program, {
        allowImport: true,
        allowExport: false,
        allowEdit: true,
        allowDeactivate: true,
        allowList: true,
        allowActivate: true,
        allowStatus: true,
        allowMigrate: true,
        allowCapsuleIndex: true,
      });

      const commands = program.commands.map((c) => c.name());
      expect(commands).not.toContain('export');
      expect(commands).not.toContain('artifact-export');
    });
  });

  describe('allowList=false should hide list command', () => {
    it('should not register list command when allowList=false', () => {
      registerOperationsCommands(program, {
        allowImport: true,
        allowExport: true,
        allowEdit: true,
        allowDeactivate: true,
        allowList: false,
        allowActivate: true,
        allowStatus: true,
        allowMigrate: true,
        allowCapsuleIndex: true,
      });

      const commands = program.commands.map((c) => c.name());
      expect(commands).not.toContain('list');
    });
  });

  describe('allowActivate=false should hide activate command', () => {
    it('should not register activate command when allowActivate=false', () => {
      registerOperationsCommands(program, {
        allowImport: true,
        allowExport: true,
        allowEdit: true,
        allowDeactivate: true,
        allowList: true,
        allowActivate: false,
        allowStatus: true,
        allowMigrate: true,
        allowCapsuleIndex: true,
      });

      const commands = program.commands.map((c) => c.name());
      expect(commands).not.toContain('activate');
    });
  });

  describe('allowStatus=false should hide status command', () => {
    it('should not register status command when allowStatus=false', () => {
      registerOperationsCommands(program, {
        allowImport: true,
        allowExport: true,
        allowEdit: true,
        allowDeactivate: true,
        allowList: true,
        allowActivate: true,
        allowStatus: false,
        allowMigrate: true,
        allowCapsuleIndex: true,
      });

      const commands = program.commands.map((c) => c.name());
      expect(commands).not.toContain('status');
    });
  });

  describe('allowEdit=false should hide edit command', () => {
    it('should not register edit command when allowEdit=false', () => {
      registerOperationsCommands(program, {
        allowImport: true,
        allowExport: true,
        allowEdit: false,
        allowDeactivate: true,
        allowList: true,
        allowActivate: true,
        allowStatus: true,
        allowMigrate: true,
        allowCapsuleIndex: true,
      });

      const commands = program.commands.map((c) => c.name());
      expect(commands).not.toContain('edit');
    });

    it('should register edit command when allowEdit=true', () => {
      registerOperationsCommands(program, {
        allowImport: true,
        allowExport: true,
        allowEdit: true,
        allowDeactivate: true,
        allowList: true,
        allowActivate: true,
        allowStatus: true,
        allowMigrate: true,
        allowCapsuleIndex: true,
      });

      const commands = program.commands.map((c) => c.name());
      expect(commands).toContain('edit');
    });
  });

  describe('allowDeactivate=false should hide deactivate command', () => {
    it('should not register deactivate command when allowDeactivate=false', () => {
      registerOperationsCommands(program, {
        allowImport: true,
        allowExport: true,
        allowEdit: true,
        allowDeactivate: false,
        allowList: true,
        allowActivate: true,
        allowStatus: true,
        allowMigrate: true,
        allowCapsuleIndex: true,
      });

      const commands = program.commands.map((c) => c.name());
      expect(commands).not.toContain('deactivate');
    });

    it('should register deactivate command when allowDeactivate=true', () => {
      registerOperationsCommands(program, {
        allowImport: true,
        allowExport: true,
        allowEdit: true,
        allowDeactivate: true,
        allowList: true,
        allowActivate: true,
        allowStatus: true,
        allowMigrate: true,
        allowCapsuleIndex: true,
      });

      const commands = program.commands.map((c) => c.name());
      expect(commands).toContain('deactivate');
    });
  });

  describe('allowImport=false should hide import command', () => {
    it('should not register import command when allowImport=false', () => {
      registerOperationsCommands(program, {
        allowImport: false,
        allowExport: true,
        allowEdit: true,
        allowDeactivate: true,
        allowList: true,
        allowActivate: true,
        allowStatus: true,
        allowMigrate: true,
        allowCapsuleIndex: true,
      });

      const commands = program.commands.map((c) => c.name());
      expect(commands).not.toContain('import');
    });

    it('should register import command when allowImport=true', () => {
      registerOperationsCommands(program, {
        allowImport: true,
        allowExport: true,
        allowEdit: true,
        allowDeactivate: true,
        allowList: true,
        allowActivate: true,
        allowStatus: true,
        allowMigrate: true,
        allowCapsuleIndex: true,
      });

      const commands = program.commands.map((c) => c.name());
      expect(commands).toContain('import');
    });
  });

  describe('allowMigrate=false should hide migrate command', () => {
    it('should not register migrate command when allowMigrate=false', () => {
      registerOperationsCommands(program, {
        allowImport: true,
        allowExport: true,
        allowEdit: true,
        allowDeactivate: true,
        allowList: true,
        allowActivate: true,
        allowStatus: true,
        allowMigrate: false,
        allowCapsuleIndex: false,
      });

      const commands = program.commands.map((c) => c.name());
      expect(commands).not.toContain('migrate');
    });

    it('should register migrate command when allowMigrate=true', () => {
      registerOperationsCommands(program, {
        allowImport: true,
        allowExport: true,
        allowEdit: true,
        allowDeactivate: true,
        allowList: true,
        allowActivate: true,
        allowStatus: true,
        allowMigrate: true,
        allowCapsuleIndex: true,
      });

      const commands = program.commands.map((c) => c.name());
      expect(commands).toContain('migrate');
    });
  });

  describe('allowCapsuleIndex=false should hide capsule-index command', () => {
    it('should not register capsule-index command when allowCapsuleIndex=false', () => {
      registerOperationsCommands(program, {
        allowImport: true,
        allowExport: true,
        allowEdit: true,
        allowDeactivate: true,
        allowList: true,
        allowActivate: true,
        allowStatus: true,
        allowMigrate: true,
        allowCapsuleIndex: false,
      });

      const commands = program.commands.map((c) => c.name());
      expect(commands).not.toContain('capsule-index');
    });

    it('should register capsule-index command when allowCapsuleIndex=true', () => {
      registerOperationsCommands(program, {
        allowImport: true,
        allowExport: true,
        allowEdit: true,
        allowDeactivate: true,
        allowList: true,
        allowActivate: true,
        allowStatus: true,
        allowMigrate: true,
        allowCapsuleIndex: true,
      });

      const commands = program.commands.map((c) => c.name());
      expect(commands).toContain('capsule-index');
    });
  });

  describe('All permissions enabled should register all commands', () => {
    it('should register all 10 command names when all permissions are true', () => {
      registerOperationsCommands(program, {
        allowImport: true,
        allowExport: true,
        allowEdit: true,
        allowDeactivate: true,
        allowList: true,
        allowActivate: true,
        allowStatus: true,
        allowMigrate: true,
        allowCapsuleIndex: true,
      });

      const commands = program.commands.map((c) => c.name()).sort();
      expect(commands).toEqual(
        [
          'activate',
          'artifact-export',
          'capsule-index',
          'deactivate',
          'edit',
          'export',
          'import',
          'list',
          'migrate',
          'status',
        ].sort(),
      );
    });
  });

  describe('No permissions enabled should register zero commands', () => {
    it('should register zero commands when all permissions are false', () => {
      registerOperationsCommands(program, {
        allowImport: false,
        allowExport: false,
        allowEdit: false,
        allowDeactivate: false,
        allowList: false,
        allowActivate: false,
        allowStatus: false,
        allowMigrate: false,
        allowCapsuleIndex: false,
      });

      const commands = program.commands.map((c) => c.name());
      expect(commands).toEqual([]);
    });
  });
});

describe('Phase 85: Barrel export completeness', () => {
  it('should export all 9 register functions from operations/index.ts', async () => {
    const barrel = await import('../../src/commands/operations/index.js');

    expect(typeof barrel.registerListCommand).toBe('function');
    expect(typeof barrel.registerEditCommand).toBe('function');
    expect(typeof barrel.registerDeactivateCommand).toBe('function');
    expect(typeof barrel.registerExportCommand).toBe('function');
    expect(typeof barrel.registerImportCommand).toBe('function');
    expect(typeof barrel.registerActivateCommand).toBe('function');
    expect(typeof barrel.registerMigrateCommand).toBe('function');
    expect(typeof barrel.registerStatusCommand).toBe('function');
    expect(typeof barrel.registerCapsuleIndexCommand).toBe('function');
  });

  it('should export OperationsCommandOptions type from operations/index.ts', async () => {
    const barrel = await import('../../src/commands/operations/index.js');
    // TypeScript type re-export is compile-time only
    // We verify the module loads without error
    expect(barrel).toBeDefined();
  });
});

describe('Phase 2: Input validation', () => {
  const validationMockState = {
    gatewayUrl: 'http://localhost:3000',
    sessionToken: 'test-token',
    session: null,
  };

  beforeEach(() => {
    mockedApiRequest.mockReset();
    mockedLoadCliState.mockReset();
    mockedLoadCliState.mockResolvedValue(validationMockState);
  });

  describe('deactivate --reason validation', () => {
    it('rejects reason over 500 characters', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const p = createSilentCommand();
      registerOperationsCommands(p, {
        allowImport: false,
        allowExport: false,
        allowEdit: false,
        allowDeactivate: true,
        allowList: false,
        allowActivate: false,
        allowStatus: false,
        allowMigrate: false,
        allowCapsuleIndex: false,
      });

      await expect(
        p.parseAsync(['node', 'test', 'deactivate', 'entry_1', '--reason', 'x'.repeat(501)]),
      ).rejects.toThrow();

      consoleErrorSpy.mockRestore();
    });

    it('accepts reason within 500 characters', async () => {
      const p = new Command();
      registerOperationsCommands(p, {
        allowImport: false,
        allowExport: false,
        allowEdit: false,
        allowDeactivate: true,
        allowList: false,
        allowActivate: false,
        allowStatus: false,
        allowMigrate: false,
        allowCapsuleIndex: false,
      });

      const deactivateCmd = p.commands.find((c) => c.name() === 'deactivate');
      expect(deactivateCmd).toBeDefined();
      const reasonOption = deactivateCmd?.options.find((o) => o.long === '--reason');
      expect(reasonOption).toBeDefined();
      expect(reasonOption?.argParser).toBeDefined();
      expect(() => reasonOption?.argParser?.('Valid reason', '')).not.toThrow();
    });
  });

  describe('edit --required-level validation', () => {
    it('rejects float values for required-level', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const p = createSilentCommand();
      registerOperationsCommands(p, {
        allowImport: false,
        allowExport: false,
        allowEdit: true,
        allowDeactivate: false,
        allowList: false,
        allowActivate: false,
        allowStatus: false,
        allowMigrate: false,
        allowCapsuleIndex: false,
      });

      await expect(
        p.parseAsync(['node', 'test', 'edit', 'entry_1', '--required-level', '3.5']),
      ).rejects.toThrow();

      consoleErrorSpy.mockRestore();
    });

    it('rejects negative values for required-level', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const p = createSilentCommand();
      registerOperationsCommands(p, {
        allowImport: false,
        allowExport: false,
        allowEdit: true,
        allowDeactivate: false,
        allowList: false,
        allowActivate: false,
        allowStatus: false,
        allowMigrate: false,
        allowCapsuleIndex: false,
      });

      await expect(
        p.parseAsync(['node', 'test', 'edit', 'entry_1', '--required-level', '-1']),
      ).rejects.toThrow();

      consoleErrorSpy.mockRestore();
    });

    it('accepts valid non-negative integer for required-level', async () => {
      mockedApiRequest.mockResolvedValue({
        data: {
          entry: {
            id: 'entry_1',
            teamId: 'team_1',
            scope: 'global',
            labels: ['test'],
            shortcut: 'test shortcut',
            detail: 'test detail text',
            requiredLevel: 5,
            owner: { id: 'user_1', handle: 'test', securityLevel: 0 },
            latestRevision: {
              revision: 1,
              submittedAt: '2026-01-01T00:00:00Z',
              submittedBy: { id: 'user_1', handle: 'test', securityLevel: 0 },
              shortcut: 'test shortcut',
              detail: 'test detail text',
              labels: ['test'],
            },
            history: [
              {
                revision: 1,
                submittedAt: '2026-01-01T00:00:00Z',
                submittedBy: { id: 'user_1', handle: 'test', securityLevel: 0 },
                shortcut: 'test shortcut',
                detail: 'test detail text',
                labels: ['test'],
                lifecycleState: 'approved',
              },
            ],
            metadata: {
              sourceKind: 'legacy-knowledge',
              submissionCount: 1,
              resubmissionCount: 0,
              revisionCount: 1,
              scopeLabel: 'global-constraint',
            },
            agentReview: null,
            lifecycleState: 'approved',
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-01T00:00:00Z',
          },
        },
        sessionToken: 'test-token',
      });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const p = new Command();
      registerOperationsCommands(p, {
        allowImport: false,
        allowExport: false,
        allowEdit: true,
        allowDeactivate: false,
        allowList: false,
        allowActivate: false,
        allowStatus: false,
        allowMigrate: false,
        allowCapsuleIndex: false,
      });

      await p.parseAsync(['node', 'test', 'edit', 'entry_1', '--required-level', '5']);
      expect(mockedApiRequest).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          body: expect.objectContaining({
            requiredLevel: 5,
          }),
        }),
      );
      consoleSpy.mockRestore();
    });
  });
});

describe('Phase 85: Thin router delegation', () => {
  it('should have exactly 9 registerXxxCommand calls in operations.ts', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');

    const operationsPath = resolve(__dirname, '../../src/commands/operations.ts');
    const content = readFileSync(operationsPath, 'utf8');

    // Count all registerXxxCommand(program, options) calls
    const registerCalls = content.match(/register\w+Command\(program,\s*options\)/g);
    expect(registerCalls).toHaveLength(9);
  });

  it('should have registerOperationsCommands export in operations.ts', async () => {
    const operations = await import('../../src/commands/operations.js');
    expect(typeof operations.registerOperationsCommands).toBe('function');
  });
});

describe('fm-agent freeze: live gaps', () => {
  it('deactivate: validates reason length between 1 and 500 characters', async () => {
    const p = createSilentCommand();
    p.exitOverride((err) => {
      throw err;
    });
    mockedLoadCliState.mockResolvedValue({
      gatewayUrl: 'http://localhost:3000',
      sessionToken: 'test-token',
      session: null,
    });
    mockedApiRequest.mockResolvedValue({
      data: {
        entry: {
          id: 'entry_1',
          teamId: 'team_1',
          scope: 'global',
          labels: ['test'],
          shortcut: 'test shortcut',
          detail: 'test detail text',
          requiredLevel: 3,
          owner: { id: 'user_1', handle: 'test', securityLevel: 0 },
          latestRevision: {
            revision: 1,
            submittedAt: '2026-01-01T00:00:00Z',
            submittedBy: { id: 'user_1', handle: 'test', securityLevel: 0 },
            shortcut: 'test shortcut',
            detail: 'test detail text',
            labels: ['test'],
            reviewNotes: [],
          },
          history: [
            {
              revision: 1,
              submittedAt: '2026-01-01T00:00:00Z',
              submittedBy: { id: 'user_1', handle: 'test', securityLevel: 0 },
              shortcut: 'test shortcut',
              detail: 'test detail text',
              labels: ['test'],
              reviewNotes: [],
            },
          ],
          metadata: {
            scopeLabel: 'global-constraint',
            submissionCount: 1,
            resubmissionCount: 0,
            revisionCount: 1,
            latestSubmissionId: null,
            latestSubmittedAt: null,
            latestReviewedAt: null,
            latestDecision: null,
          },
          agentReview: null,
          lifecycleState: 'deactivated',
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
      },
      sessionToken: 'test-token',
    });

    registerOperationsCommands(p, {
      allowImport: false,
      allowExport: false,
      allowEdit: false,
      allowDeactivate: true,
      allowList: false,
      allowActivate: false,
      allowStatus: false,
      allowMigrate: false,
      allowCapsuleIndex: false,
    });

    // Reason too long (>500 chars) should be rejected before API call
    const longReason = 'x'.repeat(501);
    await expect(
      p.parseAsync(['node', 'test', 'deactivate', 'entry_1', '--reason', longReason]),
    ).rejects.toThrow(/between 1 and 500/);

    // Empty reason should be rejected
    const p2 = createSilentCommand();
    p2.exitOverride((err) => {
      throw err;
    });
    registerOperationsCommands(p2, {
      allowImport: false,
      allowExport: false,
      allowEdit: false,
      allowDeactivate: true,
      allowList: false,
      allowActivate: false,
      allowStatus: false,
      allowMigrate: false,
      allowCapsuleIndex: false,
    });
    await expect(
      p2.parseAsync(['node', 'test', 'deactivate', 'entry_1', '--reason', '']),
    ).rejects.toThrow(/between 1 and 500/);

    // Valid reason should proceed
    await p.parseAsync(['node', 'test', 'deactivate', 'entry_1', '--reason', 'valid reason']);
    expect(mockedApiRequest).toHaveBeenCalled();
  });

  it('edit: validates requiredLevel is a non-negative integer', async () => {
    const p = createSilentCommand();
    p.exitOverride((err) => {
      throw err;
    });
    mockedLoadCliState.mockResolvedValue({
      gatewayUrl: 'http://localhost:3000',
      sessionToken: 'test-token',
      session: null,
    });

    registerOperationsCommands(p, {
      allowImport: false,
      allowExport: false,
      allowEdit: true,
      allowDeactivate: false,
      allowList: false,
      allowActivate: false,
      allowStatus: false,
      allowMigrate: false,
      allowCapsuleIndex: false,
    });

    // Non-integer requiredLevel should be rejected at Commander level
    await expect(
      p.parseAsync(['node', 'test', 'edit', 'entry_1', '--required-level', '3.5']),
    ).rejects.toThrow(/required level must be a non-negative integer/);
  });
});

describe('CLI capsule-index commands', () => {
  let capsuleIndexProgram: Command;
  const mockState = {
    gatewayUrl: 'http://localhost:3000',
    sessionToken: 'test-token',
    session: null,
  };

  beforeEach(() => {
    mockedApiRequest.mockReset();
    mockedLoadCliState.mockReset();
    mockedLoadCliState.mockResolvedValue(mockState);

    capsuleIndexProgram = new Command();
    registerOperationsCommands(capsuleIndexProgram, {
      allowImport: false,
      allowExport: false,
      allowEdit: false,
      allowDeactivate: false,
      allowList: false,
      allowActivate: false,
      allowStatus: false,
      allowMigrate: false,
      allowCapsuleIndex: true,
    });
  });

  describe('rebuild --mode full', () => {
    it('should call rebuild endpoint with mode=full by default', async () => {
      mockedApiRequest.mockResolvedValue({
        data: {
          mode: 'full',
          sourceArtifactCount: 5,
          stats: { totalArtifacts: 5, succeeded: 5, failed: 0 },
          rebuiltAt: '2024-01-01T00:00:00Z',
        },
        sessionToken: 'test-token',
      });

      await capsuleIndexProgram.parseAsync(['node', 'test', 'capsule-index', 'rebuild']);

      expect(mockedApiRequest).toHaveBeenCalledWith(
        mockState,
        expect.objectContaining({
          method: 'POST',
          path: '/v1/operations/capsule-index/rebuild',
          body: { mode: 'full' },
        }),
      );
    });

    it('should provide human-readable output for full rebuild', async () => {
      mockedApiRequest.mockResolvedValue({
        data: {
          mode: 'full',
          sourceArtifactCount: 5,
          stats: { totalArtifacts: 5, succeeded: 4, failed: 1 },
          rebuiltAt: '2024-01-01T00:00:00Z',
        },
        sessionToken: 'test-token',
      });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await capsuleIndexProgram.parseAsync(['node', 'test', 'capsule-index', 'rebuild']);

      const output = consoleSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain('Rebuilt capsule index (full)');
      expect(output).toContain('Source artifacts: 5');
      expect(output).toContain('Succeeded: 4');
      expect(output).toContain('Failed: 1');

      consoleSpy.mockRestore();
    });

    it('should provide JSON output when --json flag is used', async () => {
      const mockData = {
        mode: 'full',
        sourceArtifactCount: 5,
        stats: { totalArtifacts: 5, succeeded: 5, failed: 0 },
        rebuiltAt: '2024-01-01T00:00:00Z',
      };
      mockedApiRequest.mockResolvedValue({
        data: mockData,
        sessionToken: 'test-token',
      });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await capsuleIndexProgram.parseAsync(['node', 'test', 'capsule-index', 'rebuild', '--json']);

      const output = consoleSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output);
      expect(parsed.mode).toBe('full');
      expect(parsed.sourceArtifactCount).toBe(5);

      consoleSpy.mockRestore();
    });
  });

  describe('rebuild --mode artifact', () => {
    it('should call rebuild endpoint with mode=artifact and artifactId', async () => {
      mockedApiRequest.mockResolvedValue({
        data: {
          mode: 'artifact',
          artifactId: 'artifact_1',
          result: {
            keywordSynced: 3,
            keywordFailed: 0,
            embeddingSynced: 3,
            embeddingFailed: 0,
            capsulesSynced: 3,
          },
          rebuiltAt: '2024-01-01T00:00:00Z',
        },
        sessionToken: 'test-token',
      });

      await capsuleIndexProgram.parseAsync([
        'node',
        'test',
        'capsule-index',
        'rebuild',
        '--mode',
        'artifact',
        '--artifact-id',
        'artifact_1',
      ]);

      expect(mockedApiRequest).toHaveBeenCalledWith(
        mockState,
        expect.objectContaining({
          method: 'POST',
          path: '/v1/operations/capsule-index/rebuild',
          body: { mode: 'artifact', artifactId: 'artifact_1' },
        }),
      );
    });

    it('should provide human-readable output for artifact rebuild', async () => {
      mockedApiRequest.mockResolvedValue({
        data: {
          mode: 'artifact',
          artifactId: 'artifact_1',
          result: {
            keywordSynced: 3,
            keywordFailed: 0,
            embeddingSynced: 3,
            embeddingFailed: 0,
            capsulesSynced: 3,
          },
          rebuiltAt: '2024-01-01T00:00:00Z',
        },
        sessionToken: 'test-token',
      });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await capsuleIndexProgram.parseAsync([
        'node',
        'test',
        'capsule-index',
        'rebuild',
        '--mode',
        'artifact',
        '--artifact-id',
        'artifact_1',
      ]);

      const output = consoleSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain('artifact_1');
      expect(output).toContain('Keyword synced: 3');
      expect(output).toContain('Embedding synced: 3');

      consoleSpy.mockRestore();
    });

    it('should require --artifact-id when mode=artifact', async () => {
      await expect(
        capsuleIndexProgram.parseAsync([
          'node',
          'test',
          'capsule-index',
          'rebuild',
          '--mode',
          'artifact',
        ]),
      ).rejects.toThrow('--artifact-id is required');
    });
  });

  describe('health', () => {
    it('should call health endpoint', async () => {
      mockedApiRequest.mockResolvedValue({
        data: {
          sourceArtifactCount: 5,
          report: {
            missingKeywords: [],
            missingEmbeddings: [],
            failedKeywords: [],
            failedEmbeddings: [],
            orphanKeywords: [],
            orphanEmbeddings: [],
          },
          reportedAt: '2024-01-01T00:00:00Z',
        },
        sessionToken: 'test-token',
      });

      await capsuleIndexProgram.parseAsync(['node', 'test', 'capsule-index', 'health']);

      expect(mockedApiRequest).toHaveBeenCalledWith(
        mockState,
        expect.objectContaining({
          path: '/v1/operations/capsule-index/health',
        }),
      );
    });

    it('should show healthy status when no issues', async () => {
      mockedApiRequest.mockResolvedValue({
        data: {
          sourceArtifactCount: 5,
          report: {
            missingKeywords: [],
            missingEmbeddings: [],
            failedKeywords: [],
            failedEmbeddings: [],
            orphanKeywords: [],
            orphanEmbeddings: [],
          },
          reportedAt: '2024-01-01T00:00:00Z',
        },
        sessionToken: 'test-token',
      });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await capsuleIndexProgram.parseAsync(['node', 'test', 'capsule-index', 'health']);

      const output = consoleSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain('Status: healthy');

      consoleSpy.mockRestore();
    });

    it('should report issues when problems detected', async () => {
      mockedApiRequest.mockResolvedValue({
        data: {
          sourceArtifactCount: 5,
          report: {
            missingKeywords: ['capsule_1'],
            missingEmbeddings: ['capsule_2'],
            failedKeywords: [],
            failedEmbeddings: [],
            orphanKeywords: ['capsule_3'],
            orphanEmbeddings: [],
          },
          reportedAt: '2024-01-01T00:00:00Z',
        },
        sessionToken: 'test-token',
      });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await capsuleIndexProgram.parseAsync(['node', 'test', 'capsule-index', 'health']);

      const output = consoleSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain('Missing keywords: 1');
      expect(output).toContain('Missing embeddings: 1');
      expect(output).toContain('Orphan keywords: 1');
      expect(output).toContain('Status: 3 issue(s) detected');

      consoleSpy.mockRestore();
    });

    it('should provide JSON output when --json flag is used', async () => {
      const mockData = {
        sourceArtifactCount: 5,
        report: {
          missingKeywords: [],
          missingEmbeddings: [],
          failedKeywords: [],
          failedEmbeddings: [],
          orphanKeywords: [],
          orphanEmbeddings: [],
        },
        reportedAt: '2024-01-01T00:00:00Z',
      };
      mockedApiRequest.mockResolvedValue({
        data: mockData,
        sessionToken: 'test-token',
      });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await capsuleIndexProgram.parseAsync(['node', 'test', 'capsule-index', 'health', '--json']);

      const output = consoleSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output);
      expect(parsed.sourceArtifactCount).toBe(5);
      expect(parsed.report.missingKeywords).toEqual([]);

      consoleSpy.mockRestore();
    });
  });

  describe('cleanup-orphans', () => {
    it('should call cleanup-orphans endpoint', async () => {
      mockedApiRequest.mockResolvedValue({
        data: {
          sourceArtifactCount: 5,
          removed: 3,
          cleanedAt: '2024-01-01T00:00:00Z',
        },
        sessionToken: 'test-token',
      });

      await capsuleIndexProgram.parseAsync(['node', 'test', 'capsule-index', 'cleanup-orphans']);

      expect(mockedApiRequest).toHaveBeenCalledWith(
        mockState,
        expect.objectContaining({
          method: 'POST',
          path: '/v1/operations/capsule-index/cleanup-orphans',
        }),
      );
    });

    it('should provide human-readable output for cleanup', async () => {
      mockedApiRequest.mockResolvedValue({
        data: {
          sourceArtifactCount: 5,
          removed: 3,
          cleanedAt: '2024-01-01T00:00:00Z',
        },
        sessionToken: 'test-token',
      });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await capsuleIndexProgram.parseAsync(['node', 'test', 'capsule-index', 'cleanup-orphans']);

      const output = consoleSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain('Removed: 3');
      expect(output).toContain('Source artifacts: 5');

      consoleSpy.mockRestore();
    });

    it('should provide JSON output when --json flag is used', async () => {
      const mockData = {
        sourceArtifactCount: 5,
        removed: 3,
        cleanedAt: '2024-01-01T00:00:00Z',
      };
      mockedApiRequest.mockResolvedValue({
        data: mockData,
        sessionToken: 'test-token',
      });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await capsuleIndexProgram.parseAsync([
        'node',
        'test',
        'capsule-index',
        'cleanup-orphans',
        '--json',
      ]);

      const output = consoleSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output);
      expect(parsed.removed).toBe(3);
      expect(parsed.sourceArtifactCount).toBe(5);

      consoleSpy.mockRestore();
    });
  });
});
