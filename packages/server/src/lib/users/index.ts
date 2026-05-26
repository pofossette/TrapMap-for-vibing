/**
 * Users module exports.
 *
 * Phase: 83-03 (Store Decoupling)
 * Phase 3: PgUserRepository added.
 */

export {
  createUserRepository,
  type UserRepository,
  InMemoryUserRepository,
} from './repository.js';
export { PgUserRepository } from './pg-repository.js';
