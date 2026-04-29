import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  type RotationConfig,
  appendWithRotation,
  getFileSize,
  loadRotationConfig,
  rotateFile,
} from './log-rotation.js';

describe('log-rotation (Phase 22-02)', () => {
  describe('loadRotationConfig', () => {
    it('returns defaults when no env vars set', () => {
      const originalSize = process.env.LOG_MAX_FILE_SIZE_MB;
      const originalBackup = process.env.LOG_MAX_BACKUP_FILES;

      Reflect.deleteProperty(process.env, 'LOG_MAX_FILE_SIZE_MB');
      Reflect.deleteProperty(process.env, 'LOG_MAX_BACKUP_FILES');

      const config = loadRotationConfig();

      expect(config).toEqual({
        maxFileSizeBytes: 10 * 1024 * 1024, // 10MB
        maxBackupFiles: 5,
      });

      // Restore
      if (originalSize !== undefined) process.env.LOG_MAX_FILE_SIZE_MB = originalSize;
      if (originalBackup !== undefined) process.env.LOG_MAX_BACKUP_FILES = originalBackup;
    });

    it('returns custom values from env vars', () => {
      const originalSize = process.env.LOG_MAX_FILE_SIZE_MB;
      const originalBackup = process.env.LOG_MAX_BACKUP_FILES;

      process.env.LOG_MAX_FILE_SIZE_MB = '5';
      process.env.LOG_MAX_BACKUP_FILES = '3';

      const config = loadRotationConfig();

      expect(config).toEqual({
        maxFileSizeBytes: 5 * 1024 * 1024, // 5MB
        maxBackupFiles: 3,
      });

      // Restore
      if (originalSize !== undefined) {
        process.env.LOG_MAX_FILE_SIZE_MB = originalSize;
      } else {
        Reflect.deleteProperty(process.env, 'LOG_MAX_FILE_SIZE_MB');
      }
      if (originalBackup !== undefined) {
        process.env.LOG_MAX_BACKUP_FILES = originalBackup;
      } else {
        Reflect.deleteProperty(process.env, 'LOG_MAX_BACKUP_FILES');
      }
    });
  });

  describe('getFileSize', () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = path.join(
        '/tmp',
        `log-rotation-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      );
    });

    afterEach(async () => {
      await rm(tempDir, { recursive: true, force: true });
    });

    it('returns 0 for non-existent file', async () => {
      await mkdir(tempDir, { recursive: true });
      const nonExistent = path.join(tempDir, 'does-not-exist.txt');

      const size = await getFileSize(nonExistent);

      expect(size).toBe(0);
    });

    it('returns correct size for existing file', async () => {
      await mkdir(tempDir, { recursive: true });
      const testFile = path.join(tempDir, 'test.txt');
      const content = 'Hello, World!';

      await writeFile(testFile, content, 'utf-8');

      const size = await getFileSize(testFile);

      expect(size).toBe(Buffer.byteLength(content, 'utf-8'));
    });
  });

  describe('rotateFile', () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = path.join(
        '/tmp',
        `log-rotation-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      );
    });

    afterEach(async () => {
      await rm(tempDir, { recursive: true, force: true });
    });

    it('renames current file to .1 and creates new empty file', async () => {
      await mkdir(tempDir, { recursive: true });
      const logFile = path.join(tempDir, 'test.log');
      const originalContent = 'Original log content';

      await writeFile(logFile, originalContent, 'utf-8');

      await rotateFile(logFile, 5);

      // Original file should exist and be empty
      const newContent = await readFile(logFile, 'utf-8');
      expect(newContent).toBe('');

      // .1 backup should have original content
      const backup1 = await readFile(`${logFile}.1`, 'utf-8');
      expect(backup1).toBe(originalContent);
    });

    it('shifts existing backups (.1 -> .2)', async () => {
      await mkdir(tempDir, { recursive: true });
      const logFile = path.join(tempDir, 'test.log');

      // Create initial file and backups
      await writeFile(logFile, 'Current content', 'utf-8');
      await writeFile(`${logFile}.1`, 'Backup 1 content', 'utf-8');

      await rotateFile(logFile, 5);

      // .1 should now be empty (new current)
      const newCurrent = await readFile(logFile, 'utf-8');
      expect(newCurrent).toBe('');

      // .1 backup should have the old current content
      const backup1 = await readFile(`${logFile}.1`, 'utf-8');
      expect(backup1).toBe('Current content');

      // .2 backup should have the old .1 content
      const backup2 = await readFile(`${logFile}.2`, 'utf-8');
      expect(backup2).toBe('Backup 1 content');
    });

    it('deletes oldest backup when maxBackupFiles exceeded', async () => {
      await mkdir(tempDir, { recursive: true });
      const logFile = path.join(tempDir, 'test.log');
      const maxBackupFiles = 5;

      // Create initial file and 5 backups
      await writeFile(logFile, 'Current', 'utf-8');
      await writeFile(`${logFile}.1`, 'Backup 1', 'utf-8');
      await writeFile(`${logFile}.2`, 'Backup 2', 'utf-8');
      await writeFile(`${logFile}.3`, 'Backup 3', 'utf-8');
      await writeFile(`${logFile}.4`, 'Backup 4', 'utf-8');
      await writeFile(`${logFile}.5`, 'Backup 5', 'utf-8');

      await rotateFile(logFile, maxBackupFiles);

      // .6 should NOT exist (oldest deleted)
      await expect(stat(`${logFile}.6`)).rejects.toThrow();

      // .5 should now have the old .4 content
      const backup5 = await readFile(`${logFile}.5`, 'utf-8');
      expect(backup5).toBe('Backup 4');
    });
  });

  describe('appendWithRotation', () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = path.join(
        '/tmp',
        `log-rotation-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      );
    });

    afterEach(async () => {
      await rm(tempDir, { recursive: true, force: true });
    });

    it('does not rotate when file under size limit', async () => {
      await mkdir(tempDir, { recursive: true });
      const logFile = path.join(tempDir, 'test.log');

      const config: RotationConfig = {
        maxFileSizeBytes: 1024 * 1024, // 1MB
        maxBackupFiles: 5,
      };

      const line = '{"test": "data"}\n';
      await appendWithRotation(logFile, line, config);

      // File should exist with content
      const content = await readFile(logFile, 'utf-8');
      expect(content).toBe(line);

      // No .1 backup should exist
      await expect(stat(`${logFile}.1`)).rejects.toThrow();
    });

    it('rotates when file exceeds size limit', async () => {
      await mkdir(tempDir, { recursive: true });
      const logFile = path.join(tempDir, 'test.log');

      const config: RotationConfig = {
        maxFileSizeBytes: 10, // Very small for testing
        maxBackupFiles: 5,
      };

      // First write should create file
      const line1 = '{"test": "first line"}\n';
      await appendWithRotation(logFile, line1, config);

      // Second write should trigger rotation (line1 > 10 bytes)
      const line2 = '{"test": "second line"}\n';
      await appendWithRotation(logFile, line2, config);

      // .1 backup should exist with first line
      const backup1 = await readFile(`${logFile}.1`, 'utf-8');
      expect(backup1).toBe(line1);

      // Current file should have second line
      const current = await readFile(logFile, 'utf-8');
      expect(current).toBe(line2);
    });

    it('appends line after rotation', async () => {
      await mkdir(tempDir, { recursive: true });
      const logFile = path.join(tempDir, 'test.log');

      const config: RotationConfig = {
        maxFileSizeBytes: 5, // Very small
        maxBackupFiles: 5,
      };

      const line = '{"test": "data after rotation"}\n';

      // Create existing file that exceeds limit
      await writeFile(logFile, 'Existing content that exceeds 5 bytes', 'utf-8');

      await appendWithRotation(logFile, line, config);

      // Current file should have the new line
      const current = await readFile(logFile, 'utf-8');
      expect(current).toBe(line);

      // Backup should have old content
      const backup = await readFile(`${logFile}.1`, 'utf-8');
      expect(backup).toBe('Existing content that exceeds 5 bytes');
    });
  });
});
