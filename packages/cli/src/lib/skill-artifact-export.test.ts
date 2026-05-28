import { describe, expect, it } from 'vitest';
import { validateOutputPath } from './skill-artifact-export.js';

describe('validateOutputPath', () => {
  it('rejects absolute paths that escape intended directory', () => {
    expect(() => validateOutputPath('/etc/passwd', '/home/user/projects')).toThrow(
      'Path escapes intended directory',
    );
  });

  it('allows valid relative paths within intended directory', () => {
    const result = validateOutputPath('output/file.txt', '/home/user/projects');
    expect(result).toBe('/home/user/projects/output/file.txt');
  });
});
