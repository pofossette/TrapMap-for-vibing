import {
  type BadcaseExportDraftPayload,
  type RemediationReactivationPayload,
  type SkillLookupQuery,
} from '@trapmap/contracts';
import type { ServiceResponse, InternalRequestOptions, InternalRpcEnvelope } from './types.js';

export interface InternalServiceClients {
  identityAccess: {
    login(body: { handle: string; password: string }): Promise<ServiceResponse>;
    loginSystemAdmin(body: { systemAdminKey: string }): Promise<ServiceResponse>;
    logout(body: { sessionToken: string }): Promise<ServiceResponse>;
    validateSession(body: { sessionToken: string }): Promise<ServiceResponse>;
    selectTeam(body: { sessionToken: string; teamId: string }): Promise<ServiceResponse>;
    createTeam(body: { name: string; slug: string; actorId: string }): Promise<ServiceResponse>;
    listTeams(userId: string): Promise<ServiceResponse>;
    addMember(body: {
      teamId: string;
      userId: string;
      role: string;
      actorId: string;
    }): Promise<ServiceResponse>;
    updateMember(
      memberId: string,
      body: { updates: Record<string, unknown>; actorId: string },
    ): Promise<ServiceResponse>;
    provisionAccessKey(body: { memberId: string; actorId: string }): Promise<ServiceResponse>;
  };
  knowledgeRead: {
    getById(entryId: string): Promise<ServiceResponse>;
    listMine(userId: string, teamId?: string): Promise<ServiceResponse>;
    search(body: { query: string; teamId?: string; limit?: number }): Promise<ServiceResponse>;
    searchByContent(params: SkillLookupQuery): Promise<ServiceResponse>;
    searchGenes(body: unknown, options?: InternalRequestOptions): Promise<ServiceResponse>;
    getProjectionStatus(): Promise<ServiceResponse>;
  };
  knowledgeWrite: {
    deriveExperienceGene(
      body: Record<string, unknown>,
      options?: InternalRequestOptions,
    ): Promise<ServiceResponse>;
    planExperienceGeneDerivations(
      body: unknown,
      options?: InternalRequestOptions,
    ): Promise<ServiceResponse>;
    markExperienceGenesStale(
      body: unknown,
      options?: InternalRequestOptions,
    ): Promise<ServiceResponse>;
    importArtifact(
      body: Record<string, unknown>,
      options?: InternalRequestOptions,
    ): Promise<ServiceResponse>;
    editArtifact(
      artifactId: string,
      body: Record<string, unknown>,
      options?: InternalRequestOptions,
    ): Promise<ServiceResponse>;
    artifactHistory(artifactId: string, options?: InternalRequestOptions): Promise<ServiceResponse>;
    exportArtifacts(
      body: Record<string, unknown>,
      options?: InternalRequestOptions,
    ): Promise<ServiceResponse>;
    artifactReviewQueue(options?: InternalRequestOptions): Promise<ServiceResponse>;
    reviewArtifact(
      artifactId: string,
      body: Record<string, unknown>,
      options?: InternalRequestOptions,
    ): Promise<ServiceResponse>;
    activateArtifact(
      body: Record<string, unknown>,
      options?: InternalRequestOptions,
    ): Promise<ServiceResponse>;
    deactivateArtifact(
      artifactId: string,
      body: Record<string, unknown>,
      options?: InternalRequestOptions,
    ): Promise<ServiceResponse>;
    submit(
      body: {
        content: string;
        actorId: string;
        title?: string;
        labels?: string[];
        teamId?: string;
      },
      options?: InternalRequestOptions,
    ): Promise<ServiceResponse>;
    getConflictCandidates(entryId: string): Promise<ServiceResponse>;
    getArtifactById(artifactId: string, options?: InternalRequestOptions): Promise<ServiceResponse>;
    updateEntry(
      entryId: string,
      body: { updates: Record<string, unknown>; actorId: string },
      options?: InternalRequestOptions,
    ): Promise<ServiceResponse>;
    resubmit(
      entryId: string,
      body: { actorId: string; note?: string },
      options?: InternalRequestOptions,
    ): Promise<ServiceResponse>;
    supersede(
      entryId: string,
      body: { replacementId: string; actorId: string },
      options?: InternalRequestOptions,
    ): Promise<ServiceResponse>;
    createTrap(
      body: {
        content: string;
        teamId: string;
        actorId: string;
        title?: string;
      },
      options?: InternalRequestOptions,
    ): Promise<ServiceResponse>;
    approveReviewDecision(
      body: {
        entryId: string;
        actorId: string;
        note?: string;
        evidence?: Record<string, unknown>;
      },
      options?: InternalRequestOptions,
    ): Promise<ServiceResponse>;
    rejectReviewDecision(
      body: {
        entryId: string;
        actorId: string;
        note?: string;
        evidence?: Record<string, unknown>;
      },
      options?: InternalRequestOptions,
    ): Promise<ServiceResponse>;
    returnReviewDecision(
      body: {
        entryId: string;
        actorId: string;
        note?: string;
        evidence?: Record<string, unknown>;
      },
      options?: InternalRequestOptions,
    ): Promise<ServiceResponse>;
    applyMaintenanceDecision(
      body: {
        entryId: string;
        actorId: string;
        action: string;
        note?: string;
        evidence?: Record<string, unknown>;
      },
      options?: InternalRequestOptions,
    ): Promise<ServiceResponse>;
    applyDecayDecision(
      body: {
        entryId: string;
        actorId: string;
        action: string;
        note?: string;
        evidence?: Record<string, unknown>;
      },
      options?: InternalRequestOptions,
    ): Promise<ServiceResponse>;
    publishCandidateResult(
      body: {
        candidateId: string;
        actorId: string;
        result: Record<string, unknown>;
      },
      options?: InternalRequestOptions,
    ): Promise<ServiceResponse>;
    invoke(body: InternalRpcEnvelope, options?: InternalRequestOptions): Promise<ServiceResponse>;
    listTraps(teamId: string): Promise<ServiceResponse>;
    getTrap(trapId: string): Promise<ServiceResponse>;
  };
  candidateIngestion: {
    submit(body: { id: string; content: string; submittedBy: string }): Promise<ServiceResponse>;
    getById(candidateId: string): Promise<ServiceResponse>;
    listByStatus(status: string): Promise<ServiceResponse>;
    applyResolution(
      candidateId: string,
      body: { resolution: Record<string, unknown>; actorId: string },
      options?: InternalRequestOptions,
    ): Promise<ServiceResponse>;
    submitManualResult(
      candidateId: string,
      body: { result: Record<string, unknown>; actorId: string },
      options?: InternalRequestOptions,
    ): Promise<ServiceResponse>;
    publishCandidateResult(
      candidateId: string,
      body: { result: Record<string, unknown>; actorId: string },
      options?: InternalRequestOptions,
    ): Promise<ServiceResponse>;
  };
  review: {
    detectConflicts(body: { entryId: string }): Promise<ServiceResponse>;
    approve(body: { entryId: string; actorId: string; note?: string }): Promise<ServiceResponse>;
    reject(body: { entryId: string; actorId: string; note?: string }): Promise<ServiceResponse>;
    returnForCorrection(body: {
      entryId: string;
      actorId: string;
      note?: string;
    }): Promise<ServiceResponse>;
    applyMaintenance(body: {
      entryId: string;
      actorId: string;
      action: string;
      note?: string;
      evidence?: Record<string, unknown>;
    }): Promise<ServiceResponse>;
    applyDecay(body: {
      entryId: string;
      actorId: string;
      action: string;
      note?: string;
      evidence?: Record<string, unknown>;
    }): Promise<ServiceResponse>;
    reviewArtifact(body: {
      artifactId: string;
      decision: 'approve' | 'reject';
      actorId: string;
      note?: string;
    }): Promise<ServiceResponse>;
    submitFeedback(
      body: {
        entryId: string;
        problemType: string;
        description: string;
        actorId: string;
        [key: string]: unknown;
      },
      options?: InternalRequestOptions,
    ): Promise<ServiceResponse>;
  };
  governanceReview: InternalServiceClients['review'] & {
    getRetrievalProjection(body: { entryIds: string[] }): Promise<ServiceResponse>;
    reactivateRemediation(payload: RemediationReactivationPayload): Promise<ServiceResponse>;
    exportBadcaseDraft(payload: BadcaseExportDraftPayload): Promise<ServiceResponse>;
  };
  feedbackAdmin: {
    list(query: Record<string, string>, options?: InternalRequestOptions): Promise<ServiceResponse>;
    batch(
      body: Record<string, unknown>,
      options?: InternalRequestOptions,
    ): Promise<ServiceResponse>;
    stats(entryId: string, options?: InternalRequestOptions): Promise<ServiceResponse>;
    listRemediation(options?: InternalRequestOptions): Promise<ServiceResponse>;
    getRemediation(entryId: string, options?: InternalRequestOptions): Promise<ServiceResponse>;
    completeRemediation(
      entryId: string,
      body: Record<string, unknown>,
      options?: InternalRequestOptions,
    ): Promise<ServiceResponse>;
  };
  adminReview: {
    listReviews(
      query: Record<string, string>,
      options?: InternalRequestOptions,
    ): Promise<ServiceResponse>;
    getReview(reviewId: string, options?: InternalRequestOptions): Promise<ServiceResponse>;
    listActivity(
      query: Record<string, string>,
      options?: InternalRequestOptions,
    ): Promise<ServiceResponse>;
    decideReview(
      reviewId: string,
      body: Record<string, unknown>,
      options?: InternalRequestOptions,
    ): Promise<ServiceResponse>;
  };
  adminArtifacts: {
    list(query: Record<string, string>, options?: InternalRequestOptions): Promise<ServiceResponse>;
    getById(artifactId: string, options?: InternalRequestOptions): Promise<ServiceResponse>;
  };
  adminGraph: {
    getTrapGraph(
      query: Record<string, string>,
      options?: InternalRequestOptions,
    ): Promise<ServiceResponse>;
    getSkillGraph(
      query: Record<string, string>,
      options?: InternalRequestOptions,
    ): Promise<ServiceResponse>;
    getSkillGraphById(
      artifactId: string,
      query: Record<string, string>,
      options?: InternalRequestOptions,
    ): Promise<ServiceResponse>;
  };
  reviewQueue: {
    list(query: Record<string, string>, options?: InternalRequestOptions): Promise<ServiceResponse>;
  };
  jobRuntime: {
    schedule(body: {
      type: string;
      payload: unknown;
      delayMs?: number;
      priority?: number;
      maxAttempts?: number;
      dedupeKey?: string;
    }): Promise<ServiceResponse>;
    getStatus(jobId: string): Promise<ServiceResponse>;
    getQueueStatus(): Promise<ServiceResponse>;
  };
  cronScheduler: {
    listJobs(options?: InternalRequestOptions): Promise<ServiceResponse>;
    createJob(body: unknown, options?: InternalRequestOptions): Promise<ServiceResponse>;
    getJob(jobId: string, options?: InternalRequestOptions): Promise<ServiceResponse>;
    updateJob(
      jobId: string,
      body: unknown,
      options?: InternalRequestOptions,
    ): Promise<ServiceResponse>;
    deleteJob(jobId: string, options?: InternalRequestOptions): Promise<ServiceResponse>;
    triggerJob(jobId: string, options?: InternalRequestOptions): Promise<ServiceResponse>;
    getStatus(options?: InternalRequestOptions): Promise<ServiceResponse>;
  };
}

/**
 * Shared governance-review client (2026-08-16 merge).
 *
 * `review` and `governanceReview` expose the same seven review methods
 * with identical routes; they differ only in which static URL key the
 * base URL comes from (`urls.review` vs `urls.governanceReview`). One
 * implementation parameterized by the base-URL source keeps the two
 * groups from drifting.
 */
