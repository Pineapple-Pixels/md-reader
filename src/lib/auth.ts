import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction, CookieOptions } from 'express';
import { JWT_SECRET } from './config.js';
import { findByUsername, verifyPassword } from './users.js';
import type { UserRole } from './users.js';
import { listTeamsForUser } from './teams.js';
import { getMembership, defaultOrgId } from './orgs.js';
import { sql } from './db.js';
import type { TeamMembership } from './teams.js';

const TOKEN_EXPIRY = '7d';
const COOKIE_NAME = 'docs_token';

/** Lives in the JWT: who you are and which of your organizations the session is in (null: none). */
export type AuthPayload = {
  userId: number;
  username: string;
  orgId: number | null;
};

/**
 * `req.user`: the payload checked against the DB. Org fields are null when the account
 * belongs to no org or is no longer a member of the session's org; role is the role there.
 */
export type AuthUser = {
  userId: number;
  username: string;
  orgId: number | null;
  orgSlug: string | null;
  orgName: string | null;
  role: UserRole | null;
  teams: TeamMembership[];
};

// `req.cookies` viene tipado como `any` por @types/cookie-parser; lo centralizamos
// aca para que el resto del codigo trabaje con un tipo concreto.
function readCookie(req: Request, name: string): string | undefined {
  const cookies = req.cookies as Record<string, string | undefined> | undefined;
  return cookies?.[name];
}

// Cache in-memory de users hidratados. TTL corto (60s) para que cambios
// de membership en un proceso distinto (p.ej. CLI team:add-user) se
// propaguen solos sin necesidad de invalidacion cross-process.
const HYDRATE_TTL_MS = 60_000;
type CacheEntry = { user: AuthUser; expiresAt: number };
const hydrateCache = new Map<string, CacheEntry>();

/** null when the account no longer exists (its tokens stop working). */
export async function hydrateUser(payload: AuthPayload): Promise<AuthUser | null> {
  const key = `${payload.userId}:${payload.orgId ?? '-'}`;
  const cached = hydrateCache.get(key);
  const now = Date.now();
  if (cached && cached.expiresAt > now) return { ...cached.user, username: payload.username };

  const exists = await sql`SELECT 1 FROM users WHERE id = ${payload.userId}`;
  if (exists.count === 0) return null;

  const m = payload.orgId === null ? null : await getMembership(payload.userId, payload.orgId);
  const user: AuthUser = {
    userId: payload.userId,
    username: payload.username,
    orgId: m ? m.orgId : null,
    orgSlug: m?.slug ?? null,
    orgName: m?.name ?? null,
    role: m?.role ?? null,
    teams: m ? await listTeamsForUser(payload.userId, m.orgId) : [],
  };
  hydrateCache.set(key, { user, expiresAt: now + HYDRATE_TTL_MS });
  return user;
}

// Invalida el cache para un user. Llamar despues de add/remove member
// en el mismo proceso (p.ej. si agregamos admin UI). En prod los CLI
// corren en proceso aparte; la staleness se limita al TTL.
export function invalidateHydrateCache(userId: number): void {
  for (const key of hydrateCache.keys()) {
    if (key.startsWith(`${userId}:`)) hydrateCache.delete(key);
  }
}

export function signSession(user: { id: number; username: string }, orgId: number | null): string {
  const payload: AuthPayload = { userId: user.id, username: user.username, orgId };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

/** A session token opened in the user's default org (last used, else oldest, else none). */
export async function signDefaultSession(user: { id: number; username: string }): Promise<string> {
  return signSession(user, await defaultOrgId(user.id));
}

// lax (not strict) so the session survives the top-level redirect back from Google.
const SESSION_COOKIE: CookieOptions = {
  httpOnly: true,
  secure: process.env['NODE_ENV'] === 'production',
  sameSite: 'lax',
};

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(COOKIE_NAME, token, { ...SESSION_COOKIE, maxAge: 7 * 24 * 60 * 60 * 1000 });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME, SESSION_COOKIE);
}

export async function login(username: string, password: string): Promise<string | null> {
  const user = await findByUsername(username);
  if (!user?.passwordHash) {
    // Dummy compare para equiparar tiempos entre "user no existe" y "password mal".
    // Evita user enumeration via timing.
    await verifyPassword(password, '$2a$12$CwTycUXWue0Thq9StjUM0uJ8.fCSFCnU6H1kJq7wX3dMwCqYl2zRa');
    return null;
  }
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return null;
  return signDefaultSession(user);
}

export function verifyToken(token: string): AuthPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (typeof decoded !== 'object' || decoded === null) return null;
    const { userId, username, orgId } = decoded as Record<string, unknown>;
    if (typeof userId !== 'number' || typeof username !== 'string') return null;
    if (orgId !== null && typeof orgId !== 'number') return null;
    return { userId, username, orgId };
  } catch {
    return null;
  }
}

// Middleware unico para la API JSON. Devuelve 401 si no hay cookie valida —
// el redirect al /login lo maneja el SPA client-side (React Router), no el
// backend. Hidrata req.user con teams desde la DB (cache de 60s).
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = readCookie(req, COOKIE_NAME);
  if (token) {
    const decoded = verifyToken(token);
    if (decoded) {
      try {
        const user = await hydrateUser(decoded);
        if (user) {
          req.user = user;
          next();
          return;
        }
      } catch (err) {
        next(err);
        return;
      }
    }
  }
  res.status(401).json({ error: 'No autorizado' });
}

// Variante que hidrata el user si hay cookie valida pero no falla si no la hay.
// Uso: endpoints publicos que igual quieren saber quien esta logueado (ej. para
// permitir comentarios en docs publicos solo a users autenticados).
export async function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = readCookie(req, COOKIE_NAME);
  if (!token) { next(); return; }
  const decoded = verifyToken(token);
  if (!decoded) { next(); return; }
  try {
    const user = await hydrateUser(decoded);
    if (user) req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

// Helper para autorizacion por team. Usar despues de requireAuth.
export function userHasTeam(req: Request, slug: string): boolean {
  const user = req.user;
  if (!user) return false;
  const target = slug.toLowerCase();
  return user.teams.some((t) => t.slug.toLowerCase() === target);
}

export { COOKIE_NAME };
