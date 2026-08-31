import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalFetch = globalThis.fetch;

describe('gateway session/cookie preference — P4B', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    globalThis.fetch = originalFetch;
    Object.defineProperty(document, 'cookie', {
      value: '',
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    Object.defineProperty(document, 'cookie', {
      value: '',
      writable: true,
      configurable: true,
    });
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('cookie mode via env sends credentials:include even when bearer token is present', async () => {
    vi.stubEnv('VITE_ADMIN_PANEL_API_MODE', 'real');
    vi.stubEnv('VITE_ADMIN_PANEL_SESSION_MODE', 'cookie');

    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ authenticated: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { browserSessionProvider, isGatewayCookieModePreferred } = await import(
      './admin-panel-service-context.js'
    );
    const { useSessionStore, isCookieTransportPreferred, resolveSessionTransportPreference } =
      await import('../stores/session-store.js');
    const { createHttpClient } = await import('./api/http-client.js');

    expect(isCookieTransportPreferred()).toBe(true);
    expect(isGatewayCookieModePreferred()).toBe(true);
    expect(resolveSessionTransportPreference()).toBe('cookie');

    useSessionStore.getState().setSession({
      authenticated: true,
      activeAccountId: 'acct-admin',
      accounts: [],
      availableRoles: ['administrator'],
      token: 'cookie-mode-bearer-token-should-still-prefer-cookie',
      user: { displayName: 'Op', handle: 'op@local', role: 'administrator' },
    });

    // Provider signals cookie preference via getFetchOptions
    expect(browserSessionProvider.getFetchOptions?.()).toEqual({ credentials: 'include' });

    // http-client respects provider preference and sends credentials include
    const client = createHttpClient(browserSessionProvider);
    await client.request({ path: '/v1/auth/session' });

    expect(fetchMock).toHaveBeenCalledOnce();
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit & {
      headers: Record<string, string>;
      credentials?: string;
    };
    expect(init.credentials).toBe('include');
    // Bearer header is still present via getSessionToken, but credentials include is preferred
    // The P4B preference is to send include even when token exists to allow gateway cookie path
    expect(init.headers.authorization).toBeDefined();

    useSessionStore.getState().clearSession();
  });

  it('bearer mode sends Authorization header without credentials when token present', async () => {
    vi.stubEnv('VITE_ADMIN_PANEL_API_MODE', 'real');
    vi.stubEnv('VITE_ADMIN_PANEL_SESSION_MODE', 'bearer');

    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ authenticated: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { browserSessionProvider } = await import('./admin-panel-service-context.js');
    const { useSessionStore, isCookieTransportPreferred } = await import(
      '../stores/session-store.js'
    );
    const { createHttpClient } = await import('./api/http-client.js');

    expect(isCookieTransportPreferred()).toBe(false);

    useSessionStore.getState().setSession({
      authenticated: true,
      activeAccountId: 'acct-admin',
      accounts: [],
      availableRoles: ['administrator'],
      token: 'bearer-only-token-1234567890abcdef',
      user: { displayName: 'Op', handle: 'op@local', role: 'administrator' },
    });

    expect(browserSessionProvider.getSessionToken()).toBe('bearer-only-token-1234567890abcdef');
    expect(browserSessionProvider.getFetchOptions?.()).toEqual({});

    const client = createHttpClient(browserSessionProvider);
    await client.request({ path: '/api/admin/reviews' });

    expect(fetchMock).toHaveBeenCalledOnce();
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit & {
      headers: Record<string, string>;
      credentials?: string;
    };
    expect(init.headers.authorization).toBe('Bearer bearer-only-token-1234567890abcdef');
    expect(init.credentials).toBeUndefined();

    useSessionStore.getState().clearSession();
  });

  it('presence of trapmap_session cookie without env triggers cookie preference', async () => {
    vi.stubEnv('VITE_ADMIN_PANEL_API_MODE', 'real');
    // No VITE_ADMIN_PANEL_SESSION_MODE set -> should auto-detect via document.cookie
    Object.defineProperty(document, 'cookie', {
      value: 'trapmap_session=auto-detected-cookie-xyz; other=1',
      writable: true,
      configurable: true,
    });

    const { isCookieTransportPreferred, resolveSessionTransportPreference } = await import(
      '../stores/session-store.js'
    );
    const { browserSessionProvider } = await import('./admin-panel-service-context.js');

    expect(resolveSessionTransportPreference()).toBe('cookie');
    expect(isCookieTransportPreferred()).toBe(true);
    expect(browserSessionProvider.getFetchOptions?.()).toEqual({ credentials: 'include' });

    // Also verify http-client sends include even with no bearer token
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ authenticated: false }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const { createHttpClient } = await import('./api/http-client.js');
    const client = createHttpClient(browserSessionProvider);
    // No token in store, but cookie present
    await client.request({ path: '/v1/auth/session' });
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit & { credentials?: string };
    expect(init.credentials).toBe('include');

    // Fallback getSessionToken reads non-httpOnly cookie
    expect(browserSessionProvider.getSessionToken()).toBe('auto-detected-cookie-xyz');
  });

  it('bearer fallback without cookie and without token sends credentials include (opportunistic)', async () => {
    vi.stubEnv('VITE_ADMIN_PANEL_API_MODE', 'real');
    // no VITE_ADMIN_PANEL_SESSION_MODE, no cookie, no token
    const { browserSessionProvider } = await import('./admin-panel-service-context.js');
    const { isCookieTransportPreferred } = await import('../stores/session-store.js');
    const { createHttpClient } = await import('./api/http-client.js');

    expect(isCookieTransportPreferred()).toBe(false);
    expect(browserSessionProvider.getSessionToken()).toBeNull();

    // Provider in bearer mode with no token should still signal include for opportunistic cookie
    expect(browserSessionProvider.getFetchOptions?.()).toEqual({ credentials: 'include' });

    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ authenticated: false }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const client = createHttpClient(browserSessionProvider);
    await client.request({ path: '/v1/auth/session' });
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit & { credentials?: string };
    expect(init.credentials).toBe('include');
  });
});
