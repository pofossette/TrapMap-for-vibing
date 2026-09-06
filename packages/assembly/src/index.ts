export {
  artifactDerivationContract,
  channelMergeContract,
  conflictTriggerContract,
  dedupStrategyContract,
  intentRecognitionContract,
  judgmentContracts,
  labelAlignmentContract,
} from './contracts/judgment-contracts.js';
export type {
  Assembly,
  AssemblyBuilder,
  AssemblyOptions,
  RunningAssembly,
} from './create-assembly.js';
export { createAssembly } from './create-assembly.js';
export { defineContract, defineNode } from './define-node.js';
export type {
  ShutdownController,
  ShutdownControllerOptions,
  ShutdownState,
} from './shutdown-controller.js';
export { createShutdownController } from './shutdown-controller.js';
export { startupChecks } from './startup-checks.js';
export type {
  AssemblyContext,
  CapabilityNode,
  ContractDescriptor,
  NodeTopology,
  StartupIssue,
} from './types.js';
export { AssemblyStartupError } from './types.js';
