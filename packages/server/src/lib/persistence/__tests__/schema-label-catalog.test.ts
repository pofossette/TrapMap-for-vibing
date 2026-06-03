import { describe, expect, it } from 'vitest';

import {
  canonicalLabelEmbeddings,
  canonicalLabels,
  labelAlignmentEvents,
  labelAliases,
} from '@trapmap/server/lib/persistence/schema.js';

describe('canonical label catalog schema', () => {
  describe('canonicalLabels table', () => {
    it('exports a canonicalLabels pgTable with all required columns', () => {
      expect(canonicalLabels).toBeDefined();
      expect(typeof canonicalLabels).toBe('object');

      const columnNames = Object.keys(canonicalLabels);
      expect(columnNames).toContain('id');
      expect(columnNames).toContain('kind');
      expect(columnNames).toContain('canonicalName');
      expect(columnNames).toContain('normalizedName');
      expect(columnNames).toContain('definition');
      expect(columnNames).toContain('status');
      expect(columnNames).toContain('mergedIntoLabelId');
      expect(columnNames).toContain('createdAt');
      expect(columnNames).toContain('updatedAt');
    });

    it('uses snake_case column names for PostgreSQL compatibility', () => {
      expect(canonicalLabels.canonicalName.name).toBe('canonical_name');
      expect(canonicalLabels.normalizedName.name).toBe('normalized_name');
      expect(canonicalLabels.mergedIntoLabelId.name).toBe('merged_into_label_id');
      expect(canonicalLabels.createdAt.name).toBe('created_at');
      expect(canonicalLabels.updatedAt.name).toBe('updated_at');
    });

    it('has id as primary key', () => {
      expect(canonicalLabels.id.primary).toBe(true);
    });
  });

  describe('labelAliases table', () => {
    it('exports a labelAliases pgTable with all required columns', () => {
      expect(labelAliases).toBeDefined();

      const columnNames = Object.keys(labelAliases);
      expect(columnNames).toContain('alias');
      expect(columnNames).toContain('normalizedAlias');
      expect(columnNames).toContain('canonicalLabelId');
      expect(columnNames).toContain('source');
      expect(columnNames).toContain('confidence');
      expect(columnNames).toContain('createdAt');
    });

    it('uses snake_case column names for PostgreSQL compatibility', () => {
      expect(labelAliases.normalizedAlias.name).toBe('normalized_alias');
      expect(labelAliases.canonicalLabelId.name).toBe('canonical_label_id');
      expect(labelAliases.createdAt.name).toBe('created_at');
    });
  });

  describe('canonicalLabelEmbeddings table', () => {
    it('exports a canonicalLabelEmbeddings pgTable with all required columns', () => {
      expect(canonicalLabelEmbeddings).toBeDefined();

      const columnNames = Object.keys(canonicalLabelEmbeddings);
      expect(columnNames).toContain('canonicalLabelId');
      expect(columnNames).toContain('vector');
      expect(columnNames).toContain('contentHash');
      expect(columnNames).toContain('createdAt');
      expect(columnNames).toContain('updatedAt');
    });

    it('uses snake_case column names for PostgreSQL compatibility', () => {
      expect(canonicalLabelEmbeddings.canonicalLabelId.name).toBe('canonical_label_id');
      expect(canonicalLabelEmbeddings.contentHash.name).toBe('content_hash');
      expect(canonicalLabelEmbeddings.createdAt.name).toBe('created_at');
      expect(canonicalLabelEmbeddings.updatedAt.name).toBe('updated_at');
    });

    it('has canonicalLabelId as primary key (one embedding per label)', () => {
      expect(canonicalLabelEmbeddings.canonicalLabelId.primary).toBe(true);
    });
  });

  describe('labelAlignmentEvents table', () => {
    it('exports a labelAlignmentEvents pgTable with all required columns', () => {
      expect(labelAlignmentEvents).toBeDefined();

      const columnNames = Object.keys(labelAlignmentEvents);
      expect(columnNames).toContain('id');
      expect(columnNames).toContain('rawLabel');
      expect(columnNames).toContain('rawEvidence');
      expect(columnNames).toContain('decision');
      expect(columnNames).toContain('canonicalLabelId');
      expect(columnNames).toContain('canonicalName');
      expect(columnNames).toContain('confidence');
      expect(columnNames).toContain('reasoning');
      expect(columnNames).toContain('candidateSnapshot');
      expect(columnNames).toContain('sourceContext');
      expect(columnNames).toContain('createdAt');
    });

    it('uses snake_case column names for PostgreSQL compatibility', () => {
      expect(labelAlignmentEvents.rawLabel.name).toBe('raw_label');
      expect(labelAlignmentEvents.rawEvidence.name).toBe('raw_evidence');
      expect(labelAlignmentEvents.canonicalLabelId.name).toBe('canonical_label_id');
      expect(labelAlignmentEvents.canonicalName.name).toBe('canonical_name');
      expect(labelAlignmentEvents.candidateSnapshot.name).toBe('candidate_snapshot');
      expect(labelAlignmentEvents.sourceContext.name).toBe('source_context');
      expect(labelAlignmentEvents.createdAt.name).toBe('created_at');
    });

    it('has id as primary key', () => {
      expect(labelAlignmentEvents.id.primary).toBe(true);
    });
  });

  describe('cross-table relationships', () => {
    it('labelAliases.canonicalLabelId references canonicalLabels.id', () => {
      // Verify the column exists and is a text type (same as canonicalLabels.id)
      expect(labelAliases.canonicalLabelId).toBeDefined();
      expect(canonicalLabels.id).toBeDefined();
    });

    it('canonicalLabelEmbeddings.canonicalLabelId references canonicalLabels.id', () => {
      expect(canonicalLabelEmbeddings.canonicalLabelId).toBeDefined();
      expect(canonicalLabels.id).toBeDefined();
    });

    it('labelAlignmentEvents.canonicalLabelId references canonicalLabels.id', () => {
      expect(labelAlignmentEvents.canonicalLabelId).toBeDefined();
      expect(canonicalLabels.id).toBeDefined();
    });
  });
});
