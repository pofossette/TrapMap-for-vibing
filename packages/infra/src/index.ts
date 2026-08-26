/**
 * @trapmap/infra — shared infrastructure helpers.
 *
 * Generic, host-agnostic infrastructure that is consumed by multiple
 * service packages and both host assemblies. No framework imports,
 * no domain rules — only database/transport/vector primitives.
 */

export * from './vector/index.js';
export * from './embedding/index.js';
