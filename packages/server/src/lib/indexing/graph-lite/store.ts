/**
 * Store-backed helpers for loading, saving, and removing graph documents.
 *
 * Operates on StoreData.graphIndexDocuments for durable persistence.
 * All helpers are deterministic: upsert by {sourceType, sourceId} replaces
 * the previous document for that source, keeping only the latest revision.
 */

import type { StoreData } from '../../store.js';
import type { GraphIndexDocumentRecord } from './documents.js';

type GraphDocumentStore = Pick<StoreData, 'graphIndexDocuments'>;

/**
 * Upsert a graph document into the store.
 * Replaces any existing document with the same sourceType and sourceId.
 * This ensures only the latest revision is retained per source.
 */
export function upsertGraphIndexDocument(
  data: GraphDocumentStore,
  document: GraphIndexDocumentRecord,
): void {
  const idx = data.graphIndexDocuments.findIndex(
    (d) => d.sourceType === document.sourceType && d.sourceId === document.sourceId,
  );
  if (idx >= 0) {
    data.graphIndexDocuments[idx] = document;
  } else {
    data.graphIndexDocuments.push(document);
  }
}

/**
 * Remove all graph documents for a given source.
 * Used during deactivation or when a source is no longer approved.
 * Does not affect documents from other sources.
 */
export function removeGraphIndexDocumentsForSource(
  data: GraphDocumentStore,
  sourceType: 'trap' | 'skill',
  sourceId: string,
): void {
  data.graphIndexDocuments = data.graphIndexDocuments.filter(
    (d) => !(d.sourceType === sourceType && d.sourceId === sourceId),
  );
}

/**
 * Get all graph documents from the store.
 */
export function getGraphIndexDocuments(data: GraphDocumentStore): GraphIndexDocumentRecord[] {
  return data.graphIndexDocuments ?? [];
}

/**
 * Get graph documents for a specific source.
 */
export function getGraphIndexDocumentsForSource(
  data: GraphDocumentStore,
  sourceType: 'trap' | 'skill',
  sourceId: string,
): GraphIndexDocumentRecord[] {
  return (data.graphIndexDocuments ?? []).filter(
    (d) => d.sourceType === sourceType && d.sourceId === sourceId,
  );
}
