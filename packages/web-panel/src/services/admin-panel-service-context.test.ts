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

    const { getAdminPanelApi } = await import('./admin-panel-service-context.js');
    await getAdminPanelApi().loadSession();

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toMatch(/\/v1\/auth\/session$/);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: 'GET',
      headers: {},
    });
  });

  it('uses the mock API only when explicitly requested', async () => {
    vi.stubEnv('VITE_ADMIN_PANEL_API_MODE', 'mock');

    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as typeof fetch;

    const { getAdminPanelApi } = await import('./admin-panel-service-context.js');
    const api = getAdminPanelApi();

    await expect(api.loadSession()).resolves.toMatchObject({
      authenticated: true,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
