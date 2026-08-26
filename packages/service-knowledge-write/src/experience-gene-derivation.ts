import { extractRuleExperienceGene, validateExperienceGeneCandidate } from '@trapmap/backend-core';
import {
  type ExperienceGene,
  type ExperienceGeneDerivationTaskPayload,
  type ExperienceGeneSourceSnapshot,
  type ExperienceGeneValidationReport,
  experienceGeneEventSchema,
} from '@trapmap/contracts';
import { sha256CanonicalJson } from '@trapmap/lib';

export interface ExperienceGeneSnapshotLoaders {
  trap?(request: { sourceId: string }): Promise<ExperienceGeneSourceSnapshot | null>;
  skillArtifact?(request: {
    artifactId: string;
    revision: number;
    derivationUnitId: string;
  }): Promise<ExperienceGeneSourceSnapshot | null>;
  skillCapsule?(request: { capsuleId: string }): Promise<ExperienceGeneSourceSnapshot | null>;
}

export interface ExperienceGeneDerivationRepository {
  saveCandidate(gene: ExperienceGene): Promise<ExperienceGene>;
  markValidated(geneId: string, report: ExperienceGeneValidationReport): Promise<ExperienceGene>;
  saveRejectedCandidate(event: unknown): Promise<void>;
}

export interface ExperienceGeneDerivationDependencies {
  loaders: ExperienceGeneSnapshotLoaders;
  repository: ExperienceGeneDerivationRepository;
  nowIso: string;
  findDuplicate?: (gene: ExperienceGene) =>
    | Promise<{ sourceId: string } | null>
    | {
        sourceId: string;
      }
    | null;
  llm?: {
    extract(snapshot: ExperienceGeneSourceSnapshot): Promise<ExperienceGene>;
  };
}

export type ExperienceGeneDerivationResult =
  | { status: 'validated'; gene: ExperienceGene }
  | { status: 'rejected'; reasonClass: string }
  | { status: 'stale-source' }
  | { status: 'idempotent' };

async function loadSnapshot(
  request: ExperienceGeneDerivationTaskPayload,
  loaders: ExperienceGeneSnapshotLoaders,
): Promise<ExperienceGeneSourceSnapshot | null> {
  const loader = {
    trap: () => loaders.trap?.({ sourceId: request.source.sourceId }) ?? null,
    'skill-artifact': () =>
      loaders.skillArtifact?.({
        artifactId: request.source.artifactId ?? '',
        revision: request.source.artifactRevision ?? request.source.sourceRevision,
        derivationUnitId: request.derivationUnitId,
      }) ?? null,
    'skill-capsule': () =>
      loaders.skillCapsule?.({ capsuleId: request.source.capsuleId ?? '' }) ?? null,
  };
  return loader[request.source.kind]();
}

function rejectedEvent(
  request: ExperienceGeneDerivationTaskPayload,
  input: {
    gene?: ExperienceGene;
    reasonClass: string;
    issues: Array<{ code: string; field: string; message: string }>;
  },
) {
  return experienceGeneEventSchema.parse({
    id: `${request.requestId}:rejected`,
    type: 'rejected',
    geneId: input.gene?.geneId ?? `${request.requestId}:candidate`,
    source: request.source,
    actor: { kind: 'system', id: null },
    validatorSummary: {
      valid: false,
      issueCodes: [...new Set(input.issues.map((issue) => issue.code))].slice(0, 20),
    },
    reasonClass: input.reasonClass,
    payloadSnapshotHash: request.snapshotHash,
    payload: { validatorReport: { valid: false, issues: input.issues.slice(0, 50) } },
    createdAt: new Date().toISOString(),
  });
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}

async function rejectCandidate(
  dependencies: ExperienceGeneDerivationDependencies,
  event: unknown,
  reasonClass: string,
): Promise<ExperienceGeneDerivationResult> {
  await dependencies.repository.saveRejectedCandidate(event);
  return { status: 'rejected', reasonClass };
}

async function persistValidated(
  gene: ExperienceGene,
  dependencies: ExperienceGeneDerivationDependencies,
): Promise<ExperienceGeneDerivationResult> {
  try {
    const saved = await dependencies.repository.saveCandidate(gene);
    const validated = await dependencies.repository.markValidated(saved.geneId, {
      valid: true,
      issues: [],
    });
    return { status: 'validated', gene: validated };
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    return { status: 'idempotent' };
  }
}

async function validateAndPersist(
  gene: ExperienceGene,
  snapshot: ExperienceGeneSourceSnapshot,
  request: ExperienceGeneDerivationTaskPayload,
  dependencies: ExperienceGeneDerivationDependencies,
): Promise<ExperienceGeneDerivationResult> {
  const report = await validateExperienceGeneCandidate(gene, {
    sourceText: snapshot.text,
    source: snapshot,
    findDuplicate: dependencies.findDuplicate,
  });
  if (report.valid && report.firstFailingGate === null) return persistValidated(gene, dependencies);

  const reasonClass = report.firstFailingGate ?? 'unknown';
  return rejectCandidate(
    dependencies,
    rejectedEvent(request, { gene, reasonClass, issues: report.issues }),
    reasonClass,
  );
}

function isStaleSource(
  request: ExperienceGeneDerivationTaskPayload,
  snapshot: ExperienceGeneSourceSnapshot,
): boolean {
  return (
    snapshot.revision !== request.source.sourceRevision ||
    snapshot.sourceHash !== request.source.sourceHash ||
    sha256CanonicalJson(snapshot) !== request.snapshotHash
  );
}

export async function deriveExperienceGeneFromRule(
  request: ExperienceGeneDerivationTaskPayload,
  dependencies: ExperienceGeneDerivationDependencies,
): Promise<ExperienceGeneDerivationResult> {
  const snapshot = await loadSnapshot(request, dependencies.loaders);
  if (!snapshot) throw new Error(`experience gene source not found: ${request.source.sourceId}`);
  if (isStaleSource(request, snapshot)) return { status: 'stale-source' };

  const extracted = extractRuleExperienceGene({
    snapshot,
    nowIso: dependencies.nowIso,
  });
  if ('gene' in extracted) {
    return validateAndPersist(extracted.gene, snapshot, request, dependencies);
  }

  if (!dependencies.llm) {
    return rejectCandidate(
      dependencies,
      rejectedEvent(request, {
        reasonClass: 'generator-unavailable',
        issues: [
          {
            code: 'generator-unavailable',
            field: 'llm',
            message: 'No configured LLM fallback is available',
          },
        ],
      }),
      'generator-unavailable',
    );
  }

  let llmGene: ExperienceGene;
  try {
    llmGene = await dependencies.llm.extract(snapshot);
  } catch {
    return rejectCandidate(
      dependencies,
      rejectedEvent(request, {
        reasonClass: 'generator-unavailable',
        issues: [
          {
            code: 'generator-unavailable',
            field: 'llm',
            message: 'LLM fallback failed or returned an invalid response',
          },
        ],
      }),
      'generator-unavailable',
    );
  }

  return validateAndPersist(llmGene, snapshot, request, dependencies);
}
