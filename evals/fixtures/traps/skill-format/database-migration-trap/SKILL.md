---
name: database-migration-trap
description: Database schema migration pitfalls including breaking changes, lock contention, and rollback failures
labels:
  - database
  - postgresql
  - migration
  - schema
  - backend
  - sql
---

# Database Migration Pitfalls

## Breaking Schema Change Without Backward Compatibility

When a migration renames a column or changes a data type without maintaining backward compatibility, the deployed application crashes immediately. The old code references the old column name which no longer exists, causing "column not found" errors in production. This is a cross-domain failure affecting the backend, CI pipeline, and deployment process simultaneously.

Prerequisite: must understand expand-contract migration pattern.
Requires maintaining both old and new schemas during transition.

To mitigate: use the expand-contract pattern - add new column first, deploy code that writes to both, then remove old column in a separate migration. Fix: never rename or remove columns in a single migration. Always split into additive and subtractive phases separated by a deployment.

## Migration Lock Contention in Production

Running ALTER TABLE on a large table in postgres acquires an exclusive lock, blocking all reads and writes. In production with active traffic, this causes timeout errors and connection pool exhaustion as queries queue up waiting for the lock. The migration itself may take hours on large tables.

Requires online schema change tools. Fix: use pg_repack or postgres ONLINE operations where supported, add SET lock_timeout and SET statement_timeout before migrations, and run migrations during low-traffic windows. Test migration performance in staging with production-like data volumes.

## Failed Migration Rollback Leaves Inconsistent State

When a migration fails partway through and the rollback also fails, the database is left in an inconsistent state between the old and new schema. Subsequent application of either the migration or rollback produces errors because partial state exists. This requires manual database intervention to resolve.

Fix: wrap each migration in a transaction where possible (DDL in postgres can be transactional), include idempotent rollback scripts, and always test migration rollback in CI before applying to staging or production.
