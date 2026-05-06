import type { GraphPlanSearchResponse } from '@trapmap/contracts';
import { graphPlanSearchResponseSchema } from '@trapmap/contracts';
import { Command } from 'commander';
import { describe, expect, it, vi } from 'vitest';

import * as http from '../lib/http.js';
import { registerLoadCommand } from './load.js';

// Mock the dependencies
vi.mock('../lib/http.js', () => ({
  apiRequest: vi.fn(),
  requireSessionToken: vi.fn(),
}));

vi.mock('../lib/config.js', () => ({
  loadCliState: vi.fn(() => ({
    serverUrl: 'http://localhost:3000',
    sessionToken: 'mock-token',
    session: {
      member: { handle: 'testuser', securityLevel: 0 },
      effectivePermissions: ['knowledge:search'],
    },
  })),
}));

vi.mock('../lib/input.js', () => ({
  collectValues: (value: string, previous: string[] = []) => [...previous, value],
  resolveTextInput: vi.fn(async (options: { text?: string; stdin?: boolean }) => {
    if (options.text) return options.text;
    if (options.stdin) return 'stdin seed content';
    throw new Error('No seed provided');
  }),
}));

vi.mock('../lib/markdown-formatter.js', () => ({
  formatLoadContext: vi.fn((response) => `formatted: ${response.routingTrace.selectedMode}`),
}));

describe('CLI load command', () => {
  const mockResponse: GraphPlanSearchResponse = {
    routingTrace: {
      selectedMode: 'mix',
      routeFamily: 'graph-plan',
      routingReason: 'graph-plan-selected',
      channelsUsed: ['semantic'],
      fallbackTarget: null,
      confidenceScore: 0.9,
      confidenceBucket: 'high',
    },
    plan: null,
    fallback: null,
  };

  it('should register command when allowSearch is true', () => {
    const program = new Command();
    registerLoadCommand(program, { allowSearch: true });
    const commands = program.commands.map((c) => c.name());
    expect(commands).toContain('load');
  });

  it('should not register when allowSearch is false', () => {
    const program = new Command();
    registerLoadCommand(program, { allowSearch: false });
    const commands = program.commands.map((c) => c.name());
    expect(commands).not.toContain('load');
  });

  it('should call v3 retrieval with correct parameters', async () => {
    vi.mocked(http.apiRequest).mockResolvedValue({
      data: mockResponse,
      sessionToken: 'mock-token',
    });

    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const program = new Command();
    registerLoadCommand(program, { allowSearch: true });

    await program.parseAsync(['load', 'database optimization'], { from: 'user' });

    expect(http.apiRequest).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        method: 'POST',
        path: '/v3/retrieval/search',
        body: expect.objectContaining({
          seed: 'database optimization',
          skillBudget: 3,
          maxDepth: 2,
          fallbackMode: 'auto',
        }),
      }),
    );

    consoleLogSpy.mockRestore();
  });

  it('should pass scope and label filters', async () => {
    vi.mocked(http.apiRequest).mockResolvedValue({
      data: mockResponse,
      sessionToken: 'mock-token',
    });

    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const program = new Command();
    registerLoadCommand(program, { allowSearch: true });

    await program.parseAsync(
      ['load', 'test seed', '--scope', 'project', '--label', 'backend', '--label', 'api'],
      { from: 'user' },
    );

    expect(http.apiRequest).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        body: expect.objectContaining({
          filters: {
            labels: ['backend', 'api'],
            scopes: ['project'],
          },
        }),
      }),
    );

    consoleLogSpy.mockRestore();
  });

  it('should respect skill-budget and max-depth options', async () => {
    vi.mocked(http.apiRequest).mockResolvedValue({
      data: mockResponse,
      sessionToken: 'mock-token',
    });

    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const program = new Command();
    registerLoadCommand(program, { allowSearch: true });

    await program.parseAsync(
      ['load', 'test seed', '--skill-budget', '5', '--max-depth', '3'],
      { from: 'user' },
    );

    expect(http.apiRequest).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        body: expect.objectContaining({
          skillBudget: 5,
          maxDepth: 3,
        }),
      }),
    );

    consoleLogSpy.mockRestore();
  });

  it('should output JSON when --json flag is set', async () => {
    vi.mocked(http.apiRequest).mockResolvedValue({
      data: mockResponse,
      sessionToken: 'mock-token',
    });

    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const program = new Command();
    registerLoadCommand(program, { allowSearch: true });

    await program.parseAsync(['load', 'test seed', '--json'], { from: 'user' });

    // JSON output is via console.log with JSON.stringify
    const loggedOutput = consoleLogSpy.mock.calls[0]?.[0];
    expect(() => JSON.parse(loggedOutput)).not.toThrow();
    const parsed = JSON.parse(loggedOutput);
    expect(parsed).toHaveProperty('routingTrace');

    consoleLogSpy.mockRestore();
  });

  it('should output formatted markdown when --json flag is not set', async () => {
    vi.mocked(http.apiRequest).mockResolvedValue({
      data: mockResponse,
      sessionToken: 'mock-token',
    });

    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const program = new Command();
    registerLoadCommand(program, { allowSearch: true });

    await program.parseAsync(['load', 'test seed'], { from: 'user' });

    // Markdown output uses formatLoadContext
    const loggedOutput = consoleLogSpy.mock.calls[0]?.[0];
    expect(loggedOutput).toContain('formatted:');

    consoleLogSpy.mockRestore();
  });
});
