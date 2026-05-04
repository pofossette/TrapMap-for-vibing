/**
 * Teams module exports.
 *
 * Phase: 83-03 (Store Decoupling)
 */

export {
  createTeamRepository,
  type TeamRepository,
  InMemoryTeamRepository,
  createMembershipRepository,
  type MembershipRepository,
  InMemoryMembershipRepository,
} from './repository.js';
