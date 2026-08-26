import type { SessionProvider } from '@trapmap/client-core';

import { useSessionStore } from '@trapmap/web-panel/stores/session-store';
import { createAdminPanelApi } from './api/admin-panel-api';
import { createHttpClient } from './api/http-client';
import { createMockAdminPanelApi } from './api/mock-admin-panel-api';

export const browserSessionProvider: SessionProvider = {
  getBaseUrl() {
    return getAdminPanelBaseUrl();
  },
  getSessionToken() {
    return useSessionStore.getState().request.payload?.token ?? null;
  },
};

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

  return createAdminPanelApi(createHttpClient(browserSessionProvider));
}

const adminPanelApiMode = resolveAdminPanelApiMode();
const runtimeApi = createRuntimeApi(adminPanelApiMode);

export function getAdminPanelApi() {
  return runtimeApi;
}

export function getAdminPanelApiMode(): AdminPanelApiMode {
  return adminPanelApiMode;
}
