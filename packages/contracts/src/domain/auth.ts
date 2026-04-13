import { z } from 'zod';

import { actorRefSchema, entityIdSchema, permissionSchema, securityLevelSchema } from './common.js';
import { memberSchema, teamSchema } from './team.js';

export const loginRequestSchema = z
  .object({
    accessKey: z.string().min(16).max(256),
  })
  .or(
    z.object({
      systemAdminKey: z.string().min(16).max(256),
    }),
  );

export const activeSessionSchema = z.object({
  sessionId: entityIdSchema,
  member: memberSchema,
  activeTeam: teamSchema.nullable(),
  effectivePermissions: z.array(permissionSchema),
  expiresAt: z.string().nullable(),
  issuedAt: z.string(),
});

export const loginResponseSchema = z.object({
  session: activeSessionSchema,
});

export const sessionStatusResponseSchema = z.object({
  authenticated: z.boolean(),
  session: activeSessionSchema.nullable(),
});

export const logoutResponseSchema = z.object({
  ok: z.boolean(),
});

export const authContextSchema = z.object({
  actor: actorRefSchema,
  teamId: entityIdSchema.nullable(),
  effectivePermissions: z.array(permissionSchema),
  securityLevel: securityLevelSchema,
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type ActiveSession = z.infer<typeof activeSessionSchema>;
export type AuthContext = z.infer<typeof authContextSchema>;
export type LoginResponse = z.infer<typeof loginResponseSchema>;
export type SessionStatusResponse = z.infer<typeof sessionStatusResponseSchema>;
export type LogoutResponse = z.infer<typeof logoutResponseSchema>;
