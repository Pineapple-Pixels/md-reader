import { Router } from 'express';
import { randomUUID } from 'crypto';
import { getComments, saveComments } from '../lib/comments.js';

const router = Router();

// API: Get comments
router.get('/api/comments', async (req, res) => {
  const { file } = req.query;
  if (!file) return res.status(400).json({ error: 'file es requerido' });
  res.json(await getComments(file));
});

// API: Add comment
router.post('/api/comments', async (req, res) => {
  const { file, text, line, author } = req.body;
  if (!file || !text) return res.status(400).json({ error: 'file y text son requeridos' });
  const comments = await getComments(file);
  comments.push({ id: randomUUID(), text, line: line || null, author: author || 'Anonimo', date: new Date().toISOString() });
  await saveComments(file, comments);
  res.json({ ok: true });
});

// API: Delete comment
router.post('/api/comments/delete', async (req, res) => {
  const { file, id } = req.body;
  if (!file || !id) return res.status(400).json({ error: 'file y id son requeridos' });
  let comments = await getComments(file);
  comments = comments.filter(c => c.id !== id);
  await saveComments(file, comments);
  res.json({ ok: true });
});

export default router;
