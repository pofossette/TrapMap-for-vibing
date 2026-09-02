import { geneSearchResponseSchema, skillLookupResponseSchema } from '@trapmap/contracts';
import type { InternalServiceUrls } from '@trapmap/host-distributed/config/index.js';
import type { DiscoveryResolver } from '../discovery-resolver.js';
import type { InternalServiceClients } from './interface.js';
import { callInternalService } from './http.js';
import { createGovernanceReviewClient } from './governance.js';

export function createInternalServiceClients(
  urls: InternalServiceUrls,
  resolver?: DiscoveryResolver,
): InternalServiceClients {
  /**
   * Resolve the base URL for a given service key.  If a dynamic
   * resolver is configured, it takes precedence; otherwise we use
   * the static URL from `urls`.
   */
  const baseUrl = async (serviceName: string, staticUrl: string): Promise<string> => {
    if (!resolver) return staticUrl;
    return resolver.resolveServiceUrl(serviceName);
  };

  // review / governanceReview share the same seven review methods; the only
  // difference is the static URL key the base URL is taken from.
  const reviewClient = createGovernanceReviewClient(() =>
    baseUrl('governance-review', urls.review),
  );
  const governanceReviewClient: InternalServiceClients['governanceReview'] = {
    ...createGovernanceReviewClient(() => baseUrl('governance-review', urls.governanceReview)),
    getRetrievalProjection: async (body) =>
      callInternalService(
        `${await baseUrl('governance-review', urls.governanceReview)}/internal/governance-review/retrieval-projection`,
        'POST',
        body,
      ),
    reactivateRemediation: async (body) =>
      callInternalService(
        `${await baseUrl('governance-review', urls.governanceReview)}/internal/feedback/async/remediation-reactivation`,
        'POST',
        body,
      ),
    exportBadcaseDraft: async (body) =>
      callInternalService(
        `${await baseUrl('governance-review', urls.governanceReview)}/internal/feedback/async/badcase-export-draft`,
        'POST',
        body,
      ),
  };

  return {
    identityAccess: {
      login: async (body) =>
        callInternalService(
          `${await baseUrl('identity-access', urls.identityAccess)}/internal/auth/login`,
          'POST',
          body,
        ),
      loginSystemAdmin: async (body) =>
        callInternalService(
          `${await baseUrl('identity-access', urls.identityAccess)}/internal/auth/system-admin-login`,
          'POST',
          body,
        ),
      logout: async (body) =>
        callInternalService(
          `${await baseUrl('identity-access', urls.identityAccess)}/internal/auth/logout`,
          'POST',
          body,
        ),
      validateSession: async (body) =>
        callInternalService(
          `${await baseUrl('identity-access', urls.identityAccess)}/internal/auth/validate`,
          'POST',
          body,
        ),
      selectTeam: async (body) =>
        callInternalService(
          `${await baseUrl('identity-access', urls.identityAccess)}/internal/auth/select-team`,
          'POST',
          body,
        ),
      createTeam: async (body) =>
        callInternalService(
          `${await baseUrl('identity-access', urls.identityAccess)}/internal/teams`,
          'POST',
          body,
        ),
      listTeams: async (userId) =>
        callInternalService(
          `${await baseUrl('identity-access', urls.identityAccess)}/internal/teams`,
          'GET',
          undefined,
          { userId },
        ),
      addMember: async (body) =>
        callInternalService(
          `${await baseUrl('identity-access', urls.identityAccess)}/internal/members`,
          'POST',
          body,
        ),
      updateMember: async (memberId, body) =>
        callInternalService(
          `${await baseUrl('identity-access', urls.identityAccess)}/internal/members/${memberId}`,
          'PUT',
          body,
        ),
      provisionAccessKey: async (body) =>
        callInternalService(
          `${await baseUrl('identity-access', urls.identityAccess)}/internal/access-keys`,
          'POST',
          body,
        ),
    },
    knowledgeRead: {
      getById: async (entryId) =>
        callInternalService(
          `${await baseUrl('knowledge-read', urls.knowledgeRead)}/internal/knowledge/${entryId}`,
          'GET',
        ),
      listMine: async (userId, teamId) =>
        callInternalService(
          `${await baseUrl('knowledge-read', urls.knowledgeRead)}/internal/knowledge/mine`,
          'GET',
          undefined,
          {
            userId,
            ...(teamId ? { teamId } : {}),
          },
        ),
      search: async (body) =>
        callInternalService(
          `${await baseUrl('knowledge-read', urls.knowledgeRead)}/internal/retrieval/search`,
          'POST',
          body,
        ),
      searchByContent: async (params) => {
        const response = await callInternalService(
          `${await baseUrl('knowledge-read', urls.knowledgeRead)}/internal/retrieval/skills/search-by-content`,
          'POST',
          params,
        );
        return {
          status: response.status,
          body:
            response.status >= 200 && response.status < 300
              ? skillLookupResponseSchema.parse(response.body)
              : response.body,
        };
      },
      getProjectionStatus: async () =>
        callInternalService(
          `${await baseUrl('knowledge-read', urls.knowledgeRead)}/internal/knowledge-read/projection-status`,
          'GET',
        ),
      searchGenes: async (body, options) => {
        const response = await callInternalService(
          `${await baseUrl('knowledge-read', urls.knowledgeRead)}/internal/retrieval/genes/search`,
          'POST',
          body,
          undefined,
          options,
        );
        return {
          status: response.status,
          body:
            response.status >= 200 && response.status < 300
              ? geneSearchResponseSchema.parse(response.body)
              : response.body,
        };
      },
    },
    knowledgeWrite: {
      deriveExperienceGene: async (body, options) =>
        callInternalService(
          `${await baseUrl('knowledge-write', urls.knowledgeWrite)}/internal/experience-genes/derive`,
          'POST',
          body,
          undefined,
          options,
        ),
      planExperienceGeneDerivations: async (body, options) =>
        callInternalService(
          `${await baseUrl('knowledge-write', urls.knowledgeWrite)}/internal/experience-genes/derivation-plan`,
          'POST',
          body,
          undefined,
          options,
        ),
      markExperienceGenesStale: async (body, options) =>
        callInternalService(
          `${await baseUrl('knowledge-write', urls.knowledgeWrite)}/internal/experience-genes/stale`,
          'POST',
          body,
          undefined,
          options,
        ),
      importArtifact: async (body, options) =>
        callInternalService(
          `${await baseUrl('knowledge-write', urls.knowledgeWrite)}/internal/artifacts/import`,
          'POST',
          body,
          undefined,
          options,
        ),
      editArtifact: async (artifactId, body, options) =>
        callInternalService(
          `${await baseUrl('knowledge-write', urls.knowledgeWrite)}/internal/artifacts/${artifactId}/edit`,
          'POST',
          body,
          undefined,
          options,
        ),
      artifactHistory: async (artifactId, options) =>
        callInternalService(
          `${await baseUrl('knowledge-write', urls.knowledgeWrite)}/internal/artifacts/${artifactId}/history`,
          'GET',
          undefined,
          undefined,
          options,
        ),
      exportArtifacts: async (body, options) =>
        callInternalService(
          `${await baseUrl('knowledge-write', urls.knowledgeWrite)}/internal/artifacts/export`,
          'POST',
          body,
          undefined,
          options,
        ),
      artifactReviewQueue: async (options) =>
        callInternalService(
          `${await baseUrl('knowledge-write', urls.knowledgeWrite)}/internal/artifacts/review-queue`,
          'GET',
          undefined,
          undefined,
          options,
        ),
      reviewArtifact: async (artifactId, body, options) =>
        callInternalService(
          `${await baseUrl('knowledge-write', urls.knowledgeWrite)}/internal/artifacts/${artifactId}/review`,
          'POST',
          body,
          undefined,
          options,
        ),
      activateArtifact: async (body, options) =>
        callInternalService(
          `${await baseUrl('knowledge-write', urls.knowledgeWrite)}/internal/artifacts/activate`,
          'POST',
          body,
          undefined,
          options,
        ),
      deactivateArtifact: async (artifactId, body, options) =>
        callInternalService(
          `${await baseUrl('knowledge-write', urls.knowledgeWrite)}/internal/artifacts/${artifactId}/deactivate`,
          'POST',
          body,
          undefined,
          options,
        ),
      submit: async (body, options) =>
        callInternalService(
          `${await baseUrl('knowledge-write', urls.knowledgeWrite)}/internal/knowledge`,
          'POST',
          body,
          undefined,
          options,
        ),
      getConflictCandidates: async (entryId) =>
        callInternalService(
          `${await baseUrl('knowledge-write', urls.knowledgeWrite)}/internal/knowledge/${entryId}/conflict-candidates`,
          'GET',
        ),
      getArtifactById: async (artifactId, options) =>
        callInternalService(
          `${await baseUrl('knowledge-write', urls.knowledgeWrite)}/internal/artifacts/${artifactId}`,
          'GET',
          undefined,
          undefined,
          options,
        ),
      updateEntry: async (entryId, body, options) =>
        callInternalService(
          `${await baseUrl('knowledge-write', urls.knowledgeWrite)}/internal/knowledge/${entryId}`,
          'PUT',
          body,
          undefined,
          options,
        ),
      resubmit: async (entryId, body, options) =>
        callInternalService(
          `${await baseUrl('knowledge-write', urls.knowledgeWrite)}/internal/knowledge/${entryId}/resubmit`,
          'POST',
          body,
          undefined,
          options,
        ),
      supersede: async (entryId, body, options) =>
        callInternalService(
          `${await baseUrl('knowledge-write', urls.knowledgeWrite)}/internal/knowledge/${entryId}/supersede`,
          'POST',
          body,
          undefined,
          options,
        ),
      createTrap: async (body, options) =>
        callInternalService(
          `${await baseUrl('knowledge-write', urls.knowledgeWrite)}/internal/traps`,
          'POST',
          body,
          undefined,
          options,
        ),
      approveReviewDecision: async (body, options) =>
        callInternalService(
          `${await baseUrl('knowledge-write', urls.knowledgeWrite)}/internal/knowledge/review/approve`,
          'POST',
          body,
          undefined,
          options,
        ),
      rejectReviewDecision: async (body, options) =>
        callInternalService(
          `${await baseUrl('knowledge-write', urls.knowledgeWrite)}/internal/knowledge/review/reject`,
          'POST',
          body,
          undefined,
          options,
        ),
      returnReviewDecision: async (body, options) =>
        callInternalService(
          `${await baseUrl('knowledge-write', urls.knowledgeWrite)}/internal/knowledge/review/return-for-correction`,
          'POST',
          body,
          undefined,
          options,
        ),
      applyMaintenanceDecision: async (body, options) =>
        callInternalService(
          `${await baseUrl('knowledge-write', urls.knowledgeWrite)}/internal/knowledge/maintenance`,
          'POST',
          body,
          undefined,
          options,
        ),
      applyDecayDecision: async (body, options) =>
        callInternalService(
          `${await baseUrl('knowledge-write', urls.knowledgeWrite)}/internal/knowledge/decay`,
          'POST',
          body,
          undefined,
          options,
        ),
      publishCandidateResult: async (body, options) =>
        callInternalService(
          `${await baseUrl('knowledge-write', urls.knowledgeWrite)}/internal/candidates/publish`,
          'POST',
          body,
          undefined,
          options,
        ),
      invoke: async (body, options) =>
        callInternalService(
          `${await baseUrl('knowledge-write', urls.knowledgeWrite)}/internal/rpc/knowledge-write`,
          'POST',
          body,
          undefined,
          options,
        ),
      listTraps: async (teamId) =>
        callInternalService(
          `${await baseUrl('knowledge-write', urls.knowledgeWrite)}/internal/traps`,
          'GET',
          undefined,
          { teamId },
        ),
      getTrap: async (trapId) =>
        callInternalService(
          `${await baseUrl('knowledge-write', urls.knowledgeWrite)}/internal/traps/${trapId}`,
          'GET',
        ),
    },
    candidateIngestion: {
      submit: async (body) =>
        callInternalService(
          `${await baseUrl('candidate-ingestion', urls.candidateIngestion)}/internal/candidates`,
          'POST',
          body,
        ),
      getById: async (candidateId) =>
        callInternalService(
          `${await baseUrl('candidate-ingestion', urls.candidateIngestion)}/internal/candidates/${candidateId}`,
          'GET',
        ),
      listByStatus: async (status) =>
        callInternalService(
          `${await baseUrl('candidate-ingestion', urls.candidateIngestion)}/internal/candidates`,
          'GET',
          undefined,
          {
            status,
          },
        ),
      applyResolution: async (candidateId, body, options) =>
        callInternalService(
          `${await baseUrl('candidate-ingestion', urls.candidateIngestion)}/internal/candidates/${candidateId}/resolution`,
          'POST',
          body,
          undefined,
          options,
        ),
      submitManualResult: async (candidateId, body, options) =>
        callInternalService(
          `${await baseUrl('candidate-ingestion', urls.candidateIngestion)}/internal/candidates/${candidateId}/manual-result`,
          'POST',
          body,
          undefined,
          options,
        ),
      publishCandidateResult: async (candidateId, body, options) =>
        callInternalService(
          `${await baseUrl('candidate-ingestion', urls.candidateIngestion)}/internal/candidates/${candidateId}/publish`,
          'POST',
          body,
          undefined,
          options,
        ),
    },
    review: reviewClient,
    governanceReview: governanceReviewClient,
    feedbackAdmin: {
      list: async (query, options) =>
        callInternalService(
          `${await baseUrl('governance-review', urls.review)}/internal/feedback/admin`,
          'GET',
          undefined,
          query,
          options,
        ),
      batch: async (body, options) =>
        callInternalService(
          `${await baseUrl('governance-review', urls.review)}/internal/feedback/admin/batch`,
          'POST',
          body,
          undefined,
          options,
        ),
      stats: async (entryId, options) =>
        callInternalService(
          `${await baseUrl('governance-review', urls.review)}/internal/feedback/admin/stats/${entryId}`,
          'GET',
          undefined,
          undefined,
          options,
        ),
      listRemediation: async (options) =>
        callInternalService(
          `${await baseUrl('governance-review', urls.review)}/internal/feedback/admin/remediation`,
          'GET',
          undefined,
          undefined,
          options,
        ),
      getRemediation: async (entryId, options) =>
        callInternalService(
          `${await baseUrl('governance-review', urls.review)}/internal/feedback/admin/remediation/${entryId}`,
          'GET',
          undefined,
          undefined,
          options,
        ),
      completeRemediation: async (entryId, body, options) =>
        callInternalService(
          `${await baseUrl('governance-review', urls.review)}/internal/feedback/admin/remediation/${entryId}/complete`,
          'POST',
          body,
          undefined,
          options,
        ),
    },
    adminReview: {
      listReviews: async (query, options) =>
        callInternalService(
          `${await baseUrl('governance-review', urls.governanceReview)}/api/admin/reviews`,
          'GET',
          undefined,
          query,
          options,
        ),
      getReview: async (reviewId, options) =>
        callInternalService(
          `${await baseUrl('governance-review', urls.governanceReview)}/api/admin/reviews/${reviewId}`,
          'GET',
          undefined,
          undefined,
          options,
        ),
      listActivity: async (query, options) =>
        callInternalService(
          `${await baseUrl('governance-review', urls.governanceReview)}/api/admin/activity`,
          'GET',
          undefined,
          query,
          options,
        ),
      decideReview: async (reviewId, body, options) =>
        callInternalService(
          `${await baseUrl('governance-review', urls.governanceReview)}/api/admin/reviews/${reviewId}/decision`,
          'POST',
          body,
          undefined,
          options,
        ),
      getRuntimeOverview: async (options) =>
        callInternalService(
          `${await baseUrl('governance-review', urls.governanceReview)}/api/admin/runtime-overview`,
          'GET',
          undefined,
          undefined,
          options,
        ),
      saveJsonEdit: async (reviewId, body, options) =>
        callInternalService(
          `${await baseUrl('governance-review', urls.governanceReview)}/api/admin/reviews/${reviewId}/json-edits`,
          'POST',
          body,
          undefined,
          options,
        ),
    },
    adminArtifacts: {
      list: async (query, options) =>
        callInternalService(
          `${await baseUrl('knowledge-write', urls.knowledgeWrite)}/api/admin/artifacts`,
          'GET',
          undefined,
          query,
          options,
        ),
      getById: async (artifactId, options) =>
        callInternalService(
          `${await baseUrl('knowledge-write', urls.knowledgeWrite)}/api/admin/artifacts/${artifactId}`,
          'GET',
          undefined,
          undefined,
          options,
        ),
    },
    adminGraph: {
      getTrapGraph: async (query, options) =>
        callInternalService(
          `${await baseUrl('knowledge-read', urls.knowledgeRead)}/api/admin/graph/traps`,
          'GET',
          undefined,
          query,
          options,
        ),
      getSkillGraph: async (query, options) =>
        callInternalService(
          `${await baseUrl('knowledge-read', urls.knowledgeRead)}/api/admin/graph/skills`,
          'GET',
          undefined,
          query,
          options,
        ),
      getSkillGraphById: async (artifactId, query, options) =>
        callInternalService(
          `${await baseUrl('knowledge-read', urls.knowledgeRead)}/api/admin/graphs/skill/${artifactId}`,
          'GET',
          undefined,
          query,
          options,
        ),
    },
    reviewQueue: {
      list: async (query, options) =>
        callInternalService(
          `${await baseUrl('governance-review', urls.governanceReview)}/api/admin/reviews`,
          'GET',
          undefined,
          query,
          options,
        ),
    },
    jobRuntime: {
      schedule: async (body) =>
        callInternalService(
          `${await baseUrl('job-runtime', urls.jobRuntime)}/internal/jobs`,
          'POST',
          body,
        ),
      getStatus: async (jobId) =>
        callInternalService(
          `${await baseUrl('job-runtime', urls.jobRuntime)}/internal/jobs/${jobId}`,
          'GET',
        ),
      getQueueStatus: async () =>
        callInternalService(
          `${await baseUrl('job-runtime', urls.jobRuntime)}/internal/jobs/queue`,
          'GET',
        ),
    },
    cronScheduler: {
      listJobs: async (options) =>
        callInternalService(
          `${await baseUrl('cron-scheduler', urls.cronScheduler)}/cron/jobs`,
          'GET',
          undefined,
          undefined,
          options,
        ),
      createJob: async (body, options) =>
        callInternalService(
          `${await baseUrl('cron-scheduler', urls.cronScheduler)}/cron/jobs`,
          'POST',
          body,
          undefined,
          options,
        ),
      getJob: async (jobId, options) =>
        callInternalService(
          `${await baseUrl('cron-scheduler', urls.cronScheduler)}/cron/jobs/${jobId}`,
          'GET',
          undefined,
          undefined,
          options,
        ),
      updateJob: async (jobId, body, options) =>
        callInternalService(
          `${await baseUrl('cron-scheduler', urls.cronScheduler)}/cron/jobs/${jobId}`,
          'PATCH',
          body,
          undefined,
          options,
        ),
      deleteJob: async (jobId, options) =>
        callInternalService(
          `${await baseUrl('cron-scheduler', urls.cronScheduler)}/cron/jobs/${jobId}`,
          'DELETE',
          undefined,
          undefined,
          options,
        ),
      triggerJob: async (jobId, options) =>
        callInternalService(
          `${await baseUrl('cron-scheduler', urls.cronScheduler)}/cron/jobs/${jobId}/trigger`,
          'POST',
          undefined,
          undefined,
          options,
        ),
      getStatus: async (options) =>
        callInternalService(
          `${await baseUrl('cron-scheduler', urls.cronScheduler)}/cron/status`,
          'GET',
          undefined,
          undefined,
          options,
        ),
    },
  };
}
