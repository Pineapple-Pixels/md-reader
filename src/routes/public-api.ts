import { Router } from 'express';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { STORAGE_DIR, md } from '../lib/config.js';
import { resolveDoc, getFiles } from '../lib/storage.js';
import { getComments } from '../lib/comments.js';
import { buildTree, findMainPage, flattenTree } from '../lib/tree.js';
import { ah, statOrNull, isEnoent, queryString } from '../lib/route-helpers.js';

// API publica (sin auth). Sirve exclusivamente el scope `public`, es decir
// `storage/public/`. No hay `?scope=` aca — el scope esta hardcoded porque
// este router es el punto de entrada anonimo. Los docs privados o de team
// se sirven desde /api con cookie auth y scope explicito.
const PUBLIC_BASE = join(STORAGE_DIR, 'public');

const router = Router();

// List public docs
router.get('/docs', ah(async (_req, res) => {
  const files = await getFiles(PUBLIC_BASE);
  res.json(files);
}));

// Render a public doc
router.get('/render', ah(async (req, res) => {
  const file = queryString(req.query['file']);
  if (!file) return res.status(400).json({ error: 'file es requerido' });
  const filePath = resolveDoc(file, PUBLIC_BASE);
  if (!filePath) return res.status(400).json({ error: 'Ruta invalida' });
  let content: string;
  try { content = await readFile(filePath, 'utf-8'); }
  catch (err) {
    if (isEnoent(err) || (err as NodeJS.ErrnoException).code === 'EISDIR') {
      return res.status(404).json({ error: 'No encontrado' });
    }
    throw err;
  }
  const html = md.render(content);
  const comments = await getComments('public', file);
  res.json({ html, comments, commentCount: comments.length });
}));

// Project data (tree + initial page)
router.get('/project', ah(async (req, res) => {
  const folder = queryString(req.query['folder']);
  if (!folder) return res.status(400).json({ error: 'folder es requerido' });
  const folderPath = resolveDoc(folder, PUBLIC_BASE);
  if (!folderPath) return res.status(400).json({ error: 'Ruta invalida' });
  const stats = await statOrNull(folderPath);
  if (!stats || !stats.isDirectory()) return res.status(404).json({ error: 'No encontrado' });

  const tree = await buildTree(folderPath, folder);
  const mainPage = findMainPage(tree, folder);
  if (!mainPage) return res.status(404).json({ error: 'No encontrado' });

  const activeFilePath = resolveDoc(mainPage, PUBLIC_BASE);
  if (!activeFilePath) return res.status(400).json({ error: 'Ruta invalida' });
  let content: string;
  try { content = await readFile(activeFilePath, 'utf-8'); }
  catch (err) {
    if (isEnoent(err) || (err as NodeJS.ErrnoException).code === 'EISDIR') {
      return res.status(404).json({ error: 'No encontrado' });
    }
    throw err;
  }
  const html = md.render(content);
  const allPages = flattenTree(tree);

  res.json({ tree, html, currentFile: mainPage, allPages });
}));

// Pull raw content of a public doc
router.get('/pull', ah(async (req, res) => {
  const file = queryString(req.query['file']);
  if (!file) return res.status(400).json({ error: 'file es requerido' });
  const filePath = resolveDoc(file, PUBLIC_BASE);
  if (!filePath) return res.status(400).json({ error: 'Ruta invalida' });
  let content: string;
  try { content = await readFile(filePath, 'utf-8'); }
  catch (err) {
    if (isEnoent(err) || (err as NodeJS.ErrnoException).code === 'EISDIR') {
      return res.status(404).json({ error: 'No encontrado' });
    }
    throw err;
  }
  res.json({ file, content });
}));

// Get comments for a public doc (lectura anonima OK — escribir requiere login
// y va por POST /api/comments?scope=public con cookie).
router.get('/comments', ah(async (req, res) => {
  const file = queryString(req.query['file']);
  if (!file) return res.status(400).json({ error: 'file es requerido' });
  res.json(await getComments('public', file));
}));

// Render project page
router.get('/project/render', ah(async (req, res) => {
  const folder = queryString(req.query['folder']);
  const page = queryString(req.query['page']);
  if (!folder || !page) return res.status(400).json({ error: 'folder y page son requeridos' });
  const filePath = resolveDoc(page, PUBLIC_BASE);
  if (!filePath) return res.status(400).json({ error: 'Ruta invalida' });
  let content: string;
  try { content = await readFile(filePath, 'utf-8'); }
  catch (err) {
    if (isEnoent(err) || (err as NodeJS.ErrnoException).code === 'EISDIR') {
      return res.status(404).json({ error: 'No encontrado' });
    }
    throw err;
  }
  const rendered = md.render(content);
  res.json({ html: rendered, file: page });
}));

export default router;
