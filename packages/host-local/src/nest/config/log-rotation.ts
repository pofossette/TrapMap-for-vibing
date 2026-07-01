import { appendFile, rename, stat, unlink, writeFile } from 'node:fs/promises';

export interface RotationConfig {
  maxFileSizeBytes: number;
  maxBackupFiles: number;
}

export function loadRotationConfig(): RotationConfig {
  const maxFileSizeMB = Number(process.env.LOG_MAX_FILE_SIZE_MB ?? 10);
  const maxBackupFiles = Number(process.env.LOG_MAX_BACKUP_FILES ?? 5);
  return {
    maxFileSizeBytes: maxFileSizeMB * 1024 * 1024,
    maxBackupFiles,
  };
}

async function getFileSize(filepath: string): Promise<number> {
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

async function rotateFile(filepath: string, maxBackupFiles: number): Promise<void> {
  try {
    const oldestBackup = `${filepath}.${maxBackupFiles}`;
    try {
      await unlink(oldestBackup);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error('[log-rotation] Failed to delete oldest backup:', error);
      }
    }

    for (let i = maxBackupFiles - 1; i >= 1; i--) {
      const currentBackup = `${filepath}.${i}`;
      const nextBackup = `${filepath}.${i + 1}`;

      try {
        await rename(currentBackup, nextBackup);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          console.error(`[log-rotation] Failed to rename backup ${i}:`, error);
        }
      }
    }

    try {
      await rename(filepath, `${filepath}.1`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error('[log-rotation] Failed to rename current file:', error);
        throw error;
      }
    }

    await writeFile(filepath, '', 'utf-8');
  } catch (error) {
    console.error('[log-rotation] Rotation failed:', error);
    throw error;
  }
}

export async function appendWithRotation(
  filepath: string,
  line: string,
  rotationConfig: RotationConfig,
): Promise<void> {
  const size = await getFileSize(filepath);
  if (size >= rotationConfig.maxFileSizeBytes) {
    await rotateFile(filepath, rotationConfig.maxBackupFiles);
  }
  await appendFile(filepath, line, 'utf-8');
}
