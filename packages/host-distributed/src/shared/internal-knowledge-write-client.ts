import { InvocationError, type KnowledgeWritePort } from '@trapmap/backend-core';
import type {
  InternalRequestOptions,
  InternalServiceClients,
} from '@trapmap/host-distributed/gateway/internal-client.js';

function mapRemoteError(body: unknown, fallback: string): InvocationError {
  const payload = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const kind = typeof payload.kind === 'string' ? payload.kind : null;
  const message =
    typeof payload.error === 'string' && payload.error.length > 0 ? payload.error : fallback;

  switch (kind) {
    case 'validation':
      return InvocationError.validation(message, body);
    case 'not-found':
      return InvocationError.notFound(message, body);
    case 'conflict':
      return InvocationError.conflict(message, body);
    case 'forbidden':
      return InvocationError.forbidden(message, body);
    case 'timeout':
      return InvocationError.timeout(message, body);
    case 'unavailable':
      return InvocationError.unavailable(message, body);
    case 'internal':
      return InvocationError.internal(message, body);
    default:
      return InvocationError.internal(message, body);
  }
}

async function unwrapResponse<T>(
  request: Promise<{ status: number; body: unknown }>,
  fallback: string,
): Promise<T> {
  const response = await request;
  if (response.status >= 200 && response.status < 300) {
    return response.body as T;
  }
  throw mapRemoteError(response.body, fallback);
}

export type RemoteKnowledgeWriteClientOptions = InternalRequestOptions;

export function createRemoteKnowledgeWriteClient(
  clients: Pick<InternalServiceClients, 'knowledgeWrite'>,
  options?: RemoteKnowledgeWriteClientOptions,
): Pick<
  KnowledgeWritePort,
  | 'publishCandidateResult'
  | 'approveReviewDecision'
  | 'rejectReviewDecision'
  | 'applyMaintenanceDecision'
  | 'applyDecayDecision'
> {
  const requestOptions: InternalRequestOptions = {
    ...(options?.headers ? { headers: options.headers } : {}),
    ...(options?.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
  };

  return {
    publishCandidateResult: (input) =>
      unwrapResponse<{ entryId?: string; candidateId: string }>(
        clients.knowledgeWrite.publishCandidateResult(input, requestOptions),
        `knowledge-write publishCandidateResult failed for candidate: ${input.candidateId}`,
      ),
    approveReviewDecision: (input) =>
      unwrapResponse<{ entryId: string; lifecycleState: 'approved' }>(
        clients.knowledgeWrite.approveReviewDecision(input, requestOptions),
        `knowledge-write approveReviewDecision failed for entry: ${input.entryId}`,
      ),
    rejectReviewDecision: (input) =>
      unwrapResponse<{ entryId: string; lifecycleState: 'rejected' }>(
        clients.knowledgeWrite.rejectReviewDecision(input, requestOptions),
        `knowledge-write rejectReviewDecision failed for entry: ${input.entryId}`,
      ),
    applyMaintenanceDecision: (input) =>
      unwrapResponse<{ entryId: string; action: string }>(
        clients.knowledgeWrite.applyMaintenanceDecision(input, requestOptions),
        `knowledge-write applyMaintenanceDecision failed for entry: ${input.entryId}`,
      ),
    applyDecayDecision: (input) =>
      unwrapResponse<{ entryId: string; action: string }>(
        clients.knowledgeWrite.applyDecayDecision(input, requestOptions),
        `knowledge-write applyDecayDecision failed for entry: ${input.entryId}`,
      ),
  };
}
