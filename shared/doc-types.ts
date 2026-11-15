export const DOC_EXTS = ['.md', '.mdx', '.html'] as const;
export type DocKind = 'md' | 'mdx' | 'html';

const EXT_RE = /\.(md|mdx|html)$/i;

/** Kind of a document path, or null when the extension is not a document. */
export function docKind(file: string): DocKind | null {
  const m = EXT_RE.exec(file);
  return m ? (m[1]!.toLowerCase() as DocKind) : null;
}

export function isDocFile(file: string): boolean {
  return EXT_RE.test(file);
}

export function stripDocExt(file: string): string {
  return file.replace(EXT_RE, '');
}

/** Markdown-like documents: rendered on the sheet, exportable to PDF and Word. */
export function isMarkdownKind(file: string): boolean {
  const k = docKind(file);
  return k === 'md' || k === 'mdx';
}
