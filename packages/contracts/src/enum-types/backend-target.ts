import { z } from 'zod';

export const deploymentProfileSchema = z.enum(['local-agent', 'team-monolith', 'distributed']);

export type DeploymentProfile = z.infer<typeof deploymentProfileSchema>;

export const backendTargetSchema = z.enum(['light', 'heavy']);

export type BackendTarget = z.infer<typeof backendTargetSchema>;

export function normalizeBackendTarget(value: unknown): BackendTarget {
  return backendTargetSchema.safeParse(value).data ?? 'light';
}

export function resolveBackendTargetForProfile(profile: DeploymentProfile): BackendTarget {
  return profile === 'distributed' ? 'heavy' : 'light';
}
