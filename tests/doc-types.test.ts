import { describe, it, expect } from 'vitest';
import { kindSummary } from '../shared/doc-types.js';

describe('kindSummary', () => {
  it('should count each kind in md, mdx, html order when a folder mixes them', () => {
    // Arrange
    const files = ['b.html', 'a.md', 'sub/c.md', 'd.mdx', 'e.html', 'notes.txt'];

    // Act
    const summary = kindSummary(files);

    // Assert
    expect(summary).toBe('2 MD · 1 MDX · 2 HTML');
  });

  it('should return an empty string when no file is a document', () => {
    expect(kindSummary(['notes.txt'])).toBe('');
  });
});
