import { ApiError, type SessionProvider } from '@trapmap/client-core';

import { createAdminPanelApi } from './api/admin-panel-api';
import { createHttpClient } from './api/http-client';
import { createMockAdminPanelApi } from './api/mock-admin-panel-api';
import type { AdminPanelApiContract } from '@trapmap/web-panel/shared/enum-types';
import { useSessionStore } from '@trapmap/web-panel/stores/session-store';

export const browserSessionProvider: SessionProvider = {
  getBaseUrl() {
    return getAdminPanelBaseUrl();
  },
  getSessionToken() {
    const storeToken = useSessionStore.getState().request.payload?.token ?? null;
    if (storeToken) return storeToken;
    // Gateway cookie preference branch: when bearer token is absent in the
    // store (e.g. httpOnly cookie transport), fall back to reading a
    // non-httpOnly cookie if present so that the fetch layer can still
    // attach credentials via `credentials: 'include'`. The httpClient below
    // also sets `credentials: 'include'` when no bearer is present.
    if (typeof document !== 'undefined') {
      const match = document.cookie.match(/(?:^|; )trapmap_session=([^;]*)/);
      if (match?.[1]) {
        try {
          return decodeURIComponent(match[1]);
        } catch {
          return match[1];
        }
      }
    }
    return null;
  },
};

export function isUnauthorizedError(error: unknown): boolean {
  return error instanceof ApiError && error.statusCode === 401;
}

function withAuthRedirect<T extends AdminPanelApiContract>(api: T): T {
  const handler: ProxyHandler<T> = {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== 'function') return value;
      return async (...args: unknown[]) => {
        try {
          return await (value as (...a: unknown[]) => Promise<unknown>).apply(target, args);
        } catch (error) {
          if (isUnauthorizedError(error)) {
            // Clear local session so that RequireAuth sees unauthenticated and
            // redirects to /login. Use a microtask to avoid Zustand transients
            // during render.
            queueMicrotask(() => {
              try {
                useSessionStore.getState().clearSession();
              } catch {
                // ignore store errors during 401 handling
              }
              if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
                // Use history API to avoid full reload in SPA; fallback to assign
                const nav = (window as unknown as { __trapmapNavigate?: (path: string) => void })
                  .__trapmapNavigate;
                if (typeof nav === 'function') {
                  nav('/login');
                } else {
                  window.history.pushState({}, '', '/login');
                  window.dispatchEvent(new PopStateEvent('popstate'));
                }
              }
            });
          }
          throw error;
        }
      };
    },
  };
  return new Proxy(api, handler);
}

const ADMIN_PANEL_API_MODE_MOCK = 'mock';
const ADMIN_PANEL_API_MODE_REAL = 'real';
const fallbackBaseUrl = 'http://127.0.0.1:4000';

export type AdminPanelApiMode = typeof ADMIN_PANEL_API_MODE_REAL | typeof ADMIN_PANEL_API_MODE_MOCK;

function getAdminPanelBaseUrl(): string {
  const explicitBaseUrl = import.meta.env.VITE_ADMIN_PANEL_API_BASE_URL as string | undefined;
  if (explicitBaseUrl) {
    return explicitBaseUrl;
  }

  if (typeof window !== 'undefined') {
    return window.location.origin;
  }

  return fallbackBaseUrl;
}

function resolveAdminPanelApiMode(): AdminPanelApiMode {
  const mode = import.meta.env.VITE_ADMIN_PANEL_API_MODE;
  const runtimeMode = import.meta.env.MODE;

  if (mode === ADMIN_PANEL_API_MODE_MOCK) {
    if (runtimeMode === 'production') {
      throw new Error(
        'VITE_ADMIN_PANEL_API_MODE=mock is only supported in development and test runtimes.',
      );
    }
    return ADMIN_PANEL_API_MODE_MOCK;
  }

  if (mode !== undefined && mode !== ADMIN_PANEL_API_MODE_REAL) {
    throw new Error(
      `Unsupported VITE_ADMIN_PANEL_API_MODE value: ${mode}. Expected "real" or "mock".`,
    );
  }

  return ADMIN_PANEL_API_MODE_REAL;
}

function createRuntimeApi(mode: AdminPanelApiMode) {
  if (mode === ADMIN_PANEL_API_MODE_MOCK) {
    return createMockAdminPanelApi();
  }

  const raw = createAdminPanelApi(createHttpClient(browserSessionProvider));
  return withAuthRedirect(raw);
}

const adminPanelApiMode = resolveAdminPanelApiMode();
const runtimeApi = createRuntimeApi(adminPanelApiMode);

export function getAdminPanelApi() {
  return runtimeApi;
}

export function getAdminPanelApiMode(): AdminPanelApiMode {
  return adminPanelApiMode;
}
