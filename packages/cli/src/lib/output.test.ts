import type { RetrievalResponse } from '@trapmap/contracts';
import { describe, expect, it, vi } from 'vitest';

import { getDefaultOutputProfile } from './output-profile.js';
import { printAdaptiveResult, printResult } from './output.js';

describe('output helpers', () => {
  it('prints raw json when json flag is enabled', () => {
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    printResult({ ok: true }, { json: true }, () => 'legacy');

    expect(consoleLogSpy).toHaveBeenCalledWith('{\n  "ok": true\n}');
    consoleLogSpy.mockRestore();
  });

  it('uses legacy formatter when no output profile is configured', () => {
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const payload: RetrievalResponse = {
      globalConstraints: [],
      projectKnowledge: [],
      refinementSummary: null,
      summary: null,
    };

    printAdaptiveResult(
      'retrieval-v1',
      payload,
      {
        serverUrl: 'http://localhost:3000',
        sessionToken: null,
        session: null,
      },
      {},
      () => 'legacy output',
    );

    expect(consoleLogSpy).toHaveBeenCalledWith('legacy output');
    consoleLogSpy.mockRestore();
  });

  it('uses profile renderer when text render mode is configured', () => {
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const payload: RetrievalResponse = {
      globalConstraints: [],
      projectKnowledge: [],
      refinementSummary: null,
      summary: {
        text: 'Use skill bundle',
      },
    };

    printAdaptiveResult(
      'retrieval-v1',
      payload,
      {
        serverUrl: 'http://localhost:3000',
        sessionToken: null,
        session: null,
        outputProfile: {
          ...getDefaultOutputProfile(),
          tool: 'claude-code',
        },
      },
      {},
      () => 'legacy output',
    );

    const output = String(consoleLogSpy.mock.calls[0]?.[0]);
    expect(output).toContain('<trapmap_skill_pack>');
    expect(output).toContain('<summary>');
    consoleLogSpy.mockRestore();
  });

  it('falls back to legacy formatter if renderer throws', () => {
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const payload = { failRender: true };

    printAdaptiveResult(
      'generic',
      payload,
      {
        serverUrl: 'http://localhost:3000',
        sessionToken: null,
        session: null,
        outputProfile: {
          ...getDefaultOutputProfile(),
          tool: 'generic',
        },
      },
      {},
      () => 'legacy fallback',
    );

    expect(consoleLogSpy).toHaveBeenCalledWith('legacy fallback');
    consoleLogSpy.mockRestore();
  });

  it('falls back to legacy formatter for graph-plan renderer failures', () => {
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const payload = { failRender: true };

    printAdaptiveResult(
      'graph-plan',
      payload,
      {
        serverUrl: 'http://localhost:3000',
        sessionToken: null,
        session: null,
        outputProfile: {
          ...getDefaultOutputProfile(),
          tool: 'codex',
        },
      },
      {},
      () => 'legacy graph formatter',
    );

    expect(consoleLogSpy).toHaveBeenCalledWith('legacy graph formatter');
    consoleLogSpy.mockRestore();
  });
});
