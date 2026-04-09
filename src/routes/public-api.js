import { Router } from 'express';
import { readFile, stat } from 'fs/promises';
import { PUB_DIR, md } from '../lib/config.js';
import { resolveDoc, getFiles } from '../lib/storage.js';
import { isPublic, getPublicFiles } from '../lib/meta.js';
import { getComments } from '../lib/comments.js';
import { buildTree, findMainPage, flattenTree } from '../lib/tree.js';

const router = Router();

// Forward async errors to the Express error handler.
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

async function statOrNull(p) {
  try { return await stat(p); }
  catch (err) { if (err.code === 'ENOENT') return null; throw err; }
}

// List public docs
router.get('/docs', ah(async (req, res) => {
  const allFiles = await getFiles(PUB_DIR);
  const pubFiles = await getPublicFiles(allFiles);
  res.json(pubFiles);
}));

// Render a public doc
router.get('/render', ah(async (req, res) => {
  const { file } = req.query;
  if (!file) return res.status(400).json({ error: 'file es requerido' });
  if (!await isPublic(file)) return res.status(404).json({ error: 'No encontrado' });
  const filePath = resolveDoc(file);
  if (!filePath) return res.status(400).json({ error: 'Ruta invalida' });
  let content;
  try { content = await readFile(filePath, 'utf-8'); }
  catch (err) {
    if (err.code === 'ENOENT' || err.code === 'EISDIR') return res.status(404).json({ error: 'No encontrado' });
    throw err;
  }
  const html = md.render(content);
  const comments = await getComments(file);
  res.json({ html, commentCount: comments.length, isFilePublic: true });
}));

// Project data (tree + initial page)
router.get('/project', ah(async (req, res) => {
  const { folder } = req.query;
  if (!folder) return res.status(400).json({ error: 'folder es requerido' });
  const folderPath = resolveDoc(folder);
  if (!folderPath) return res.status(400).json({ error: 'Ruta invalida' });
  const stats = await statOrNull(folderPath);
  if (!stats || !stats.isDirectory()) return res.status(404).json({ error: 'No encontrado' });

  const allFiles = await getFiles(PUB_DIR);
  const folderFiles = allFiles.filter(f => f.name.startsWith(folder + '/'));
  const pubFiles = await getPublicFiles(folderFiles);
  if (pubFiles.length === 0) return res.status(404).json({ error: 'No encontrado' });

  const tree = await buildTree(folderPath, folder);
  const mainPage = findMainPage(tree, folder);
  if (!mainPage) return res.status(404).json({ error: 'No encontrado' });

  if (!await isPublic(mainPage)) return res.status(404).json({ error: 'No encontrado' });

  const activeFilePath = resolveDoc(mainPage);
  if (!activeFilePath) return res.status(400).json({ error: 'Ruta invalida' });
  let content;
  try { content = await readFile(activeFilePath, 'utf-8'); }
  catch (err) {
    if (err.code === 'ENOENT' || err.code === 'EISDIR') return res.status(404).json({ error: 'No encontrado' });
    throw err;
  }
  const html = md.render(content);
  const allPages = flattenTree(tree);

  res.json({ tree, html, currentFile: mainPage, allPages });
}));

// Pull raw content of a public doc
router.get('/pull', ah(async (req, res) => {
  const { file } = req.query;
  if (!file) return res.status(400).json({ error: 'file es requerido' });
  if (!await isPublic(file)) return res.status(404).json({ error: 'No encontrado' });
  const filePath = resolveDoc(file);
  if (!filePath) return res.status(400).json({ error: 'Ruta invalida' });
  let content;
  try { content = await readFile(filePath, 'utf-8'); }
  catch (err) {
    if (err.code === 'ENOENT' || err.code === 'EISDIR') return res.status(404).json({ error: 'No encontrado' });
    throw err;
  }
  res.json({ file, content });
}));

// Get comments for a public doc
router.get('/comments', ah(async (req, res) => {
  const { file } = req.query;
  if (!file) return res.status(400).json({ error: 'file es requerido' });
  if (!await isPublic(file)) return res.status(404).json({ error: 'No encontrado' });
  res.json(await getComments(file));
}));

// Render project page
router.get('/project/render', ah(async (req, res) => {
  const { folder, page } = req.query;
  if (!folder || !page) return res.status(400).json({ error: 'folder y page son requeridos' });
  if (!await isPublic(page)) return res.status(404).json({ error: 'No encontrado' });
  const filePath = resolveDoc(page);
  if (!filePath) return res.status(400).json({ error: 'Ruta invalida' });
  let content;
  try { content = await readFile(filePath, 'utf-8'); }
  catch (err) {
    if (err.code === 'ENOENT' || err.code === 'EISDIR') return res.status(404).json({ error: 'No encontrado' });
    throw err;
  }
  const rendered = md.render(content);
  res.json({ html: rendered, file: page });
}));

export default router;
