import { create } from 'zustand';

import type { AdminPanelSession } from '@trapmap/web-panel/shared/enum-types';
import {
  type RequestState,
  createErrorRequestState,
  createIdleRequestState,
  createLoadingRequestState,
  createSuccessRequestState,
} from '@trapmap/web-panel/shared/lib/request-state';

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
