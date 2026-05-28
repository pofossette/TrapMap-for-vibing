import { describe, expect, it } from 'vitest';
import { decodeFileContent, validateBundleFilePath, validateOutputPath } from './skill-artifact-export.js';

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

describe('validateBundleFilePath', () => {
  it('allows file..txt (double dot not as segment)', () => {
    expect(() => validateBundleFilePath('file..txt')).not.toThrow();
  });

  it('rejects foo/../bar (traversal segment)', () => {
    expect(() => validateBundleFilePath('foo/../bar')).toThrow();
  });

  it('rejects paths with null bytes', () => {
    expect(() => validateBundleFilePath('foo\0bar')).toThrow();
  });

  it('rejects absolute paths', () => {
    expect(() => validateBundleFilePath('/etc/passwd')).toThrow();
  });

  it('allows normal relative paths', () => {
    const result = validateBundleFilePath('foo/bar.txt');
    expect(result).toBe('foo/bar.txt');
  });
});

describe('decodeFileContent', () => {
  it('decodes base64 without padding', () => {
    const result = decodeFileContent('SGVsbG8');
    expect(result.toString('utf8')).toBe('Hello');
  });

  it('decodes base64 with padding', () => {
    const result = decodeFileContent('SGVsbG8=');
    expect(result.toString('utf8')).toBe('Hello');
  });

  it('treats non-base64 content as UTF-8 text', () => {
    const result = decodeFileContent('Hello World!');
    expect(result.toString('utf8')).toBe('Hello World!');
  });
});
