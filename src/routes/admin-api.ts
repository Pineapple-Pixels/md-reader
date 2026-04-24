import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth, invalidateHydrateCache } from '../lib/auth.js';
import {
  listUsers,
  createUser,
  updatePassword,
  deleteUser,
  findByUsername,
} from '../lib/users.js';
import type { UserRole } from '../lib/users.js';
import {
  listTeams,
  createTeam,
  deleteTeam,
  listMembers,
  addMember,
  removeMember,
  isValidSlug,
} from '../lib/teams.js';

import { sql } from '../lib/db.js';
import { parsePagination } from '../lib/route-helpers.js';
import { logger } from '../lib/logger.js';

const router = Router();

// All admin routes require auth + admin role.
router.use(requireAuth);
router.use((req: Request, res: Response, next: NextFunction) => {
  if (req.user?.role !== 'admin') {
    res.status(403).json({ error: 'Se requiere rol admin' });
    return;
  }
  next();
});

// --- Zod schemas ---

const CreateUserBody = z.object({
  username: z.string().trim().min(1).max(50),
  password: z.string().min(4).max(200),
  displayName: z.string().max(100).optional(),
  role: z.enum(['admin', 'member']).optional(),
});

const UpdateUserBody = z.object({
  role: z.enum(['admin', 'member']).optional(),
  displayName: z.string().max(100).optional(),
  password: z.string().min(4).max(200).optional(),
});

const CreateTeamBody = z.object({
  slug: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1).max(100),
});

const MemberBody = z.object({
  username: z.string().trim().min(1),
  role: z.enum(['admin', 'member']).optional(),
});

// ===== USERS =====

router.get('/users', async (req, res, next) => {
  try {
    const pg = parsePagination(req.query as Record<string, unknown>);
    const { data, total } = await listUsers(pg);
    res.json({
      data: data.map((u) => ({
        id: u.id,
        username: u.username,
        displayName: u.displayName,
        role: u.role,
        createdAt: u.createdAt.toISOString(),
      })),
      total,
      limit: pg.limit ?? total,
      offset: pg.offset ?? 0,
    });
  } catch (err) { next(err); }
});

router.post('/users', async (req, res, next) => {
  try {
    const parsed = CreateUserBody.safeParse(req.body);
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? 'Datos invalidos';
      return res.status(400).json({ error: msg });
    }
    const { username, password, displayName, role } = parsed.data;
    const existing = await findByUsername(username);
    if (existing) return res.status(409).json({ error: 'El usuario ya existe' });
    const opts: { username: string; password: string; displayName?: string; role?: UserRole } = { username, password };
    if (displayName !== undefined) opts.displayName = displayName;
    if (role !== undefined) opts.role = role;
    const user = await createUser(opts);
    logger.info('admin', `user created: ${username}`, { by: req.user?.username, role: role ?? 'member' });
    res.status(201).json({
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      createdAt: user.createdAt.toISOString(),
    });
  } catch (err) { next(err); }
});

router.patch('/users/:username', async (req, res, next) => {
  try {
    const { username } = req.params;
    const parsed = UpdateUserBody.safeParse(req.body);
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? 'Datos invalidos';
      return res.status(400).json({ error: msg });
    }
    const user = await findByUsername(username);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    const { role, displayName, password } = parsed.data;
    if (role !== undefined) {
      await sql`UPDATE users SET role = ${role} WHERE id = ${user.id}`;
    }
    if (displayName !== undefined) {
      await sql`UPDATE users SET display_name = ${displayName} WHERE id = ${user.id}`;
    }
    if (password) {
      await updatePassword(username, password);
    }
    invalidateHydrateCache(user.id);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.delete('/users/:username', async (req, res, next) => {
  try {
    const { username } = req.params;
    // No permitir que un admin se borre a si mismo
    if (req.user?.username.toLowerCase() === username.toLowerCase()) {
      return res.status(400).json({ error: 'No podes eliminarte a vos mismo' });
    }
    await sql`UPDATE comments SET author_id = NULL WHERE author_id = (SELECT id FROM users WHERE LOWER(username) = LOWER(${username}))`;
    const deleted = await deleteUser(username);
    if (!deleted) return res.status(404).json({ error: 'Usuario no encontrado' });
    logger.info('admin', `user deleted: ${username}`, { by: req.user?.username });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ===== TEAMS =====

router.get('/teams', async (req, res, next) => {
  try {
    const pg = parsePagination(req.query as Record<string, unknown>);
    const { data, total } = await listTeams(pg);
    res.json({
      data: data.map((t) => ({
        id: t.id,
        slug: t.slug,
        name: t.name,
        createdAt: t.createdAt.toISOString(),
      })),
      total,
      limit: pg.limit ?? total,
      offset: pg.offset ?? 0,
    });
  } catch (err) { next(err); }
});

router.post('/teams', async (req, res, next) => {
  try {
    const parsed = CreateTeamBody.safeParse(req.body);
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? 'Datos invalidos';
      return res.status(400).json({ error: msg });
    }
    const { slug, name } = parsed.data;
    if (!isValidSlug(slug)) {
      return res.status(400).json({ error: 'Slug invalido (solo lowercase, numeros y guion)' });
    }
    const team = await createTeam({ slug, name });
    logger.info('admin', `team created: ${slug}`, { by: req.user?.username });
    res.status(201).json({
      id: team.id,
      slug: team.slug,
      name: team.name,
      createdAt: team.createdAt.toISOString(),
    });
  } catch (err) {
    if ((err as Error).message?.includes('unique') || (err as Error).message?.includes('duplicate')) {
      return res.status(409).json({ error: 'Ya existe un team con ese slug' });
    }
    next(err);
  }
});

router.delete('/teams/:slug', async (req, res, next) => {
  try {
    const { slug } = req.params;
    const deleted = await deleteTeam(slug);
    if (!deleted) return res.status(404).json({ error: 'Team no encontrado' });
    logger.info('admin', `team deleted: ${slug}`, { by: req.user?.username });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ===== MEMBERSHIPS =====

router.get('/teams/:slug/members', async (req, res, next) => {
  try {
    const { slug } = req.params;
    const pg = parsePagination(req.query as Record<string, unknown>);
    const { data, total } = await listMembers(slug, pg);
    res.json({ data, total, limit: pg.limit ?? total, offset: pg.offset ?? 0 });
  } catch (err) { next(err); }
});

router.post('/teams/:slug/members', async (req, res, next) => {
  try {
    const { slug } = req.params;
    const parsed = MemberBody.safeParse(req.body);
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? 'Datos invalidos';
      return res.status(400).json({ error: msg });
    }
    const { username, role } = parsed.data;
    await addMember(slug, username, role);
    // Invalidar cache del user para que sus teams se refresquen
    const user = await findByUsername(username);
    if (user) invalidateHydrateCache(user.id);
    res.json({ ok: true });
  } catch (err) {
    if ((err as Error).message?.includes('no encontrados')) {
      return res.status(404).json({ error: (err as Error).message });
    }
    next(err);
  }
});

router.delete('/teams/:slug/members/:username', async (req, res, next) => {
  try {
    const { slug, username } = req.params;
    const removed = await removeMember(slug, username);
    if (!removed) return res.status(404).json({ error: 'Miembro no encontrado' });
    const user = await findByUsername(username);
    if (user) invalidateHydrateCache(user.id);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Change member role
router.patch('/teams/:slug/members/:username', async (req, res, next) => {
  try {
    const { slug, username } = req.params;
    const parsed = z.object({ role: z.enum(['admin', 'member']) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'role es requerido (admin o member)' });
    // addMember with ON CONFLICT DO UPDATE handles role change
    await addMember(slug, username, parsed.data.role);
    const user = await findByUsername(username);
    if (user) invalidateHydrateCache(user.id);
    res.json({ ok: true });
  } catch (err) {
    if ((err as Error).message?.includes('no encontrados')) {
      return res.status(404).json({ error: (err as Error).message });
    }
    next(err);
  }
});

export default router;
