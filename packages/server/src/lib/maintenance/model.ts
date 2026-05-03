/**
 * Maintenance model helpers for ownership verification and SLA management.
 *
 * Provides validation, default computation, and stale/overdue checks
 * for maintenance metadata on knowledge entries and skill artifacts.
 */

import type { MaintenanceMeta } from '@trapmap/contracts';
import { maintenanceMetaSchema } from '@trapmap/contracts';

import type { ActorRef } from '@trapmap/contracts';

import type { MaintenanceMetaRecord } from '../store.js';

/**
 * Validate maintenance metadata using zod schema.
 * Returns the validated metadata or throws on validation error.
 */
export function validateMaintenanceMeta(meta: unknown): MaintenanceMeta {
  return maintenanceMetaSchema.parse(meta);
}

/**
 * Compute a default review-by date as an ISO timestamp.
 *
 * @param days - Number of days from now for the review deadline
 * @returns ISO timestamp string representing the review deadline
 */
export function computeDefaultReviewBy(days: number): string {
  return new Date(Date.now() + days * 86400000).toISOString();
}

/**
 * Check whether a review-by date is overdue.
 *
 * @param reviewBy - ISO timestamp for the review deadline, or null if not scheduled
 * @param now - Current date for comparison
 * @returns true if reviewBy is set and has passed
 */
export function isReviewOverdue(reviewBy: string | null, now: Date): boolean {
  if (reviewBy === null) return false;
  return new Date(reviewBy) < now;
}

/**
 * Check whether a verification has gone stale.
 *
 * Returns true if lastVerifiedAt is set and the age in days exceeds staleDays.
 * Returns true if lastVerifiedAt is null (never verified, considered stale).
 *
 * @param lastVerifiedAt - ISO timestamp of last verification, or null
 * @param staleDays - Number of days after which verification is considered stale
 * @param now - Current date for comparison
 * @returns true if verification is stale or never performed
 */
export function isStaleVerification(lastVerifiedAt: string | null, staleDays: number, now: Date): boolean {
  if (lastVerifiedAt === null) return true;
  const verifiedAt = new Date(lastVerifiedAt);
  const ageMs = now.getTime() - verifiedAt.getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  return ageDays > staleDays;
}

/**
 * Convert a MaintenanceMetaRecord to an ActorRef for contract-level use.
 *
 * Returns null if no maintainer is assigned (maintainerUserId is null).
 *
 * @param record - Maintenance metadata record from the store
 * @returns ActorRef if maintainer is assigned, null otherwise
 */
export function toActorRefFromRecord(record: MaintenanceMetaRecord): ActorRef | null {
  if (record.maintainerUserId === null) return null;
  return {
    id: record.maintainerUserId,
    handle: record.maintainerHandle ?? '',
    securityLevel: record.maintainerLevel ?? 0,
  };
}
