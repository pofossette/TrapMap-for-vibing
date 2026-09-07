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
    case 'unauthorized':
      return InvocationError.unauthorized(message, body);
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

/**
 * Trusted actor header for the governance-review → knowledge-write owner hop.
 * knowledge-write's internal mutation routes resolve the acting identity via
 * `trustedActor(headers, body)` and reject (401) when the header is absent,
 * so the HTTP transport must project the already-authorized `actorId` from
 * the port input into the header. The value always mirrors the body, which
 * keeps `trustedActor`'s header/body match check meaningful.
 */
const TRUSTED_ACTOR_HEADER = 'x-trapmap-actor-id';

function trustedActorHeadersFor(input: unknown): Record<string, string> {
  if (input !== null && typeof input === 'object' && 'actorId' in input) {
    const actorId: unknown = (input as { actorId?: unknown }).actorId;
    if (typeof actorId === 'string' && actorId.length > 0) {
      return { [TRUSTED_ACTOR_HEADER]: actorId };
    }
  }
  return {};
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
  | 'returnReviewDecision'
  | 'applyMaintenanceDecision'
  | 'applyDecayDecision'
> {
  const transport = options?.transport ?? 'http';
  const baseOptions: InternalRequestOptions = {
    ...(options?.headers ? { headers: options.headers } : {}),
    ...(options?.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
  };
  const optionsFor = (input: unknown): InternalRequestOptions => ({
    ...baseOptions,
    headers: { ...baseOptions.headers, ...trustedActorHeadersFor(input) },
  });

  const invoke = async <T>(
    method: InternalRpcEnvelope['method'],
    input: InternalRpcEnvelope['input'],
    fallback: string,
    httpRequest: Promise<{ status: number; body: unknown }>,
  ): Promise<T> => {
    if (transport === 'rpc') {
      const response = await clients.knowledgeWrite.invoke({ method, input }, optionsFor(input));
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
        clients.knowledgeWrite.publishCandidateResult(input, optionsFor(input)),
      ),
    approveReviewDecision: (input) =>
      invoke<{ entryId: string; lifecycleState: 'approved' }>(
        'approveReviewDecision',
        input,
        `knowledge-write approveReviewDecision failed for entry: ${input.entryId}`,
        clients.knowledgeWrite.approveReviewDecision(input, optionsFor(input)),
      ),
    rejectReviewDecision: (input) =>
      invoke<{ entryId: string; lifecycleState: 'rejected' }>(
        'rejectReviewDecision',
        input,
        `knowledge-write rejectReviewDecision failed for entry: ${input.entryId}`,
        clients.knowledgeWrite.rejectReviewDecision(input, optionsFor(input)),
      ),
    returnReviewDecision: (input) =>
      invoke<{ entryId: string; lifecycleState: 'submitted' }>(
        'returnReviewDecision',
        input,
        `knowledge-write returnReviewDecision failed for entry: ${input.entryId}`,
        clients.knowledgeWrite.returnReviewDecision(input, optionsFor(input)),
      ),
    applyMaintenanceDecision: (input) =>
      invoke<{ entryId: string; action: string }>(
        'applyMaintenanceDecision',
        input,
        `knowledge-write applyMaintenanceDecision failed for entry: ${input.entryId}`,
        clients.knowledgeWrite.applyMaintenanceDecision(input, optionsFor(input)),
      ),
    applyDecayDecision: (input) =>
      invoke<{ entryId: string; action: string }>(
        'applyDecayDecision',
        input,
        `knowledge-write applyDecayDecision failed for entry: ${input.entryId}`,
        clients.knowledgeWrite.applyDecayDecision(input, optionsFor(input)),
      ),
  };
}
