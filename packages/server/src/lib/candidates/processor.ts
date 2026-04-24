import type { JsonStore, StoreData } from '../store.js';
import type { CandidateSubmission } from '@trapmap/contracts';
import {
  updateCandidateStatus,
  attachAnalysisSnapshot,
  attachDuplicateCase,
  getCandidateById,
  canRetryCandidate,
  getMaxRetries,
} from './store.js';
import {
  computeCandidateFingerprint,
  createAnalysisSnapshot,
} from './fingerprint.js';
import { detectDuplicates, type DuplicateDetectionInput } from './detector.js';

const RETRY_DELAY_MS = 5000;
const DUPLICATE_THRESHOLD = 0.38; // Match pre-review.ts medium threshold

/**
 * Services needed for candidate processing.
 */
export interface CandidateProcessorServices {
  store: JsonStore;
  getSnapshot: () => Promise<StoreData>;
}

/**
 * Process a single candidate through the full analysis pipeline.
 *
 * Steps:
 * 1. Update status to 'queued'
 * 2. Update status to 'analyzing'
 * 3. Compute fingerprint and analysis snapshot
 * 4. Run duplicate detection
 * 5. Update status to 'duplicate_detected' or 'ready_for_review'
 */
export async function processCandidate(
  candidateId: string,
  services: CandidateProcessorServices,
): Promise<void> {
  // Get fresh snapshot for processing
  const data = await services.getSnapshot();
  const candidate = getCandidateById(data, candidateId);

  if (!candidate) {
    throw new Error(`Candidate ${candidateId} not found`);
  }

  // Skip if already processed or processing
  if (!['received', 'queued', 'error'].includes(candidate.status)) {
    return;
  }

  try {
    // Phase 1: Queue the candidate
    await services.store.transact(async (txData) => {
      updateCandidateStatus({
        data: txData,
        candidateId,
        status: 'queued',
      });
    });

    // Phase 2: Start analysis
    await services.store.transact(async (txData) => {
      updateCandidateStatus({
        data: txData,
        candidateId,
        status: 'analyzing',
      });
    });

    // Phase 3: Compute fingerprint
    const fingerprintInput = buildFingerprintInput(candidate);
    const { fingerprint, keywords, tokens } = computeCandidateFingerprint(fingerprintInput);

    const snapshot = createAnalysisSnapshot(fingerprint, keywords, tokens);

    // Phase 4: Run duplicate detection
    const freshData = await services.getSnapshot();
    const detectionInput: DuplicateDetectionInput = {
      candidateId,
      candidateFingerprint: fingerprint,
      candidateKeywords: keywords,
      candidateTokens: tokens,
      trapEntries: freshData.knowledgeEntries,
      skillArtifacts: freshData.skillArtifacts,
      threshold: DUPLICATE_THRESHOLD,
    };

    const result = await detectDuplicates(detectionInput);

    // Phase 5: Store results and determine final status
    const finalStatus = result.duplicateCase ? 'duplicate_detected' : 'ready_for_review';

    await services.store.transact(async (txData) => {
      attachAnalysisSnapshot({
        data: txData,
        candidateId,
        snapshot: result.analysisSnapshot,
      });

      if (result.duplicateCase) {
        attachDuplicateCase({
          data: txData,
          candidateId,
          duplicateCase: result.duplicateCase,
        });
      }

      updateCandidateStatus({
        data: txData,
        candidateId,
        status: finalStatus,
      });
    });

  } catch (error) {
    // Handle error with retry tracking
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    await services.store.transact(async (txData) => {
      updateCandidateStatus({
        data: txData,
        candidateId,
        status: 'error',
        error: errorMessage,
      });
    });

    throw error;
  }
}

/**
 * Process candidate with retry logic.
 */
export async function processCandidateWithRetry(
  candidateId: string,
  services: CandidateProcessorServices,
): Promise<void> {
  const data = await services.getSnapshot();
  const candidate = getCandidateById(data, candidateId);

  if (!candidate) {
    throw new Error(`Candidate ${candidateId} not found`);
  }

  // Check if already at max retries
  if (candidate.retryCount >= getMaxRetries()) {
    // Mark as permanently failed
    await services.store.transact(async (txData) => {
      updateCandidateStatus({
        data: txData,
        candidateId,
        status: 'error',
        error: 'Max retries exceeded',
      });
    });
    return;
  }

  try {
    await processCandidate(candidateId, services);
  } catch (error) {
    // Check if we can retry
    const updatedData = await services.getSnapshot();
    const updatedCandidate = getCandidateById(updatedData, candidateId);

    if (updatedCandidate && canRetryCandidate(updatedCandidate)) {
      // Schedule retry after delay
      setTimeout(() => {
        void processCandidateWithRetry(candidateId, services);
      }, RETRY_DELAY_MS);
    }
  }
}

/**
 * Build fingerprint input from candidate submission.
 */
function buildFingerprintInput(candidate: CandidateSubmission) {
  if (candidate.sourceType === 'trap' && candidate.originalPayload.trap) {
    const trap = candidate.originalPayload.trap;
    return {
      sourceType: 'trap' as const,
      trapPayload: {
        shortcut: trap.shortcut,
        detail: trap.detail,
        labels: trap.labels,
      },
    };
  }

  if (candidate.sourceType === 'skill' && candidate.originalPayload.skill) {
    const skill = candidate.originalPayload.skill;
    return {
      sourceType: 'skill' as const,
      skillPayload: {
        profile: skill.profile ?? null,
        files: skill.files,
      },
    };
  }

  throw new Error(`Cannot build fingerprint input for candidate ${candidate.id}`);
}

/**
 * Process all pending candidates (for startup recovery).
 */
export async function processPendingCandidates(
  services: CandidateProcessorServices,
): Promise<{ processed: number; errors: number }> {
  const data = await services.getSnapshot();
  const pending = data.candidateSubmissions.filter(c =>
    c.status === 'received' || c.status === 'queued' || c.status === 'analyzing'
  );

  let processed = 0;
  let errors = 0;

  for (const candidate of pending) {
    try {
      await processCandidateWithRetry(candidate.id, services);
      processed++;
    } catch {
      errors++;
    }
  }

  return { processed, errors };
}

/**
 * Fire-and-forget wrapper for candidate processing.
 * Safe to call from route handlers - won't block response.
 */
export function scheduleCandidateProcessing(
  candidateId: string,
  services: CandidateProcessorServices,
): void {
  // Fire-and-forget with void operator
  void processCandidateWithRetry(candidateId, services).catch((error) => {
    // Log error but don't throw - this is fire-and-forget
    console.error(`Candidate processing failed for ${candidateId}:`, error);
  });
}
