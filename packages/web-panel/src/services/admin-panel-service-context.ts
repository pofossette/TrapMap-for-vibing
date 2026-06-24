import type { SessionProvider } from '@trapmap/client-core';

import { createAdminPanelApi } from './api/admin-panel-api';
import { createHttpClient } from './api/http-client';
import { createMockAdminPanelApi } from './api/mock-admin-panel-api';

const browserSessionProvider: SessionProvider = {
  getBaseUrl() {
    return getAdminPanelBaseUrl();
  },
  getSessionToken() {
    return null;
  },
};

const ADMIN_PANEL_API_MODE_MOCK = 'mock';
const ADMIN_PANEL_API_MODE_REAL = 'real';
const fallbackBaseUrl = 'http://127.0.0.1:4000';

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

function createRuntimeApi() {
  const mode = import.meta.env.VITE_ADMIN_PANEL_API_MODE;

  if (mode === ADMIN_PANEL_API_MODE_MOCK) {
    return createMockAdminPanelApi();
  }

  if (mode !== undefined && mode !== ADMIN_PANEL_API_MODE_REAL) {
    throw new Error(
      `Unsupported VITE_ADMIN_PANEL_API_MODE value: ${mode}. Expected "real" or "mock".`,
    );
  }

  return createAdminPanelApi(createHttpClient(browserSessionProvider));
}

const runtimeApi = createRuntimeApi();

export function getAdminPanelApi() {
  return runtimeApi;
}
