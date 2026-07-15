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

function ownerIdFromRaw(raw: OwnerEntry & Record<string, unknown>): string {
  if (typeof raw.ownerUserId === 'string') return raw.ownerUserId;
  const owner = raw.owner as { id?: unknown } | undefined;
  return typeof owner?.id === 'string' ? owner.id : 'unknown-owner';
}

function labelsFromRaw(raw: Record<string, unknown>): string[] {
  return Array.isArray(raw.labels) && raw.labels.length > 0 ? raw.labels : ['unlabeled'];
}

function scopeFromRaw(raw: Record<string, unknown>): 'project' | 'global' {
  return raw.scope === 'project' ? 'project' : 'global';
}

function textFromRaw(raw: Record<string, unknown>, key: 'shortcut' | 'detail'): string {
  const fallback = key === 'shortcut' ? (raw.title ?? raw.id) : (raw.content ?? '');
  return typeof raw[key] === 'string' ? raw[key] : String(fallback);
}

function optionalValue<T>(value: T | null | undefined): T | null {
  return value ?? null;
}

function arrayValue(value: unknown, fallback: unknown[]): unknown {
  return value ?? fallback;
}

function textValue(value: string, fallback: string): string {
  return value || fallback;
}

function latestRevisionFromRaw(
  raw: OwnerEntry & Record<string, unknown>,
  ownerId: string,
  requiredLevel: number,
  createdAt: string,
  labels: string[],
  shortcut: string,
  detail: string,
) {
  return (
    raw.latestRevision ?? {
      revision: 1,
      submittedAt: createdAt,
      submittedBy: actor(ownerId, ownerId, requiredLevel),
      shortcut: shortcut || String(raw.id),
      detail: detail || 'Knowledge entry',
      labels,
      reviewNotes: [],
    }
  );
}

function metadataFromRaw(
  raw: Record<string, unknown>,
  scope: 'project' | 'global',
  createdAt: string,
) {
  return (
    raw.metadata ?? {
      scopeLabel: scope === 'global' ? 'global-constraint' : 'project-knowledge',
      submissionCount: 1,
      resubmissionCount: 0,
      revisionCount: 1,
      latestSubmissionId: null,
      latestSubmittedAt: createdAt,
      latestReviewedAt: null,
      latestDecision: null,
    }
  );
}

function normalizeFallbackEntry(raw: OwnerEntry & Record<string, unknown>): KnowledgeEntry {
  const requiredLevel = typeof raw.requiredLevel === 'number' ? raw.requiredLevel : 0;
  const ownerId = ownerIdFromRaw(raw);
  const createdAt = timestamp(raw.createdAt);
  const updatedAt = timestamp(optionalValue(raw.updatedAt) ?? createdAt);
  const labels = labelsFromRaw(raw);
  const scope = scopeFromRaw(raw);
  const lifecycleState = raw.lifecycleState ?? 'submitted';
  const shortcut = textFromRaw(raw, 'shortcut');
  const detail = textFromRaw(raw, 'detail');
  const latestRevision = latestRevisionFromRaw(
    raw,
    ownerId,
    requiredLevel,
    createdAt,
    labels,
    shortcut,
    detail,
  );

  return knowledgeEntrySchema.parse({
    id: String(raw.id),
    teamId: typeof raw.teamId === 'string' ? raw.teamId : optionalValue(null),
    scope,
    labels,
    shortcut: textValue(shortcut, String(raw.id)),
    detail: textValue(detail, 'Knowledge entry'),
    requiredLevel,
    lifecycleState,
    owner: actor(raw.owner, ownerId, requiredLevel),
    latestRevision,
    history: Array.isArray(raw.history) && raw.history.length > 0 ? raw.history : [latestRevision],
    metadata: metadataFromRaw(raw, scope, createdAt),
    latestSubmission: optionalValue(raw.latestSubmission),
    submissionHistory: arrayValue(raw.submissionHistory, []),
    agentReview: optionalValue(raw.agentReview),
    reviewHistory: arrayValue(raw.reviewHistory, []),
    reviewNotes: arrayValue(raw.reviewNotes, []),
    lifecycleHistory: arrayValue(raw.lifecycleHistory, []),
    boundary: optionalValue(raw.boundary),
    evidenceMeta: optionalValue(raw.evidenceMeta),
    maintenanceMeta: optionalValue(raw.maintenanceMeta),
    remediation: optionalValue(raw.remediation),
    createdAt,
    updatedAt,
  });
}

export function normalizeKnowledgeOwnerEntry(entry: KnowledgeEntry): KnowledgeEntry {
  const parsed = knowledgeEntrySchema.safeParse(entry);
  if (parsed.success) return parsed.data;
  return normalizeFallbackEntry(entry as OwnerEntry & Record<string, unknown>);
}

export function ownerId(entry: KnowledgeEntry): string {
  const raw = entry as OwnerEntry;
  return raw.ownerUserId ?? entry.owner.id;
}
