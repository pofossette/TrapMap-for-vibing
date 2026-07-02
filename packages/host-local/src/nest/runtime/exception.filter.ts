import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter as NestExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { ZodError } from 'zod';

import { InvocationError } from '@trapmap/backend-core';

import { RequestContextService } from './request-context.service.js';

/**
 * Canonical error envelope for all Nest host responses.
 */
export interface ErrorEnvelope {
  code: string;
  message: string;
  kind: string;
  requestId: string;
  traceId?: string;
  error?: string;
  details?: Record<string, unknown>;
}

type InvocationErrorKind =
  | 'validation'
  | 'not-found'
  | 'conflict'
  | 'forbidden'
  | 'timeout'
  | 'unavailable'
  | 'internal';

const KIND_TO_STATUS: Record<InvocationErrorKind, number> = {
  validation: HttpStatus.BAD_REQUEST,
  'not-found': HttpStatus.NOT_FOUND,
  conflict: HttpStatus.CONFLICT,
  forbidden: HttpStatus.FORBIDDEN,
  timeout: HttpStatus.GATEWAY_TIMEOUT,
  unavailable: HttpStatus.SERVICE_UNAVAILABLE,
  internal: HttpStatus.INTERNAL_SERVER_ERROR,
};

const KIND_TO_CODE: Record<InvocationErrorKind, string> = {
  validation: 'validation_error',
  'not-found': 'not_found',
  conflict: 'conflict',
  forbidden: 'forbidden',
  timeout: 'timeout',
  unavailable: 'unavailable',
  internal: 'internal_error',
};

@Catch()
export class AllExceptionFilter implements NestExceptionFilter {
  private readonly logger = new Logger(AllExceptionFilter.name);

  constructor(private readonly requestContext: RequestContextService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<
      FastifyReply & {
        raw?: {
          writableEnded?: boolean;
          setHeader?: (name: string, value: string) => void;
          end?: (body: string) => void;
          statusCode?: number;
        };
      }
    >();

    const requestId = this.requestContext.getRequestId();
    const traceId = this.requestContext.getTraceId();

    const envelope = this.buildEnvelope(exception, requestId, traceId);

    if ('sent' in response && response.sent) {
      return;
    }

    if ('status' in response && typeof response.status === 'function') {
      response.status(envelope.status).send(envelope.body);
      return;
    }

    if (response.raw && !response.raw.writableEnded && typeof response.raw.end === 'function') {
      response.raw.statusCode = envelope.status;
      response.raw.setHeader?.('content-type', 'application/json; charset=utf-8');
      response.raw.end(JSON.stringify(envelope.body));
    }
  }

  private buildEnvelope(
    exception: unknown,
    requestId: string,
    traceId: string | null,
  ): { status: number; body: ErrorEnvelope } {
    if (exception instanceof InvocationError) {
      return this.fromInvocationError(exception, requestId, traceId);
    }

    if (exception instanceof ZodError) {
      return this.fromZodError(exception, requestId, traceId);
    }

    if (exception instanceof HttpException) {
      return this.fromHttpException(exception, requestId, traceId);
    }

    this.logger.error('Unhandled exception', exception);
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: {
        code: 'internal_error',
        message: 'An unexpected error occurred',
        kind: 'internal',
        requestId,
        ...(traceId !== null ? { traceId } : {}),
        error: 'An unexpected error occurred',
      },
    };
  }

  private fromInvocationError(
    err: InvocationError,
    requestId: string,
    traceId: string | null,
  ): { status: number; body: ErrorEnvelope } {
    const kind = err.kind;
    const status = KIND_TO_STATUS[kind] ?? HttpStatus.INTERNAL_SERVER_ERROR;
    const code = KIND_TO_CODE[kind] ?? 'internal_error';

    return {
      status,
      body: {
        code,
        message: err.message,
        kind,
        requestId,
        ...(traceId !== null ? { traceId } : {}),
        error: err.message,
      },
    };
  }

  private fromZodError(
    err: ZodError,
    requestId: string,
    traceId: string | null,
  ): { status: number; body: ErrorEnvelope } {
    return {
      status: HttpStatus.BAD_REQUEST,
      body: {
        code: 'validation_error',
        message: 'Request validation failed',
        kind: 'validation',
        requestId,
        ...(traceId !== null ? { traceId } : {}),
        error: 'Request validation failed',
        details: {
          issues: err.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        },
      },
    };
  }

  private fromHttpException(
    err: HttpException,
    requestId: string,
    traceId: string | null,
  ): { status: number; body: ErrorEnvelope } {
    const status = err.getStatus();
    const message = err.message;

    let code = 'internal_error';
    let kind: string = 'internal';

    if (status === HttpStatus.NOT_FOUND) {
      code = 'not_found';
      kind = 'not-found';
    } else if (status === HttpStatus.FORBIDDEN) {
      code = 'forbidden';
      kind = 'forbidden';
    } else if (status === HttpStatus.BAD_REQUEST) {
      code = 'validation_error';
      kind = 'validation';
    }

    return {
      status,
      body: {
        code,
        message,
        kind,
        requestId,
        ...(traceId !== null ? { traceId } : {}),
        error: message,
      },
    };
  }
}
