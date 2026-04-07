import { Router } from 'express';
import { readFile, writeFile, unlink, rm, stat } from 'fs/promises';
import { dirname } from 'path';
import { existsSync } from 'fs';
import { randomUUID } from 'crypto';
import { PUB_DIR, md } from '../lib/config.js';
import { resolveDoc, getFiles, ensureDir, saveVersion } from '../lib/storage.js';
import { getComments, saveComments } from '../lib/comments.js';
import { requireTokenOrAuth } from '../lib/auth.js';
import { toggleVisibility, removeMeta, getMeta } from '../lib/meta.js';
import { getSearchIndex, invalidateSearchIndex } from '../lib/search-index.js';
import { buildTree, findMainPage, flattenTree } from '../lib/tree.js';

const router = Router();

// All API routes require auth (cookie or token)
router.use(requireTokenOrAuth);

// Search index
router.get('/search-index', async (req, res) => {
  const index = await getSearchIndex();
  res.json(index);
});

// List all docs
router.get('/docs', async (req, res) => {
  const files = await getFiles(PUB_DIR);
  res.json(files);
});

// Get metadata (visibility info)
router.get('/meta', async (req, res) => {
  const meta = await getMeta();
  res.json(meta);
});

// Render a single doc to HTML
router.get('/render', async (req, res) => {
  const { file } = req.query;
  if (!file) return res.status(400).json({ error: 'file es requerido' });
  const filePath = resolveDoc(file);
  if (!filePath || !existsSync(filePath)) return res.status(404).json({ error: 'Archivo no encontrado' });
  const content = await readFile(filePath, 'utf-8');
  const html = md.render(content);
  const comments = await getComments(file);
  const meta = await getMeta();
  res.json({ html, commentCount: comments.length, isFilePublic: !!meta[file]?.public });
});

// Download doc
router.get('/download', async (req, res) => {
  const { file } = req.query;
  if (!file) return res.status(400).json({ error: 'file es requerido' });
  const filePath = resolveDoc(file);
  if (!filePath || !existsSync(filePath)) return res.status(404).json({ error: 'Archivo no encontrado' });
  const content = await readFile(filePath, 'utf-8');
  const rawName = file.split('/').pop();
  const safeName = (rawName || '').replace(/[^a-zA-Z0-9._-]/g, '') || 'document.md';
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
  res.type('text/markdown').send(content);
});

// Upload/push doc
router.post('/push', async (req, res) => {
  const { file, content } = req.body;
  if (!file || content === undefined) return res.status(400).json({ error: 'file y content son requeridos' });
  const filePath = resolveDoc(file);
  if (!filePath) return res.status(400).json({ error: 'Ruta invalida' });
  await ensureDir(dirname(filePath));
  if (existsSync(filePath)) {
    const old = await readFile(filePath, 'utf-8');
    await saveVersion(filePath, old);
  }
  await writeFile(filePath, content);
  invalidateSearchIndex();
  res.json({ ok: true, url: `/doc/${file}` });
});

// Save doc (with version backup)
router.post('/save', async (req, res) => {
  const { file, content } = req.body;
  if (!file || content === undefined) return res.status(400).json({ error: 'file y content son requeridos' });
  const filePath = resolveDoc(file);
  if (!filePath) return res.status(400).json({ error: 'Ruta invalida' });
  if (existsSync(filePath)) {
    const old = await readFile(filePath, 'utf-8');
    await saveVersion(filePath, old);
  }
  await writeFile(filePath, content);
  invalidateSearchIndex();
  res.json({ ok: true });
});

// Pull doc (raw content)
router.get('/pull', async (req, res) => {
  const { file } = req.query;
  if (!file) return res.status(400).json({ error: 'file es requerido' });
  const filePath = resolveDoc(file);
  if (!filePath || !existsSync(filePath)) return res.status(404).json({ error: 'Archivo no encontrado' });
  const content = await readFile(filePath, 'utf-8');
  res.json({ file, content });
});

// Toggle visibility
router.post('/toggle-visibility', async (req, res) => {
  const { file } = req.body;
  if (!file) return res.status(400).json({ error: 'file es requerido' });
  const isNowPublic = await toggleVisibility(file);
  invalidateSearchIndex();
  res.json({ ok: true, public: isNowPublic });
});

// Delete doc or folder
router.delete('/delete', async (req, res) => {
  const { file } = req.body;
  if (!file) return res.status(400).json({ error: 'file es requerido' });
  const filePath = resolveDoc(file);
  if (!filePath || !existsSync(filePath)) return res.status(404).json({ error: 'Archivo no encontrado' });
  const stats = await stat(filePath);
  if (stats.isDirectory()) {
    const files = await getFiles(filePath);
    for (const f of files) {
      const fPath = resolveDoc(f.name);
      if (fPath && existsSync(fPath)) {
        const content = await readFile(fPath, 'utf-8');
        await saveVersion(fPath, content);
      }
      await removeMeta(f.name);
    }
    await rm(filePath, { recursive: true });
  } else {
    const content = await readFile(filePath, 'utf-8');
    await saveVersion(filePath, content);
    await unlink(filePath);
    await removeMeta(file);
  }
  invalidateSearchIndex();
  res.json({ ok: true });
});

// Project data (tree + initial page)
router.get('/project', async (req, res) => {
  const { folder } = req.query;
  if (!folder) return res.status(400).json({ error: 'folder es requerido' });
  const folderPath = resolveDoc(folder);
  if (!folderPath || !existsSync(folderPath)) return res.status(404).json({ error: 'Carpeta no encontrada' });

  const tree = await buildTree(folderPath, folder);
  const mainPage = findMainPage(tree, folder);
  if (!mainPage) return res.status(404).json({ error: 'No se encontraron archivos .md' });

  const activeFilePath = resolveDoc(mainPage);
  if (!activeFilePath || !existsSync(activeFilePath)) return res.status(404).json({ error: 'Pagina no encontrada' });

  const content = await readFile(activeFilePath, 'utf-8');
  const html = md.render(content);
  const allPages = flattenTree(tree);

  res.json({ tree, html, currentFile: mainPage, allPages });
});

// Render project page (for SPA navigation within project)
router.get('/project/render', async (req, res) => {
  const { folder, page } = req.query;
  if (!folder || !page) return res.status(400).json({ error: 'folder y page son requeridos' });
  const filePath = resolveDoc(page);
  if (!filePath || !existsSync(filePath)) return res.status(404).json({ error: 'Pagina no encontrada' });
  const content = await readFile(filePath, 'utf-8');
  const rendered = md.render(content);
  res.json({ html: rendered, file: page });
});

// Comments
router.get('/comments', async (req, res) => {
  const { file } = req.query;
  if (!file) return res.status(400).json({ error: 'file es requerido' });
  res.json(await getComments(file));
});

router.post('/comments', async (req, res) => {
  const { file, text, line, author } = req.body;
  if (!file || !text) return res.status(400).json({ error: 'file y text son requeridos' });
  const comments = await getComments(file);
  comments.push({ id: randomUUID(), text, line: line || null, author: author || 'Anonimo', date: new Date().toISOString() });
  await saveComments(file, comments);
  res.json({ ok: true });
});

router.post('/comments/delete', async (req, res) => {
  const { file, id } = req.body;
  if (!file || !id) return res.status(400).json({ error: 'file y id son requeridos' });
  let comments = await getComments(file);
  comments = comments.filter(c => c.id !== id);
  await saveComments(file, comments);
  res.json({ ok: true });
});

export default router;
