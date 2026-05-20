/**
 * Feedback module exports.
 *
 * Round 6: Added PgFeedbackRepository export.
 */

export {
  createFeedbackRepository,
  type FeedbackRepository,
  InMemoryFeedbackRepository,
} from './repository.js';
export { PgFeedbackRepository } from './pg-repository.js';
