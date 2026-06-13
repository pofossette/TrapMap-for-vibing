-- Phase 1: async operator semantics
-- Goal:
--   1. Reserve the migration slot used by the operator/read-model phase
--   2. Confirm no additional physical schema objects are required beyond Phase 0 lease indexes
--
-- This migration is intentionally a no-op. Phase 1 adds operator-facing
-- query/read-model behavior in application code without introducing a new
-- async_jobs table or extra persistence objects.

SELECT 1;
