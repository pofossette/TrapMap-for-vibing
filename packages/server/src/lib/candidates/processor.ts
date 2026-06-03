import type { ChatProvider } from '@trapmap/server/lib/ai/types.js';
import type { TaskHandler } from '@trapmap/server/lib/queue/task-queue.js';
import { createTaskQueue } from '@trapmap/server/lib/queue/task-queue.js';
import type { SkillShareerStore, StoreData } from '@trapmap/server/lib/store.js';
import type { Pool } from 'pg';
import { detectDuplicates } from './detector.js';
import { buildNormalizedDuplicateInput } from './fingerprint.js';
import { createPgDuplicateDetector } from './pg-detector.js';
import type { CandidateRepository } from './repository.js';
import {
  attachAnalysisSnapshot,
  attachDuplicateCase,
  canRetryCandidate,
  getCandidateById,
  getMaxRetries,
  updateCandidateStatus,
} from './store.js';
import type { DuplicateDetectionInput, DuplicateDetectionResult } from './types.js';

const DUPLICATE_THRESHOLD = 0.38; // Match pre-review.ts medium threshold

/** Task type for candidate processing */
export const CANDIDATE_PROCESSING_TASK_TYPE = 'candidate_processing';

/**
 * Payload for candidate processing tasks.
 */
export interface CandidateProcessingPayload {
  candidateId: string;
  retryCount: number;
}

/**
 * Services needed for candidate processing.
 */
export interface CandidateProcessorServices {
  store: SkillShareerStore;
  getSnapshot: () => Promise<StoreData>;
  /** Optional PostgreSQL pool for pgvector-based duplicate detection */
  pool?: Pool;
  /** Feature flag for using PostgreSQL-based detection */
  usePgDuplicateDetection?: () => boolean;
  /** Optional repository for direct candidate DB operations (bypasses transact) */
  candidateRepo?: CandidateRepository;
  /** Optional ChatProvider for LLM-based duplicate adjudication */
  chat?: ChatProvider;
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
    if (services.candidateRepo) {
      await services.candidateRepo.updateStatus(candidateId, 'queued');
    } else {
      await services.store.transact(async (txData) => {
        updateCandidateStatus({
          data: txData,
          candidateId,
          status: 'queued',
        });
      });
    }

    // Phase 2: Start analysis
    if (services.candidateRepo) {
      await services.candidateRepo.updateStatus(candidateId, 'analyzing');
    } else {
      await services.store.transact(async (txData) => {
        updateCandidateStatus({
          data: txData,
          candidateId,
          status: 'analyzing',
        });
      });
    }

    // Phase 3: Build normalized duplicate input (Phase 2 — shared helper)
    // The same `normalized` shape feeds both the in-memory and PostgreSQL
    // detectors so trap and skill candidates get the same recall/embedding
    // treatment (no more trap-only candidateText, no more empty skill text).
    const normalized = buildNormalizedDuplicateInput(candidate);

    // Phase 4: Run duplicate detection
    const freshData = await services.getSnapshot();
    let result: DuplicateDetectionResult;

    // Use PostgreSQL-based detection if pool is available and flag is set
    if (services.pool && services.usePgDuplicateDetection?.()) {
      const pgConfig: Parameters<typeof createPgDuplicateDetector>[0] = {
        pool: services.pool,
      };
      if (services.usePgDuplicateDetection) {
        pgConfig.featureFlag = services.usePgDuplicateDetection;
      }
      if (services.chat) {
        pgConfig.chat = services.chat;
      }
      const pgDetector = createPgDuplicateDetector(pgConfig);

      // Embedding input: title + body concatenation from the normalized
      // contract. Empty for the no-files edge case so PG embedding still
      // produces a vector (rather than crashing) but with no semantic signal.
      const candidateText = normalized.bodyText
        ? `${normalized.titleText}\n${normalized.bodyText}`
        : normalized.titleText;

      result = await pgDetector(
        {
          candidateId,
          candidateText,
          candidateTokens: normalized.tokenTerms,
          candidateKeywords: normalized.keywordTerms,
          candidateFingerprint: normalized.fingerprint,
          candidateExactLookupKey: normalized.exactLookupKey,
          candidateTitle: normalized.titleText,
          candidateBody: normalized.bodyText,
          teamId: candidate.teamId,
        },
        {
          trapEntries: freshData.knowledgeEntries,
          skillArtifacts: freshData.skillArtifacts,
        },
      );
    } else {
      // Fall back to in-memory detection
      const detectionInput: DuplicateDetectionInput = {
        candidateId,
        candidateFingerprint: normalized.fingerprint,
        candidateExactLookupKey: normalized.exactLookupKey,
        candidateKeywords: normalized.keywordTerms,
        candidateTokens: normalized.tokenTerms,
        candidateTitle: normalized.titleText,
        candidateBody: normalized.bodyText,
        trapEntries: freshData.knowledgeEntries,
        skillArtifacts: freshData.skillArtifacts,
        threshold: DUPLICATE_THRESHOLD,
      };
      result = await detectDuplicates(detectionInput, services.chat);
    }

    // Phase 5: Store results and determine final status
    const finalStatus = result.duplicateCase ? 'duplicate_detected' : 'ready_for_review';

    if (services.candidateRepo) {
      await services.candidateRepo.attachAnalysis(candidateId, result.analysisSnapshot);
      if (result.duplicateCase) {
        await services.candidateRepo.attachDuplicateCase(candidateId, result.duplicateCase);
      }
      await services.candidateRepo.updateStatus(candidateId, finalStatus);
    } else {
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
    }
  } catch (error) {
    // Handle error with retry tracking
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    if (services.candidateRepo) {
      await services.candidateRepo.updateStatus(candidateId, 'error', errorMessage);
    } else {
      await services.store.transact(async (txData) => {
        updateCandidateStatus({
          data: txData,
          candidateId,
          status: 'error',
          error: errorMessage,
        });
      });
    }

    throw error;
  }
}

/**
 * Process candidate with retry logic using task queue.
 * If pool is available, enqueues to persistent task queue.
 * Otherwise falls back to immediate processing (for tests/JsonStore).
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
    if (services.candidateRepo) {
      await services.candidateRepo.updateStatus(candidateId, 'error', 'Max retries exceeded');
    } else {
      await services.store.transact(async (txData) => {
        updateCandidateStatus({
          data: txData,
          candidateId,
          status: 'error',
          error: 'Max retries exceeded',
        });
      });
    }
    return;
  }

  try {
    await processCandidate(candidateId, services);
  } catch (_error) {
    // Check if we can retry
    const updatedData = await services.getSnapshot();
    const updatedCandidate = getCandidateById(updatedData, candidateId);

    if (updatedCandidate && canRetryCandidate(updatedCandidate)) {
      // If pool is available, use task queue for retry with backoff
      // Otherwise, the caller is responsible for scheduling (e.g., processPendingCandidates)
      if (services.pool) {
        const queue = createTaskQueue({ pool: services.pool });
        const retryCount = updatedCandidate.retryCount;
        // Exponential backoff: 5s, 10s, 20s
        const delayMs = 5000 * 2 ** retryCount;

        await queue.enqueue<CandidateProcessingPayload>(
          CANDIDATE_PROCESSING_TASK_TYPE,
          { candidateId, retryCount },
          { delayMs, maxAttempts: getMaxRetries() - retryCount, dedupeKey: candidateId },
        );
      }
    }
  }
}

/**
 * Process all pending candidates (for startup recovery).
 */
export async function processPendingCandidates(
  services: CandidateProcessorServices,
): Promise<{ processed: number; errors: number }> {
  const data = await services.getSnapshot();
  const pending = data.candidateSubmissions.filter(
    (c) => c.status === 'received' || c.status === 'queued' || c.status === 'analyzing',
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
 * If pool is available, enqueues to task queue for persistent processing.
 * Otherwise falls back to immediate in-memory processing (for tests/JsonStore).
 */
export function scheduleCandidateProcessing(
  candidateId: string,
  services: CandidateProcessorServices,
): void {
  // If pool is available, use task queue for reliable processing
  if (services.pool) {
    const queue = createTaskQueue({ pool: services.pool });
    void queue
      .enqueue<CandidateProcessingPayload>(
        CANDIDATE_PROCESSING_TASK_TYPE,
        { candidateId, retryCount: 0 },
        { maxAttempts: getMaxRetries(), dedupeKey: candidateId },
      )
      .catch((error) => {
        console.error(`Failed to enqueue candidate processing for ${candidateId}:`, error);
      });
  } else {
    // Fall back to fire-and-forget immediate processing (for tests/JsonStore)
    void processCandidateWithRetry(candidateId, services).catch((error) => {
      console.error(`Candidate processing failed for ${candidateId}:`, error);
    });
  }
}

/**
 * Create a task handler for candidate processing.
 * Use this to register the handler with a task worker.
 */
export function createCandidateProcessingHandler(
  services: CandidateProcessorServices,
): TaskHandler<CandidateProcessingPayload> {
  return {
    type: CANDIDATE_PROCESSING_TASK_TYPE,
    handle: async (task) => {
      const { candidateId } = task.payload;
      await processCandidate(candidateId, services);
    },
    onDead: async (task) => {
      const { candidateId } = task.payload;
      console.error(`Candidate processing dead-lettered for ${candidateId}:`, task.lastError);
      // Mark candidate as permanently failed
      if (services.candidateRepo) {
        await services.candidateRepo.updateStatus(
          candidateId,
          'error',
          `Max retries exceeded: ${task.lastError ?? 'Unknown error'}`,
        );
      } else {
        await services.store.transact(async (txData) => {
          updateCandidateStatus({
            data: txData,
            candidateId,
            status: 'error',
            error: `Max retries exceeded: ${task.lastError ?? 'Unknown error'}`,
          });
        });
      }
    },
  };
}
