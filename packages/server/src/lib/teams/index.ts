/**
 * Teams module exports.
 *
 * Phase: 83-03 (Store Decoupling)
 * Phase 3: PgTeamRepository and PgMembershipRepository added.
 */

export {
  createTeamRepository,
  type TeamRepository,
  InMemoryTeamRepository,
  createMembershipRepository,
  type MembershipRepository,
  InMemoryMembershipRepository,
} from './repository.js';
