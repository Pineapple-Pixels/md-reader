import { Router } from 'express';
import type { Response } from 'express';
import { readFile, writeFile, unlink, rm } from 'fs/promises';
import { dirname } from 'path';
import archiver from 'archiver';
import { z } from 'zod';
import { md } from '../lib/config.js';
import {
  resolveDoc,
  getFiles,
  ensureDir,
  saveVersion,
  isWritableDocPath,
  resolveScope,
  ScopeError,
} from '../lib/storage.js';
import type { ResolvedScope } from '../lib/storage.js';
import {
  getComments,
  addComment,
  deleteComment,
  deleteAllComments,
} from '../lib/comments.js';
import { requireAuth } from '../lib/auth.js';
import { getSearchIndex, invalidateSearchIndex } from '../lib/search-index.js';
import { buildTree, findMainPage, flattenTree } from '../lib/tree.js';
import { ah, statOrNull, isEnoent, isNotFile, queryString } from '../lib/route-helpers.js';

const router = Router();

// Limits on user-provided comment fields
const COMMENT_TEXT_MAX = 2000;
const COMMENT_AUTHOR_MAX = 100;

// ----- Body schemas (zod) -----
// El scope viaja siempre como query param (no body) para mantener semantica REST
// uniforme entre GET y POST. Los bodies solo cargan datos del doc.
const FileContentBody = z.object({
  file: z.string().min(1),
  content: z.string(),
});

const FileBody = z.object({
  file: z.string().min(1),
});

const CommentBody = z.object({
  file: z.string().min(1),
  text: z.string().trim().min(1).max(COMMENT_TEXT_MAX),
  // `null`, `undefined` o `""` → sin linea; entero positivo si viene
  line: z
    .union([z.number().int().positive(), z.string(), z.null()])
    .optional()
    .transform((v) => {
      if (v === null || v === undefined || v === '') return null;
      const n = typeof v === 'number' ? v : Number(v);
      return Number.isInteger(n) && n >= 1 ? n : NaN;
    })
    .refine((v) => v === null || Number.isInteger(v), {
      message: 'line debe ser un entero positivo',
    }),
  author: z
    .string()
    .optional()
    .transform((v) => {
      if (v === undefined || v === null) return 'Anonimo';
      const trimmed = v.trim().slice(0, COMMENT_AUTHOR_MAX);
      return trimmed || 'Anonimo';
    }),
});

const CommentDeleteBody = z.object({
  file: z.string().min(1),
  id: z.string().min(1),
});

// All private API routes require cookie auth.
router.use(requireAuth);

// Helper: resuelve el scope del query o manda el error HTTP apropiado.
// Retorna null si falla para que el handler pueda hacer `if (!scope) return;`.
function getScope(req: import('express').Request, res: Response): ResolvedScope | null {
  try {
    return resolveScope(queryString(req.query['scope']), req.user);
  } catch (err) {
    if (err instanceof ScopeError) {
      res.status(err.status).json({ error: err.message });
      return null;
    }
    throw err;
  }
}

// Guard de escritura — usar despues de getScope.
function assertWritable(scope: ResolvedScope, res: Response): boolean {
  if (!scope.canWrite) {
    res.status(403).json({ error: 'No tenes permiso de escritura en este scope' });
    return false;
  }
  return true;
}

// Search index
router.get('/search-index', ah(async (req, res) => {
  const scope = getScope(req, res);
  if (!scope) return;
  const index = await getSearchIndex(scope.id, scope.basePath);
  res.json(index);
}));

// List all docs
router.get('/docs', ah(async (req, res) => {
  const scope = getScope(req, res);
  if (!scope) return;
  const files = await getFiles(scope.basePath);
  res.json(files);
}));

// Render a single doc to HTML
router.get('/render', ah(async (req, res) => {
  const scope = getScope(req, res);
  if (!scope) return;
  const file = queryString(req.query['file']);
  if (!file) return res.status(400).json({ error: 'file es requerido' });
  const filePath = resolveDoc(file, scope.basePath);
  if (!filePath) return res.status(400).json({ error: 'Ruta invalida' });
  let content: string;
  try { content = await readFile(filePath, 'utf-8'); }
  catch (err) {
    if (isNotFile(err)) {
      return res.status(404).json({ error: 'Archivo no encontrado' });
    }
    throw err;
  }
  const html = md.render(content);
  const comments = await getComments(scope.id, file);
  res.json({ html, comments, commentCount: comments.length, canWrite: scope.canWrite, canComment: scope.canComment });
}));

// Download doc (file) or project (folder → .zip with all .md files)
router.get('/download', ah(async (req, res) => {
  const scope = getScope(req, res);
  if (!scope) return;
  const file = queryString(req.query['file']);
  if (!file) return res.status(400).json({ error: 'file es requerido' });
  const filePath = resolveDoc(file, scope.basePath);
  if (!filePath) return res.status(400).json({ error: 'Ruta invalida' });
  const stats = await statOrNull(filePath);
  if (!stats) return res.status(404).json({ error: 'Archivo no encontrado' });

  // Folder → stream a zip with all .md files preserving structure.
  if (stats.isDirectory()) {
    const rawFolder = file.replace(/[/\\]+$/, '').split(/[/\\]/).pop() ?? 'project';
    const safeFolder = rawFolder.replace(/[^a-zA-Z0-9._-]/g, '') || 'project';
    res.setHeader('Content-Disposition', `attachment; filename="${safeFolder}.zip"`);
    res.type('application/zip');

    const archive = archiver('zip', { zlib: { level: 9 } });
    // If archiver fails mid-stream the response is already partially sent;
    // destroy the socket so the client sees a broken download instead of a
    // silently truncated zip, and log for diagnosis.
    archive.on('error', (err) => {
      console.error('[download] archive error:', err);
      res.destroy(err);
    });
    archive.pipe(res);
    archive.glob('**/*.md', { cwd: filePath, dot: false }, { prefix: safeFolder });
    await archive.finalize();
    return;
  }

  // Single file → markdown download.
  let content: string;
  try { content = await readFile(filePath, 'utf-8'); }
  catch (err) {
    if (isEnoent(err)) return res.status(404).json({ error: 'Archivo no encontrado' });
    throw err;
  }
  const rawName = file.split('/').pop();
  const safeName = (rawName ?? '').replace(/[^a-zA-Z0-9._-]/g, '') || 'document.md';
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
  res.type('text/markdown').send(content);
}));

// Upload/push doc (crear o sobrescribir — usa versionado como backup)
router.post('/push', ah(async (req, res) => {
  const scope = getScope(req, res);
  if (!scope) return;
  if (!assertWritable(scope, res)) return;
  const parsed = FileContentBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'file y content son requeridos' });
  const { file, content } = parsed.data;
  if (!isWritableDocPath(file)) return res.status(400).json({ error: 'Ruta invalida' });
  const filePath = resolveDoc(file, scope.basePath);
  if (!filePath) return res.status(400).json({ error: 'Ruta invalida' });
  await ensureDir(dirname(filePath));
  // Best-effort version backup — missing previous file is fine.
  try {
    const old = await readFile(filePath, 'utf-8');
    await saveVersion(filePath, old, scope.basePath);
  } catch (err) {
    if (!isEnoent(err)) throw err;
  }
  await writeFile(filePath, content);
  invalidateSearchIndex(scope.id);
  res.json({ ok: true });
}));

// Save doc (with version backup)
router.post('/save', ah(async (req, res) => {
  const scope = getScope(req, res);
  if (!scope) return;
  if (!assertWritable(scope, res)) return;
  const parsed = FileContentBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'file y content son requeridos' });
  const { file, content } = parsed.data;
  if (!isWritableDocPath(file)) return res.status(400).json({ error: 'Ruta invalida' });
  const filePath = resolveDoc(file, scope.basePath);
  if (!filePath) return res.status(400).json({ error: 'Ruta invalida' });
  try {
    const old = await readFile(filePath, 'utf-8');
    await saveVersion(filePath, old, scope.basePath);
  } catch (err) {
    if (!isEnoent(err)) throw err;
  }
  await writeFile(filePath, content);
  invalidateSearchIndex(scope.id);
  res.json({ ok: true });
}));

// Pull doc (raw content)
router.get('/pull', ah(async (req, res) => {
  const scope = getScope(req, res);
  if (!scope) return;
  const file = queryString(req.query['file']);
  if (!file) return res.status(400).json({ error: 'file es requerido' });
  const filePath = resolveDoc(file, scope.basePath);
  if (!filePath) return res.status(400).json({ error: 'Ruta invalida' });
  let content: string;
  try { content = await readFile(filePath, 'utf-8'); }
  catch (err) {
    if (isNotFile(err)) {
      return res.status(404).json({ error: 'Archivo no encontrado' });
    }
    throw err;
  }
  res.json({ file, content });
}));

// Delete doc or folder
router.delete('/delete', ah(async (req, res) => {
  const scope = getScope(req, res);
  if (!scope) return;
  if (!assertWritable(scope, res)) return;
  const parsed = FileBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'file es requerido' });
  const { file } = parsed.data;
  const filePath = resolveDoc(file, scope.basePath);
  if (!filePath) return res.status(400).json({ error: 'Ruta invalida' });
  // stat instead of existsSync closes the TOCTOU window for the type check.
  const stats = await statOrNull(filePath);
  if (!stats) return res.status(404).json({ error: 'Archivo no encontrado' });
  if (stats.isDirectory()) {
    // getFiles returns names relative to the directory passed in — we need them
    // relative to scope.basePath so resolveDoc y deleteAllComments trabajen bien.
    const files = await getFiles(filePath, file);
    await Promise.all(files.map(async (f) => {
      const fPath = resolveDoc(f.name, scope.basePath);
      if (!fPath) return;
      try {
        const content = await readFile(fPath, 'utf-8');
        await saveVersion(fPath, content, scope.basePath);
      } catch (err) {
        if (!isEnoent(err)) throw err;
      }
      await deleteAllComments(scope.id, f.name);
    }));
    await rm(filePath, { recursive: true, force: true });
  } else {
    try {
      const content = await readFile(filePath, 'utf-8');
      await saveVersion(filePath, content, scope.basePath);
    } catch (err) {
      if (!isEnoent(err)) throw err;
    }
    await unlink(filePath).catch((err: unknown) => { if (!isEnoent(err)) throw err; });
    await deleteAllComments(scope.id, file);
  }
  invalidateSearchIndex(scope.id);
  res.json({ ok: true });
}));

// Project data (tree + initial page)
router.get('/project', ah(async (req, res) => {
  const scope = getScope(req, res);
  if (!scope) return;
  const folder = queryString(req.query['folder']);
  if (!folder) return res.status(400).json({ error: 'folder es requerido' });
  const folderPath = resolveDoc(folder, scope.basePath);
  if (!folderPath) return res.status(400).json({ error: 'Ruta invalida' });
  const stats = await statOrNull(folderPath);
  if (!stats || !stats.isDirectory()) return res.status(404).json({ error: 'Carpeta no encontrada' });

  const tree = await buildTree(folderPath, folder);
  const mainPage = findMainPage(tree, folder);
  if (!mainPage) return res.status(404).json({ error: 'No se encontraron archivos .md' });

  const activeFilePath = resolveDoc(mainPage, scope.basePath);
  if (!activeFilePath) return res.status(400).json({ error: 'Ruta invalida' });
  let content: string;
  try { content = await readFile(activeFilePath, 'utf-8'); }
  catch (err) {
    if (isNotFile(err)) {
      return res.status(404).json({ error: 'Pagina no encontrada' });
    }
    throw err;
  }
  const html = md.render(content);
  const allPages = flattenTree(tree);

  res.json({ tree, html, currentFile: mainPage, allPages });
}));

// Render project page (for SPA navigation within project)
router.get('/project/render', ah(async (req, res) => {
  const scope = getScope(req, res);
  if (!scope) return;
  const folder = queryString(req.query['folder']);
  const page = queryString(req.query['page']);
  if (!folder || !page) return res.status(400).json({ error: 'folder y page son requeridos' });
  const filePath = resolveDoc(page, scope.basePath);
  if (!filePath) return res.status(400).json({ error: 'Ruta invalida' });
  let content: string;
  try { content = await readFile(filePath, 'utf-8'); }
  catch (err) {
    if (isNotFile(err)) {
      return res.status(404).json({ error: 'Pagina no encontrada' });
    }
    throw err;
  }
  const rendered = md.render(content);
  res.json({ html: rendered, file: page });
}));

// Comments
router.get('/comments', ah(async (req, res) => {
  const scope = getScope(req, res);
  if (!scope) return;
  const file = queryString(req.query['file']);
  if (!file) return res.status(400).json({ error: 'file es requerido' });
  res.json(await getComments(scope.id, file));
}));

router.post('/comments', ah(async (req, res) => {
  const scope = getScope(req, res);
  if (!scope) return;
  if (!scope.canComment) {
    return res.status(403).json({ error: 'No podes comentar en este scope' });
  }
  const parsed = CommentBody.safeParse(req.body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return res.status(400).json({ error: first?.message ?? 'Body invalido' });
  }
  const { file, text, line } = parsed.data;
  const filePath = resolveDoc(file, scope.basePath);
  if (!filePath) return res.status(400).json({ error: 'Ruta invalida' });
  const stats = await statOrNull(filePath);
  if (!stats || !stats.isFile()) return res.status(404).json({ error: 'Archivo no encontrado' });
  const resolvedAuthor = req.user?.username ?? 'Anonimo';
  const authorId = req.user?.userId ?? null;
  const comment = await addComment(scope.id, file, {
    line: line ?? null,
    text,
    author: resolvedAuthor,
    authorId,
  });
  res.json({ ok: true, comment });
}));

router.post('/comments/delete', ah(async (req, res) => {
  const scope = getScope(req, res);
  if (!scope) return;
  if (!scope.canComment) {
    return res.status(403).json({ error: 'No podes borrar comentarios en este scope' });
  }
  const parsed = CommentDeleteBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'file y id son requeridos' });
  const { file, id } = parsed.data;
  await deleteComment(scope.id, file, id);
  res.json({ ok: true });
}));

export default router;
