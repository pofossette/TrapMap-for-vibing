import { appendFile, rename, stat, unlink, writeFile } from 'node:fs/promises';

/**
 * Configuration for log file rotation.
 */
export interface RotationConfig {
  maxFileSizeBytes: number;
  maxBackupFiles: number;
}

/**
 * Load rotation configuration from environment variables.
 * LOG_MAX_FILE_SIZE_MB: Maximum file size in MB before rotation (default: 10)
 * LOG_MAX_BACKUP_FILES: Maximum number of backup files to keep (default: 5)
 */
export function loadRotationConfig(): RotationConfig {
  const maxFileSizeMB = Number(process.env.LOG_MAX_FILE_SIZE_MB ?? 10);
  const maxBackupFiles = Number(process.env.LOG_MAX_BACKUP_FILES ?? 5);
  return {
    maxFileSizeBytes: maxFileSizeMB * 1024 * 1024,
    maxBackupFiles,
  };
}

/**
 * Get the size of a file in bytes.
 * Returns 0 if the file doesn't exist.
 *
 * @param filepath - Path to the file
 * @returns File size in bytes, or 0 if file doesn't exist
 */
export async function getFileSize(filepath: string): Promise<number> {
  try {
    const stats = await stat(filepath);
    return stats.size;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return 0;
    }
    throw error;
  }
}

/**
 * Rotate a log file by creating numbered backups.
 *
 * Rotation process:
 * 1. Delete the oldest backup if it exceeds maxBackupFiles
 * 2. Shift existing backups (.1 -> .2, .2 -> .3, etc.)
 * 3. Rename current file to .1
 * 4. Create new empty file
 *
 * @param filepath - Path to the log file to rotate
 * @param maxBackupFiles - Maximum number of backup files to keep
 */
export async function rotateFile(filepath: string, maxBackupFiles: number): Promise<void> {
  try {
    // Delete oldest backup if it exists
    const oldestBackup = `${filepath}.${maxBackupFiles}`;
    try {
      await unlink(oldestBackup);
    } catch (error) {
      // Ignore ENOENT - file doesn't exist
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error('[log-rotation] Failed to delete oldest backup:', error);
      }
    }

    // Shift existing backups from maxBackupFiles-1 down to 1
    for (let i = maxBackupFiles - 1; i >= 1; i--) {
      const currentBackup = `${filepath}.${i}`;
      const nextBackup = `${filepath}.${i + 1}`;

      try {
        await rename(currentBackup, nextBackup);
      } catch (error) {
        // Ignore ENOENT - backup doesn't exist
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          console.error(`[log-rotation] Failed to rename backup ${i}:`, error);
        }
      }
    }

    // Rename current file to .1
    try {
      await rename(filepath, `${filepath}.1`);
    } catch (error) {
      // Ignore ENOENT - current file doesn't exist
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error('[log-rotation] Failed to rename current file:', error);
        throw error;
      }
    }

    // Create new empty file
    await writeFile(filepath, '', 'utf-8');
  } catch (error) {
    console.error('[log-rotation] Rotation failed:', error);
    throw error;
  }
}

/**
 * Append a line to a log file with automatic rotation.
 * If the file exceeds maxFileSizeBytes, it will be rotated before appending.
 *
 * @param filepath - Path to the log file
 * @param line - Line to append (should include newline)
 * @param rotationConfig - Rotation configuration
 */
export async function appendWithRotation(
  filepath: string,
  line: string,
  rotationConfig: RotationConfig,
): Promise<void> {
  // Check current file size
  const size = await getFileSize(filepath);

  // Rotate if file exceeds size limit
  if (size >= rotationConfig.maxFileSizeBytes) {
    await rotateFile(filepath, rotationConfig.maxBackupFiles);
  }

  // Append the line
  await appendFile(filepath, line, 'utf-8');
}
