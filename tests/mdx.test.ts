import { describe, it, expect } from 'vitest';
import { mdxToMarkdown } from '../src/lib/mdx.js';
import { renderDoc, HTML_FRAME_CSP } from '../src/lib/render.js';

const SRC = [
  "import Tabs from './Tabs'",
  'import {',
  '  A,',
  '  B,',
  "} from 'x'",
  'export const meta = {',
  "  title: 'Hola',",
  '}',
  '',
  '# Titulo',
  '',
  '{/* nota interna */}',
  '<div className="aviso">Texto</div>',
  '',
  '```js',
  "import nada from 'codigo'",
  '{/* se ve en el codigo */}',
  '```',
  '{/* varias',
  'lineas */} despues',
].join('\n');

describe('mdxToMarkdown', () => {
  it('should keep the line count so comments stay on their lines', () => {
    // Act
    const out = mdxToMarkdown(SRC);

    // Assert
    expect(out.split('\n')).toHaveLength(SRC.split('\n').length);
    expect(out.split('\n')[9]).toBe('# Titulo');
  });

  it('should blank imports and exports, including multi-line ones', () => {
    const out = mdxToMarkdown(SRC).split('\n');

    expect(out.slice(0, 8).every((l) => l === '')).toBe(true);
  });

  it('should drop JSX comments and turn className into class outside code fences', () => {
    const out = mdxToMarkdown(SRC).split('\n');

    expect(out[11]).toBe('');
    expect(out[12]).toBe('<div class="aviso">Texto</div>');
    expect(out[18]).toBe('');
    expect(out[19]).toBe(' despues');
  });

  it('should leave code fences untouched', () => {
    const out = mdxToMarkdown(SRC).split('\n');

    expect(out[15]).toBe("import nada from 'codigo'");
    expect(out[16]).toBe('{/* se ve en el codigo */}');
  });
});

describe('renderDoc', () => {
  it('should render mdx with HTML and source lines, and never inline html documents', () => {
    // Act
    const mdx = renderDoc('a/doc.mdx', '# Hola\n\n<span class="x">hi</span>\n');
    const html = renderDoc('a/doc.html', '<script>alert(1)</script>');

    // Assert
    expect(mdx.kind).toBe('mdx');
    expect(mdx.html).toContain('data-source-line="1"');
    expect(mdx.html).toContain('<span class="x">hi</span>');
    expect(html).toEqual({ kind: 'html', html: '' });
  });

  it('should keep raw HTML escaped in plain markdown', () => {
    expect(renderDoc('doc.md', '<b>x</b>').html).toContain('&lt;b&gt;');
  });
});

describe('HTML_FRAME_CSP', () => {
  it('should sandbox HTML documents into an opaque origin without forms or top navigation', () => {
    expect(HTML_FRAME_CSP.startsWith('sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox;')).toBe(true);
    expect(HTML_FRAME_CSP).not.toMatch(/allow-same-origin|allow-forms|allow-top-navigation/);
    expect(HTML_FRAME_CSP).toContain("frame-ancestors 'self'");
  });
});
