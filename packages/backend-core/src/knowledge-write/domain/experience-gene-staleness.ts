import type { ExperienceGene, ExperienceGeneSourceSnapshot } from '@trapmap/contracts';

export type ExperienceGeneStalenessReason =
  | 'source-revision'
  | 'source-hash'
  | 'remediation'
  | 'source-lifecycle'
  | 'governance';

export type ExperienceGeneStalenessSignal = {
  revision?: number;
  sourceHash?: string;
  remediationSuppressed?: boolean;
  lifecycleState?: 'approved' | 'rejected' | 'deactivated' | 'deprecated' | 'superseded';
  labels?: string[];
  scope?: ExperienceGeneSourceSnapshot['scope'];
  teamId?: string | null;
  requiredLevel?: number;
};

export type ExperienceGeneStalenessResult =
  | { stale: true; reason: ExperienceGeneStalenessReason }
  | { stale: false };

export function evaluateExperienceGeneStaleness(input: {
  gene: ExperienceGene;
  signal: ExperienceGeneStalenessSignal;
}): ExperienceGeneStalenessResult {
  const { gene, signal } = input;

  if (signal.revision !== undefined && signal.revision !== gene.source.sourceRevision) {
    return { stale: true, reason: 'source-revision' };
  }
  if (signal.sourceHash !== undefined && signal.sourceHash !== gene.source.sourceHash) {
    return { stale: true, reason: 'source-hash' };
  }
  if (signal.remediationSuppressed === true) {
    return { stale: true, reason: 'remediation' };
  }
  if (signal.lifecycleState !== undefined && signal.lifecycleState !== 'approved') {
    return { stale: true, reason: 'source-lifecycle' };
  }
  if (signal.scope !== undefined && signal.scope !== gene.scope) {
    return { stale: true, reason: 'governance' };
  }
  if (signal.teamId !== undefined && signal.teamId !== gene.teamId) {
    return { stale: true, reason: 'governance' };
  }
  if (signal.requiredLevel !== undefined && signal.requiredLevel > gene.requiredLevel) {
    return { stale: true, reason: 'governance' };
  }
  if (signal.labels !== undefined && gene.labels.some((label) => !signal.labels!.includes(label))) {
    return { stale: true, reason: 'governance' };
  }

  return { stale: false };
}
