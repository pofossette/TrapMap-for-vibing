import type { ArtifactReadProjection, SkillArtifact } from '@trapmap/contracts';
import type { ArtifactWritePort } from './artifact-ports.js';

export interface ArtifactMigrationError {
  artifactId: string;
  error: string;
}

export interface ArtifactMigrationResult {
  totalArtifacts: number;
  migrated: number;
  skipped: number;
  verified: number;
  errors: ArtifactMigrationError[];
  durationMs: number;
}

export interface Wave9ArtifactBackfillConfig {
  artifacts: readonly SkillArtifact[];
  artifactWriter: ArtifactWritePort;
  artifactReadProjection: ArtifactReadProjection;
  dryRun?: boolean;
  onProgress?: (info: { processed: number; total: number; artifactId: string }) => void;
}

export async function migrateSkillArtifacts(
  config: Wave9ArtifactBackfillConfig,
): Promise<ArtifactMigrationResult> {
  const startedAt = Date.now();
  const result: ArtifactMigrationResult = {
    totalArtifacts: config.artifacts.length,
    migrated: 0,
    skipped: 0,
    verified: 0,
    errors: [],
    durationMs: 0,
  };

  for (const [index, artifact] of config.artifacts.entries()) {
    try {
      if (config.dryRun) {
        result.skipped += 1;
      } else {
        const existing = await config.artifactReadProjection.getById(artifact.id);
        if (existing) {
          if (JSON.stringify(existing) !== JSON.stringify(artifact)) {
            result.errors.push({
              artifactId: artifact.id,
              error: 'destination artifact differs from snapshot',
            });
            continue;
          }
          result.skipped += 1;
          result.verified += 1;
        } else {
          await config.artifactWriter.insert(artifact);
          result.migrated += 1;
          const written = await config.artifactReadProjection.getById(artifact.id);
          if (written && JSON.stringify(written) === JSON.stringify(artifact)) {
            result.verified += 1;
          } else {
            result.errors.push({
              artifactId: artifact.id,
              error: 'destination artifact differs from snapshot after write',
            });
          }
        }
      }
    } catch (error) {
      result.errors.push({
        artifactId: artifact.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    config.onProgress?.({
      processed: index + 1,
      total: result.totalArtifacts,
      artifactId: artifact.id,
    });
  }

  result.durationMs = Date.now() - startedAt;
  return result;
}
