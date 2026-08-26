export interface VectorSearchRecord {
  sourceId: string;
  sourceRevision: number;
  contentHash: string;
  vector: number[];
  teamId: string | null;
  scope: 'global' | 'project';
  requiredLevel: number;
}

export interface VectorSearchFilters {
  teamId: string | null;
  maxRequiredLevel: number;
  scopes: Array<'global' | 'project'>;
  sourceIds?: string[];
}

export interface VectorSearchHit {
  sourceId: string;
  similarity: number;
}

export interface VectorSearchPort {
  upsert(records: VectorSearchRecord[]): Promise<void>;
  search(vector: number[], filters: VectorSearchFilters, limit: number): Promise<VectorSearchHit[]>;
  deleteBySource(sourceId: string): Promise<void>;
  health(): Promise<{ ok: boolean; reason?: string }>;
}
