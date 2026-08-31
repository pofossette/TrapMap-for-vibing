/**
 * Go Accelerator domain contracts — Zod SSOT for distributed compute hub.
 *
 * These schemas are the SINGLE SOURCE OF TRUTH for `services/go-accelerator`
 * JSON wire types. `packages/contracts/scripts/generate-json-schema.ts`
 * emits them to `contracts/json-schema/go-accelerator/*.json` (draft 2020-12),
 * and `services/go-accelerator/pkg/api/types.go` is checked against that
 * output via `pnpm generate:contracts --check`.
 *
 * Rules:
 * - Payload `unknown` is modeled as `z.unknown()` (maps to Go `json.RawMessage`);
 *   Go side validates via `json.RawMessage` + canonicalJsonStringify byte check.
 * - All `float64` scores are `z.number().finite().min(-1).max(1)` where cosine,
 *   or `min(0).max(1)` where normalized.
 * - `Sha256Hex` reuses `sha256HexSchema` (64 lower hex).
 */

import { z } from 'zod';

import { sha256HexSchema } from './common.js';

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export const goAcceleratorHealthResponseSchema = z
  .object({
    status: z.string().min(1),
    service: z.string().min(1),
    version: z.string().min(1),
  })
  .strict();

export type GoAcceleratorHealthResponse = z.infer<typeof goAcceleratorHealthResponseSchema>;

// ---------------------------------------------------------------------------
// Hash
// ---------------------------------------------------------------------------

export const goAcceleratorCanonicalHashRequestSchema = z
  .object({
    payload: z.unknown(),
  })
  .strict();

export const goAcceleratorCanonicalHashResponseSchema = z
  .object({
    canonical: z.string().min(1),
    hash: sha256HexSchema,
  })
  .strict();

// ---------------------------------------------------------------------------
// Vector
// ---------------------------------------------------------------------------

export const goAcceleratorVectorCosineRequestSchema = z
  .object({
    a: z.array(z.number().finite()),
    b: z.array(z.number().finite()),
  })
  .strict();

export const goAcceleratorVectorCosineResponseSchema = z
  .object({
    similarity: z.number().finite(),
    normA: z.number().finite().min(0),
    normB: z.number().finite().min(0),
  })
  .strict();

export const goAcceleratorBatchCosineRequestSchema = z
  .object({
    query: z.array(z.number().finite()),
    vectors: z.array(z.array(z.number().finite())),
  })
  .strict();

export const goAcceleratorBatchCosineResponseSchema = z
  .object({
    scores: z.array(z.number().finite()),
  })
  .strict();

export const goAcceleratorFallbackVectorRequestSchema = z
  .object({
    text: z.string(),
    dim: z.number().int().min(1).max(4096).optional().default(384),
  })
  .strict();

export const goAcceleratorFallbackVectorResponseSchema = z
  .object({
    vector: z.array(z.number().finite()),
    dim: z.number().int().min(1).max(4096),
  })
  .strict();

// ---------------------------------------------------------------------------
// Text / Tokenize
// ---------------------------------------------------------------------------

export const goAcceleratorTokenizeRequestSchema = z
  .object({
    text: z.string(),
    maxTokens: z.number().int().min(1).optional(),
    chunkSize: z.number().int().min(1).max(10000).optional(),
    overlap: z.number().int().min(0).max(1000).optional(),
  })
  .strict();

export const goAcceleratorTokenizeResponseSchema = z
  .object({
    tokens: z.array(z.string()),
    chunks: z.array(z.string()),
    count: z.number().int().min(0),
  })
  .strict();

// ---------------------------------------------------------------------------
// Retrieval
// ---------------------------------------------------------------------------

export const goAcceleratorRetrievalScoreEntrySchema = z
  .object({
    id: z.string().min(1),
    scope: z.string().min(1),
    labels: z.array(z.string()),
    requiredLevel: z.number().int().min(0).max(10),
    shortcut: z.string(),
    detail: z.string(),
    score: z.number().finite().optional(),
  })
  .strict();

export const goAcceleratorRetrievalScoreRequestSchema = z
  .object({
    entries: z.array(goAcceleratorRetrievalScoreEntrySchema),
    query: z.string(),
    filters: z.object({
      labels: z.array(z.string()),
      scopes: z.array(z.string()),
    }),
    limit: z.number().int().min(1).max(100).optional(),
  })
  .strict();

export const goAcceleratorRetrievalScoreResponseSchema = z
  .object({
    globalConstraints: z.array(goAcceleratorRetrievalScoreEntrySchema),
    projectKnowledge: z.array(goAcceleratorRetrievalScoreEntrySchema),
    reason: z.string().min(1),
  })
  .strict();

// ---------------------------------------------------------------------------
// Gene
// ---------------------------------------------------------------------------

export const goAcceleratorGeneCandidateSchema = z
  .object({
    geneId: z.string().min(1),
    title: z.string().optional().default(''),
    semanticScore: z.number().finite().min(0).max(1),
    keywordScore: z.number().finite().min(0).max(1),
    exactSignalMatch: z.boolean(),
    errorTextMatch: z.boolean(),
    boundaryMatch: z.boolean(),
    freshValidation: z.boolean(),
    broadMatch: z.boolean(),
    sourceKind: z.string().min(1),
  })
  .strict();

export const goAcceleratorGeneSelectRequestSchema = z
  .object({
    candidates: z.array(goAcceleratorGeneCandidateSchema),
    query: z.string(),
    maxResults: z.number().int().min(1).max(100).optional(),
  })
  .strict();

export const goAcceleratorGeneSelectResponseSchema = z
  .object({
    selected: z.array(
      z.object({
        geneId: z.string().min(1),
        score: z.number().finite(),
        reasons: z.array(z.string()),
      }),
    ),
    warnings: z.array(z.string()).optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Gene Derive Batch (P2) — 10 regex + 2×canonical hash per trap
// ---------------------------------------------------------------------------

export const goAcceleratorGeneDeriveBatchRequestSchema = z
  .object({
    traps: z
      .array(
        z.object({
          trapId: z.string().min(1),
          trapText: z.string().min(1),
          derivationUnitId: z.string().min(1),
        }),
      )
      .min(1)
      .max(200),
  })
  .strict();

export const goAcceleratorGeneDeriveBatchResponseSchema = z
  .object({
    results: z.array(
      z.object({
        trapId: z.string().min(1),
        derivationUnitId: z.string().min(1),
        sections: z.object({
          MATCH: z.array(z.string()),
          GOAL: z.array(z.string()),
          STRATEGY: z.array(z.string()),
          AVOID: z.array(z.string()),
          VERIFY: z.array(z.string()),
        }),
        contentHash: sha256HexSchema,
        sourceHash: sha256HexSchema,
      }),
    ),
  })
  .strict();

// ---------------------------------------------------------------------------
// Registry (for `pnpm generate:contracts` discovery)
// ---------------------------------------------------------------------------

export const goAcceleratorSchemas = {
  healthResponse: goAcceleratorHealthResponseSchema,
  canonicalHashRequest: goAcceleratorCanonicalHashRequestSchema,
  canonicalHashResponse: goAcceleratorCanonicalHashResponseSchema,
  vectorCosineRequest: goAcceleratorVectorCosineRequestSchema,
  vectorCosineResponse: goAcceleratorVectorCosineResponseSchema,
  batchCosineRequest: goAcceleratorBatchCosineRequestSchema,
  batchCosineResponse: goAcceleratorBatchCosineResponseSchema,
  fallbackVectorRequest: goAcceleratorFallbackVectorRequestSchema,
  fallbackVectorResponse: goAcceleratorFallbackVectorResponseSchema,
  tokenizeRequest: goAcceleratorTokenizeRequestSchema,
  tokenizeResponse: goAcceleratorTokenizeResponseSchema,
  retrievalScoreEntry: goAcceleratorRetrievalScoreEntrySchema,
  retrievalScoreRequest: goAcceleratorRetrievalScoreRequestSchema,
  retrievalScoreResponse: goAcceleratorRetrievalScoreResponseSchema,
  geneCandidate: goAcceleratorGeneCandidateSchema,
  geneSelectRequest: goAcceleratorGeneSelectRequestSchema,
  geneDeriveBatchRequest: goAcceleratorGeneDeriveBatchRequestSchema,
  geneDeriveBatchResponse: goAcceleratorGeneDeriveBatchResponseSchema,
  geneSelectResponse: goAcceleratorGeneSelectResponseSchema,
} as const;

export type GoAcceleratorSchemas = typeof goAcceleratorSchemas;
