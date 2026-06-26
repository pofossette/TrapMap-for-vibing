import { z } from 'zod';

/**
 * Zod schema for the retrieval search request body.
 *
 * Per Phase 1 contract-first rule: Zod schemas from packages/contracts
 * are the source of truth. This local schema mirrors the contract
 * until the gateway controller can import directly from contracts.
 *
 * TODO(Phase 1 closeout): replace with shared contract schema once
 * the pilot surface contract is finalized in packages/contracts.
 */
export const searchBodySchema = z.object({
  query: z.string().min(1),
  teamId: z.string().optional(),
  limit: z.number().int().positive().optional(),
});
