import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../lib/auth.js';
import { ah } from '../lib/route-helpers.js';
import {
  ThemeBodySchema, listUserThemes, createUserTheme, updateUserTheme, deleteUserTheme, setActiveTheme,
  MAX_THEMES_PER_USER,
} from '../lib/design.js';
import type { ThemeTokens } from '../../shared/design.js';

// The signed-in user's own app themes. Every query is keyed by req.user.userId.
const router = Router();
router.use(requireAuth);

const userId = (req: Request): number => req.user!.userId;

function themeId(req: Request, res: Response): number | null {
  const m = /^custom:(\d{1,9})$/.exec(String(req.params['id'] ?? ''));
  if (!m) {
    res.status(404).json({ error: 'Tema no encontrado' });
    return null;
  }
  return Number(m[1]);
}

function badBody(res: Response, err: z.ZodError): void {
  const issue = err.issues[0];
  res.status(400).json({ error: `${issue?.path.join('.') || 'body'}: ${issue?.message ?? 'invalido'}` });
}

router.get('/themes', ah(async (req, res) => {
  res.json(await listUserThemes(userId(req)));
}));

router.post('/themes', ah(async (req, res) => {
  const parsed = ThemeBodySchema.safeParse(req.body);
  if (!parsed.success) return badBody(res, parsed.error);
  const theme = await createUserTheme(userId(req), parsed.data.name, parsed.data.tokens as ThemeTokens);
  if (!theme) return res.status(409).json({ error: `Maximo ${MAX_THEMES_PER_USER} temas por usuario` });
  res.status(201).json(theme);
}));

router.patch('/themes/:id', ah(async (req, res) => {
  const id = themeId(req, res);
  if (id === null) return;
  const parsed = ThemeBodySchema.safeParse(req.body);
  if (!parsed.success) return badBody(res, parsed.error);
  const ok = await updateUserTheme(userId(req), id, parsed.data.name, parsed.data.tokens as ThemeTokens);
  if (!ok) return res.status(404).json({ error: 'Tema no encontrado' });
  res.json({ ok: true });
}));

router.delete('/themes/:id', ah(async (req, res) => {
  const id = themeId(req, res);
  if (id === null) return;
  if (!(await deleteUserTheme(userId(req), id))) return res.status(404).json({ error: 'Tema no encontrado' });
  res.json({ ok: true });
}));

router.put('/active-theme', ah(async (req, res) => {
  const parsed = z.object({ id: z.string().min(1).max(40) }).strict().safeParse(req.body);
  if (!parsed.success) return badBody(res, parsed.error);
  if (!(await setActiveTheme(userId(req), parsed.data.id))) return res.status(404).json({ error: 'Tema no encontrado' });
  res.json({ ok: true });
}));

export default router;
