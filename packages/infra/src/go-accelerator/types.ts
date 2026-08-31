export interface GoAcceleratorConfig {
  enabled: boolean;
  baseUrl: string;
  timeoutMs: number;
}

export interface CanonicalHashResult {
  canonical: string;
  hash: string;
}

export interface VectorCosineResult {
  similarity: number;
  normA: number;
  normB: number;
}

export interface TokenizeResult {
  tokens: string[];
  chunks: string[];
  count: number;
}

export interface RetrievalScoreEntry {
  id: string;
  scope: string;
  labels: string[];
  requiredLevel: number;
  shortcut: string;
  detail: string;
  score?: number;
}

export interface GeneCandidateInput {
  geneId: string;
  semanticScore: number;
  keywordScore: number;
  exactSignalMatch: boolean;
  errorTextMatch: boolean;
  boundaryMatch: boolean;
  freshValidation: boolean;
  broadMatch: boolean;
  sourceKind: string;
}
