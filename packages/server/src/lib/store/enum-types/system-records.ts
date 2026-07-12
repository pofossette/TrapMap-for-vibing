import type { Permission, RoleTemplate } from '@trapmap/contracts';

export interface UserRecord {
  id: string;
  handle: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TeamRecord {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MembershipRecord {
  id: string;
  userId: string;
  teamId: string;
  roleTemplate: RoleTemplate;
  securityLevel: number;
  permissions: Permission[];
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AccessKeyRecord {
  id: string;
  memberId: string;
  tokenHash: string;
  tokenPreview: string;
  issuedByUserId: string;
  teamId: string;
  level: number;
  notes: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SessionRecord {
  id: string;
  subjectType: 'user' | 'system-admin';
  userId: string | null;
  activeTeamId: string | null;
  tokenHash: string;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuditEventRecord {
  id: string;
  teamId: string | null;
  actorId: string;
  action: string;
  entityId: string;
  payload: Record<string, unknown>;
  eventVersion?: number;
  sourceService?: string;
  requestId?: string;
  traceId?: string;
  operationId?: string;
  causationId?: string;
  outcome?: 'success' | 'rejected' | 'failed';
  createdAt: string;
  updatedAt: string;
}
