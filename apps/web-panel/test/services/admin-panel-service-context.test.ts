import { beforeEach, describe, expect, it, vi } from 'vitest';

const originalFetch = globalThis.fetch;

describe('admin-panel service context', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    globalThis.fetch = originalFetch;
  });

  it('defaults to the real API client when no mode is set', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ authenticated: false, accounts: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    globalThis.fetch = fetchMock as typeof fetch;

    const { getAdminPanelApi } = await import('../../src/services/admin-panel-service-context.js');
    await getAdminPanelApi().loadSession();

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toMatch(/\/v1\/auth\/session$/);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: 'GET',
      headers: {},
    });
  });

  it('defaults to the real API client when mode is explicitly real', async () => {
    vi.stubEnv('VITE_ADMIN_PANEL_API_MODE', 'real');

    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ authenticated: false, accounts: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    globalThis.fetch = fetchMock as typeof fetch;

    const { getAdminPanelApi } = await import('../../src/services/admin-panel-service-context.js');
    await getAdminPanelApi().loadSession();

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('uses the mock API only when explicitly requested', async () => {
    vi.stubEnv('VITE_ADMIN_PANEL_API_MODE', 'mock');

    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as typeof fetch;

    const { getAdminPanelApi } = await import('../../src/services/admin-panel-service-context.js');
    const api = getAdminPanelApi();

    await expect(api.loadSession()).resolves.toMatchObject({
      authenticated: true,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects mock mode in production runtimes', async () => {
    vi.stubEnv('VITE_ADMIN_PANEL_API_MODE', 'mock');
    vi.stubEnv('MODE', 'production');

    await expect(import('../../src/services/admin-panel-service-context.js')).rejects.toThrow(
      /only supported in development and test runtimes/i,
    );
  });

  it('attaches bearer token from session store to real requests', async () => {
    vi.stubEnv('VITE_ADMIN_PANEL_API_MODE', 'real');
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ authenticated: true, token: 'mock-session-token-admin' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    globalThis.fetch = fetchMock as typeof fetch;

    const { getAdminPanelApi, browserSessionProvider } = await import(
      '../../src/services/admin-panel-service-context.js'
    );
    const { useSessionStore } = await import('../../src/stores/session-store.js');

    // Initially no token
    expect(browserSessionProvider.getSessionToken()).toBeNull();

    // Seed a session with token
    useSessionStore.getState().setSession({
      authenticated: true,
      activeAccountId: 'acct-admin',
      accounts: [],
      availableRoles: ['administrator'],
      token: 'test-bearer-1234567890abcdef',
      user: {
        displayName: 'TrapMap Operator',
        handle: 'operator@trapmap.local',
        role: 'administrator',
      },
    });

    expect(browserSessionProvider.getSessionToken()).toBe('test-bearer-1234567890abcdef');

    await getAdminPanelApi().loadSession();

    expect(fetchMock).toHaveBeenCalledOnce();
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit & { headers: Record<string, string> };
    expect(init.headers.authorization).toBe('Bearer test-bearer-1234567890abcdef');

    // Cleanup for other tests
    useSessionStore.getState().clearSession();
  });

  it('mock login validates access key and can logout to unauthenticated', async () => {
    vi.stubEnv('VITE_ADMIN_PANEL_API_MODE', 'mock');
    vi.stubEnv('MODE', 'test');
    globalThis.fetch = vi.fn() as typeof fetch;

    const { getAdminPanelApi } = await import('../../src/services/admin-panel-service-context.js');
    const api = getAdminPanelApi();

    await expect(api.login({ accessKey: 'short' })).rejects.toThrow(/at least 16/);

    const session = await api.login({ accessKey: 'valid-access-key-123456' });
    expect(session.authenticated).toBe(true);
    expect(session.token).toBeTruthy();

    await api.logout();
    const after = await api.loadSession();
    expect(after.authenticated).toBe(false);
  });

  it.each([
    [undefined, 'real'],
    ['real', 'real'],
    ['mock', 'mock'],
  ])('reports the %s API mode as %s', async (envMode, expectedMode) => {
    vi.stubEnv('VITE_ADMIN_PANEL_API_MODE', envMode);
    if (envMode === 'mock') vi.stubEnv('MODE', 'test');

    const { getAdminPanelApiMode } = await import(
      '../../src/services/admin-panel-service-context.js'
    );

    expect(getAdminPanelApiMode()).toBe(expectedMode);
  });
});
