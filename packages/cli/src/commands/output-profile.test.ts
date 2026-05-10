import { Command } from 'commander';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { registerOutputProfileCommands } from './output-profile.js';

vi.mock('../lib/config.js', () => ({
  loadCliState: vi.fn(async () => ({
    serverUrl: 'http://localhost:3000',
    sessionToken: null,
    session: null,
    outputProfile: {
      tool: 'generic',
      modelHint: 'generic',
      renderMode: 'text',
      graphPlanMode: 'summary',
      verbosity: 'balanced',
      includeRawHints: true,
    },
  })),
  updateCliState: vi.fn(async (updater) => {
    const current = {
      serverUrl: 'http://localhost:3000',
      sessionToken: null,
      session: null,
      outputProfile: {
        tool: 'generic',
        modelHint: 'generic',
        renderMode: 'text',
        graphPlanMode: 'summary',
        verbosity: 'balanced',
        includeRawHints: true,
      },
    };

    return typeof updater === 'function' ? updater(current) : { ...current, ...updater };
  }),
}));

describe('output profile commands', () => {
  let program: Command;

  beforeEach(() => {
    program = new Command();
    registerOutputProfileCommands(program);
  });

  it('registers output profile show and set commands', () => {
    const output = program.commands.find((cmd) => cmd.name() === 'output');
    expect(output).toBeDefined();

    const profile = output?.commands.find((cmd) => cmd.name() === 'profile');
    expect(profile).toBeDefined();

    const subcommands = profile?.commands.map((cmd) => cmd.name()) ?? [];
    expect(subcommands).toContain('show');
    expect(subcommands).toContain('set');
  });

  it('prints current output profile on show', async () => {
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await program.parseAsync(['output', 'profile', 'show'], { from: 'user' });

    expect(consoleLogSpy.mock.calls[0]?.[0]).toContain('"tool": "generic"');
    consoleLogSpy.mockRestore();
  });

  it('updates output profile fields on set', async () => {
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await program.parseAsync(
      [
        'output',
        'profile',
        'set',
        '--tool',
        'codex',
        '--model',
        'gpt',
        '--verbosity',
        'detailed',
        '--graph-plan-mode',
        'full',
      ],
      { from: 'user' },
    );

    const output = String(consoleLogSpy.mock.calls[0]?.[0]);
    expect(output).toContain('"tool": "codex"');
    expect(output).toContain('"modelHint": "gpt"');
    expect(output).toContain('"graphPlanMode": "full"');
    consoleLogSpy.mockRestore();
  });
});
