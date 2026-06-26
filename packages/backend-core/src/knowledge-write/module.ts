/**
 * Knowledge-write bounded context.
 *
 * Owns knowledge / trap entry creation, resubmit, supersede, update and
 * every authoritative aggregate mutation that review / maintenance /
 * decay / candidate publish ultimately delegate to.
 */

export * from './application/index.js';
export * from './domain/index.js';
