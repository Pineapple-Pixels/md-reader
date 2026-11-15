import MarkdownIt from 'markdown-it';
import type { Response } from 'express';
import { md } from './config.js';
import { mdxToMarkdown } from './mdx.js';
import { sourceLinePlugin } from './md-source-lines.js';
import { docKind, type DocKind } from '../../shared/doc-types.js';

// MDX may carry raw HTML; every client view sanitizes it with DOMPurify before inserting it.
const mdxRenderer = new MarkdownIt({ html: true, linkify: true, typographer: true });
mdxRenderer.use(sourceLinePlugin);

/** Renders md/mdx to HTML. HTML documents are never inlined: they go through `sendHtmlFrame`. */
export function renderDoc(file: string, content: string): { kind: DocKind; html: string } {
  const kind = docKind(file) ?? 'md';
  if (kind === 'html') return { kind, html: '' };
  if (kind === 'mdx') return { kind, html: mdxRenderer.render(mdxToMarkdown(content)) };
  return { kind, html: md.render(content) };
}

/**
 * The CSP `sandbox` directive gives the page an opaque origin even when opened directly,
 * so its scripts can neither read the app's cookies nor call the API as the viewer.
 */
export const HTML_FRAME_CSP = [
  'sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox',
  "default-src 'none'",
  "script-src 'unsafe-inline' https:",
  "style-src 'unsafe-inline' https:",
  'img-src data: https:',
  'font-src data: https:',
  'media-src data: https:',
  'connect-src https:',
  "form-action 'none'",
  "base-uri 'none'",
  "frame-ancestors 'self'",
].join('; ');

export function sendHtmlFrame(res: Response, content: string): void {
  res.setHeader('Content-Security-Policy', HTML_FRAME_CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');
  res.type('html').send(content);
}
