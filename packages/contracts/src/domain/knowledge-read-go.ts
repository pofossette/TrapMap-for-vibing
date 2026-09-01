/**
 * Knowledge-Read-Go domain contracts — Zod SSOT for modular read service.
 * Mirrors go-accelerator pattern: SSOT -> json-schema -> pkg/api/types.go via pnpm generate:contracts
 * This file defines the minimal read path DTOs consumed by services/knowledge-read-go.
 */

import { z } from 'zod';

export const knowledgeReadGoHealthResponseSchema = z
  .object({
    status: z.string().min(1),
    service: z.string().min(1),
    version: z.string().min(1),
  })
  .strict();

export const knowledgeReadRequestSchema = z
  .object({
    query: z.string().min(1),
    limit: z.number().int().min(1).max(100).optional(),
    queryTokens: z.array(z.string()).optional(),
  })
  .strict();

export const knowledgeReadRankingEntrySchema = z
  .object({
    id: z.string().min(1),
    semanticScore: z.number().finite().min(0).max(1),
    keywordScore: z.number().finite().min(0).max(1),
    graphScore: z.number().finite().min(0).max(1).optional(),
    channelScores: z.record(z.string(), z.number().finite()),
    combinedScore: z.number().finite(),
    tokenMatches: z.array(z.object({ token: z.string(), fields: z.array(z.string()) })),
    channels: z.array(z.string()),
    preRerankScore: z.number().finite(),
    finalScore: z.number().finite(),
    labels: z.array(z.string()),
    scope: z.string(),
    shortcut: z.string(),
    detail: z.string(),
    decayState: z.string().optional(),
  })
  .strict();

export const knowledgeReadResponseSchema = z
  .object({
    entries: z.array(knowledgeReadRankingEntrySchema),
    summary: z.string(),
    citations: z.array(
      z.object({
        id: z.string().min(1),
        scope: z.string(),
        detail: z.string(),
      }),
    ),
  })
  .strict();

export const knowledgeReadSchemas = {
  healthResponse: knowledgeReadGoHealthResponseSchema,
  readRequest: knowledgeReadRequestSchema,
  rankingEntry: knowledgeReadRankingEntrySchema,
  readResponse: knowledgeReadResponseSchema,
} as const;
