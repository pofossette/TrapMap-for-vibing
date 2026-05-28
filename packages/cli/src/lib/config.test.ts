import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

describe('cli config', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('hydrates output profile defaults when config omits new fields', async () => {
    const fs = await import('node:fs/promises');
    vi.mocked(fs.readFile).mockResolvedValue(
      JSON.stringify({
        serverUrl: 'http://localhost:9999',
        outputProfile: {
          tool: 'codex',
        },
      }) as never,
    );

    const { getDefaultOutputProfile, loadCliState } = await import('./config.js');
    const state = await loadCliState();

    expect(state.serverUrl).toBe('http://localhost:9999');
    expect(state.outputProfile).toEqual({
      ...getDefaultOutputProfile(),
      tool: 'codex',
    });
  });

  it('falls back to tmpdir when homedir throws', async () => {
    const osModule = await import('node:os');
    const originalHomedir = osModule.default.homedir;
    osModule.default.homedir = (() => {
      throw new Error('no home');
    }) as typeof osModule.default.homedir;
    try {
      const { loadCliState } = await import('./config.js');
      const result = await loadCliState();
      expect(result.serverUrl).toBeDefined();
    } finally {
      osModule.default.homedir = originalHomedir;
    }
  });

  it('preserves empty-string outputProfile value', async () => {
    const fs = await import('node:fs/promises');
    vi.mocked(fs.readFile).mockResolvedValue(
      JSON.stringify({ outputProfile: '' }) as never,
    );
    const { loadCliState } = await import('./config.js');
    const state = await loadCliState();
    expect(state.outputProfile).toBe('');
  });

  it('omits outputProfile when config file does not define it', async () => {
    const fs = await import('node:fs/promises');
    vi.mocked(fs.readFile).mockResolvedValue(
      JSON.stringify({
        serverUrl: 'http://localhost:9999',
      }) as never,
    );

    const { loadCliState } = await import('./config.js');
    const state = await loadCliState();

    expect(state.serverUrl).toBe('http://localhost:9999');
    expect('outputProfile' in state).toBe(false);
  });
});
