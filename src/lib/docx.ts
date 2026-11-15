import { Document, Packer } from 'docx';
import { htmlToContent } from 'docx/html';
import type { Response } from 'express';
import { DEFAULT_DESIGN, fontById, type OrgDesign } from '../../shared/design.js';
import { isMarkdownKind, stripDocExt } from '../../shared/doc-types.js';
import { getOrgBrand } from './design.js';
import { renderDoc } from './render.js';
import { readDocFile, NotFileError } from './route-helpers.js';
import { resolveDoc, type ResolvedScope } from './storage.js';

/** Sends an md/mdx doc of the scope as a .docx download. */
export async function sendDocx(res: Response, scope: ResolvedScope, file: string | null): Promise<void> {
  if (!file || !isMarkdownKind(file)) {
    res.status(400).json({ error: 'Solo documentos .md o .mdx' });
    return;
  }
  const filePath = resolveDoc(file, scope.basePath);
  if (!filePath) {
    res.status(400).json({ error: 'Ruta invalida' });
    return;
  }
  let content: string;
  try { content = await readDocFile(filePath); }
  catch (err) {
    if (err instanceof NotFileError) {
      res.status(404).json({ error: 'Archivo no encontrado' });
      return;
    }
    throw err;
  }
  const brand = await getOrgBrand(scope.id.split('/')[0]!);
  const name = stripDocExt(file.split('/').pop() ?? 'documento');
  const buf = await htmlToDocx(renderDoc(file, content).html, brand?.design ?? DEFAULT_DESIGN, name);
  const safe = name.replace(/[^a-zA-Z0-9._-]/g, '') || 'documento';
  res.setHeader('Content-Disposition', `attachment; filename="${safe}.docx"; filename*=UTF-8''${encodeURIComponent(name)}.docx`);
  res.type('application/vnd.openxmlformats-officedocument.wordprocessingml.document').send(buf);
}

/** Word document from rendered md/mdx HTML, styled with the org's document design. */
export async function htmlToDocx(html: string, design: OrgDesign, title: string): Promise<Buffer> {
  const c = design.colors;
  const body = fontById(design.fonts.body).label;
  const heading = fontById(design.fonts.heading).label;
  const mono = fontById(design.fonts.mono).label;
  const stylesheet = `
    body { font-family: '${body}'; color: ${c.text}; }
    h1, h2, h3, h4, h5, h6 { font-family: '${heading}'; color: ${c.heading}; }
    a { color: ${c.link}; }
    blockquote { color: ${c.quote}; border-left: 3px solid ${c.quote}; padding-left: 12px; }
    code, pre { font-family: '${mono}'; background: ${c.codeBg}; }
    th { background: ${c.tableHead}; }
    td, th { border: 1px solid ${c.border}; }
  `;
  const doc = new Document({ title, sections: [{ children: [...htmlToContent(html, { stylesheet })] }] });
  return Packer.toBuffer(doc);
}
