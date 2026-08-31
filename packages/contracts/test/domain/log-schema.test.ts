import { describe, expect, it } from 'vitest';

import {
  LOKI_LOW_CARDINALITY_LABELS,
  type LogEntry,
  buildLokiLabels,
  formatLogForStdout,
  logEntrySchema,
  redactLogContext,
} from '../../src/domain/log-schema.js';

describe('log schema', () => {
  describe('logEntrySchema', () => {
    it('accepts a minimal valid entry', () => {
      const result = logEntrySchema.parse({
        timestamp: '2026-07-02T10:00:00.000Z',
        level: 'info',
        service: 'trapmap',
        environment: 'production',
        message: 'Request completed',
      });
      expect(result.timestamp).toBe('2026-07-02T10:00:00.000Z');
      expect(result.level).toBe('info');
      expect(result.service).toBe('trapmap');
      expect(result.environment).toBe('production');
      expect(result.message).toBe('Request completed');
    });

    it('accepts all optional fields', () => {
      const result = logEntrySchema.parse({
        timestamp: '2026-07-02T10:00:00.000Z',
        level: 'error',
        service: 'trapmap',
        environment: 'staging',
        traceId: 'abc123',
        requestId: 'req-456',
        operationId: 'operation-789',
        causationId: 'event-012',
        ownerSurface: 'runtime-seam',
        context: 'GET /v1/traps',
        message: 'Something failed',
      });
      expect(result.traceId).toBe('abc123');
      expect(result.requestId).toBe('req-456');
      expect(result.operationId).toBe('operation-789');
      expect(result.causationId).toBe('event-012');
      expect(result.ownerSurface).toBe('runtime-seam');
      expect(result.context).toBe('GET /v1/traps');
    });

    it('accepts all four log levels', () => {
      for (const level of ['debug', 'info', 'warn', 'error'] as const) {
        const result = logEntrySchema.parse({
          timestamp: '2026-07-02T10:00:00.000Z',
          level,
          service: 'trapmap',
          environment: 'development',
          message: `Level ${level} test`,
        });
        expect(result.level).toBe(level);
      }
    });

    it('allows passthrough fields', () => {
      const result = logEntrySchema.parse({
        timestamp: '2026-07-02T10:00:00.000Z',
        level: 'info',
        service: 'trapmap',
        environment: 'production',
        message: 'With extra',
        statusCode: 200,
        latencyMs: 42,
        method: 'GET',
        route: '/v1/traps',
      });
      expect((result as any).statusCode).toBe(200);
      expect((result as any).latencyMs).toBe(42);
    });

    it('rejects an entry missing required fields', () => {
      expect(() =>
        logEntrySchema.parse({
          timestamp: '2026-07-02T10:00:00.000Z',
          level: 'info',
          message: 'Incomplete',
        }),
      ).toThrow();
    });

    it('rejects an invalid level', () => {
      expect(() =>
        logEntrySchema.parse({
          timestamp: '2026-07-02T10:00:00.000Z',
          level: 'critical',
          service: 'trapmap',
          environment: 'production',
          message: 'Bad level',
        }),
      ).toThrow();
    });

    it('rejects an invalid timestamp format', () => {
      expect(() =>
        logEntrySchema.parse({
          timestamp: 'not-a-datetime',
          level: 'info',
          service: 'trapmap',
          environment: 'production',
          message: 'Bad timestamp',
        }),
      ).toThrow();
    });
  });

  describe('LOKI_LOW_CARDINALITY_LABELS', () => {
    it('contains only service, environment, level', () => {
      expect(LOKI_LOW_CARDINALITY_LABELS).toEqual(['service', 'environment', 'level']);
    });
  });

  describe('buildLokiLabels', () => {
    it('extracts only low-cardinality fields', () => {
      const entry: LogEntry = {
        timestamp: '2026-07-02T10:00:00.000Z',
        level: 'warn',
        service: 'trapmap',
        environment: 'staging',
        traceId: 'abc123',
        requestId: 'req-456',
        operationId: 'operation-789',
        causationId: 'event-012',
        ownerSurface: 'runtime-seam',
        context: 'GET /v1/traps',
        message: 'Slow query',
      };
      const labels = buildLokiLabels(entry);
      expect(labels).toEqual({
        service: 'trapmap',
        environment: 'staging',
        level: 'warn',
      });
    });

    it('does not include correlation IDs or owner surface', () => {
      const entry: LogEntry = {
        timestamp: '2026-07-02T10:00:00.000Z',
        level: 'info',
        service: 'trapmap',
        environment: 'production',
        traceId: 'abc',
        requestId: 'def',
        operationId: 'operation-ghi',
        causationId: 'event-jkl',
        ownerSurface: 'runtime-seam',
        context: 'ghi',
        message: 'test',
      };
      const labels = buildLokiLabels(entry);
      expect(labels).not.toHaveProperty('traceId');
      expect(labels).not.toHaveProperty('requestId');
      expect(labels).not.toHaveProperty('operationId');
      expect(labels).not.toHaveProperty('causationId');
      expect(labels).not.toHaveProperty('ownerSurface');
      expect(labels).not.toHaveProperty('context');
    });
  });

  describe('formatLogForStdout', () => {
    it('formats a minimal entry without extra fields', () => {
      const entry: LogEntry = {
        timestamp: '2026-07-02T10:00:00.000Z',
        level: 'info',
        service: 'trapmap',
        environment: 'production',
        message: 'Server started',
      };
      const output = formatLogForStdout(entry);
      expect(JSON.parse(output)).toEqual(entry);
    });

    it('includes extra passthrough fields as JSON', () => {
      const entry: LogEntry = {
        timestamp: '2026-07-02T10:00:00.000Z',
        level: 'error',
        service: 'trapmap',
        environment: 'production',
        traceId: 'abc',
        message: 'Request failed',
        statusCode: 500,
      };
      const output = formatLogForStdout(entry);
      expect(JSON.parse(output)).toMatchObject({
        traceId: 'abc',
        message: 'Request failed',
        statusCode: 500,
      });
    });

    it('keeps the structured level intact', () => {
      const warnEntry: LogEntry = {
        timestamp: '2026-07-02T10:00:00.000Z',
        level: 'warn',
        service: 'trapmap',
        environment: 'production',
        message: 'warn test',
      };
      const output = formatLogForStdout(warnEntry);
      expect(JSON.parse(output)).toMatchObject({ level: 'warn', message: 'warn test' });
    });

    it('redacts sensitive fields before serializing stdout fallback', () => {
      const output = formatLogForStdout({
        timestamp: '2026-07-02T10:00:00.000Z',
        level: 'error',
        service: 'trapmap',
        environment: 'production',
        message: 'Request failed',
        authorization: 'Bearer secret',
        nested: { sessionToken: 'session-secret', safe: 'kept' },
      });
      const parsed = JSON.parse(output);

      expect(parsed.authorization).toBe('[REDACTED]');
      expect(parsed.nested).toEqual({ sessionToken: '[REDACTED]', safe: 'kept' });
      expect(redactLogContext({ accessToken: 'secret', value: 'kept' })).toEqual({
        accessToken: '[REDACTED]',
        value: 'kept',
      });
    });

    it('redacts authorization, token, password, secret, cookie, session, prompt, and content fields', () => {
      const result = redactLogContext({
        authorization: 'Bearer xyz',
        accessToken: 'tok_123',
        sessionToken: 'sess_456',
        password: 'hunter2',
        secret: 'my-secret',
        cookie: 'session=abc',
        session: 'user-session-data',
        prompt: 'Tell me about traps',
        contentBody: 'raw knowledge text',
        rawContent: 'raw text',
        knowledgeBody: 'knowledge entry body',
        requestBody: '{"key":"value"}',
        safeField: 'visible',
      });

      expect(result).toEqual({
        authorization: '[REDACTED]',
        accessToken: '[REDACTED]',
        sessionToken: '[REDACTED]',
        password: '[REDACTED]',
        secret: '[REDACTED]',
        cookie: '[REDACTED]',
        session: '[REDACTED]',
        prompt: '[REDACTED]',
        contentBody: '[REDACTED]',
        rawContent: '[REDACTED]',
        knowledgeBody: '[REDACTED]',
        requestBody: '[REDACTED]',
        safeField: 'visible',
      });
    });

    it('redacts sensitive fields in nested objects', () => {
      const result = redactLogContext({
        metadata: {
          authorization: 'Bearer nested-secret',
          nestedDeep: {
            password: 'deep-password',
            safe: 'kept',
          },
          safe: 'kept',
        },
        safeTop: 'visible',
      });

      expect(result.metadata).toEqual({
        authorization: '[REDACTED]',
        nestedDeep: {
          password: '[REDACTED]',
          safe: 'kept',
        },
        safe: 'kept',
      });
      expect(result.safeTop).toBe('visible');
    });

    it('redacts sensitive fields in arrays of objects', () => {
      const result = redactLogContext({
        items: [
          { id: '1', prompt: 'user prompt', safe: 'kept' },
          { id: '2', secret: 'array-secret', safe: 'kept' },
        ],
        safeTop: 'visible',
      });

      expect(result.items).toEqual([
        { id: '1', prompt: '[REDACTED]', safe: 'kept' },
        { id: '2', secret: '[REDACTED]', safe: 'kept' },
      ]);
      expect(result.safeTop).toBe('visible');
    });

    it('handles mixed arrays with primitive and object values', () => {
      const result = redactLogContext({
        tags: ['safe-tag', { cookie: 'session-abc', name: 'test' }],
        count: 42,
      });

      expect(result.tags).toEqual(['safe-tag', { cookie: '[REDACTED]', name: 'test' }]);
      expect(result.count).toBe(42);
    });
  });
});
