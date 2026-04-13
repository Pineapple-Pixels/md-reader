import { describe, it, expect } from 'vitest';
import { isEnoent, isNotFile, queryString, parsePagination } from '../src/lib/route-helpers.js';

describe('isEnoent', () => {
  it('returns true for ENOENT errors', () => {
    const err = Object.assign(new Error('not found'), { code: 'ENOENT' });
    expect(isEnoent(err)).toBe(true);
  });

  it('returns false for other error codes', () => {
    const err = Object.assign(new Error('perm'), { code: 'EACCES' });
    expect(isEnoent(err)).toBe(false);
  });

  it('returns false for non-Error objects', () => {
    expect(isEnoent('ENOENT')).toBe(false);
    expect(isEnoent(null)).toBe(false);
    expect(isEnoent(undefined)).toBe(false);
  });
});

describe('isNotFile', () => {
  it('returns true for ENOENT', () => {
    const err = Object.assign(new Error('not found'), { code: 'ENOENT' });
    expect(isNotFile(err)).toBe(true);
  });

  it('returns true for EISDIR', () => {
    const err = Object.assign(new Error('is dir'), { code: 'EISDIR' });
    expect(isNotFile(err)).toBe(true);
  });

  it('returns false for other codes', () => {
    const err = Object.assign(new Error('perm'), { code: 'EACCES' });
    expect(isNotFile(err)).toBe(false);
  });
});

describe('queryString', () => {
  it('returns the string for valid non-empty strings', () => {
    expect(queryString('hello')).toBe('hello');
    expect(queryString('docs/file.md')).toBe('docs/file.md');
  });

  it('returns null for empty strings', () => {
    expect(queryString('')).toBeNull();
  });

  it('returns null for non-string values', () => {
    expect(queryString(undefined)).toBeNull();
    expect(queryString(null)).toBeNull();
    expect(queryString(123)).toBeNull();
    expect(queryString(['a', 'b'])).toBeNull();
    expect(queryString({ key: 'val' })).toBeNull();
  });
});

describe('parsePagination', () => {
  it('returns empty object when no params', () => {
    expect(parsePagination({})).toEqual({});
  });

  it('parses valid limit and offset', () => {
    expect(parsePagination({ limit: '10', offset: '20' })).toEqual({ limit: 10, offset: 20 });
  });

  it('ignores limit over 200', () => {
    expect(parsePagination({ limit: '999' })).toEqual({});
  });

  it('ignores non-integer limit', () => {
    expect(parsePagination({ limit: '3.5' })).toEqual({});
  });

  it('ignores negative offset', () => {
    expect(parsePagination({ offset: '-1' })).toEqual({});
  });

  it('accepts offset 0', () => {
    expect(parsePagination({ offset: '0' })).toEqual({ offset: 0 });
  });

  it('ignores non-string values', () => {
    expect(parsePagination({ limit: 10 as unknown, offset: null as unknown })).toEqual({});
  });
});
