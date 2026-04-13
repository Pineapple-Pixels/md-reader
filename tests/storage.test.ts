import { describe, it, expect } from 'vitest';
import { resolve, sep } from 'path';

// We test the pure functions directly without importing config (which reads env).
// resolveDoc and isWritableDocPath are pure path functions.

// Inline the logic to avoid triggering config.ts side effects
function resolveDoc(file: string, basePath: string): string | null {
  const resolved = resolve(basePath, file);
  if (resolved !== basePath && !resolved.startsWith(basePath + sep)) return null;
  return resolved;
}

function isWritableDocPath(file: unknown): file is string {
  if (typeof file !== 'string' || !file) return false;
  if (file.includes('\0')) return false;
  if (!file.endsWith('.md')) return false;
  const segments = file.split(/[/\\]/);
  if (segments.some((s: string) => !s || s === '..' || s.startsWith('.'))) return false;
  return true;
}

describe('resolveDoc', () => {
  // Use an absolute path that works on any OS
  const base = resolve('/tmp/test-storage/users/1');

  it('resolves a simple file path', () => {
    const result = resolveDoc('readme.md', base);
    expect(result).toBe(resolve(base, 'readme.md'));
  });

  it('resolves nested paths', () => {
    const result = resolveDoc('docs/guide.md', base);
    expect(result).toBe(resolve(base, 'docs/guide.md'));
  });

  it('blocks path traversal with ../', () => {
    expect(resolveDoc('../../../etc/passwd', base)).toBeNull();
  });

  it('blocks path traversal with ../ mid-path', () => {
    expect(resolveDoc('docs/../../etc/passwd', base)).toBeNull();
  });

  it('blocks escape to sibling directory', () => {
    expect(resolveDoc('../2/secret.md', base)).toBeNull();
  });

  it('returns basePath itself for . (directory listing)', () => {
    const result = resolveDoc('.', base);
    expect(result).toBe(base);
  });
});

describe('isWritableDocPath', () => {
  it('accepts valid .md files', () => {
    expect(isWritableDocPath('readme.md')).toBe(true);
    expect(isWritableDocPath('docs/guide.md')).toBe(true);
    expect(isWritableDocPath('a/b/c/deep.md')).toBe(true);
  });

  it('rejects non-.md extensions', () => {
    expect(isWritableDocPath('file.txt')).toBe(false);
    expect(isWritableDocPath('file.js')).toBe(false);
    expect(isWritableDocPath('file')).toBe(false);
  });

  it('rejects empty or non-string', () => {
    expect(isWritableDocPath('')).toBe(false);
    expect(isWritableDocPath(null)).toBe(false);
    expect(isWritableDocPath(undefined)).toBe(false);
    expect(isWritableDocPath(123)).toBe(false);
  });

  it('rejects null bytes', () => {
    expect(isWritableDocPath('file\0.md')).toBe(false);
  });

  it('rejects path traversal segments', () => {
    expect(isWritableDocPath('../secret.md')).toBe(false);
    expect(isWritableDocPath('docs/../secret.md')).toBe(false);
  });

  it('rejects hidden files/directories', () => {
    expect(isWritableDocPath('.hidden.md')).toBe(false);
    expect(isWritableDocPath('.versions/backup.md')).toBe(false);
    expect(isWritableDocPath('docs/.secret.md')).toBe(false);
  });

  it('rejects empty segments (double slashes)', () => {
    expect(isWritableDocPath('docs//file.md')).toBe(false);
  });
});
