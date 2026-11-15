import { Router } from 'express';
import type { Request, Response } from 'express';
import { renderDoc, sendHtmlFrame } from '../lib/render.js';
import { sendDocx } from '../lib/docx.js';
import { docKind } from '../../shared/doc-types.js';
import { join } from 'path';
import { resolveDoc, getFiles, publicScope, ScopeError, orgDir } from '../lib/storage.js';
import { getOrgBrand, LOGO_MIME } from '../lib/design.js';
import type { OrgBrand } from '../../shared/design.js';
import type { ResolvedScope } from '../lib/storage.js';
import { getComments } from '../lib/comments.js';
import { buildTree, findMainPage, flattenTree } from '../lib/tree.js';
import { ah, statOrNull, queryString, readDocFile, NotFileError, parsePagination } from '../lib/route-helpers.js';

// Anonymous read-only API for one org's public docs, mounted at /api/public/:org.
const router = Router({ mergeParams: true });

function orgPublic(req: Request, res: Response): ResolvedScope | null {
  try {
    return publicScope(String(req.params['org'] ?? ''), undefined);
  } catch (err) {
    if (err instanceof ScopeError) {
      res.status(err.status).json({ error: err.message });
      return null;
    }
    throw err;
  }
}

// Brand and document design of the org (needed to render even anonymous public docs).
router.get('/design', ah(async (req, res) => {
  const scope = orgPublic(req, res);
  if (!scope) return;
  const slug = String(req.params['org']).toLowerCase();
  const brand = await getOrgBrand(slug);
  if (!brand) return res.status(404).json({ error: 'Organizacion no encontrada' });
  const body: OrgBrand = {
    name: brand.name,
    design: brand.design,
    logoUrl: brand.logo ? `/api/public/${slug}/logo?v=${encodeURIComponent(brand.logo)}` : null,
  };
  res.json(body);
}));

router.get('/logo', ah(async (req, res) => {
  const scope = orgPublic(req, res);
  if (!scope) return;
  const slug = String(req.params['org']).toLowerCase();
  const brand = await getOrgBrand(slug);
  const ext = brand?.logo?.split('.').pop();
  if (!brand?.logo || !ext || !(ext in LOGO_MIME)) return res.status(404).json({ error: 'Sin logo' });
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.sendFile(join(orgDir(slug), 'brand', brand.logo), {
    headers: { 'Content-Type': LOGO_MIME[ext as keyof typeof LOGO_MIME], 'Cache-Control': 'public, max-age=86400' },
  });
}));

// List public docs
router.get('/docs', ah(async (req, res) => {
  const scope = orgPublic(req, res);
  if (!scope) return;
  const files = await getFiles(scope.basePath);
  res.json(files);
}));

// Render a public doc
router.get('/render', ah(async (req, res) => {
  const scope = orgPublic(req, res);
  if (!scope) return;
  const file = queryString(req.query['file']);
  if (!file) return res.status(400).json({ error: 'file es requerido' });
  const filePath = resolveDoc(file, scope.basePath);
  if (!filePath) return res.status(400).json({ error: 'Ruta invalida' });
  let content: string;
  try { content = await readDocFile(filePath); }
  catch (err) {
    if (err instanceof NotFileError) return res.status(404).json({ error: 'No encontrado' });
    throw err;
  }
  const { kind, html } = renderDoc(file, content);
  const { data: comments, total: commentCount } = await getComments(scope.id, file);
  res.json({ kind, html, comments, commentCount });
}));

router.get('/export/docx', ah(async (req, res) => {
  const scope = orgPublic(req, res);
  if (!scope) return;
  await sendDocx(res, scope, queryString(req.query['file']));
}));

// Raw HTML document, isolated by a CSP sandbox (shown by the client inside an iframe).
router.get('/frame', ah(async (req, res) => {
  const scope = orgPublic(req, res);
  if (!scope) return;
  const file = queryString(req.query['file']);
  if (!file || docKind(file) !== 'html') return res.status(400).json({ error: 'Solo documentos .html' });
  const filePath = resolveDoc(file, scope.basePath);
  if (!filePath) return res.status(400).json({ error: 'Ruta invalida' });
  try { sendHtmlFrame(res, await readDocFile(filePath)); }
  catch (err) {
    if (err instanceof NotFileError) return res.status(404).json({ error: 'No encontrado' });
    throw err;
  }
}));

// Project data (tree + initial page)
router.get('/project', ah(async (req, res) => {
  const scope = orgPublic(req, res);
  if (!scope) return;
  const folder = queryString(req.query['folder']);
  if (!folder) return res.status(400).json({ error: 'folder es requerido' });
  const folderPath = resolveDoc(folder, scope.basePath);
  if (!folderPath) return res.status(400).json({ error: 'Ruta invalida' });
  const stats = await statOrNull(folderPath);
  if (!stats || !stats.isDirectory()) return res.status(404).json({ error: 'No encontrado' });

  const tree = await buildTree(folderPath, folder);
  const mainPage = findMainPage(tree, folder);
  if (!mainPage) return res.status(404).json({ error: 'No encontrado' });

  const activeFilePath = resolveDoc(mainPage, scope.basePath);
  if (!activeFilePath) return res.status(400).json({ error: 'Ruta invalida' });
  let content: string;
  try { content = await readDocFile(activeFilePath); }
  catch (err) {
    if (err instanceof NotFileError) return res.status(404).json({ error: 'No encontrado' });
    throw err;
  }
  const { kind, html } = renderDoc(mainPage, content);
  const allPages = flattenTree(tree);

  res.json({ tree, kind, html, currentFile: mainPage, allPages });
}));

// Pull raw content of a public doc
router.get('/pull', ah(async (req, res) => {
  const scope = orgPublic(req, res);
  if (!scope) return;
  const file = queryString(req.query['file']);
  if (!file) return res.status(400).json({ error: 'file es requerido' });
  const filePath = resolveDoc(file, scope.basePath);
  if (!filePath) return res.status(400).json({ error: 'Ruta invalida' });
  let content: string;
  try { content = await readDocFile(filePath); }
  catch (err) {
    if (err instanceof NotFileError) return res.status(404).json({ error: 'No encontrado' });
    throw err;
  }
  res.json({ file, content });
}));

// Get comments for a public doc (lectura anonima OK — escribir requiere login
// y va por POST /api/comments?scope=public con cookie).
router.get('/comments', ah(async (req, res) => {
  const scope = orgPublic(req, res);
  if (!scope) return;
  const file = queryString(req.query['file']);
  if (!file) return res.status(400).json({ error: 'file es requerido' });
  const pg = parsePagination(req.query as Record<string, unknown>);
  const { data, total } = await getComments(scope.id, file, pg);
  res.json({ data, total, limit: pg.limit ?? total, offset: pg.offset ?? 0 });
}));

// Render project page
router.get('/project/render', ah(async (req, res) => {
  const scope = orgPublic(req, res);
  if (!scope) return;
  const folder = queryString(req.query['folder']);
  const page = queryString(req.query['page']);
  if (!folder || !page) return res.status(400).json({ error: 'folder y page son requeridos' });
  const filePath = resolveDoc(page, scope.basePath);
  if (!filePath) return res.status(400).json({ error: 'Ruta invalida' });
  let content: string;
  try { content = await readDocFile(filePath); }
  catch (err) {
    if (err instanceof NotFileError) return res.status(404).json({ error: 'No encontrado' });
    throw err;
  }
  const { kind, html } = renderDoc(page, content);
  res.json({ kind, html, file: page });
}));

export default router;
