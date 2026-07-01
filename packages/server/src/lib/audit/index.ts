/**
 * Audit module exports.
 *
 * Phase: 100-01 (Store Repository Pattern)
 * Phase 3: PgAuditRepository added.
 */

export {
  createAuditRepository,
  type AuditRepository,
} from './repository.js';
