import { mkdir, readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  type UserOpsLogConfig,
  type UserOpsLogEntry,
  loadUserOpsLogConfig,
  logUserOperation,
} from './user-ops-log.js';

describe('user-ops-log (Phase 21-01)', () => {
  describe('loadUserOpsLogConfig', () => {
    it('returns disabled with default logDir when no env vars set', () => {
      const originalEnabled = process.env.LOG_USER_OPS_ENABLED;
      const originalDir = process.env.LOG_USER_OPS_DIR;
      const originalSize = process.env.LOG_MAX_FILE_SIZE_MB;
      const originalBackup = process.env.LOG_MAX_BACKUP_FILES;

      Reflect.deleteProperty(process.env, 'LOG_USER_OPS_ENABLED');
      Reflect.deleteProperty(process.env, 'LOG_USER_OPS_DIR');
      Reflect.deleteProperty(process.env, 'LOG_MAX_FILE_SIZE_MB');
      Reflect.deleteProperty(process.env, 'LOG_MAX_BACKUP_FILES');

      const config = loadUserOpsLogConfig();

      expect(config).toEqual({
        enabled: false,
        logDir: 'logs/user-ops',
        maxFileSizeBytes: 10 * 1024 * 1024, // 10MB default
        maxBackupFiles: 5,
      });

      // Restore
      if (originalEnabled !== undefined) process.env.LOG_USER_OPS_ENABLED = originalEnabled;
      if (originalDir !== undefined) process.env.LOG_USER_OPS_DIR = originalDir;
      if (originalSize !== undefined) process.env.LOG_MAX_FILE_SIZE_MB = originalSize;
      if (originalBackup !== undefined) process.env.LOG_MAX_BACKUP_FILES = originalBackup;
    });

    it('returns enabled: true when LOG_USER_OPS_ENABLED=true', () => {
      const original = process.env.LOG_USER_OPS_ENABLED;
      process.env.LOG_USER_OPS_ENABLED = 'true';

      const config = loadUserOpsLogConfig();

      expect(config.enabled).toBe(true);

      // Restore
      if (original !== undefined) {
        process.env.LOG_USER_OPS_ENABLED = original;
      } else {
        Reflect.deleteProperty(process.env, 'LOG_USER_OPS_ENABLED');
      }
    });

    it('returns enabled: false when LOG_USER_OPS_ENABLED is not "true"', () => {
      const original = process.env.LOG_USER_OPS_ENABLED;
      process.env.LOG_USER_OPS_ENABLED = 'false';

      const config = loadUserOpsLogConfig();

      expect(config.enabled).toBe(false);

      if (original !== undefined) {
        process.env.LOG_USER_OPS_ENABLED = original;
      } else {
        process.env.LOG_USER_OPS_ENABLED = undefined;
      }
    });

    it('returns custom logDir when LOG_USER_OPS_DIR is set', () => {
      const originalEnabled = process.env.LOG_USER_OPS_ENABLED;
      const originalDir = process.env.LOG_USER_OPS_DIR;

      process.env.LOG_USER_OPS_ENABLED = 'true';
      process.env.LOG_USER_OPS_DIR = '/tmp/custom-logs';

      const config = loadUserOpsLogConfig();

      expect(config.logDir).toBe('/tmp/custom-logs');

      // Restore
      if (originalEnabled !== undefined) {
        process.env.LOG_USER_OPS_ENABLED = originalEnabled;
      } else {
        Reflect.deleteProperty(process.env, 'LOG_USER_OPS_ENABLED');
      }
      if (originalDir !== undefined) {
        process.env.LOG_USER_OPS_DIR = originalDir;
      } else {
        Reflect.deleteProperty(process.env, 'LOG_USER_OPS_DIR');
      }
    });
  });

  describe('logUserOperation', () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = path.join(
        '/tmp',
        `user-ops-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      );
    });

    afterEach(async () => {
      await rm(tempDir, { recursive: true, force: true });
    });

    it('creates log directory if it does not exist', async () => {
      const config: UserOpsLogConfig = {
        enabled: true,
        logDir: tempDir,
        maxFileSizeBytes: 1024 * 1024,
        maxBackupFiles: 5,
      };
      const entry: UserOpsLogEntry = {
        timestamp: '2026-04-19T12:00:00.000Z',
        actorId: 'user_1',
        actorHandle: 'alice',
        action: 'search',
        targetId: null,
        teamId: 'team_1',
        metadata: { query: 'test' },
      };

      await logUserOperation(config, entry);

      // Directory should exist
      await expect(mkdir(tempDir, { recursive: true })).resolves.toBeUndefined();

      // File should be written
      const files = await import('node:fs/promises').then((fs) => fs.readdir(tempDir));
      expect(files.length).toBeGreaterThanOrEqual(1);
    });

    it('writes JSON Lines to daily log file named YYYY-MM-DD.log', async () => {
      const config: UserOpsLogConfig = {
        enabled: true,
        logDir: tempDir,
        maxFileSizeBytes: 1024 * 1024,
        maxBackupFiles: 5,
      };
      const entry: UserOpsLogEntry = {
        timestamp: '2026-04-19T12:00:00.000Z',
        actorId: 'user_1',
        actorHandle: 'alice',
        action: 'search',
        targetId: null,
        teamId: 'team_1',
        metadata: { query: 'test' },
      };

      await logUserOperation(config, entry);

      const logFile = path.join(tempDir, '2026-04-19.log');
      const content = await readFile(logFile, 'utf-8');
      const lines = content.trim().split('\n');

      expect(lines).toHaveLength(1);
      const parsed = JSON.parse(lines[0]!);

      expect(parsed).toEqual(entry);
    });

    it('does not write any file when config.enabled is false', async () => {
      const config: UserOpsLogConfig = {
        enabled: false,
        logDir: tempDir,
        maxFileSizeBytes: 1024 * 1024,
        maxBackupFiles: 5,
      };
      const entry: UserOpsLogEntry = {
        timestamp: '2026-04-19T12:00:00.000Z',
        actorId: 'user_1',
        actorHandle: 'alice',
        action: 'search',
        targetId: null,
        teamId: 'team_1',
        metadata: {},
      };

      await logUserOperation(config, entry);

      // Directory should not be created
      await expect(import('node:fs/promises').then((fs) => fs.readdir(tempDir))).rejects.toThrow();
    });

    it('log entry contains all required fields', async () => {
      const config: UserOpsLogConfig = {
        enabled: true,
        logDir: tempDir,
        maxFileSizeBytes: 1024 * 1024,
        maxBackupFiles: 5,
      };
      const entry: UserOpsLogEntry = {
        timestamp: '2026-04-19T12:00:00.000Z',
        actorId: 'user_42',
        actorHandle: 'bob',
        action: 'submit',
        targetId: 'skill_1',
        teamId: 'team_7',
        metadata: { labels: ['docker', 'ci'] },
      };

      await logUserOperation(config, entry);

      const logFile = path.join(tempDir, '2026-04-19.log');
      const content = await readFile(logFile, 'utf-8');
      const parsed = JSON.parse(content.trim());

      expect(parsed.timestamp).toBe('2026-04-19T12:00:00.000Z');
      expect(parsed.actorId).toBe('user_42');
      expect(parsed.actorHandle).toBe('bob');
      expect(parsed.action).toBe('submit');
      expect(parsed.targetId).toBe('skill_1');
      expect(parsed.teamId).toBe('team_7');
      expect(parsed.metadata).toEqual({ labels: ['docker', 'ci'] });
    });

    it('appends multiple entries to the same daily log file', async () => {
      const config: UserOpsLogConfig = {
        enabled: true,
        logDir: tempDir,
        maxFileSizeBytes: 1024 * 1024,
        maxBackupFiles: 5,
      };

      const entry1: UserOpsLogEntry = {
        timestamp: '2026-04-19T10:00:00.000Z',
        actorId: 'user_1',
        actorHandle: 'alice',
        action: 'search',
        targetId: null,
        teamId: 'team_1',
        metadata: { query: 'docker' },
      };

      const entry2: UserOpsLogEntry = {
        timestamp: '2026-04-19T11:00:00.000Z',
        actorId: 'user_2',
        actorHandle: 'bob',
        action: 'submit',
        targetId: 'skill_5',
        teamId: 'team_1',
        metadata: {},
      };

      await logUserOperation(config, entry1);
      await logUserOperation(config, entry2);

      const logFile = path.join(tempDir, '2026-04-19.log');
      const content = await readFile(logFile, 'utf-8');
      const lines = content.trim().split('\n');

      expect(lines).toHaveLength(2);
      expect(JSON.parse(lines[0]!)).toEqual(entry1);
      expect(JSON.parse(lines[1]!)).toEqual(entry2);
    });

    it('does not throw when appendFile fails', { timeout: 10000 }, async () => {
      // Use a null byte in path to force an immediate ENAMETOOLONG/EINVAL error
      const config: UserOpsLogConfig = {
        enabled: true,
        logDir: '/tmp/\x00invalid-path/user-ops',
        maxFileSizeBytes: 1024 * 1024,
        maxBackupFiles: 5,
      };
      const entry: UserOpsLogEntry = {
        timestamp: '2026-04-19T12:00:00.000Z',
        actorId: 'user_1',
        actorHandle: 'alice',
        action: 'search',
        targetId: null,
        teamId: 'team_1',
        metadata: {},
      };

      // Should not throw - fire-and-forget
      await expect(logUserOperation(config, entry)).resolves.toBeUndefined();
    });

    it('rotates file when size limit exceeded', async () => {
      const config: UserOpsLogConfig = {
        enabled: true,
        logDir: tempDir,
        maxFileSizeBytes: 10, // Very small for testing
        maxBackupFiles: 5,
      };

      const entry1: UserOpsLogEntry = {
        timestamp: '2026-04-19T10:00:00.000Z',
        actorId: 'user_1',
        actorHandle: 'alice',
        action: 'search',
        targetId: null,
        teamId: 'team_1',
        metadata: { query: 'first entry that exceeds limit' },
      };

      const entry2: UserOpsLogEntry = {
        timestamp: '2026-04-19T11:00:00.000Z',
        actorId: 'user_2',
        actorHandle: 'bob',
        action: 'submit',
        targetId: 'skill_1',
        teamId: 'team_1',
        metadata: {},
      };

      // First write creates the file
      await logUserOperation(config, entry1);

      // Second write should trigger rotation (entry1 > 10 bytes)
      await logUserOperation(config, entry2);

      const logFile = path.join(tempDir, '2026-04-19.log');

      // Current file should have entry2
      const currentContent = await readFile(logFile, 'utf-8');
      expect(JSON.parse(currentContent.trim())).toEqual(entry2);

      // Backup should have entry1
      const backupContent = await readFile(`${logFile}.1`, 'utf-8');
      expect(JSON.parse(backupContent.trim())).toEqual(entry1);
    });
  });
});
