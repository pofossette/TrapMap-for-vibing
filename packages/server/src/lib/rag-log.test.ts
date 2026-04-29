import { mkdir, readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  type RagLogConfig,
  type RagLogEntry,
  generateQueryId,
  loadRagLogConfig,
  logRagRetrieval,
} from './rag-log.js';

describe('rag-log (Phase 22-01)', () => {
  describe('loadRagLogConfig', () => {
    it('returns disabled with default logDir when no env vars set', () => {
      const originalEnabled = process.env.LOG_RAG_ENABLED;
      const originalDir = process.env.LOG_RAG_DIR;
      const originalSize = process.env.LOG_MAX_FILE_SIZE_MB;
      const originalBackup = process.env.LOG_MAX_BACKUP_FILES;

      Reflect.deleteProperty(process.env, 'LOG_RAG_ENABLED');
      Reflect.deleteProperty(process.env, 'LOG_RAG_DIR');
      Reflect.deleteProperty(process.env, 'LOG_MAX_FILE_SIZE_MB');
      Reflect.deleteProperty(process.env, 'LOG_MAX_BACKUP_FILES');

      const config = loadRagLogConfig();

      expect(config).toEqual({
        enabled: false,
        logDir: 'logs/rag',
        maxFileSizeBytes: 10 * 1024 * 1024, // 10MB default
        maxBackupFiles: 5,
      });

      // Restore
      if (originalEnabled !== undefined) process.env.LOG_RAG_ENABLED = originalEnabled;
      if (originalDir !== undefined) process.env.LOG_RAG_DIR = originalDir;
      if (originalSize !== undefined) process.env.LOG_MAX_FILE_SIZE_MB = originalSize;
      if (originalBackup !== undefined) process.env.LOG_MAX_BACKUP_FILES = originalBackup;
    });

    it('returns enabled: true when LOG_RAG_ENABLED=true', () => {
      const original = process.env.LOG_RAG_ENABLED;
      process.env.LOG_RAG_ENABLED = 'true';

      const config = loadRagLogConfig();

      expect(config.enabled).toBe(true);

      // Restore
      if (original !== undefined) {
        process.env.LOG_RAG_ENABLED = original;
      } else {
        Reflect.deleteProperty(process.env, 'LOG_RAG_ENABLED');
      }
    });

    it('returns enabled: false when LOG_RAG_ENABLED is not "true"', () => {
      const original = process.env.LOG_RAG_ENABLED;
      process.env.LOG_RAG_ENABLED = 'false';

      const config = loadRagLogConfig();

      expect(config.enabled).toBe(false);

      if (original !== undefined) {
        process.env.LOG_RAG_ENABLED = original;
      } else {
        process.env.LOG_RAG_ENABLED = undefined;
      }
    });

    it('returns custom logDir when LOG_RAG_DIR is set', () => {
      const originalEnabled = process.env.LOG_RAG_ENABLED;
      const originalDir = process.env.LOG_RAG_DIR;

      process.env.LOG_RAG_ENABLED = 'true';
      process.env.LOG_RAG_DIR = '/tmp/custom-rag-logs';

      const config = loadRagLogConfig();

      expect(config.logDir).toBe('/tmp/custom-rag-logs');

      // Restore
      if (originalEnabled !== undefined) {
        process.env.LOG_RAG_ENABLED = originalEnabled;
      } else {
        Reflect.deleteProperty(process.env, 'LOG_RAG_ENABLED');
      }
      if (originalDir !== undefined) {
        process.env.LOG_RAG_DIR = originalDir;
      } else {
        Reflect.deleteProperty(process.env, 'LOG_RAG_DIR');
      }
    });
  });

  describe('logRagRetrieval', () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = path.join('/tmp', `rag-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    });

    afterEach(async () => {
      await rm(tempDir, { recursive: true, force: true });
    });

    it('creates log directory if it does not exist', async () => {
      const config: RagLogConfig = {
        enabled: true,
        logDir: tempDir,
        maxFileSizeBytes: 1024 * 1024,
        maxBackupFiles: 5,
      };
      const entry: RagLogEntry = {
        timestamp: '2026-04-19T12:00:00.000Z',
        queryId: 'qry_123456_abc123',
        seed: 'how to fix docker permission denied',
        mode: 'semantic',
        actorId: 'user_1',
        teamId: 'team_1',
        pipelineSteps: [{ name: 'embedding', latencyMs: 50 }],
        totalLatencyMs: 100,
        resultCount: 5,
        metadata: {
          filters: { labels: ['docker'], scopes: ['global'] },
          maxResults: 10,
          includeSummary: true,
          includeRefinement: false,
        },
      };

      await logRagRetrieval(config, entry);

      // Directory should exist
      await expect(mkdir(tempDir, { recursive: true })).resolves.toBeUndefined();

      // File should be written
      const files = await import('node:fs/promises').then((fs) => fs.readdir(tempDir));
      expect(files.length).toBeGreaterThanOrEqual(1);
    });

    it('writes JSON Lines to daily log file named YYYY-MM-DD.log', async () => {
      const config: RagLogConfig = {
        enabled: true,
        logDir: tempDir,
        maxFileSizeBytes: 1024 * 1024,
        maxBackupFiles: 5,
      };
      const entry: RagLogEntry = {
        timestamp: '2026-04-19T12:00:00.000Z',
        queryId: 'qry_123456_abc123',
        seed: 'how to fix docker permission denied',
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
      const lines = content.trim().split('\n');

      expect(lines).toHaveLength(1);
      const parsed = JSON.parse(lines[0]!);

      expect(parsed).toEqual(entry);
    });

    it('does not write any file when config.enabled is false', async () => {
      const config: RagLogConfig = {
        enabled: false,
        logDir: tempDir,
        maxFileSizeBytes: 1024 * 1024,
        maxBackupFiles: 5,
      };
      const entry: RagLogEntry = {
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
      };

      await logRagRetrieval(config, entry);

      // Directory should not be created
      await expect(import('node:fs/promises').then((fs) => fs.readdir(tempDir))).rejects.toThrow();
    });

    it('log entry contains all required fields', async () => {
      const config: RagLogConfig = {
        enabled: true,
        logDir: tempDir,
        maxFileSizeBytes: 1024 * 1024,
        maxBackupFiles: 5,
      };
      const entry: RagLogEntry = {
        timestamp: '2026-04-19T12:00:00.000Z',
        queryId: 'qry_789_xyz789',
        seed: 'CI/CD pipeline setup',
        mode: 'graph-assisted',
        actorId: 'user_42',
        teamId: 'team_7',
        pipelineSteps: [
          { name: 'embedding', latencyMs: 30 },
          { name: 'keyword', latencyMs: 15, metadata: { tokens: ['ci', 'cd', 'pipeline'] } },
          { name: 'merge', latencyMs: 5 },
          { name: 'rerank', latencyMs: 25 },
        ],
        totalLatencyMs: 75,
        resultCount: 12,
        metadata: {
          filters: { labels: ['ci', 'devops'], scopes: ['project-x'] },
          maxResults: 20,
          includeSummary: true,
          includeRefinement: true,
        },
      };

      await logRagRetrieval(config, entry);

      const logFile = path.join(tempDir, '2026-04-19.log');
      const content = await readFile(logFile, 'utf-8');
      const parsed = JSON.parse(content.trim());

      expect(parsed.timestamp).toBe('2026-04-19T12:00:00.000Z');
      expect(parsed.queryId).toBe('qry_789_xyz789');
      expect(parsed.seed).toBe('CI/CD pipeline setup');
      expect(parsed.mode).toBe('graph-assisted');
      expect(parsed.actorId).toBe('user_42');
      expect(parsed.teamId).toBe('team_7');
      expect(parsed.pipelineSteps).toHaveLength(4);
      expect(parsed.pipelineSteps[0]).toEqual({ name: 'embedding', latencyMs: 30 });
      expect(parsed.pipelineSteps[1]).toEqual({
        name: 'keyword',
        latencyMs: 15,
        metadata: { tokens: ['ci', 'cd', 'pipeline'] },
      });
      expect(parsed.totalLatencyMs).toBe(75);
      expect(parsed.resultCount).toBe(12);
      expect(parsed.metadata.filters).toEqual({ labels: ['ci', 'devops'], scopes: ['project-x'] });
      expect(parsed.metadata.maxResults).toBe(20);
      expect(parsed.metadata.includeSummary).toBe(true);
      expect(parsed.metadata.includeRefinement).toBe(true);
    });

    it('appends multiple entries to the same daily log file', async () => {
      const config: RagLogConfig = {
        enabled: true,
        logDir: tempDir,
        maxFileSizeBytes: 1024 * 1024,
        maxBackupFiles: 5,
      };

      const entry1: RagLogEntry = {
        timestamp: '2026-04-19T10:00:00.000Z',
        queryId: 'qry_001_aaa',
        seed: 'docker networking',
        mode: 'semantic',
        actorId: 'user_1',
        teamId: 'team_1',
        pipelineSteps: [{ name: 'embedding', latencyMs: 40 }],
        totalLatencyMs: 40,
        resultCount: 8,
        metadata: {
          maxResults: 10,
          includeSummary: true,
          includeRefinement: false,
        },
      };

      const entry2: RagLogEntry = {
        timestamp: '2026-04-19T11:00:00.000Z',
        queryId: 'qry_002_bbb',
        seed: 'kubernetes secrets',
        mode: 'hybrid',
        actorId: 'user_2',
        teamId: 'team_1',
        pipelineSteps: [
          { name: 'embedding', latencyMs: 35 },
          { name: 'keyword', latencyMs: 10 },
        ],
        totalLatencyMs: 45,
        resultCount: 3,
        metadata: {
          maxResults: 5,
          includeSummary: false,
          includeRefinement: false,
        },
      };

      await logRagRetrieval(config, entry1);
      await logRagRetrieval(config, entry2);

      const logFile = path.join(tempDir, '2026-04-19.log');
      const content = await readFile(logFile, 'utf-8');
      const lines = content.trim().split('\n');

      expect(lines).toHaveLength(2);
      expect(JSON.parse(lines[0]!)).toEqual(entry1);
      expect(JSON.parse(lines[1]!)).toEqual(entry2);
    });

    it('does not throw when appendFile fails', { timeout: 10000 }, async () => {
      // Use a null byte in path to force an immediate ENAMETOOLONG/EINVAL error
      const config: RagLogConfig = {
        enabled: true,
        logDir: '/tmp/\x00invalid-path/rag',
        maxFileSizeBytes: 1024 * 1024,
        maxBackupFiles: 5,
      };
      const entry: RagLogEntry = {
        timestamp: '2026-04-19T12:00:00.000Z',
        queryId: 'qry_test',
        seed: 'test',
        mode: 'semantic',
        actorId: 'user_1',
        teamId: 'team_1',
        pipelineSteps: [],
        totalLatencyMs: 10,
        resultCount: 0,
        metadata: {
          maxResults: 10,
          includeSummary: false,
          includeRefinement: false,
        },
      };

      // Should not throw - fire-and-forget
      await expect(logRagRetrieval(config, entry)).resolves.toBeUndefined();
    });

    it('rotates file when size limit exceeded', async () => {
      const config: RagLogConfig = {
        enabled: true,
        logDir: tempDir,
        maxFileSizeBytes: 10, // Very small for testing
        maxBackupFiles: 5,
      };

      const entry1: RagLogEntry = {
        timestamp: '2026-04-19T10:00:00.000Z',
        queryId: 'qry_001_aaa',
        seed: 'first entry that exceeds the small size limit',
        mode: 'semantic',
        actorId: 'user_1',
        teamId: 'team_1',
        pipelineSteps: [{ name: 'embedding', latencyMs: 40 }],
        totalLatencyMs: 40,
        resultCount: 8,
        metadata: {
          maxResults: 10,
          includeSummary: true,
          includeRefinement: false,
        },
      };

      const entry2: RagLogEntry = {
        timestamp: '2026-04-19T11:00:00.000Z',
        queryId: 'qry_002_bbb',
        seed: 'second entry',
        mode: 'hybrid',
        actorId: 'user_2',
        teamId: 'team_1',
        pipelineSteps: [
          { name: 'embedding', latencyMs: 35 },
          { name: 'keyword', latencyMs: 10 },
        ],
        totalLatencyMs: 45,
        resultCount: 3,
        metadata: {
          maxResults: 5,
          includeSummary: false,
          includeRefinement: false,
        },
      };

      // First write creates the file
      await logRagRetrieval(config, entry1);

      // Second write should trigger rotation (entry1 > 10 bytes)
      await logRagRetrieval(config, entry2);

      const logFile = path.join(tempDir, '2026-04-19.log');

      // Current file should have entry2
      const currentContent = await readFile(logFile, 'utf-8');
      expect(JSON.parse(currentContent.trim())).toEqual(entry2);

      // Backup should have entry1
      const backupContent = await readFile(`${logFile}.1`, 'utf-8');
      expect(JSON.parse(backupContent.trim())).toEqual(entry1);
    });
  });

  describe('generateQueryId', () => {
    it('generates a query ID with correct format', () => {
      const queryId = generateQueryId();

      expect(queryId).toMatch(/^qry_[a-z0-9]{12}$/);
    });

    it('generates unique query IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateQueryId());
      }

      // All IDs should be unique
      expect(ids.size).toBe(100);
    });
  });
});
