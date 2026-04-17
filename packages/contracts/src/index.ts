export * from './domain/artifacts.js';
export * from './domain/auth.js';
export * from './domain/common.js';
export * from './domain/knowledge.js';
export * from './domain/operations.js';
export * from './domain/path-validation.js';
export * from './domain/retrieval.js';
export * from './domain/review.js';
export * from './domain/team.js';

// Phase 15-02: Activation policy exports
export type {
  ScriptActivationPolicy,
  ClientOverridePolicy,
  ScriptWithPolicyMetadata,
} from './domain/artifacts.js';
export {
  scriptActivationPolicySchema,
  clientOverridePolicySchema,
  scriptWithPolicyMetadataSchema,
} from './domain/artifacts.js';
