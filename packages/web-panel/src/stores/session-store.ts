import { create } from 'zustand';

import {
  type RequestState,
  createErrorRequestState,
  createIdleRequestState,
  createLoadingRequestState,
  createSuccessRequestState,
} from '@trapmap/web-panel/shared/lib/request-state';
import type { AdminPanelSession } from '@trapmap/web-panel/shared/types/admin-panel';

type SessionStore = {
  request: RequestState<AdminPanelSession>;
  switchError: string | null;
  setError: (message: string) => void;
  setLoading: () => void;
  setSession: (session: AdminPanelSession, at?: string) => void;
  setSwitchError: (message: string | null) => void;
};

export const useSessionStore = create<SessionStore>((set) => ({
  request: createIdleRequestState<AdminPanelSession>(null),
  switchError: null,
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
