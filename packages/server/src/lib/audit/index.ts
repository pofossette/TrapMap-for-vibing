/**
 * Audit module exports.
 *
 * Phase: 100-01 (Store Repository Pattern)
 */

export {
  createAuditRepository,
  type AuditRepository,
  InMemoryAuditRepository,
} from './repository.js';
