import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../src/nest/config/config.js';

const EXPERIENCE_GENE_MODE = 'TRAPMAP_EXPERIENCE_GENE_MODE';
const EXPERIENCE_GENES_MODE = 'TRAPMAP_EXPERIENCE_GENES_MODE';

describe('host-local configuration', () => {
  afterEach(() => {
    delete process.env[EXPERIENCE_GENE_MODE];
    delete process.env[EXPERIENCE_GENES_MODE];
  });

  it('defaults Experience Gene rollout to off and rejects unknown modes safely', () => {
    delete process.env[EXPERIENCE_GENE_MODE];
    expect(loadConfig().experienceGeneMode).toBe('off');

    process.env[EXPERIENCE_GENE_MODE] = 'unexpected';
    expect(loadConfig().experienceGeneMode).toBe('off');

    process.env[EXPERIENCE_GENE_MODE] = 'shadow';
    expect(loadConfig().experienceGeneMode).toBe('shadow');
  });

  it('defaults Experience Gene retrieval rollout to off', () => {
    delete process.env[EXPERIENCE_GENES_MODE];
    expect(loadConfig().experienceGenesMode).toBe('off');

    process.env[EXPERIENCE_GENES_MODE] = 'serve';
    expect(loadConfig().experienceGenesMode).toBe('serve');
  });
});

// Keep in sync with NON_PREFIXED_ENV_ALIASES in
// packages/host-local/src/nest/config/config.ts (flattened [oldName, aliasName] pairs).
// Hand-written (not imported) to avoid coupling the test to the module's export surface.
const NON_PREFIXED_ALIAS_KEYS = [
  'LOG_RAG_ENABLED',
  'TRAPMAP_LOG_RAG_ENABLED',
  'LOG_RAG_DIR',
  'TRAPMAP_LOG_RAG_DIR',
  'LOG_USER_OPS_ENABLED',
  'TRAPMAP_LOG_USER_OPS_ENABLED',
  'LOG_USER_OPS_DIR',
  'TRAPMAP_LOG_USER_OPS_DIR',
  'LOG_MAX_FILE_SIZE_MB',
  'TRAPMAP_LOG_MAX_FILE_SIZE_MB',
  'LOG_MAX_BACKUP_FILES',
  'TRAPMAP_LOG_MAX_BACKUP_FILES',
  'LANGFUSE_ENABLED',
  'TRAPMAP_LANGFUSE_ENABLED',
  'LANGFUSE_BASE_URL',
  'TRAPMAP_LANGFUSE_BASE_URL',
  'LANGFUSE_PUBLIC_KEY',
  'TRAPMAP_LANGFUSE_PUBLIC_KEY',
  'LANGFUSE_SECRET_KEY',
  'TRAPMAP_LANGFUSE_SECRET_KEY',
  'LANGFUSE_FLUSH_TIMEOUT_MS',
  'TRAPMAP_LANGFUSE_FLUSH_TIMEOUT_MS',
  'LANGFUSE_PRIVACY_MODE',
  'TRAPMAP_LANGFUSE_PRIVACY_MODE',
  'SENTRY_DSN',
  'TRAPMAP_SENTRY_DSN',
  'SENTRY_ENVIRONMENT',
  'TRAPMAP_SENTRY_ENVIRONMENT',
  'SENTRY_RELEASE',
  'TRAPMAP_SENTRY_RELEASE',
  'SENTRY_TRACES_SAMPLE_RATE',
  'TRAPMAP_SENTRY_TRACES_SAMPLE_RATE',
  'SENTRY_SAMPLE_RATE',
  'TRAPMAP_SENTRY_SAMPLE_RATE',
  'SENTRY_MAX_BREADCRUMBS',
  'TRAPMAP_SENTRY_MAX_BREADCRUMBS',
];

describe('TRAPMAP_ aliases for non-prefixed env vars (old name wins)', () => {
  let envSnapshot: Record<string, string | undefined> = {};

  beforeEach(() => {
    envSnapshot = {};
    for (const key of NON_PREFIXED_ALIAS_KEYS) {
      envSnapshot[key] = process.env[key];
    }
  });

  afterEach(() => {
    for (const key of NON_PREFIXED_ALIAS_KEYS) {
      const original = envSnapshot[key];
      if (original === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = original;
      }
    }
  });

  it('prefers the old LOG_* names when both old and alias are set', () => {
    process.env.LOG_RAG_ENABLED = 'false';
    process.env.TRAPMAP_LOG_RAG_ENABLED = 'true';
    process.env.LOG_RAG_DIR = 'logs/old';
    process.env.TRAPMAP_LOG_RAG_DIR = 'logs/alias';
    process.env.LOG_USER_OPS_ENABLED = 'false';
    process.env.TRAPMAP_LOG_USER_OPS_ENABLED = 'true';
    process.env.LOG_USER_OPS_DIR = 'logs/user-ops-old';
    process.env.TRAPMAP_LOG_USER_OPS_DIR = 'logs/user-ops-alias';
    process.env.LOG_MAX_FILE_SIZE_MB = '10';
    process.env.TRAPMAP_LOG_MAX_FILE_SIZE_MB = '20';
    process.env.LOG_MAX_BACKUP_FILES = '3';
    process.env.TRAPMAP_LOG_MAX_BACKUP_FILES = '7';

    const config = loadConfig();

    expect(config.ragLog.enabled).toBe(false);
    expect(config.ragLog.logDir).toBe('logs/old');
    expect(config.userOpsLog.enabled).toBe(false);
    expect(config.userOpsLog.logDir).toBe('logs/user-ops-old');
    expect(config.ragLog.maxFileSizeBytes).toBe(10 * 1024 * 1024);
    expect(config.ragLog.maxBackupFiles).toBe(3);
    expect(config.userOpsLog.maxBackupFiles).toBe(3);
  });

  it('falls back to TRAPMAP_LOG_* aliases when old names are unset', () => {
    process.env.TRAPMAP_LOG_RAG_ENABLED = 'true';
    process.env.TRAPMAP_LOG_RAG_DIR = 'logs/alias';
    process.env.TRAPMAP_LOG_USER_OPS_ENABLED = 'true';
    process.env.TRAPMAP_LOG_USER_OPS_DIR = 'logs/user-ops-alias';
    process.env.TRAPMAP_LOG_MAX_FILE_SIZE_MB = '20';
    process.env.TRAPMAP_LOG_MAX_BACKUP_FILES = '7';

    const config = loadConfig();

    expect(config.ragLog.enabled).toBe(true);
    expect(config.ragLog.logDir).toBe('logs/alias');
    expect(config.userOpsLog.enabled).toBe(true);
    expect(config.userOpsLog.logDir).toBe('logs/user-ops-alias');
    expect(config.ragLog.maxFileSizeBytes).toBe(20 * 1024 * 1024);
    expect(config.ragLog.maxBackupFiles).toBe(7);
    expect(config.userOpsLog.maxBackupFiles).toBe(7);
  });

  it('keeps LOG_* defaults when neither old nor alias is set', () => {
    const config = loadConfig();

    expect(config.ragLog.enabled).toBe(false);
    expect(config.ragLog.logDir).toBe('logs/rag');
    expect(config.userOpsLog.enabled).toBe(false);
    expect(config.ragLog.maxFileSizeBytes).toBe(10 * 1024 * 1024);
  });

  it('backfills SENTRY_/LANGFUSE_ from aliases only when old names are unset', () => {
    process.env.TRAPMAP_SENTRY_DSN = 'https://alias-dsn';
    process.env.TRAPMAP_LANGFUSE_BASE_URL = 'https://alias-langfuse';

    loadConfig();

    expect(process.env.SENTRY_DSN).toBe('https://alias-dsn');
    expect(process.env.LANGFUSE_BASE_URL).toBe('https://alias-langfuse');
  });

  it('never overrides old SENTRY_/LANGFUSE_ names with aliases', () => {
    process.env.SENTRY_DSN = 'https://old-dsn';
    process.env.TRAPMAP_SENTRY_DSN = 'https://alias-dsn';
    process.env.LANGFUSE_BASE_URL = 'https://old-langfuse';
    process.env.TRAPMAP_LANGFUSE_BASE_URL = 'https://alias-langfuse';

    loadConfig();

    expect(process.env.SENTRY_DSN).toBe('https://old-dsn');
    expect(process.env.LANGFUSE_BASE_URL).toBe('https://old-langfuse');
  });

  it('leaves SENTRY_/LANGFUSE_ untouched when neither old nor alias is set', () => {
    loadConfig();

    expect(process.env.SENTRY_DSN).toBeUndefined();
    expect(process.env.LANGFUSE_BASE_URL).toBeUndefined();
  });
});
