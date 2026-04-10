import { Router } from 'express';
import { readFile, writeFile, unlink, rm } from 'fs/promises';
import { dirname } from 'path';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { PUB_DIR, md } from '../lib/config.js';
import { resolveDoc, getFiles, ensureDir, saveVersion, isWritableDocPath } from '../lib/storage.js';
import { getComments, addComment, deleteComment, deleteAllComments, type Comment } from '../lib/comments.js';
import { requireTokenOrAuth } from '../lib/auth.js';
import { toggleVisibility, removeMeta, getMeta } from '../lib/meta.js';
import { getSearchIndex, invalidateSearchIndex } from '../lib/search-index.js';
import { buildTree, findMainPage, flattenTree } from '../lib/tree.js';
import { ah, statOrNull, isEnoent, queryString } from '../lib/route-helpers.js';

const router = Router();

// Limits on user-provided comment fields
const COMMENT_TEXT_MAX = 2000;
const COMMENT_AUTHOR_MAX = 100;

// ----- Body schemas (zod) -----
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

// All API routes require auth (cookie or token)
router.use(requireTokenOrAuth);

// Search index
router.get('/search-index', ah(async (_req, res) => {
  const index = await getSearchIndex();
  res.json(index);
}));

// List all docs
router.get('/docs', ah(async (_req, res) => {
  const files = await getFiles(PUB_DIR);
  res.json(files);
}));

// Get metadata (visibility info)
router.get('/meta', ah(async (_req, res) => {
  const meta = await getMeta();
  res.json(meta);
}));

// Render a single doc to HTML
router.get('/render', ah(async (req, res) => {
  const file = queryString(req.query['file']);
  if (!file) return res.status(400).json({ error: 'file es requerido' });
  const filePath = resolveDoc(file);
  if (!filePath) return res.status(400).json({ error: 'Ruta invalida' });
  let content: string;
  try { content = await readFile(filePath, 'utf-8'); }
  catch (err) {
    if (isEnoent(err) || (err as NodeJS.ErrnoException).code === 'EISDIR') {
      return res.status(404).json({ error: 'Archivo no encontrado' });
    }
    throw err;
  }
  const html = md.render(content);
  const comments = await getComments(file);
  const meta = await getMeta();
  res.json({ html, commentCount: comments.length, isFilePublic: meta[file]?.public === true });
}));

// Download doc
router.get('/download', ah(async (req, res) => {
  const file = queryString(req.query['file']);
  if (!file) return res.status(400).json({ error: 'file es requerido' });
  const filePath = resolveDoc(file);
  if (!filePath) return res.status(400).json({ error: 'Ruta invalida' });
  let content: string;
  try { content = await readFile(filePath, 'utf-8'); }
  catch (err) {
    if (isEnoent(err) || (err as NodeJS.ErrnoException).code === 'EISDIR') {
      return res.status(404).json({ error: 'Archivo no encontrado' });
    }
    throw err;
  }
  const rawName = file.split('/').pop();
  const safeName = (rawName ?? '').replace(/[^a-zA-Z0-9._-]/g, '') || 'document.md';
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
  res.type('text/markdown').send(content);
}));

// Upload/push doc
router.post('/push', ah(async (req, res) => {
  const parsed = FileContentBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'file y content son requeridos' });
  const { file, content } = parsed.data;
  if (!isWritableDocPath(file)) return res.status(400).json({ error: 'Ruta invalida' });
  const filePath = resolveDoc(file);
  if (!filePath) return res.status(400).json({ error: 'Ruta invalida' });
  await ensureDir(dirname(filePath));
  // Best-effort version backup — missing previous file is fine.
  try {
    const old = await readFile(filePath, 'utf-8');
    await saveVersion(filePath, old);
  } catch (err) {
    if (!isEnoent(err)) throw err;
  }
  await writeFile(filePath, content);
  invalidateSearchIndex();
  res.json({ ok: true, url: `/doc/${file}` });
}));

// Save doc (with version backup)
router.post('/save', ah(async (req, res) => {
  const parsed = FileContentBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'file y content son requeridos' });
  const { file, content } = parsed.data;
  if (!isWritableDocPath(file)) return res.status(400).json({ error: 'Ruta invalida' });
  const filePath = resolveDoc(file);
  if (!filePath) return res.status(400).json({ error: 'Ruta invalida' });
  try {
    const old = await readFile(filePath, 'utf-8');
    await saveVersion(filePath, old);
  } catch (err) {
    if (!isEnoent(err)) throw err;
  }
  await writeFile(filePath, content);
  invalidateSearchIndex();
  res.json({ ok: true });
}));

// Pull doc (raw content)
router.get('/pull', ah(async (req, res) => {
  const file = queryString(req.query['file']);
  if (!file) return res.status(400).json({ error: 'file es requerido' });
  const filePath = resolveDoc(file);
  if (!filePath) return res.status(400).json({ error: 'Ruta invalida' });
  let content: string;
  try { content = await readFile(filePath, 'utf-8'); }
  catch (err) {
    if (isEnoent(err) || (err as NodeJS.ErrnoException).code === 'EISDIR') {
      return res.status(404).json({ error: 'Archivo no encontrado' });
    }
    throw err;
  }
  res.json({ file, content });
}));

// Toggle visibility
router.post('/toggle-visibility', ah(async (req, res) => {
  const parsed = FileBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'file es requerido' });
  const { file } = parsed.data;
  if (!isWritableDocPath(file)) return res.status(400).json({ error: 'Ruta invalida' });
  const isNowPublic = await toggleVisibility(file);
  invalidateSearchIndex();
  res.json({ ok: true, public: isNowPublic });
}));

// Delete doc or folder
router.delete('/delete', ah(async (req, res) => {
  const parsed = FileBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'file es requerido' });
  const { file } = parsed.data;
  const filePath = resolveDoc(file);
  if (!filePath) return res.status(400).json({ error: 'Ruta invalida' });
  // stat instead of existsSync closes the TOCTOU window for the type check.
  const stats = await statOrNull(filePath);
  if (!stats) return res.status(404).json({ error: 'Archivo no encontrado' });
  if (stats.isDirectory()) {
    // getFiles returns names relative to the directory passed in — we need them
    // relative to PUB_DIR so resolveDoc() and removeMeta() work correctly.
    const files = await getFiles(filePath, file);
    await Promise.all(files.map(async (f) => {
      const fPath = resolveDoc(f.name);
      if (!fPath) return;
      try {
        const content = await readFile(fPath, 'utf-8');
        await saveVersion(fPath, content);
      } catch (err) {
        if (!isEnoent(err)) throw err;
      }
      await removeMeta(f.name);
      await deleteAllComments(f.name);
    }));
    await rm(filePath, { recursive: true, force: true });
  } else {
    try {
      const content = await readFile(filePath, 'utf-8');
      await saveVersion(filePath, content);
    } catch (err) {
      if (!isEnoent(err)) throw err;
    }
    await unlink(filePath).catch((err: unknown) => { if (!isEnoent(err)) throw err; });
    await removeMeta(file);
    await deleteAllComments(file);
  }
  invalidateSearchIndex();
  res.json({ ok: true });
}));

// Project data (tree + initial page)
router.get('/project', ah(async (req, res) => {
  const folder = queryString(req.query['folder']);
  if (!folder) return res.status(400).json({ error: 'folder es requerido' });
  const folderPath = resolveDoc(folder);
  if (!folderPath) return res.status(400).json({ error: 'Ruta invalida' });
  const stats = await statOrNull(folderPath);
  if (!stats || !stats.isDirectory()) return res.status(404).json({ error: 'Carpeta no encontrada' });

  const tree = await buildTree(folderPath, folder);
  const mainPage = findMainPage(tree, folder);
  if (!mainPage) return res.status(404).json({ error: 'No se encontraron archivos .md' });

  const activeFilePath = resolveDoc(mainPage);
  if (!activeFilePath) return res.status(400).json({ error: 'Ruta invalida' });
  let content: string;
  try { content = await readFile(activeFilePath, 'utf-8'); }
  catch (err) {
    if (isEnoent(err) || (err as NodeJS.ErrnoException).code === 'EISDIR') {
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
  const folder = queryString(req.query['folder']);
  const page = queryString(req.query['page']);
  if (!folder || !page) return res.status(400).json({ error: 'folder y page son requeridos' });
  const filePath = resolveDoc(page);
  if (!filePath) return res.status(400).json({ error: 'Ruta invalida' });
  let content: string;
  try { content = await readFile(filePath, 'utf-8'); }
  catch (err) {
    if (isEnoent(err) || (err as NodeJS.ErrnoException).code === 'EISDIR') {
      return res.status(404).json({ error: 'Pagina no encontrada' });
    }
    throw err;
  }
  const rendered = md.render(content);
  res.json({ html: rendered, file: page });
}));

// Comments
router.get('/comments', ah(async (req, res) => {
  const file = queryString(req.query['file']);
  if (!file) return res.status(400).json({ error: 'file es requerido' });
  res.json(await getComments(file));
}));

router.post('/comments', ah(async (req, res) => {
  const parsed = CommentBody.safeParse(req.body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return res.status(400).json({ error: first?.message ?? 'Body invalido' });
  }
  const { file, text, line, author } = parsed.data;
  const filePath = resolveDoc(file);
  if (!filePath) return res.status(400).json({ error: 'Ruta invalida' });
  const stats = await statOrNull(filePath);
  if (!stats || !stats.isFile()) return res.status(404).json({ error: 'Archivo no encontrado' });
  const comment: Comment = {
    id: randomUUID(),
    text,
    author,
    createdAt: new Date().toISOString(),
    // Mantener compat con el formato anterior que usaba `date` en vez de `createdAt`.
    date: new Date().toISOString(),
  };
  if (line !== null) comment.line = line;
  await addComment(file, comment);
  res.json({ ok: true });
}));

router.post('/comments/delete', ah(async (req, res) => {
  const parsed = CommentDeleteBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'file y id son requeridos' });
  const { file, id } = parsed.data;
  await deleteComment(file, id);
  res.json({ ok: true });
}));

export default router;
