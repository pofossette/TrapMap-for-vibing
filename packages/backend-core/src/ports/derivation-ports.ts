export interface DerivationRequest<TSnapshot> {
  sourceType: string;
  sourceId: string;
  sourceRevision: number;
  sourceHash: string;
  snapshot: TSnapshot;
}

export interface ValidationIssue {
  code: string;
  field: string;
  message: string;
}

export interface ValidationReport {
  valid: boolean;
  issues: ValidationIssue[];
}

export interface DerivationCandidate<TOutput> {
  output: TOutput;
  validatorReport: ValidationReport;
  provenance: {
    generator: 'rule' | 'llm' | 'hybrid';
    model: string | null;
    promptVersion: string;
  };
}
