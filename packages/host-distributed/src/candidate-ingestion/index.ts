/**
 * Start the candidate-ingestion distributed service.
 *
 * Phase 3 convergence: delegate to the distributed assembly profile (builds
 * the config/database/candidate-ingestion server nodes and boots them).
 */
import { startDistributedService } from '../assembly/profiles/distributed.js';

export async function startCandidateIngestionService() {
  return startDistributedService('candidate-ingestion');
}
