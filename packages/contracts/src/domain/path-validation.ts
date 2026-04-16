import { z } from 'zod';

/**
 * Error codes for path validation failures.
 */
export enum PathValidationError {
  ABSOLUTE_PATH = 'ABSOLUTE_PATH',
  PARENT_TRAVERSAL = 'PARENT_TRAVERSAL',
  EMPTY_PATH = 'EMPTY_PATH',
  INVALID_WINDOWS_PATH = 'INVALID_WINDOWS_PATH',
}

/**
 * Validates a relative file path for security.
 *
 * Security rules (T-13-01 mitigation):
 * - Reject absolute paths (e.g., `/etc/passwd`, `C:\Windows\System32`)
 * - Reject parent traversal sequences (e.g., `../../etc/passwd`)
 * - Reject empty paths
 * - Reject Windows drive letters
 *
 * @param path - The path to validate
 * @returns The path if valid, throws error if invalid
 * @throws {Error} If path contains invalid patterns
 */
export function validateRelativePath(path: string): string {
  if (!path || path.trim().length === 0) {
    throw new Error(PathValidationError.EMPTY_PATH);
  }

  // Check for absolute paths
  if (path.startsWith('/') || path.startsWith('\\')) {
    throw new Error(PathValidationError.ABSOLUTE_PATH);
  }

  // Check for Windows drive letters (e.g., C:, D:)
  if (/^[a-zA-Z]:/.test(path)) {
    throw new Error(PathValidationError.INVALID_WINDOWS_PATH);
  }

  // Check for parent traversal
  if (path.includes('..')) {
    throw new Error(PathValidationError.PARENT_TRAVERSAL);
  }

  return path;
}

/**
 * Zod refinement for validating relative file paths.
 * Can be used in schema definitions for automatic path validation.
 */
export const relativePathRefinement = (path: string): boolean => {
  try {
    validateRelativePath(path);
    return true;
  } catch {
    return false;
  }
};

/**
 * Zod schema for canonical relative file paths.
 * Enforces security constraints at the schema boundary.
 */
export const canonicalPathSchema = z
  .string()
  .min(1)
  .max(512)
  .refine(relativePathRefinement, {
    message: 'Path must be relative, without absolute paths, parent traversal, or Windows drive letters',
  });
