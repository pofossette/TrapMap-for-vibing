import { beforeEach, describe, expect, it } from 'vitest';

import { useSessionStore } from './session-store';

const mockSession = {
  authenticated: true,
  activeAccountId: 'acct-admin',
  accounts: [
    {
      id: 'acct-admin',
      token: 'mock-session-token-admin',
      user: {
        displayName: 'TrapMap Operator',
        handle: 'operator@trapmap.local',
        role: 'administrator' as const,
      },
    },
  ],
  availableRoles: ['administrator' as const, 'reviewer' as const, 'read-only-operator' as const],
  token: 'mock-session-token-admin',
  user: {
    displayName: 'TrapMap Operator',
    handle: 'operator@trapmap.local',
    role: 'administrator' as const,
  },
};

describe('session-store', () => {
  beforeEach(() => {
    useSessionStore.getState().clearSession();
  });

  it('starts idle and transitions through loading to success', () => {
    const initial = useSessionStore.getState();
    expect(initial.request.status).toBe('idle');
    initial.setLoading();
    expect(useSessionStore.getState().request.status).toBe('loading');
    useSessionStore.getState().setSession(mockSession);
    const success = useSessionStore.getState();
    expect(success.request.status).toBe('success');
    expect(success.request.payload?.authenticated).toBe(true);
    expect(success.request.payload?.token).toBe('mock-session-token-admin');
    expect(success.switchError).toBeNull();
  });

  it('records error and allows recovery via setSession', () => {
    useSessionStore.getState().setLoading();
    useSessionStore.getState().setError('session fetch failed');
    expect(useSessionStore.getState().request.status).toBe('error');
    expect(useSessionStore.getState().request.error).toBe('session fetch failed');
    useSessionStore.getState().setSession(mockSession);
    expect(useSessionStore.getState().request.status).toBe('success');
  });

  it('clears session back to idle', () => {
    useSessionStore.getState().setSession(mockSession);
    expect(useSessionStore.getState().request.payload?.authenticated).toBe(true);
    useSessionStore.getState().clearSession();
    const cleared = useSessionStore.getState();
    expect(cleared.request.status).toBe('idle');
    expect(cleared.request.payload).toBeNull();
    expect(cleared.switchError).toBeNull();
  });

  it('tracks switchError separately', () => {
    useSessionStore.getState().setSession(mockSession);
    useSessionStore.getState().setSwitchError('switch failed');
    expect(useSessionStore.getState().switchError).toBe('switch failed');
    useSessionStore.getState().setSession(mockSession);
    expect(useSessionStore.getState().switchError).toBeNull();
  });
});
