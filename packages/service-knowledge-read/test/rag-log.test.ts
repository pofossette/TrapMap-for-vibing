import { mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  type RagLogConfig,
  type RagLogEntry,
  generateQueryId,
  loadRagLogConfig,
  logRagRetrieval,
} from '../src/rag-log.js';

describe('knowledge-read rag-log', () => {
  it('loads defaults when env vars are unset', () => {
    const originalEnabled = process.env.LOG_RAG_ENABLED;
    const originalDir = process.env.LOG_RAG_DIR;
    const originalSize = process.env.LOG_MAX_FILE_SIZE_MB;
    const originalBackup = process.env.LOG_MAX_BACKUP_FILES;

    Reflect.deleteProperty(process.env, 'LOG_RAG_ENABLED');
    Reflect.deleteProperty(process.env, 'LOG_RAG_DIR');
    Reflect.deleteProperty(process.env, 'LOG_MAX_FILE_SIZE_MB');
    Reflect.deleteProperty(process.env, 'LOG_MAX_BACKUP_FILES');

    expect(loadRagLogConfig()).toEqual({
      enabled: false,
      logDir: 'logs/rag',
      maxFileSizeBytes: 10 * 1024 * 1024,
      maxBackupFiles: 5,
    });

    if (originalEnabled !== undefined) process.env.LOG_RAG_ENABLED = originalEnabled;
    if (originalDir !== undefined) process.env.LOG_RAG_DIR = originalDir;
    if (originalSize !== undefined) process.env.LOG_MAX_FILE_SIZE_MB = originalSize;
    if (originalBackup !== undefined) process.env.LOG_MAX_BACKUP_FILES = originalBackup;
  });

  it('generates stable query ids with the expected prefix', () => {
    expect(generateQueryId()).toMatch(/^qry_/);
  });

  describe('logRagRetrieval', () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = path.join(
        '/tmp',
        `knowledge-read-rag-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      );
    });

    afterEach(async () => {
      await rm(tempDir, { recursive: true, force: true });
    });

    it('writes JSON lines to a date-based log file when enabled', async () => {
      const config: RagLogConfig = {
        enabled: true,
        logDir: tempDir,
        maxFileSizeBytes: 1024 * 1024,
        maxBackupFiles: 5,
      };
      const entry: RagLogEntry = {
        timestamp: '2026-04-19T12:00:00.000Z',
        queryId: 'qry_123456_abc123',
        seed: 'docker permissions',
        mode: 'hybrid',
        actorId: 'user_1',
        teamId: 'team_1',
        pipelineSteps: [{ name: 'embedding', latencyMs: 50 }],
        totalLatencyMs: 100,
        resultCount: 5,
        metadata: {
          maxResults: 10,
          includeSummary: true,
          includeRefinement: false,
        },
      };

      await logRagRetrieval(config, entry);

      const logFile = path.join(tempDir, '2026-04-19.log');
      const content = await readFile(logFile, 'utf-8');
      expect(JSON.parse(content.trim())).toEqual(entry);
    });

    it('does not create files when disabled', async () => {
      const config: RagLogConfig = {
        enabled: false,
        logDir: tempDir,
        maxFileSizeBytes: 1024 * 1024,
        maxBackupFiles: 5,
      };

      await logRagRetrieval(config, {
        timestamp: '2026-04-19T12:00:00.000Z',
        queryId: 'qry_123456_abc123',
        seed: 'test query',
        mode: 'semantic',
        actorId: 'user_1',
        teamId: 'team_1',
        pipelineSteps: [],
        totalLatencyMs: 50,
        resultCount: 0,
        metadata: {
          maxResults: 10,
          includeSummary: false,
          includeRefinement: false,
        },
      });

      await expect(readFile(path.join(tempDir, '2026-04-19.log'), 'utf-8')).rejects.toThrow();
    });
  });
});
