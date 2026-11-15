import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth, invalidateHydrateCache } from '../lib/auth.js';
import { createUser, hashPassword, findByUsername } from '../lib/users.js';
import {
  addOrgMember, removeOrgMember, findMember, setMemberRole, listOrgMembers,
  inviteToOrg, listInvites, deleteInvite,
} from '../lib/orgs.js';
import {
  listTeams,
  createTeam,
  deleteTeam,
  listMembers,
  addMember,
  removeMember,
  isValidSlug,
} from '../lib/teams.js';

import express from 'express';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { sql } from '../lib/db.js';
import { OrgDesignSchema, saveOrgBrand, setOrgLogo, sniffImage, LOGO_MAX_BYTES } from '../lib/design.js';
import type { OrgDesign } from '../../shared/design.js';
import { orgDir, ensureDir } from '../lib/storage.js';
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

// The admin's current organization (an admin role implies one); every query below is limited to it.
const orgOf = (req: Request): number => req.user!.orgId!;
const orgSlugOf = (req: Request): string => req.user!.orgSlug!;

// --- Zod schemas ---

// Either username+password (new local account, no email) or just an email (invitation, joins
// on Google sign-in). Never both: an admin-typed email is unverified and must not identify anyone.
export const CreateUserBody = z.object({
  username: z.string().trim().min(1).max(50).optional(),
  password: z.string().min(4).max(200).optional(),
  email: z.string().trim().toLowerCase().email().max(200).optional(),
  displayName: z.string().max(100).optional(),
  role: z.enum(['admin', 'member']).optional(),
}).strict().refine(
  (b) => b.email !== undefined
    ? b.username === undefined && b.password === undefined
    : b.username !== undefined && b.password !== undefined,
  { message: 'Indica solo un email (invitacion) o usuario y contrasena (cuenta local sin email)' },
);

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

// ===== USERS (members of this org) =====

router.get('/users', async (req, res, next) => {
  try {
    const pg = parsePagination(req.query as Record<string, unknown>);
    const { data, total } = await listOrgMembers(orgOf(req), pg);
    res.json({
      data: data.map((u) => ({
        id: u.id,
        username: u.username,
        displayName: u.displayName,
        email: u.email,
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
    const { username, password, email, displayName } = parsed.data;
    const role = parsed.data.role ?? 'member';

    if (email) {
      const result = await inviteToOrg(orgOf(req), email, role, req.user!.userId);
      logger.info('admin', `invite ${result}`, { by: req.user?.username, org: orgSlugOf(req) });
      return res.status(201).json({ ok: true, result });
    }

    const name = username!;
    if (await findByUsername(name)) return res.status(409).json({ error: 'El usuario ya existe' });
    const opts: Parameters<typeof createUser>[0] = { username: name, password: password! };
    if (displayName !== undefined) opts.displayName = displayName;
    let user;
    try {
      user = await createUser(opts);
    } catch (err) {
      if ((err as Error).message?.includes('duplicate')) return res.status(409).json({ error: 'No se pudo crear el usuario' });
      throw err;
    }
    await addOrgMember(orgOf(req), user.id, role);
    logger.info('admin', `user created: ${name}`, { by: req.user?.username, role });
    res.status(201).json({ ok: true, result: 'created' });
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
    const member = await findMember(orgOf(req), username);
    if (!member) return res.status(404).json({ error: 'Usuario no encontrado' });

    const { role, displayName, password } = parsed.data;
    // An admin may only reset the password of a local account; setting one on a Google account
    // would hand the admin a way in that survives the account joining other orgs.
    if (password && !member.localPassword) {
      return res.status(403).json({ error: 'Esta cuenta entra con Google: no se le puede poner password' });
    }
    // The account is shared with other orgs: their admins must not take it over.
    if ((password || displayName !== undefined) && member.orgCount > 1) {
      return res.status(403).json({ error: 'El usuario tambien pertenece a otras organizaciones: solo el puede cambiar su nombre o password' });
    }
    if (role !== undefined) await setMemberRole(orgOf(req), member.id, role);
    if (displayName !== undefined) {
      await sql`UPDATE users SET display_name = ${displayName} WHERE id = ${member.id}`;
    }
    if (password) {
      // By id, never by username: a case-variant username must not receive this password.
      await sql`UPDATE users SET password_hash = ${await hashPassword(password)} WHERE id = ${member.id}`;
    }
    invalidateHydrateCache(member.id);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Removes the person from this org (and its teams); their account and other orgs stay.
router.delete('/users/:username', async (req, res, next) => {
  try {
    const { username } = req.params;
    if (req.user?.username.toLowerCase() === username.toLowerCase()) {
      return res.status(400).json({ error: 'No podes quitarte a vos mismo' });
    }
    const member = await findMember(orgOf(req), username);
    if (!member || !(await removeOrgMember(orgOf(req), member.id))) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    invalidateHydrateCache(member.id);
    logger.info('admin', `member removed: ${username}`, { by: req.user?.username, org: orgSlugOf(req) });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.get('/invites', async (req, res, next) => {
  try {
    const invites = await listInvites(orgOf(req));
    res.json({ data: invites.map((i) => ({ email: i.email, role: i.role, createdAt: i.createdAt.toISOString() })) });
  } catch (err) { next(err); }
});

router.delete('/invites/:email', async (req, res, next) => {
  try {
    if (!(await deleteInvite(orgOf(req), req.params.email))) return res.status(404).json({ error: 'Invitacion no encontrada' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ===== TEAMS =====

router.get('/teams', async (req, res, next) => {
  try {
    const pg = parsePagination(req.query as Record<string, unknown>);
    const { data, total } = await listTeams(orgOf(req), pg);
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
    const team = await createTeam(orgOf(req), { slug, name });
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
    const deleted = await deleteTeam(orgOf(req), slug);
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
    const { data, total } = await listMembers(orgOf(req), slug, pg);
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
    await addMember(orgOf(req), slug, username, role);
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
    const removed = await removeMember(orgOf(req), slug, username);
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
    await addMember(orgOf(req), slug, username, parsed.data.role);
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

// ===== DESIGN (how the org's documents look) =====

const DesignBody = z.object({
  name: z.string().trim().min(1).max(100),
  design: OrgDesignSchema,
}).strict();

router.put('/design', async (req, res, next) => {
  try {
    const parsed = DesignBody.safeParse(req.body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return res.status(400).json({ error: `${issue?.path.join('.') || 'body'}: ${issue?.message ?? 'invalido'}` });
    }
    await saveOrgBrand(orgOf(req), parsed.data.name, parsed.data.design as OrgDesign);
    logger.info('admin', 'design updated', { by: req.user?.username, org: req.user?.orgSlug });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

const rawImage = express.raw({ type: ['image/png', 'image/jpeg', 'image/webp'], limit: LOGO_MAX_BYTES });

router.put('/logo', (req, res, next) => {
  rawImage(req, res, (parseErr?: unknown) => {
    if (parseErr) {
      const tooLarge = (parseErr as { type?: string }).type === 'entity.too.large';
      res.status(tooLarge ? 413 : 400).json({ error: tooLarge ? 'El logo supera 512 KB' : 'Imagen invalida' });
      return;
    }
    (async () => {
      const body: unknown = req.body;
      const kind = Buffer.isBuffer(body) ? sniffImage(body) : null;
      if (!kind || !Buffer.isBuffer(body)) {
        res.status(400).json({ error: 'El logo tiene que ser PNG, JPEG o WebP' });
        return;
      }
      const dir = join(orgDir(orgSlugOf(req)), 'brand');
      await ensureDir(dir);
      const file = `logo-${Date.now()}.${kind}`;
      await writeFile(join(dir, file), body);
      const old = await setOrgLogo(orgOf(req), file);
      if (old) await unlink(join(dir, old)).catch(() => {});
      res.json({ ok: true });
    })().catch(next);
  });
});

router.delete('/logo', async (req, res, next) => {
  try {
    const old = await setOrgLogo(orgOf(req), null);
    if (old) await unlink(join(orgDir(orgSlugOf(req)), 'brand', old)).catch(() => {});
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
