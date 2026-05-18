/**
 * LLM extraction cache with SHA-256 keyed lookup.
 *
 * Two cache layers:
 * - phase1Cache: text -> ExtractionPlan (Phase 1 planning results)
 * - phase2Cache: text -> LlmExtractionResult (Phase 2 extraction results)
 *
 * Cache keys are SHA-256(text + PROMPT_VERSION) to ensure prompt changes
 * automatically invalidate stale entries.
 *
 * Phase 4-1: LLM extraction caching
 */

import { createHash } from 'node:crypto';

import type { ExtractionPlan } from '@trapmap/contracts';

import type { LlmExtractionResult } from './llm-extract.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Prompt version — bump to invalidate all caches.
 * Exported for reconciliation to detect version changes.
 */
export const PROMPT_VERSION = 1;

// ---------------------------------------------------------------------------
// Cache class
// ---------------------------------------------------------------------------

/**
 * In-memory LLM extraction cache.
 *
 * Stores Phase 1 (planning) and Phase 2 (extraction) results keyed by
 * SHA-256(text + promptVersion). Supports targeted invalidation by text.
 */
export class LlmExtractionCache {
  private readonly phase1Cache = new Map<string, ExtractionPlan>();
  private readonly phase2Cache = new Map<string, LlmExtractionResult>();

  /**
   * Build a deterministic cache key from text content and prompt version.
   */
  private buildKey(text: string): string {
    const hash = createHash('sha256');
    hash.update(text);
    hash.update(`:pv${PROMPT_VERSION}`);
    return hash.digest('hex');
  }

  // -- Phase 1: ExtractionPlan cache --

  /**
   * Get a cached Phase 1 extraction plan.
   * @returns The cached plan, or undefined if not found.
   */
  getPhase1(text: string): ExtractionPlan | undefined {
    return this.phase1Cache.get(this.buildKey(text));
  }

  /**
   * Store a Phase 1 extraction plan in the cache.
   */
  setPhase1(text: string, plan: ExtractionPlan): void {
    this.phase1Cache.set(this.buildKey(text), plan);
  }

  /**
   * Check whether a Phase 1 plan is cached.
   */
  hasPhase1(text: string): boolean {
    return this.phase1Cache.has(this.buildKey(text));
  }

  // -- Phase 2: LlmExtractionResult cache --

  /**
   * Get a cached Phase 2 extraction result.
   * @returns The cached result, or undefined if not found.
   */
  getPhase2(text: string): LlmExtractionResult | undefined {
    return this.phase2Cache.get(this.buildKey(text));
  }

  /**
   * Store a Phase 2 extraction result in the cache.
   */
  setPhase2(text: string, result: LlmExtractionResult): void {
    this.phase2Cache.set(this.buildKey(text), result);
  }

  /**
   * Check whether a Phase 2 result is cached.
   */
  hasPhase2(text: string): boolean {
    return this.phase2Cache.has(this.buildKey(text));
  }

  // -- Invalidation --

  /**
   * Invalidate cached entries for a specific text.
   * Removes both Phase 1 and Phase 2 entries.
   */
  invalidate(text: string): void {
    const key = this.buildKey(text);
    this.phase1Cache.delete(key);
    this.phase2Cache.delete(key);
  }

  /**
   * Clear all cached entries (Phase 1 and Phase 2).
   * Use when prompt version changes or for testing.
   */
  clear(): void {
    this.phase1Cache.clear();
    this.phase2Cache.clear();
  }

  // -- Stats --

  /**
   * Total number of cached entries across both layers.
   */
  get size(): number {
    return this.phase1Cache.size + this.phase2Cache.size;
  }

  /**
   * Number of Phase 1 cached entries.
   */
  get phase1Size(): number {
    return this.phase1Cache.size;
  }

  /**
   * Number of Phase 2 cached entries.
   */
  get phase2Size(): number {
    return this.phase2Cache.size;
  }
}
