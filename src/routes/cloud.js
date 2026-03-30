import { Router } from 'express';
import { readFile, writeFile, unlink, rm, stat } from 'fs/promises';
import { dirname, basename } from 'path';
import { existsSync } from 'fs';
import { PUB_DIR, LOCAL_DIR, PUB_TOKEN, md } from '../lib/config.js';
import { resolveDoc, checkToken, ensureDir, getFiles, saveVersion } from '../lib/storage.js';
import { getComments } from '../lib/comments.js';
import { buildTree, findMainPage } from '../lib/tree.js';
import { renderDoc } from '../views/doc.js';
import { renderEditor } from '../views/editor.js';
import { renderSource } from '../views/source.js';
import { renderProject } from '../views/project.js';

const router = Router();

// API: List cloud docs
router.get('/api/docs', async (req, res) => {
  const files = await getFiles(PUB_DIR);
  res.json(files);
});

// API: Download cloud doc as .md file
router.get('/api/download', async (req, res) => {
  const { file } = req.query;
  if (!file) return res.status(400).json({ error: 'file es requerido' });
  const filePath = resolveDoc(file);
  if (!filePath || !existsSync(filePath)) return res.status(404).json({ error: 'Archivo no encontrado' });
  const content = await readFile(filePath, 'utf-8');
  const filename = file.split('/').pop();
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.type('text/markdown').send(content);
});

// API: Publish doc to cloud
router.post('/api/publish', async (req, res) => {
  if (!checkToken(req, PUB_TOKEN)) return res.status(401).json({ error: 'Token invalido' });
  const { file, content } = req.body;
  if (!file || !content) return res.status(400).json({ error: 'file y content son requeridos' });
  const filePath = resolveDoc(file);
  if (!filePath) return res.status(400).json({ error: 'Ruta invalida' });
  await ensureDir(dirname(filePath));
  if (existsSync(filePath)) {
    const old = await readFile(filePath, 'utf-8');
    await saveVersion(filePath, old);
  }
  await writeFile(filePath, content);
  res.json({ ok: true, url: `/pub/${file}` });
});

// API: Delete cloud doc or folder
router.delete('/api/delete', async (req, res) => {
  if (!checkToken(req, PUB_TOKEN)) return res.status(401).json({ error: 'Token invalido' });
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
    }
    await rm(filePath, { recursive: true });
  } else {
    const content = await readFile(filePath, 'utf-8');
    await saveVersion(filePath, content);
    await unlink(filePath);
  }
  res.json({ ok: true });
});

// Create new doc
router.post('/new', async (req, res) => {
  let file = req.body.file || '';
  if (!file.endsWith('.md')) file += '.md';
  const filePath = resolveDoc(file);
  if (!filePath) return res.redirect('/pub/?error=ruta-invalida');
  await ensureDir(dirname(filePath));
  if (existsSync(filePath)) return res.redirect(`/pub/${file}?edit=1`);
  await writeFile(filePath, `# ${basename(file, '.md')}\n\n`);
  res.redirect(`/pub/${file}?edit=1`);
});

// Save cloud doc
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
  res.json({ ok: true, url: `/pub/${file}` });
});

// API: Render a single page of a project (for SPA navigation)
router.get('/api/project/render', async (req, res) => {
  const { folder, page, local } = req.query;
  if (!folder || !page) return res.status(400).json({ error: 'folder y page son requeridos' });
  const baseDir = local ? LOCAL_DIR : PUB_DIR;
  const filePath = resolveDoc(page, baseDir);
  if (!filePath || !existsSync(filePath)) return res.status(404).json({ error: 'Pagina no encontrada' });
  const content = await readFile(filePath, 'utf-8');
  const rendered = md.render(content);
  res.json({ html: rendered, file: page });
});

// Project view: cloud
router.get('/project/:folder/', async (req, res) => {
  await serveProject(req.params.folder, req, res, { local: false });
});

async function serveProject(folder, req, res, { local = false, projectName = null } = {}) {
  const baseDir = local ? LOCAL_DIR : PUB_DIR;
  const folderPath = resolveDoc(folder, baseDir);
  if (!folderPath || !existsSync(folderPath)) return res.status(404).send('Carpeta no encontrada');

  const tree = await buildTree(folderPath, folder);
  const name = projectName || folder;
  const requestedPage = req.query.page;

  let activePage = requestedPage || findMainPage(tree, name);
  if (!activePage) return res.status(404).send('No se encontraron archivos .md en esta carpeta');

  const activeFilePath = resolveDoc(activePage, baseDir);
  if (!activeFilePath || !existsSync(activeFilePath)) return res.status(404).send('Pagina no encontrada');

  const content = await readFile(activeFilePath, 'utf-8');
  const urlPrefix = local ? '/pub/local/' : '/pub/';
  const apiBase = '/pub';

  res.send(renderProject(name, tree, activePage, content, { urlPrefix, local, apiBase }));
}

// --- Cloud doc view routes ---
router.get('/:name.md', async (req, res) => {
  const file = req.params.name + '.md';
  await serveDoc(file, req, res);
});

router.get('/:folder/:name.md', async (req, res) => {
  const file = req.params.folder + '/' + req.params.name + '.md';
  await serveDoc(file, req, res);
});

router.get('/:a/:b/:name.md', async (req, res) => {
  const file = req.params.a + '/' + req.params.b + '/' + req.params.name + '.md';
  await serveDoc(file, req, res);
});

async function serveDoc(file, req, res, { local = false } = {}) {
  const baseDir = local ? LOCAL_DIR : PUB_DIR;
  const urlPrefix = local ? '/pub/local/' : '/pub/';
  const saveEndpoint = local ? '/pub/local/save' : '/pub/save';
  const filePath = resolveDoc(file, baseDir);
  if (!filePath || !existsSync(filePath)) return res.status(404).send('Archivo no encontrado');

  const content = await readFile(filePath, 'utf-8');

  if (req.query.raw !== undefined) return res.type('text/plain').send(content);
  if (req.query.edit !== undefined) return res.send(renderEditor(file, content, { urlPrefix, saveEndpoint, local }));
  if (req.query.source !== undefined) {
    const comments = await getComments(file);
    return res.send(renderSource(file, content, comments, { urlPrefix, local }));
  }

  const comments = await getComments(file);
  res.send(renderDoc(file, content, comments.length, { urlPrefix, local }));
}

// Export serveProject and serveDoc for local routes
export { serveProject, serveDoc };
export default router;
