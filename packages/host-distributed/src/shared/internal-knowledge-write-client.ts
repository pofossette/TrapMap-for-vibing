import { InvocationError, type KnowledgeWritePort } from '@trapmap/backend-core';
import type {
  InternalRequestOptions,
  InternalRpcEnvelope,
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

type RemoteKnowledgeWriteTransport = 'http' | 'rpc';

interface RemoteKnowledgeWriteClientConfig extends InternalRequestOptions {
  transport?: RemoteKnowledgeWriteTransport;
}

function unwrapRpcResult<T>(body: unknown, fallback: string): T {
  const payload = body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
  if (payload?.ok === true) {
    return payload.result as T;
  }
  throw mapRemoteError(body, fallback);
}

export function createRemoteKnowledgeWriteClient(
  clients: Pick<InternalServiceClients, 'knowledgeWrite'>,
  options?: RemoteKnowledgeWriteClientConfig,
): Pick<
  KnowledgeWritePort,
  | 'publishCandidateResult'
  | 'approveReviewDecision'
  | 'rejectReviewDecision'
  | 'applyMaintenanceDecision'
  | 'applyDecayDecision'
> {
  const transport = options?.transport ?? 'http';
  const requestOptions: InternalRequestOptions = {
    ...(options?.headers ? { headers: options.headers } : {}),
    ...(options?.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
  };

  const invoke = async <T>(
    method: InternalRpcEnvelope['method'],
    input: InternalRpcEnvelope['input'],
    fallback: string,
    httpRequest: Promise<{ status: number; body: unknown }>,
  ): Promise<T> => {
    if (transport === 'rpc') {
      const response = await clients.knowledgeWrite.invoke({ method, input }, requestOptions);
      if (response.status >= 200 && response.status < 300) {
        return unwrapRpcResult<T>(response.body, fallback);
      }
      throw mapRemoteError(response.body, fallback);
    }

    return unwrapResponse<T>(httpRequest, fallback);
  };

  return {
    publishCandidateResult: (input) =>
      invoke<{ entryId?: string; candidateId: string }>(
        'publishCandidateResult',
        input,
        `knowledge-write publishCandidateResult failed for candidate: ${input.candidateId}`,
        clients.knowledgeWrite.publishCandidateResult(input, requestOptions),
      ),
    approveReviewDecision: (input) =>
      invoke<{ entryId: string; lifecycleState: 'approved' }>(
        'approveReviewDecision',
        input,
        `knowledge-write approveReviewDecision failed for entry: ${input.entryId}`,
        clients.knowledgeWrite.approveReviewDecision(input, requestOptions),
      ),
    rejectReviewDecision: (input) =>
      invoke<{ entryId: string; lifecycleState: 'rejected' }>(
        'rejectReviewDecision',
        input,
        `knowledge-write rejectReviewDecision failed for entry: ${input.entryId}`,
        clients.knowledgeWrite.rejectReviewDecision(input, requestOptions),
      ),
    applyMaintenanceDecision: (input) =>
      invoke<{ entryId: string; action: string }>(
        'applyMaintenanceDecision',
        input,
        `knowledge-write applyMaintenanceDecision failed for entry: ${input.entryId}`,
        clients.knowledgeWrite.applyMaintenanceDecision(input, requestOptions),
      ),
    applyDecayDecision: (input) =>
      invoke<{ entryId: string; action: string }>(
        'applyDecayDecision',
        input,
        `knowledge-write applyDecayDecision failed for entry: ${input.entryId}`,
        clients.knowledgeWrite.applyDecayDecision(input, requestOptions),
      ),
  };
}
