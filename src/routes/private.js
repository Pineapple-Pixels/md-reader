import { Router } from 'express';
import { readFile, writeFile, unlink, rm, stat } from 'fs/promises';
import { dirname, basename } from 'path';
import { existsSync } from 'fs';
import { PUB_DIR, md } from '../lib/config.js';
import { resolveDoc, getFiles, ensureDir, saveVersion } from '../lib/storage.js';
import { getComments } from '../lib/comments.js';
import { getMeta } from '../lib/meta.js';
import { invalidateSearchIndex } from '../lib/search-index.js';
import { buildTree, findMainPage } from '../lib/tree.js';
import { renderPrivateIndex } from '../views/private-index.js';
import { renderIslandTest } from '../views/island-test.js';
import { renderDoc } from '../views/doc.js';
import { renderEditor } from '../views/editor.js';
import { renderSource } from '../views/source.js';
import { renderProject } from '../views/project.js';

const router = Router();

// Island test page (temporary — remove after verifying)
router.get('/island-test', (req, res) => res.send(renderIslandTest()));

// Dashboard: list all docs with visibility status
router.get('/', async (req, res) => {
  const files = await getFiles(PUB_DIR);
  const meta = await getMeta();
  res.send(renderPrivateIndex(files, meta));
});

// Create new doc
router.post('/new', async (req, res) => {
  let file = req.body.file || '';
  if (!file.endsWith('.md')) file += '.md';
  const filePath = resolveDoc(file);
  if (!filePath) return res.redirect('/?error=ruta-invalida');
  await ensureDir(dirname(filePath));
  if (existsSync(filePath)) return res.redirect(`/doc/${file}?edit=1`);
  await writeFile(filePath, `# ${basename(file, '.md')}\n\n`);
  res.redirect(`/doc/${file}?edit=1`);
});

// Save doc
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
  res.json({ ok: true, url: `/doc/${file}` });
});

// Project view
router.get('/project/:folder/', async (req, res) => {
  const folder = req.params.folder;
  const folderPath = resolveDoc(folder);
  if (!folderPath || !existsSync(folderPath)) return res.status(404).send('Carpeta no encontrada');

  const tree = await buildTree(folderPath, folder);
  const activePage = req.query.page || findMainPage(tree, folder);
  if (!activePage) return res.status(404).send('No se encontraron archivos .md');

  const activeFilePath = resolveDoc(activePage);
  if (!activeFilePath || !existsSync(activeFilePath)) return res.status(404).send('Pagina no encontrada');

  const content = await readFile(activeFilePath, 'utf-8');
  res.send(renderProject(folder, tree, activePage, content, { urlPrefix: '/doc/', apiBase: '', isPublic: false }));
});

// Doc view routes (1-3 levels)
router.get('/doc/:name.md', (req, res) => serveDoc(req.params.name + '.md', req, res));
router.get('/doc/:a/:name.md', (req, res) => serveDoc(req.params.a + '/' + req.params.name + '.md', req, res));
router.get('/doc/:a/:b/:name.md', (req, res) => serveDoc(req.params.a + '/' + req.params.b + '/' + req.params.name + '.md', req, res));

async function serveDoc(file, req, res) {
  const filePath = resolveDoc(file);
  if (!filePath || !existsSync(filePath)) return res.status(404).send('Archivo no encontrado');

  const content = await readFile(filePath, 'utf-8');

  if (req.query.raw !== undefined) return res.type('text/plain').send(content);
  if (req.query.edit !== undefined) return res.send(renderEditor(file, content, { urlPrefix: '/doc/', saveEndpoint: '/save' }));
  if (req.query.source !== undefined) {
    const comments = await getComments(file);
    return res.send(renderSource(file, content, comments, { urlPrefix: '/doc/' }));
  }

  const comments = await getComments(file);
  const meta = await getMeta();
  const isFilePublic = !!meta[file]?.public;
  res.send(renderDoc(file, content, comments.length, { urlPrefix: '/doc/', isFilePublic }));
}

export default router;
