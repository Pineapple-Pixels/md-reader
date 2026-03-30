import { Router } from 'express';
import { readFile, writeFile, unlink, rm, stat } from 'fs/promises';
import { dirname } from 'path';
import { existsSync } from 'fs';
import { PUB_DIR, LOCAL_DIR } from '../lib/config.js';
import { resolveDoc, ensureDir, getFiles, saveVersion } from '../lib/storage.js';
import { serveProject, serveDoc } from './cloud.js';

const router = Router();

// Push a local doc
router.post('/api/local/push', async (req, res) => {
  const { file, content, device } = req.body;
  if (!file || content === undefined) return res.status(400).json({ error: 'file y content son requeridos' });
  const deviceName = device || 'default';
  const localPath = resolveDoc(`${deviceName}/${file}`, LOCAL_DIR);
  if (!localPath) return res.status(400).json({ error: 'Ruta invalida' });
  await ensureDir(dirname(localPath));
  await writeFile(localPath, content);
  res.json({ ok: true, url: `/pub/local/${deviceName}/${file}` });
});

// Pull a local doc
router.get('/api/local/pull', async (req, res) => {
  const { file } = req.query;
  if (!file) return res.status(400).json({ error: 'file es requerido' });
  const localPath = resolveDoc(file, LOCAL_DIR);
  if (!localPath || !existsSync(localPath)) return res.status(404).json({ error: 'Archivo no encontrado' });
  const content = await readFile(localPath, 'utf-8');
  res.json({ file, content });
});

// List local docs
router.get('/api/local/docs', async (req, res) => {
  await ensureDir(LOCAL_DIR);
  const files = await getFiles(LOCAL_DIR);
  res.json(files);
});

// Publish local doc to cloud
router.post('/api/local/publish', async (req, res) => {
  const { file } = req.body;
  if (!file) return res.status(400).json({ error: 'file es requerido' });
  const localPath = resolveDoc(file, LOCAL_DIR);
  if (!localPath || !existsSync(localPath)) return res.status(404).json({ error: 'Archivo local no encontrado' });
  const content = await readFile(localPath, 'utf-8');
  const parts = file.split('/');
  const cloudFile = parts.length > 1 ? parts.slice(1).join('/') : file;
  const cloudPath = resolveDoc(cloudFile);
  if (!cloudPath) return res.status(400).json({ error: 'Ruta invalida' });
  await ensureDir(dirname(cloudPath));
  if (existsSync(cloudPath)) {
    const old = await readFile(cloudPath, 'utf-8');
    await saveVersion(cloudPath, old);
  }
  await writeFile(cloudPath, content);
  await unlink(localPath);
  res.json({ ok: true, url: `/pub/${cloudFile}` });
});

// Delete local doc or folder
router.delete('/api/local/delete', async (req, res) => {
  const { file, recursive } = req.body;
  if (!file) return res.status(400).json({ error: 'file es requerido' });
  const localPath = resolveDoc(file, LOCAL_DIR);
  if (!localPath || !existsSync(localPath)) return res.status(404).json({ error: 'Archivo no encontrado' });
  const stats = await stat(localPath);
  if (stats.isDirectory()) {
    await rm(localPath, { recursive: true });
  } else {
    await unlink(localPath);
  }
  res.json({ ok: true });
});

// Save local doc
router.post('/local/save', async (req, res) => {
  const { file, content } = req.body;
  if (!file || content === undefined) return res.status(400).json({ error: 'file y content son requeridos' });
  const filePath = resolveDoc(file, LOCAL_DIR);
  if (!filePath) return res.status(400).json({ error: 'Ruta invalida' });
  await writeFile(filePath, content);
  res.json({ ok: true, url: `/pub/local/${file}` });
});

// Local project view
router.get('/local/project/:device/:folder/', async (req, res) => {
  const folderPath = req.params.device + '/' + req.params.folder;
  await serveProject(folderPath, req, res, { local: true, projectName: req.params.folder });
});

// Local doc view routes
router.get('/local/:device/:name.md', async (req, res) => {
  const file = req.params.device + '/' + req.params.name + '.md';
  await serveDoc(file, req, res, { local: true });
});

router.get('/local/:device/:folder/:name.md', async (req, res) => {
  const file = req.params.device + '/' + req.params.folder + '/' + req.params.name + '.md';
  await serveDoc(file, req, res, { local: true });
});

router.get('/local/:device/:a/:b/:name.md', async (req, res) => {
  const file = req.params.device + '/' + req.params.a + '/' + req.params.b + '/' + req.params.name + '.md';
  await serveDoc(file, req, res, { local: true });
});

export default router;
