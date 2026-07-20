export {
  GOVERNANCE_REVIEW_MODULE,
  createGovernanceReviewModule,
} from './module.js';
export type { GovernanceReviewDeps as ReviewDeps } from './module.js';
export type { GovernanceReviewDeps } from './module.js';
export { createGovernanceConflictTaskScheduler } from './conflict-scheduler.js';
export type {
  GovernanceConflictLifecycleEvent,
  GovernanceConflictLifecycleHandler,
} from './conflict-scheduler.js';
