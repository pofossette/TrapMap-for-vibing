/**
 * Historical label backfill runner.
 *
 * Reads existing `knowledge_labels`, artifact `labels`, and historical
 * `graph_index_documents.nodes[*]` to seed the canonical label catalog.
 * Reuses the same candidate recall and alignment pipeline from Phase 2.
 *
 * Supports `--dry-run` to preview what would be created without writing.
 */

import type { EmbeddingsProvider } from '@trapmap/server/lib/ai/types.js';
import type { ChatProvider } from '@trapmap/server/lib/ai/types.js';

import { alignLabel } from './llm-align.js';
import type { CanonicalLabelRecord, LabelRepository } from './repository.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BackfillReport {
  /** Total raw labels examined */
  examined: number;
  /** Canonical labels created */
  canonicalCreated: number;
  /** Aliases created */
  aliasesCreated: number;
  /** Alignment events recorded */
  alignmentEvents: number;
  /** Labels that matched existing canonical labels */
  matchedExisting: number;
  /** Labels that were unsure */
  unsure: number;
  /** Labels skipped (already in catalog) */
  skipped: number;
  /** Warnings encountered */
  warnings: string[];
}

export interface BackfillOptions {
  /** Chat provider for LLM alignment (null = skip LLM, only seed exact matches) */
  chat: ChatProvider | null;
  /** Embeddings provider for semantic recall (null = skip embedding recall) */
  embeddings?: EmbeddingsProvider | null;
  /** Source context for alignment events */
  sourceContext?: string;
  /** Dry run: preview without writing */
  dryRun?: boolean;
  /** Auto-merge confidence threshold (default: 0.8) */
  autoMergeThreshold?: number;
}

interface RawLabelSource {
  label: string;
  kind: string;
  sourceType: 'knowledge' | 'artifact' | 'graph';
  sourceId: string;
}

// ---------------------------------------------------------------------------
// Core backfill function
// ---------------------------------------------------------------------------

/**
 * Backfill the canonical label catalog from historical data.
 *
 * 1. Collect all unique raw labels from knowledge_labels, artifact labels, and graph nodes
 * 2. For each unique label, check if it already exists in the catalog
 * 3. If not, run alignment (or create directly if no chat provider)
 * 4. Seed aliases for matched labels
 * 5. Reindex affected graph documents (not implemented here — callers handle this)
 */
export async function backfillLabels(
  repository: LabelRepository,
  rawLabelSources: RawLabelSource[],
  options: BackfillOptions,
): Promise<BackfillReport> {
  const { chat, sourceContext = 'backfill', dryRun = false, autoMergeThreshold = 0.8 } = options;

  const report: BackfillReport = {
    examined: 0,
    canonicalCreated: 0,
    aliasesCreated: 0,
    alignmentEvents: 0,
    matchedExisting: 0,
    unsure: 0,
    skipped: 0,
    warnings: [],
  };

  // Deduplicate labels by normalized form
  const uniqueLabels = deduplicateLabels(rawLabelSources);
  report.examined = uniqueLabels.length;

  for (const entry of uniqueLabels) {
    const normalizedLabel = normalizeLabel(entry.label);

    // Check if this label already exists as an alias
    const existingAlias = await repository.findCanonicalByAlias(entry.label);
    if (existingAlias) {
      report.skipped++;
      continue;
    }

    // Check if a canonical label with this normalized name already exists
    const existingCanonical = await checkByNormalizedName(repository, normalizedLabel, entry.kind);
    if (existingCanonical) {
      // Just add the alias
      if (!dryRun) {
        await repository.upsertAlias({
          alias: entry.label,
          canonicalLabelId: existingCanonical.id,
          source: 'backfill',
          confidence: 1.0,
        });
      }
      report.aliasesCreated++;
      report.matchedExisting++;
      continue;
    }

    // Need to decide: align via LLM or create directly
    if (chat?.isConfigured) {
      // Use LLM alignment
      const result = await alignLabel(repository, chat, entry.label, '', entry.kind, {
        sourceContext,
        maxCandidates: 5,
        autoMergeThreshold,
        generateEventId: () => `backfill_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      });

      report.alignmentEvents++;

      if (result.decision.decision === 'existing') {
        report.matchedExisting++;
        report.aliasesCreated++;
      } else if (result.decision.decision === 'new') {
        report.canonicalCreated++;
        report.aliasesCreated++;
      } else {
        report.unsure++;
      }
    } else {
      // No LLM — create new canonical label directly
      if (!dryRun) {
        const newId = `lbl_${normalizedLabel.replace(/[^a-z0-9]/g, '_')}`;
        await repository.upsertCanonicalLabel({
          id: newId,
          kind: entry.kind,
          canonicalName: entry.label,
        });
        await repository.upsertAlias({
          alias: entry.label,
          canonicalLabelId: newId,
          source: 'backfill',
          confidence: 1.0,
        });
      }
      report.canonicalCreated++;
      report.aliasesCreated++;
    }
  }

  return report;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeLabel(value: string): string {
  return value.toLowerCase().trim().replace(/\s+/g, '-');
}

function deduplicateLabels(sources: RawLabelSource[]): RawLabelSource[] {
  const seen = new Map<string, RawLabelSource>();
  for (const source of sources) {
    const key = normalizeLabel(source.label);
    if (!seen.has(key)) {
      seen.set(key, source);
    }
  }
  return [...seen.values()];
}

async function checkByNormalizedName(
  repository: LabelRepository,
  normalizedName: string,
  kind: string,
): Promise<CanonicalLabelRecord | null> {
  const results = await repository.searchCandidates(normalizedName, kind, 1);
  for (const result of results) {
    if (result.label.normalizedName === normalizedName && result.label.status === 'active') {
      return result.label;
    }
  }
  return null;
}
