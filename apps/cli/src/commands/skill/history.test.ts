import type { SkillHistoryResponse } from '@trapmap/contracts';
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

function makeHistoryResponse(overrides: Partial<SkillHistoryResponse> = {}): SkillHistoryResponse {
  return {
    artifactId: 'artifact.db',
    title: 'Docker Troubleshooting',
    currentRevision: 2,
    lifecycleState: 'approved',
    revisions: [
      {
        revision: 1,
        submittedAt: '2026-05-01T10:00:00Z',
        submittedBy: { id: 'user-1', handle: 'alice', securityLevel: 0 },
        lifecycleState: 'approved',
        sourceHash: 'b'.repeat(64),
      },
      {
        revision: 2,
        version: '2.1.0',
        submittedAt: '2026-05-09T10:00:00Z',
        submittedBy: { id: 'user-2', handle: 'bob', securityLevel: 0 },
        lifecycleState: 'approved',
        sourceHash: 'c'.repeat(64),
      },
    ],
    ...overrides,
  };
}

describe('CLI skill history command', () => {
  let program: Command;

  beforeEach(() => {
    program = new Command();
  });

  describe('registration', () => {
    it('registers history subcommand when allowExport is true', () => {
      registerSkillCommands(program, {
        allowSearch: false,
        allowSubmit: false,
        allowExport: true,
        allowReview: false,
      });

      const skillCommand = program.commands.find((cmd) => cmd.name() === 'skill');
      const historyCommand = skillCommand?.commands.find((cmd) => cmd.name() === 'history');

      expect(historyCommand).toBeDefined();
      expect(historyCommand?.description()).toContain('history');
    });
  });

  describe('execution', () => {
    it('parses the object-shaped history response and renders revision history in text', async () => {
      vi.mocked(http.apiRequest).mockResolvedValue({
        data: makeHistoryResponse(),
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      registerSkillCommands(program, {
        allowSearch: false,
        allowSubmit: false,
        allowExport: true,
        allowReview: false,
      });

      await program.parseAsync(['skill', 'history', 'artifact.db'], { from: 'user' });

      expect(http.apiRequest).toHaveBeenCalledWith(
        expect.objectContaining({ sessionToken: 'mock-token' }),
        {
          method: 'GET',
          path: '/v1/operations/artifacts/artifact.db/history',
        },
      );

      const output = String(consoleLogSpy.mock.calls[0]?.[0]);
      expect(output).toContain('Artifact ID: artifact.db');
      expect(output).toContain('Title: Docker Troubleshooting');
      expect(output).toContain('Current Revision: 2');
      expect(output).toContain('Lifecycle State: approved');
      expect(output).toContain('Revision History:');
      expect(output).toContain('1. 2026-05-01T10:00:00Z by alice [approved]');
      expect(output).toContain('2. 2026-05-09T10:00:00Z by bob [approved]');
      consoleLogSpy.mockRestore();
    });

    it('emits the parsed history response as JSON when --json is passed', async () => {
      vi.mocked(http.apiRequest).mockResolvedValue({
        data: makeHistoryResponse(),
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      registerSkillCommands(program, {
        allowSearch: false,
        allowSubmit: false,
        allowExport: true,
        allowReview: false,
      });

      await program.parseAsync(['skill', 'history', 'artifact.db', '--json'], { from: 'user' });

      const parsed = JSON.parse(String(consoleLogSpy.mock.calls[0]?.[0]));
      expect(parsed.artifactId).toBe('artifact.db');
      expect(parsed.currentRevision).toBe(2);
      expect(parsed.lifecycleState).toBe('approved');
      expect(parsed.revisions).toHaveLength(2);
      expect(parsed.revisions[1]?.version).toBe('2.1.0');
      consoleLogSpy.mockRestore();
    });
  });
});
