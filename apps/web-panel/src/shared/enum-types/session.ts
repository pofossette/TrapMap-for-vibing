export type SessionUserRole = 'administrator' | 'reviewer' | 'read-only-operator';

export type SessionUser = {
  displayName: string;
  handle: string;
  role: SessionUserRole;
};

export type SessionAccount = {
  id: string;
  token: string;
  user: SessionUser;
};

export type AdminPanelSession = {
  accounts: SessionAccount[];
  authenticated: boolean;
  activeAccountId: string | null;
  availableRoles: SessionUserRole[];
  token: string | null;
  user: SessionUser | null;
};
