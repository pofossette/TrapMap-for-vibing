import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock('@trapmap/contracts', async (importOriginal) => {
  const contracts = await importOriginal<typeof import('@trapmap/contracts')>();
  return {
    ...contracts,
    normalizeBackendTarget: vi.fn(contracts.normalizeBackendTarget),
  };
});

describe('cli config', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('hydrates output profile defaults when config omits new fields', async () => {
    const fs = await import('node:fs/promises');
    vi.mocked(fs.readFile).mockResolvedValue(
      JSON.stringify({
        gatewayUrl: 'http://localhost:9999',
        outputProfile: {
          tool: 'codex',
        },
      }),
    );

    const { getDefaultOutputProfile, loadCliState } = await import('../../src/lib/config.js');
    const state = await loadCliState();

    expect(state.gatewayUrl).toBe('http://localhost:9999');
    expect(state.backendTarget).toBe('light');
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
      const { loadCliState } = await import('../../src/lib/config.js');
      const result = await loadCliState();
      expect(result.gatewayUrl).toBeDefined();
      expect(result.backendTarget).toBe('light');
    } finally {
      osModule.default.homedir = originalHomedir;
    }
  });

  it('preserves empty-string outputProfile value', async () => {
    const fs = await import('node:fs/promises');
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ outputProfile: '' }));
    const { loadCliState } = await import('../../src/lib/config.js');
    const state = await loadCliState();
    // BUG(fm-agent): empty-string outputProfile should be normalized to undefined per CliState interface
    // Currently the conditional spread `...(outputProfile != null ? { outputProfile } : {})` does not
    // override the empty string from `...parsed`, leaving an invalid non-OutputProfile value.
    // FIXME: change to `toBeUndefined()` once loadCliState normalizes falsy outputProfile values.
    expect(state.outputProfile).toBeUndefined();
  });

  it('omits outputProfile when config file does not define it', async () => {
    const fs = await import('node:fs/promises');
    vi.mocked(fs.readFile).mockResolvedValue(
      JSON.stringify({
        gatewayUrl: 'http://localhost:9999',
      }),
    );

    const { loadCliState } = await import('../../src/lib/config.js');
    const state = await loadCliState();

    expect(state.gatewayUrl).toBe('http://localhost:9999');
    expect(state.backendTarget).toBe('light');
    expect('outputProfile' in state).toBe(false);
  });

  it('normalizeOutputProfile: filters unknown extra properties like colorScheme', async () => {
    const fs = await import('node:fs/promises');
    vi.mocked(fs.readFile).mockResolvedValue(
      JSON.stringify({
        gatewayUrl: 'http://localhost:9999',
        outputProfile: {
          tool: 'codex',
          colorScheme: 'dark',
        },
      }),
    );

    const { loadCliState } = await import('../../src/lib/config.js');
    const state = await loadCliState();
    const validKeys = [
      'tool',
      'modelHint',
      'renderMode',
      'graphPlanMode',
      'verbosity',
      'includeRawHints',
    ];
    const actualKeys = Object.keys(state.outputProfile!);
    const extraKeys = actualKeys.filter((k) => !validKeys.includes(k));
    expect(extraKeys).toEqual([]);
  });

  it('migrates legacy serverUrl config to gatewayUrl in memory', async () => {
    const fs = await import('node:fs/promises');
    vi.mocked(fs.readFile).mockResolvedValue(
      JSON.stringify({
        serverUrl: 'http://legacy-server:9999',
      }),
    );

    const { loadCliState } = await import('../../src/lib/config.js');
    const state = await loadCliState();

    expect(state.gatewayUrl).toBe('http://legacy-server:9999');
    expect(state.backendTarget).toBe('light');
    expect(state.serverUrl).toBeUndefined();
  });

  it('prefers explicit gatewayUrl over legacy serverUrl when both exist', async () => {
    const fs = await import('node:fs/promises');
    vi.mocked(fs.readFile).mockResolvedValue(
      JSON.stringify({
        gatewayUrl: 'http://gateway:4000',
        serverUrl: 'http://legacy-server:9999',
      }),
    );

    const { loadCliState } = await import('../../src/lib/config.js');
    const state = await loadCliState();

    expect(state.gatewayUrl).toBe('http://gateway:4000');
    expect(state.backendTarget).toBe('light');
    expect(state.serverUrl).toBeUndefined();
  });

  it('keeps explicit heavy backendTarget from config', async () => {
    const fs = await import('node:fs/promises');
    vi.mocked(fs.readFile).mockResolvedValue(
      JSON.stringify({
        gatewayUrl: 'http://gateway:4000',
        backendTarget: 'heavy',
      }),
    );

    const { loadCliState } = await import('../../src/lib/config.js');
    const state = await loadCliState();

    expect(state.backendTarget).toBe('heavy');
  });

  it('normalizes unknown backendTarget to light', async () => {
    const fs = await import('node:fs/promises');
    vi.mocked(fs.readFile).mockResolvedValue(
      JSON.stringify({
        gatewayUrl: 'http://gateway:4000',
        backendTarget: 'unknown',
      }),
    );

    const { loadCliState } = await import('../../src/lib/config.js');
    const state = await loadCliState();

    expect(state.backendTarget).toBe('light');
  });

  it('normalizes backendTarget through the shared contracts helper', async () => {
    const fs = await import('node:fs/promises');
    const { normalizeBackendTarget } = await import('@trapmap/contracts');
    vi.mocked(fs.readFile).mockResolvedValue(
      JSON.stringify({
        gatewayUrl: 'http://gateway:4000',
        backendTarget: 'unknown',
      }),
    );

    const { loadCliState } = await import('../../src/lib/config.js');
    const state = await loadCliState();

    expect(state.backendTarget).toBe('light');
    expect(normalizeBackendTarget).toHaveBeenCalledWith('unknown');
  });

  it('persists only canonical gateway and backend target fields after legacy migration', async () => {
    const fs = await import('node:fs/promises');
    vi.mocked(fs.readFile).mockResolvedValue(
      JSON.stringify({
        serverUrl: 'http://legacy-server:9999',
      }),
    );

    const { updateCliState } = await import('../../src/lib/config.js');
    await updateCliState({ backendTarget: 'heavy' });

    const persistedState = JSON.parse(vi.mocked(fs.writeFile).mock.calls[0][1] as string);
    expect(persistedState).toMatchObject({
      gatewayUrl: 'http://legacy-server:9999',
      backendTarget: 'heavy',
    });
    expect(persistedState).not.toHaveProperty('serverUrl');
  });
});
