import type { KnowledgeEntry } from '@trapmap/contracts';
import { knowledgeEntrySchema } from '@trapmap/contracts';

type OwnerEntry = KnowledgeEntry & {
  ownerUserId?: string;
};

function timestamp(value: unknown): string {
  return typeof value === 'string' && value.length > 0 ? value : new Date().toISOString();
}

function actor(value: unknown, fallbackId: string, level: number) {
  if (value && typeof value === 'object') {
    const candidate = value as Record<string, unknown>;
    if (typeof candidate.id === 'string' && typeof candidate.handle === 'string') {
      return {
        id: candidate.id,
        handle: candidate.handle,
        securityLevel:
          typeof candidate.securityLevel === 'number' ? candidate.securityLevel : level,
      };
    }
  }
  return { id: fallbackId, handle: fallbackId, securityLevel: level };
}

export function normalizeKnowledgeOwnerEntry(entry: KnowledgeEntry): KnowledgeEntry {
  const parsed = knowledgeEntrySchema.safeParse(entry);
  if (parsed.success) return parsed.data;

  const raw = entry as OwnerEntry & Record<string, unknown>;
  const requiredLevel = typeof raw.requiredLevel === 'number' ? raw.requiredLevel : 0;
  const ownerId = raw.ownerUserId ?? raw.owner?.id ?? 'unknown-owner';
  const createdAt = timestamp(raw.createdAt);
  const updatedAt = timestamp(raw.updatedAt ?? createdAt);
  const labels = Array.isArray(raw.labels) && raw.labels.length > 0 ? raw.labels : ['unlabeled'];
  const scope = raw.scope === 'project' ? 'project' : 'global';
  const lifecycleState = raw.lifecycleState ?? 'submitted';
  const shortcut = typeof raw.shortcut === 'string' ? raw.shortcut : String(raw.title ?? raw.id);
  const detail = typeof raw.detail === 'string' ? raw.detail : String(raw.content ?? '');
  const latestRevision = {
    revision: 1,
    submittedAt: createdAt,
    submittedBy: actor(ownerId, ownerId, requiredLevel),
    shortcut: shortcut || String(raw.id),
    detail: detail || 'Knowledge entry',
    labels,
    reviewNotes: [],
  };

  return knowledgeEntrySchema.parse({
    id: String(raw.id),
    teamId: typeof raw.teamId === 'string' ? raw.teamId : null,
    scope,
    labels,
    shortcut: shortcut || String(raw.id),
    detail: detail || 'Knowledge entry',
    requiredLevel,
    lifecycleState,
    owner: actor(raw.owner, String(ownerId), requiredLevel),
    latestRevision: raw.latestRevision ?? latestRevision,
    history: Array.isArray(raw.history) && raw.history.length > 0 ? raw.history : [latestRevision],
    metadata: raw.metadata ?? {
      scopeLabel: scope === 'global' ? 'global-constraint' : 'project-knowledge',
      submissionCount: 1,
      resubmissionCount: 0,
      revisionCount: 1,
      latestSubmissionId: null,
      latestSubmittedAt: createdAt,
      latestReviewedAt: null,
      latestDecision: null,
    },
    latestSubmission: raw.latestSubmission ?? null,
    submissionHistory: raw.submissionHistory ?? [],
    agentReview: raw.agentReview ?? null,
    reviewHistory: raw.reviewHistory ?? [],
    reviewNotes: raw.reviewNotes ?? [],
    lifecycleHistory: raw.lifecycleHistory ?? [],
    boundary: raw.boundary ?? null,
    evidenceMeta: raw.evidenceMeta ?? null,
    maintenanceMeta: raw.maintenanceMeta ?? null,
    remediation: raw.remediation ?? null,
    createdAt,
    updatedAt,
  });
}

export function ownerId(entry: KnowledgeEntry): string {
  const raw = entry as OwnerEntry;
  return raw.ownerUserId ?? entry.owner.id;
}
