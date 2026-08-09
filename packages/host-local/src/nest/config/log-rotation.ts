
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
