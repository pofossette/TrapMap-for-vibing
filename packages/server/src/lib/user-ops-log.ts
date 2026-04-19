// Stub - TDD RED phase
// This module will be implemented in the GREEN phase

export type UserOpsAction =
  | 'search'
  | 'submit'
  | 'edit'
  | 'review'
  | 'review-list'
  | 'import'
  | 'export';

export interface UserOpsLogEntry {
  timestamp: string;
  actorId: string;
  actorHandle: string;
  action: UserOpsAction;
  targetId: string | null;
  teamId: string | null;
  metadata: Record<string, unknown>;
}

export interface UserOpsLogConfig {
  enabled: boolean;
  logDir: string;
}

export function loadUserOpsLogConfig(): UserOpsLogConfig {
  throw new Error('Not implemented');
}

export async function logUserOperation(
  _config: UserOpsLogConfig,
  _entry: UserOpsLogEntry,
): Promise<void> {
  throw new Error('Not implemented');
}
