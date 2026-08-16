import type { SkillRevisionSummary } from '@trapmap/contracts';
import { Command } from 'commander';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as http from '@trapmap/cli/lib/http.js';
import { registerSkillCommands } from './index.js';

vi.mock('../../lib/http.js', () => ({
  apiRequest: vi.fn(),
  requireSessionToken: vi.fn(),
}));

vi.mock('../../lib/config.js', () => ({
  loadCliState: vi.fn(() => ({
    gatewayUrl: 'http://localhost:3000',
    sessionToken: 'mock-token',
    session: {
      member: { handle: 'testuser', securityLevel: 0 },
      effectivePermissions: ['knowledge:export'],
    },
  })),
}));

const fakeHash = 'a'.repeat(64);

function makeRevisionSummary(overrides: Partial<SkillRevisionSummary> = {}): SkillRevisionSummary {
  return {
    revision: 1,
    submittedAt: '2026-05-01T10:00:00Z',
    submittedBy: { id: 'user-1', handle: 'alice', securityLevel: 0 },
    lifecycleState: 'approved',
    sourceHash: fakeHash,
    ...overrides,
  };
}

function makeHistoryResponse(revisions: SkillRevisionSummary[]): {
  artifactId: string;
  title: string;
  currentRevision: number;
  lifecycleState: string;
  revisions: SkillRevisionSummary[];
} {
  return {
    artifactId: 'artifact.db',
    title: 'Docker Troubleshooting',
    currentRevision: revisions.at(-1)?.revision ?? 0,
    lifecycleState: 'approved',
    revisions,
  };
}

describe('CLI skill versions command', () => {
  let program: Command;

  beforeEach(() => {
    program = new Command();
  });

  describe('registration', () => {
    it('registers versions subcommand when allowExport is true', () => {
      registerSkillCommands(program, {
        allowSearch: false,
        allowSubmit: false,
        allowExport: true,
        allowReview: false,
      });

      const skillCommand = program.commands.find((cmd) => cmd.name() === 'skill');
      const versionsCommand = skillCommand?.commands.find((cmd) => cmd.name() === 'versions');

      expect(versionsCommand).toBeDefined();
      expect(versionsCommand?.description()).toContain('version');

      const args = versionsCommand?.registeredArguments || [];
      expect(args).toHaveLength(1);
      expect(args[0]?.name()).toBe('artifactId');

      const jsonOption = versionsCommand?.options.find((opt) => opt.long === '--json');
      expect(jsonOption).toBeDefined();
    });

    it('does not register versions when allowExport is false', () => {
      registerSkillCommands(program, {
        allowSearch: true,
        allowSubmit: false,
        allowExport: false,
        allowReview: false,
      });

      const skillCommand = program.commands.find((cmd) => cmd.name() === 'skill');
      const versionsCommand = skillCommand?.commands.find((cmd) => cmd.name() === 'versions');
      expect(versionsCommand).toBeUndefined();
    });
  });

  describe('execution', () => {
    it('fetches the artifact history endpoint and renders version history in text', async () => {
      vi.mocked(http.apiRequest).mockResolvedValue({
        data: makeHistoryResponse([
          makeRevisionSummary({
            revision: 1,
            sourceHash: 'b'.repeat(64),
            submittedAt: '2026-05-01T10:00:00Z',
            submittedBy: { id: 'user-1', handle: 'alice', securityLevel: 0 },
          }),
          makeRevisionSummary({
            revision: 2,
            version: '2.1.0',
            sourceHash: 'c'.repeat(64),
            submittedAt: '2026-05-09T10:00:00Z',
            submittedBy: { id: 'user-2', handle: 'bob', securityLevel: 0 },
          }),
        ]),
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      registerSkillCommands(program, {
        allowSearch: false,
        allowSubmit: false,
        allowExport: true,
        allowReview: false,
      });

      await program.parseAsync(['skill', 'versions', 'artifact.db'], { from: 'user' });

      expect(http.apiRequest).toHaveBeenCalledWith(
        expect.objectContaining({ sessionToken: 'mock-token' }),
        {
          method: 'GET',
          path: '/v1/operations/artifacts/artifact.db/history',
        },
      );

      const output = String(consoleLogSpy.mock.calls[0]?.[0]);
      expect(output).toContain('Artifact ID: artifact.db');
      expect(output).toContain('Current Version: 2.1.0');
      expect(output).toContain('Current Revision: 2');
      expect(output).toContain('Version History:');
      expect(output).toContain('1. (none)');
      expect(output).toContain('2026-05-01T10:00:00Z by alice');
      expect(output).toContain('source: bbbbbbbb');
      expect(output).toContain('2. 2.1.0');
      expect(output).toContain('2026-05-09T10:00:00Z by bob');
      expect(output).toContain('source: cccccccc');
      consoleLogSpy.mockRestore();
    });

    it('renders unversioned artifacts without a declared version', async () => {
      vi.mocked(http.apiRequest).mockResolvedValue({
        data: makeHistoryResponse([makeRevisionSummary()]),
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      registerSkillCommands(program, {
        allowSearch: false,
        allowSubmit: false,
        allowExport: true,
        allowReview: false,
      });

      await program.parseAsync(['skill', 'versions', 'artifact.db'], { from: 'user' });

      const output = String(consoleLogSpy.mock.calls[0]?.[0]);
      expect(output).toContain('Current Version: (none)');
      expect(output).toContain('Current Revision: 1');
      expect(output).toContain('1. (none)');
      consoleLogSpy.mockRestore();
    });

    it('emits JSON payload with version fields when --json is passed', async () => {
      vi.mocked(http.apiRequest).mockResolvedValue({
        data: makeHistoryResponse([
          makeRevisionSummary({
            revision: 1,
            sourceHash: 'b'.repeat(64),
          }),
          makeRevisionSummary({
            revision: 2,
            version: '2.1.0',
            sourceHash: 'c'.repeat(64),
          }),
        ]),
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      registerSkillCommands(program, {
        allowSearch: false,
        allowSubmit: false,
        allowExport: true,
        allowReview: false,
      });

      await program.parseAsync(['skill', 'versions', 'artifact.db', '--json'], { from: 'user' });

      const parsed = JSON.parse(String(consoleLogSpy.mock.calls[0]?.[0]));
      expect(parsed.artifactId).toBe('artifact.db');
      expect(parsed.currentRevision).toBe(2);
      expect(parsed.currentVersion).toBe('2.1.0');
      expect(parsed.revisions).toHaveLength(2);
      expect(parsed.revisions[0]?.version).toBeUndefined();
      expect(parsed.revisions[1]?.version).toBe('2.1.0');
      consoleLogSpy.mockRestore();
    });
  });
});
