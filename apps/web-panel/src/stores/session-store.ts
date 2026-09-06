import type { AdminPanelSession } from '@trapmap/web-panel/shared/enum-types';
import {
  createErrorRequestState,
  createIdleRequestState,
  createLoadingRequestState,
  createSuccessRequestState,
  type RequestState,
} from '@trapmap/web-panel/shared/lib/request-state';
import { create } from 'zustand';

/**
 * Gateway session/cookie preference — web-panel SHOULD prefer gateway httpOnly
 * cookie semantics (`credentials:'include'` + `trapmap_session`) over insecure
 * browser bearer persistence when the gateway contract supports it.
 *
 * Gateway contract:
 * - `host-local` supports `SESSION_TRANSPORT=bearer-header|cookie` (default `bearer-header`)
 *   but `auth-context.ts` currently only reads `Authorization: Bearer` / `x-session-token` headers;
 *   `cookie` transport requires future gateway `Set-Cookie` + `Cookie: trapmap_session=` handling.
 * - `host-distributed` gateway `registerAuthHook` currently only validates `Bearer` header.
 *   Until both hosts expose `Set-Cookie` / cookie validation, web-panel keeps bearer transport
 *   as fallback. Bearer token in `useSessionStore` lives in JS memory (not localStorage) but is
 *   still JS-accessible and therefore less secure than httpOnly cookie — hence the insecure
 *   persistence warning. When gateway signals cookie support via `VITE_ADMIN_PANEL_SESSION_MODE=cookie`
 *   or a `trapmap_session` cookie already present, panel prefers `credentials:'include'`.
 *
 * This is a conditional preference: cookie when available, bearer otherwise with documented warning.
 */
export type SessionTransportPreference = 'bearer' | 'cookie';

export function resolveSessionTransportPreference(): SessionTransportPreference {
  const envMode = (import.meta.env.VITE_ADMIN_PANEL_SESSION_MODE as string | undefined)?.trim();
  if (envMode === 'cookie') return 'cookie';
  if (envMode === 'bearer') return 'bearer';
  if (typeof document !== 'undefined' && document.cookie.includes('trapmap_session=')) {
    return 'cookie';
  }
  return 'bearer';
}

export function isCookieTransportPreferred(): boolean {
  return resolveSessionTransportPreference() === 'cookie';
}

type SessionStore = {
  request: RequestState<AdminPanelSession>;
  switchError: string | null;
  clearSession: () => void;
  setError: (message: string) => void;
  setLoading: () => void;
  setSession: (session: AdminPanelSession, at?: string) => void;
  setSwitchError: (message: string | null) => void;
};

export const useSessionStore = create<SessionStore>((set) => ({
  request: createIdleRequestState<AdminPanelSession>(null),
  switchError: null,
  clearSession: () =>
    set({
      request: createIdleRequestState<AdminPanelSession>(null),
      switchError: null,
    }),
  setLoading: () =>
    set((state) => ({
      request: createLoadingRequestState(state.request),
    })),
  setSession: (session, at = new Date().toISOString()) =>
    set({
      request: createSuccessRequestState(session, at),
      switchError: null,
    }),
  setError: (message) =>
    set((state) => ({
      request: createErrorRequestState(state.request, message),
    })),
  setSwitchError: (message) =>
    set({
      switchError: message,
    }),
}));
