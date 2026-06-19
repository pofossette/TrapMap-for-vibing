import type { SessionProvider } from '@trapmap/client-core';

import { createAdminPanelApi } from './api/admin-panel-api';
import { createHttpClient } from './api/http-client';
import { createMockAdminPanelApi } from './api/mock-admin-panel-api';

const browserSessionProvider: SessionProvider = {
  getBaseUrl() {
    return window.location.origin;
  },
  getSessionToken() {
    return null;
  },
};

const isDev = import.meta.env.DEV;

const runtimeApi =
  isDev || typeof window === 'undefined'
    ? createMockAdminPanelApi()
    : createAdminPanelApi(createHttpClient(browserSessionProvider));

export function getAdminPanelApi() {
  return runtimeApi;
}
