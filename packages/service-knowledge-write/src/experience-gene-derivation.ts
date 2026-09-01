import {
  type ExperienceGeneDuplicateMatch,
  extractRuleExperienceGene,
  validateExperienceGeneCandidate,
} from '@trapmap/backend-core';
import {
  type ExperienceGene,
  type ExperienceGeneDerivationTaskPayload,
  type ExperienceGeneSourceSnapshot,
  type ExperienceGeneValidationReport,
  experienceGeneEventSchema,
} from '@trapmap/contracts';
import { createFallbackEmbedding } from '@trapmap/infra';
import { getGoAcceleratorClient } from '@trapmap/infra/go-accelerator/client.js';
import {
  canonicalHashWithFallback,
  geneDeriveBatchWithFallback,
} from '@trapmap/infra/go-accelerator/fallback.js';

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
  prepareProjections(
    geneId: string,
    embedding: number[],
    modelVersion: string,
  ): Promise<ExperienceGene>;
  solidify(geneId: string): Promise<ExperienceGene>;
  markIndexStatus(
    geneId: string,
    status: 'failed',
    error?: string | undefined,
  ): Promise<ExperienceGene>;
  saveRejectedCandidate(event: unknown): Promise<void>;
}

export interface ExperienceGeneDerivationDependencies {
  loaders: ExperienceGeneSnapshotLoaders;
  repository: ExperienceGeneDerivationRepository;
  nowIso: string;
  findDuplicate?: (gene: ExperienceGene) => Promise<ExperienceGeneDuplicateMatch | null>;
  llm?: {
    extract(snapshot: ExperienceGeneSourceSnapshot): Promise<ExperienceGene>;
  };
  embedding?: {
    version: string;
    generate(text: string): Promise<number[]>;
  };
}

export type ExperienceGeneDerivationResult =
  | { status: 'validated'; gene: ExperienceGene }
  | { status: 'rejected'; reasonClass: string }
  | { status: 'stale-source' }
  | { status: 'idempotent' }
  | { status: 'solidified'; gene: ExperienceGene };

export function experienceGeneEmbeddingText(gene: ExperienceGene): string {
  return [
    gene.title,
    ...gene.signalsMatch,
    gene.summary,
    ...gene.strategy,
    ...gene.avoid,
    ...gene.validation,
  ].join('\n');
}

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
    if (saved.geneId !== gene.geneId) {
      if (saved.status === 'validated') return projectValidated(saved, dependencies);
      return { status: 'idempotent' };
    }
    const validated = await dependencies.repository.markValidated(saved.geneId, {
      valid: true,
      issues: [],
    });
    return projectValidated(validated, dependencies);
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    return { status: 'idempotent' };
  }
}

async function projectValidated(
  gene: ExperienceGene,
  dependencies: ExperienceGeneDerivationDependencies,
): Promise<ExperienceGeneDerivationResult> {
  let vector: number[];
  try {
    vector =
      dependencies.embedding === undefined
        ? createFallbackEmbedding(experienceGeneEmbeddingText(gene))
        : await dependencies.embedding.generate(experienceGeneEmbeddingText(gene));
  } catch {
    const retained = await dependencies.repository.markIndexStatus(
      gene.geneId,
      'failed',
      'embedding-unavailable',
    );
    return { status: 'validated', gene: retained };
  }

  const ready = await dependencies.repository.prepareProjections(
    gene.geneId,
    vector,
    dependencies.embedding?.version ?? 'experience-gene-fallback-v1',
  );
  const solidified = await dependencies.repository.solidify(ready.geneId);
  return { status: 'solidified', gene: solidified };
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

async function isStaleSource(
  request: ExperienceGeneDerivationTaskPayload,
  snapshot: ExperienceGeneSourceSnapshot,
): Promise<boolean> {
  return (
    snapshot.revision !== request.source.sourceRevision ||
    snapshot.sourceHash !== request.source.sourceHash ||
    (await canonicalHashWithFallback(snapshot, getGoAcceleratorClient())).hash !==
      request.snapshotHash
  );
}

export async function deriveExperienceGeneFromRule(
  request: ExperienceGeneDerivationTaskPayload,
  dependencies: ExperienceGeneDerivationDependencies,
): Promise<ExperienceGeneDerivationResult> {
  const snapshot = await loadSnapshot(request, dependencies.loaders);
  if (!snapshot) throw new Error(`experience gene source not found: ${request.source.sourceId}`);
  if (await isStaleSource(request, snapshot)) return { status: 'stale-source' };

  // Warm Go derive batch (distributed only, fallback to local on failure)
  // This ensures the Go 10-regex+2-hash path is exercised for bottleneck metrics
  const goClient = getGoAcceleratorClient();
  if (goClient.isEnabled) {
    try {
      await geneDeriveBatchWithFallback(
        [
          {
            trapId: snapshot.sourceId,
            trapText: snapshot.text,
            derivationUnitId: snapshot.derivationUnitId,
          },
        ],
        goClient,
      );
    } catch {}
  }
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
