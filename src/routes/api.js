import { Router } from 'express';
import { readFile, writeFile, unlink, rm, stat } from 'fs/promises';
import { dirname } from 'path';
import { randomUUID } from 'crypto';
import { PUB_DIR, md } from '../lib/config.js';
import { resolveDoc, getFiles, ensureDir, saveVersion, isWritableDocPath } from '../lib/storage.js';
import { getComments, addComment, deleteComment } from '../lib/comments.js';
import { requireTokenOrAuth } from '../lib/auth.js';
import { toggleVisibility, removeMeta, getMeta } from '../lib/meta.js';
import { getSearchIndex, invalidateSearchIndex } from '../lib/search-index.js';
import { buildTree, findMainPage, flattenTree } from '../lib/tree.js';

const router = Router();

// Forward async route errors to the Express error handler so rejected
// promises don't crash the process or hang the request.
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Treat ENOENT as "not found", rethrow anything else.
async function statOrNull(p) {
  try { return await stat(p); }
  catch (err) { if (err.code === 'ENOENT') return null; throw err; }
}

// Limits on user-provided comment fields
const COMMENT_TEXT_MAX = 2000;
const COMMENT_AUTHOR_MAX = 100;

// All API routes require auth (cookie or token)
router.use(requireTokenOrAuth);

// Search index
router.get('/search-index', ah(async (req, res) => {
  const index = await getSearchIndex();
  res.json(index);
}));

// List all docs
router.get('/docs', ah(async (req, res) => {
  const files = await getFiles(PUB_DIR);
  res.json(files);
}));

// Get metadata (visibility info)
router.get('/meta', ah(async (req, res) => {
  const meta = await getMeta();
  res.json(meta);
}));

// Render a single doc to HTML
router.get('/render', ah(async (req, res) => {
  const { file } = req.query;
  if (!file) return res.status(400).json({ error: 'file es requerido' });
  const filePath = resolveDoc(file);
  if (!filePath) return res.status(400).json({ error: 'Ruta invalida' });
  let content;
  try { content = await readFile(filePath, 'utf-8'); }
  catch (err) {
    if (err.code === 'ENOENT' || err.code === 'EISDIR') return res.status(404).json({ error: 'Archivo no encontrado' });
    throw err;
  }
  const html = md.render(content);
  const comments = await getComments(file);
  const meta = await getMeta();
  res.json({ html, commentCount: comments.length, isFilePublic: !!meta[file]?.public });
}));

// Download doc
router.get('/download', ah(async (req, res) => {
  const { file } = req.query;
  if (!file) return res.status(400).json({ error: 'file es requerido' });
  const filePath = resolveDoc(file);
  if (!filePath) return res.status(400).json({ error: 'Ruta invalida' });
  let content;
  try { content = await readFile(filePath, 'utf-8'); }
  catch (err) {
    if (err.code === 'ENOENT' || err.code === 'EISDIR') return res.status(404).json({ error: 'Archivo no encontrado' });
    throw err;
  }
  const rawName = file.split('/').pop();
  const safeName = (rawName || '').replace(/[^a-zA-Z0-9._-]/g, '') || 'document.md';
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
  res.type('text/markdown').send(content);
}));

// Upload/push doc
router.post('/push', ah(async (req, res) => {
  const { file, content } = req.body;
  if (!file || content === undefined) return res.status(400).json({ error: 'file y content son requeridos' });
  if (!isWritableDocPath(file)) return res.status(400).json({ error: 'Ruta invalida' });
  const filePath = resolveDoc(file);
  if (!filePath) return res.status(400).json({ error: 'Ruta invalida' });
  await ensureDir(dirname(filePath));
  // Best-effort version backup — missing previous file is fine.
  try {
    const old = await readFile(filePath, 'utf-8');
    await saveVersion(filePath, old);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  await writeFile(filePath, content);
  invalidateSearchIndex();
  res.json({ ok: true, url: `/doc/${file}` });
}));

// Save doc (with version backup)
router.post('/save', ah(async (req, res) => {
  const { file, content } = req.body;
  if (!file || content === undefined) return res.status(400).json({ error: 'file y content son requeridos' });
  if (!isWritableDocPath(file)) return res.status(400).json({ error: 'Ruta invalida' });
  const filePath = resolveDoc(file);
  if (!filePath) return res.status(400).json({ error: 'Ruta invalida' });
  try {
    const old = await readFile(filePath, 'utf-8');
    await saveVersion(filePath, old);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  await writeFile(filePath, content);
  invalidateSearchIndex();
  res.json({ ok: true });
}));

// Pull doc (raw content)
router.get('/pull', ah(async (req, res) => {
  const { file } = req.query;
  if (!file) return res.status(400).json({ error: 'file es requerido' });
  const filePath = resolveDoc(file);
  if (!filePath) return res.status(400).json({ error: 'Ruta invalida' });
  let content;
  try { content = await readFile(filePath, 'utf-8'); }
  catch (err) {
    if (err.code === 'ENOENT' || err.code === 'EISDIR') return res.status(404).json({ error: 'Archivo no encontrado' });
    throw err;
  }
  res.json({ file, content });
}));

// Toggle visibility
router.post('/toggle-visibility', ah(async (req, res) => {
  const { file } = req.body;
  if (!file) return res.status(400).json({ error: 'file es requerido' });
  if (!isWritableDocPath(file)) return res.status(400).json({ error: 'Ruta invalida' });
  const isNowPublic = await toggleVisibility(file);
  invalidateSearchIndex();
  res.json({ ok: true, public: isNowPublic });
}));

// Delete doc or folder
router.delete('/delete', ah(async (req, res) => {
  const { file } = req.body;
  if (!file) return res.status(400).json({ error: 'file es requerido' });
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
        if (err.code !== 'ENOENT') throw err;
      }
      await removeMeta(f.name);
    }));
    await rm(filePath, { recursive: true, force: true });
  } else {
    try {
      const content = await readFile(filePath, 'utf-8');
      await saveVersion(filePath, content);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
    await unlink(filePath).catch((err) => { if (err.code !== 'ENOENT') throw err; });
    await removeMeta(file);
  }
  invalidateSearchIndex();
  res.json({ ok: true });
}));

// Project data (tree + initial page)
router.get('/project', ah(async (req, res) => {
  const { folder } = req.query;
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
  let content;
  try { content = await readFile(activeFilePath, 'utf-8'); }
  catch (err) {
    if (err.code === 'ENOENT' || err.code === 'EISDIR') return res.status(404).json({ error: 'Pagina no encontrada' });
    throw err;
  }
  const html = md.render(content);
  const allPages = flattenTree(tree);

  res.json({ tree, html, currentFile: mainPage, allPages });
}));

// Render project page (for SPA navigation within project)
router.get('/project/render', ah(async (req, res) => {
  const { folder, page } = req.query;
  if (!folder || !page) return res.status(400).json({ error: 'folder y page son requeridos' });
  const filePath = resolveDoc(page);
  if (!filePath) return res.status(400).json({ error: 'Ruta invalida' });
  let content;
  try { content = await readFile(filePath, 'utf-8'); }
  catch (err) {
    if (err.code === 'ENOENT' || err.code === 'EISDIR') return res.status(404).json({ error: 'Pagina no encontrada' });
    throw err;
  }
  const rendered = md.render(content);
  res.json({ html: rendered, file: page });
}));

// Comments
router.get('/comments', ah(async (req, res) => {
  const { file } = req.query;
  if (!file) return res.status(400).json({ error: 'file es requerido' });
  res.json(await getComments(file));
}));

router.post('/comments', ah(async (req, res) => {
  const { file, text, line, author } = req.body;
  if (!file || typeof text !== 'string') return res.status(400).json({ error: 'file y text son requeridos' });
  const trimmedText = text.trim();
  if (!trimmedText) return res.status(400).json({ error: 'text no puede estar vacio' });
  if (trimmedText.length > COMMENT_TEXT_MAX) return res.status(400).json({ error: `text excede ${COMMENT_TEXT_MAX} caracteres` });
  // line may be null/undefined or a positive integer line number
  let normalizedLine = null;
  if (line !== null && line !== undefined && line !== '') {
    const n = Number(line);
    if (!Number.isInteger(n) || n < 1) return res.status(400).json({ error: 'line debe ser un entero positivo' });
    normalizedLine = n;
  }
  let normalizedAuthor = 'Anonimo';
  if (author !== undefined && author !== null) {
    if (typeof author !== 'string') return res.status(400).json({ error: 'author invalido' });
    const a = author.trim().slice(0, COMMENT_AUTHOR_MAX);
    if (a) normalizedAuthor = a;
  }
  await addComment(file, {
    id: randomUUID(),
    text: trimmedText,
    line: normalizedLine,
    author: normalizedAuthor,
    date: new Date().toISOString(),
  });
  res.json({ ok: true });
}));

router.post('/comments/delete', ah(async (req, res) => {
  const { file, id } = req.body;
  if (!file || !id) return res.status(400).json({ error: 'file y id son requeridos' });
  await deleteComment(file, id);
  res.json({ ok: true });
}));

export default router;
