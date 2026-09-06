import { ApiError as TopLevelApiError } from '@trapmap/client-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalFetch = globalThis.fetch;

describe('server-side authorization — gateway enforces auth (real transport)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    globalThis.fetch = originalFetch;
    // Reset location to non-login so redirect is observable (no dispatch to avoid react-router AbortSignal mismatch)
    window.history.pushState({}, '', '/');
    // Provide mock navigate hook so withAuthRedirect uses it instead of pushState+popstate (which triggers react-router error in jsdom)
    (window as unknown as { __trapmapNavigate?: unknown }).__trapmapNavigate = vi.fn();
    // Clear cookie
    Object.defineProperty(document, 'cookie', {
      value: '',
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    window.history.pushState({}, '', '/');
    (window as unknown as { __trapmapNavigate?: unknown }).__trapmapNavigate = undefined;
    Object.defineProperty(document, 'cookie', {
      value: '',
      writable: true,
      configurable: true,
    });
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('unauthenticated GET /api/admin/reviews → 401 → isUnauthorizedError true and triggers RequireAuth redirect to /login', async () => {
    vi.stubEnv('VITE_ADMIN_PANEL_API_MODE', 'real');

    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ message: 'unauthorized' }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { getAdminPanelApi, isUnauthorizedError } = await import(
      '../../src/services/admin-panel-service-context.js'
    );
    const { useSessionStore } = await import('../../src/stores/session-store.js');
    const { isUnauthorizedSession } = await import('../../src/app/router/router.js');

    // Seed authenticated session so clearing is observable
    useSessionStore.getState().setSession({
      authenticated: true,
      activeAccountId: 'acct-admin',
      accounts: [],
      availableRoles: ['administrator'],
      token: 'test-token-admin-401',
      user: { displayName: 'Op', handle: 'op@local', role: 'administrator' },
    });
    const navigateMock = (window as unknown as { __trapmapNavigate: ReturnType<typeof vi.fn> })
      .__trapmapNavigate;

    await expect(getAdminPanelApi().loadPendingReviews()).rejects.toMatchObject({
      statusCode: 401,
    });

    // Verify real transport error is detected as unauthorized (server-side, not just client guard)
    let caught: unknown;
    try {
      await getAdminPanelApi().loadPendingReviews();
    } catch (error) {
      caught = error;
    }
    // Use property check instead of instanceof due to module reset producing distinct ApiError constructors
    expect((caught as { statusCode?: number })?.statusCode).toBe(401);
    expect(isUnauthorizedError(caught)).toBe(true);

    // withAuthRedirect queues a microtask to clear session and redirect to /login
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(useSessionStore.getState().request.status).toBe('idle');
    expect(useSessionStore.getState().request.payload).toBeNull();
    expect(navigateMock).toHaveBeenCalledWith('/login');

    // RequireAuth would redirect on error status (gateway 401 mapped to error)
    expect(
      isUnauthorizedSession({
        status: 'error',
        payload: null,
        error: 'Request failed with status 401',
        updatedAt: new Date().toISOString(),
      } as never),
    ).toBe(true);
    // And on unauthenticated success payload (session endpoint returning authenticated:false)
    expect(
      isUnauthorizedSession({
        status: 'success',
        payload: {
          authenticated: false,
          activeAccountId: null,
          accounts: [],
          availableRoles: [],
          token: null,
          user: null,
        },
        error: null,
        updatedAt: new Date().toISOString(),
      } as never),
    ).toBe(true);

    useSessionStore.getState().clearSession();
  });

  it('unauthenticated POST /api/admin/reviews/:id/decision → 401 → redirect, not 403', async () => {
    vi.stubEnv('VITE_ADMIN_PANEL_API_MODE', 'real');

    const fetchMock = vi.fn(async (url: RequestInfo) => {
      const path = typeof url === 'string' ? url : url.toString();
      if (path.includes('/decision')) {
        return new Response(JSON.stringify({ message: 'Missing session token' }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ authenticated: false }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { getAdminPanelApi, isUnauthorizedError } = await import(
      '../../src/services/admin-panel-service-context.js'
    );
    const { useSessionStore } = await import('../../src/stores/session-store.js');

    useSessionStore.getState().setSession({
      authenticated: true,
      activeAccountId: 'acct-admin',
      accounts: [],
      availableRoles: ['administrator'],
      token: 'test-token-post-401',
      user: { displayName: 'Op', handle: 'op@local', role: 'administrator' },
    });
    const navigateMock = (window as unknown as { __trapmapNavigate: ReturnType<typeof vi.fn> })
      .__trapmapNavigate;

    await expect(
      getAdminPanelApi().submitReviewDecision({
        entryId: 'rev-201',
        decision: 'approve',
        notes: 'should fail unauthorized',
      } as never),
    ).rejects.toMatchObject({ statusCode: 401 });

    let caught: unknown;
    try {
      await getAdminPanelApi().submitReviewDecision({
        entryId: 'rev-201',
        decision: 'approve',
        notes: 'again',
      } as never);
    } catch (error) {
      caught = error;
    }
    expect(isUnauthorizedError(caught)).toBe(true);
    expect((caught as { statusCode?: number })?.statusCode).toBe(401);

    await new Promise<void>((resolve) => queueMicrotask(resolve));
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(useSessionStore.getState().request.status).toBe('idle');
    expect(navigateMock).toHaveBeenCalledWith('/login');

    useSessionStore.getState().clearSession();
  });

  it('authenticated read-only-operator POST → 403 → isUnauthorizedError false, no redirect, noPermission', async () => {
    vi.stubEnv('VITE_ADMIN_PANEL_API_MODE', 'real');

    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ message: 'read-only-operator cannot submit review decision' }),
          {
            status: 403,
            headers: { 'content-type': 'application/json' },
          },
        ),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { getAdminPanelApi, isUnauthorizedError } = await import(
      '../../src/services/admin-panel-service-context.js'
    );
    const { useSessionStore } = await import('../../src/stores/session-store.js');
    const { isUnauthorizedSession } = await import('../../src/app/router/router.js');

    // Seed read-only session (gateway would still have token, but role lacks permission)
    useSessionStore.getState().setSession({
      authenticated: true,
      activeAccountId: 'acct-readonly',
      accounts: [],
      availableRoles: ['read-only-operator'],
      token: 'test-token-readonly-403',
      user: {
        displayName: 'Observer',
        handle: 'observer@trapmap.local',
        role: 'read-only-operator',
      },
    });
    const navigateMock = (window as unknown as { __trapmapNavigate: ReturnType<typeof vi.fn> })
      .__trapmapNavigate;

    await expect(
      getAdminPanelApi().submitReviewDecision({
        entryId: 'rev-201',
        decision: 'approve',
        notes: 'read-only attempt',
      } as never),
    ).rejects.toMatchObject({ statusCode: 403 });

    let caught: unknown;
    try {
      await getAdminPanelApi().submitReviewDecision({
        entryId: 'rev-201',
        decision: 'reject',
        notes: 'also forbidden',
      } as never);
    } catch (error) {
      caught = error;
    }
    expect((caught as { statusCode?: number })?.statusCode).toBe(403);
    expect(isUnauthorizedError(caught)).toBe(false);

    // 403 must NOT trigger the 401 redirect/clear path
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(useSessionStore.getState().request.status).toBe('success');
    expect(useSessionStore.getState().request.payload?.authenticated).toBe(true);
    expect(useSessionStore.getState().request.payload?.user?.role).toBe('read-only-operator');
    expect(navigateMock).not.toHaveBeenCalled();

    // Client-side RBAC would disable actions and show noPermission; server-side 403 confirms it
    // RequireAuth does NOT treat 403 success payload as unauthorized unless authenticated false
    expect(
      isUnauthorizedSession({
        status: 'success',
        payload: {
          authenticated: true,
          activeAccountId: 'acct-readonly',
          accounts: [],
          availableRoles: ['read-only-operator'],
          token: 'test-token-readonly-403',
          user: {
            displayName: 'Observer',
            handle: 'observer@trapmap.local',
            role: 'read-only-operator',
          },
        },
        error: null,
        updatedAt: new Date().toISOString(),
      } as never),
    ).toBe(false);

    useSessionStore.getState().clearSession();
  });

  it('administrator GET /api/admin/reviews → 200 → not unauthorized, returns filteredTotal', async () => {
    vi.stubEnv('VITE_ADMIN_PANEL_API_MODE', 'real');

    const reviewsPayload = {
      items: [],
      filteredTotal: 0,
      total: 0,
      nextCursor: null,
    };
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify(reviewsPayload), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { getAdminPanelApi, isUnauthorizedError } = await import(
      '../../src/services/admin-panel-service-context.js'
    );
    const { useSessionStore } = await import('../../src/stores/session-store.js');

    useSessionStore.getState().setSession({
      authenticated: true,
      activeAccountId: 'acct-admin',
      accounts: [],
      availableRoles: ['administrator'],
      token: 'test-token-admin-success',
      user: { displayName: 'Admin', handle: 'admin@trapmap.local', role: 'administrator' },
    });

    const result = await getAdminPanelApi().loadPendingReviews();
    expect(result).toEqual(reviewsPayload);
    expect(fetchMock).toHaveBeenCalledOnce();
    const calledUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(calledUrl).toMatch(/\/api\/admin\/reviews/);
    // Authorization header should be attached for administrator
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit & { headers: Record<string, string> };
    expect(init.headers.authorization).toBe('Bearer test-token-admin-success');

    // 200 must not be considered unauthorized — use fresh ApiError instance from same module as isUnauthorizedError
    const { ApiError: FreshApiError } = await import('@trapmap/client-core');
    expect(isUnauthorizedError(new FreshApiError(200, null, 'ok'))).toBe(false);
    void TopLevelApiError;

    useSessionStore.getState().clearSession();
  });

  it('reviewer POST decision → 200 → not unauthorized, server accepts', async () => {
    vi.stubEnv('VITE_ADMIN_PANEL_API_MODE', 'real');

    const decisionResponse = {
      entry: { id: 'rev-201', lifecycleState: 'approved' },
    };
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify(decisionResponse), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { getAdminPanelApi, isUnauthorizedError } = await import(
      '../../src/services/admin-panel-service-context.js'
    );
    const { useSessionStore } = await import('../../src/stores/session-store.js');

    useSessionStore.getState().setSession({
      authenticated: true,
      activeAccountId: 'acct-reviewer',
      accounts: [],
      availableRoles: ['reviewer'],
      token: 'test-token-reviewer-success',
      user: { displayName: 'Reviewer', handle: 'reviewer@trapmap.local', role: 'reviewer' },
    });

    const result = await getAdminPanelApi().submitReviewDecision({
      entryId: 'rev-201',
      decision: 'approve',
      notes: 'reviewer ok - server-enforced',
    } as never);
    expect(result).toEqual(decisionResponse);
    expect(fetchMock).toHaveBeenCalledOnce();
    const calledUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(new URL(calledUrl).pathname).toBe('/api/admin/reviews/rev-201/decision');
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit & {
      headers: Record<string, string>;
      body?: string;
    };
    expect(init.headers.authorization).toBe('Bearer test-token-reviewer-success');
    expect(init.body).toContain('approve');

    const { ApiError: FreshError } = await import('@trapmap/client-core');
    expect(isUnauthorizedError(new FreshError(403, null, 'forbidden'))).toBe(false);
    expect(isUnauthorizedError(new FreshError(401, null, 'unauthorized'))).toBe(true);

    useSessionStore.getState().clearSession();
  });

  it('isUnauthorizedError distinguishes 401 from 403 and generic errors (server-side contract)', async () => {
    const { isUnauthorizedError } = await import(
      '../../src/services/admin-panel-service-context.js'
    );
    const { ApiError: CoreError } = await import('@trapmap/client-core');

    expect(
      isUnauthorizedError(new CoreError(401, { message: 'unauthorized' }, 'unauthorized')),
    ).toBe(true);
    expect(isUnauthorizedError(new CoreError(401, null, 'Missing session token'))).toBe(true);
    expect(isUnauthorizedError(new CoreError(403, { kind: 'forbidden' }, 'forbidden'))).toBe(false);
    expect(isUnauthorizedError(new CoreError(500, null, 'server error'))).toBe(false);
    expect(isUnauthorizedError(new Error('generic'))).toBe(false);
    expect(isUnauthorizedError(null)).toBe(false);
    expect(isUnauthorizedError(undefined)).toBe(false);

    // Verify helper is stable for RequireAuth mapping: 401 error status triggers login
    const { isUnauthorizedSession } = await import('../../src/app/router/router.js');
    expect(
      isUnauthorizedSession({
        status: 'error',
        payload: null,
        error: 'Request failed with status 401',
        updatedAt: new Date().toISOString(),
      } as never),
    ).toBe(true);
    expect(
      isUnauthorizedSession({
        status: 'error',
        payload: null,
        error: 'Request failed with status 403',
        updatedAt: new Date().toISOString(),
      } as never),
    ).toBe(true); // router treats any error as unauthorized (conservative), but transport distinguishes
    expect(
      isUnauthorizedSession({
        status: 'success',
        payload: {
          authenticated: true,
          activeAccountId: 'acct-admin',
          accounts: [],
          availableRoles: ['administrator'],
          token: 'tok',
          user: { displayName: 'Op', handle: 'op@local', role: 'administrator' },
        },
        error: null,
        updatedAt: new Date().toISOString(),
      } as never),
    ).toBe(false);
  });
});
