import { Router } from 'express';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { PUB_DIR, md } from '../lib/config.js';
import { resolveDoc, getFiles } from '../lib/storage.js';
import { isPublic, getPublicFiles } from '../lib/meta.js';
import { getComments } from '../lib/comments.js';
import { buildTree, findMainPage } from '../lib/tree.js';
import { renderPublicIndex } from '../views/public-index.js';
import { renderDoc } from '../views/doc.js';
import { renderSource } from '../views/source.js';
import { renderProject } from '../views/project.js';

const router = Router();

// Public index: only public docs
router.get('/', async (req, res) => {
  const allFiles = await getFiles(PUB_DIR);
  const pubFiles = await getPublicFiles(allFiles);
  res.send(renderPublicIndex(pubFiles));
});

// Public project view
router.get('/project/:folder/', async (req, res) => {
  const folder = req.params.folder;
  const folderPath = resolveDoc(folder);
  if (!folderPath || !existsSync(folderPath)) return res.status(404).send('No encontrado');

  // Check if at least one file in folder is public
  const allFiles = await getFiles(PUB_DIR);
  const folderFiles = allFiles.filter(f => f.name.startsWith(folder + '/'));
  const pubFiles = await getPublicFiles(folderFiles);
  if (pubFiles.length === 0) return res.status(404).send('No encontrado');

  const tree = await buildTree(folderPath, folder);
  const activePage = req.query.page || findMainPage(tree, folder);
  if (!activePage) return res.status(404).send('No encontrado');

  if (!await isPublic(activePage)) return res.status(404).send('No encontrado');

  const activeFilePath = resolveDoc(activePage);
  if (!activeFilePath || !existsSync(activeFilePath)) return res.status(404).send('No encontrado');

  const content = await readFile(activeFilePath, 'utf-8');
  res.send(renderProject(folder, tree, activePage, content, { urlPrefix: '/pub/', apiBase: '/pub', isPublic: true }));
});

// Public API: render project page
router.get('/api/project/render', async (req, res) => {
  const { folder, page } = req.query;
  if (!folder || !page) return res.status(400).json({ error: 'folder y page son requeridos' });
  if (!await isPublic(page)) return res.status(404).json({ error: 'No encontrado' });
  const filePath = resolveDoc(page);
  if (!filePath || !existsSync(filePath)) return res.status(404).json({ error: 'No encontrado' });
  const content = await readFile(filePath, 'utf-8');
  const rendered = md.render(content);
  res.json({ html: rendered, file: page });
});

// Public doc view (1-3 levels)
router.get('/:name.md', (req, res) => servePublicDoc(req.params.name + '.md', req, res));
router.get('/:a/:name.md', (req, res) => servePublicDoc(req.params.a + '/' + req.params.name + '.md', req, res));
router.get('/:a/:b/:name.md', (req, res) => servePublicDoc(req.params.a + '/' + req.params.b + '/' + req.params.name + '.md', req, res));

async function servePublicDoc(file, req, res) {
  if (!await isPublic(file)) return res.status(404).send('No encontrado');
  const filePath = resolveDoc(file);
  if (!filePath || !existsSync(filePath)) return res.status(404).send('No encontrado');

  const content = await readFile(filePath, 'utf-8');

  if (req.query.raw !== undefined) return res.type('text/plain').send(content);
  if (req.query.source !== undefined) {
    const comments = await getComments(file);
    return res.send(renderSource(file, content, comments, { urlPrefix: '/pub/', isPublic: true }));
  }

  const comments = await getComments(file);
  res.send(renderDoc(file, content, comments.length, { urlPrefix: '/pub/', isPublic: true }));
}

export default router;
