---
name: api-pagination-trap
description: Backend API pagination and query pitfalls including N+1, missing limits, and connection pool exhaustion
labels:
  - api
  - backend
  - node
  - postgresql
  - performance
  - pagination
---

# API Pagination and Query Pitfalls

## N+1 Query Problem

When an API endpoint returns a list of items and each item requires a separate database query for related data, the result is N+1 queries instead of 2. With 100 items this becomes 101 queries, causing severe performance degradation and timeout errors in production. The endpoint appears to work in local development with small datasets but fails under load in staging and production.

Prerequisite: must understand SQL JOIN operations and ORM eager loading.
Requires using JOIN or batch loading strategies for related data.

To mitigate: use ORM eager loading (sequelize include, TypeORM relations) or DataLoader for batching. Fix: replace N+1 queries with a single JOIN query or use a batch loader pattern. Test with vitest against a seeded postgres database.

## Missing Pagination Limits

API endpoints that return all records without pagination cause out-of-memory errors when the table grows large. A GET /api/items endpoint that returns all items works fine with 100 records but crashes with OOM error when the table has 1 million records in production.

Requires default limit on all list endpoints. Fix: add mandatory limit and offset parameters with sensible defaults (limit=50, max limit=1000). Use cursor-based pagination for large datasets.

## Connection Pool Exhaustion

When the backend opens database connections without releasing them, the connection pool becomes exhausted. New requests timeout waiting for a connection, causing cascade failures across the entire API. The error manifests as "cannot acquire connection from pool" in production.

Fix: ensure all connections are released in finally blocks, configure pool size based on expected concurrency, and use connection leak detection in staging.
