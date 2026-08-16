export { defineNode, defineContract } from './define-node.js';
export { startupChecks } from './startup-checks.js';
export { createAssembly } from './create-assembly.js';
export type {
  Assembly,
  AssemblyBuilder,
  AssemblyOptions,
  RunningAssembly,
} from './create-assembly.js';
export { createShutdownController } from './shutdown-controller.js';
export type {
  ShutdownController,
  ShutdownControllerOptions,
  ShutdownState,
} from './shutdown-controller.js';
export type {
  AssemblyContext,
  CapabilityNode,
  ContractDescriptor,
  NodeTopology,
  StartupIssue,
} from './types.js';
export { AssemblyStartupError } from './types.js';
