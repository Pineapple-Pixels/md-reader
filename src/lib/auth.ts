import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import { JWT_SECRET } from './config.js';
import { findByUsername, verifyPassword } from './users.js';
import type { UserRole } from './users.js';
import { listTeamsForUser } from './teams.js';
import type { TeamMembership } from './teams.js';

const TOKEN_EXPIRY = '7d';
const COOKIE_NAME = 'docs_token';

// `AuthPayload` es lo que vive dentro del JWT. `AuthUser` es lo que cuelga
// de `req.user`: el payload hidratado con teams desde la DB. Los hacemos
// distintos porque no queremos reemitir el token cuando cambian los
// memberships.
export type AuthPayload = {
  userId: number;
  username: string;
  role: UserRole;
};

export type AuthUser = AuthPayload & {
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
const hydrateCache = new Map<number, CacheEntry>();

async function hydrateUser(payload: AuthPayload): Promise<AuthUser> {
  const cached = hydrateCache.get(payload.userId);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    // Refrescamos username/role desde el payload por si el JWT es nuevo con
    // datos distintos, pero los teams vienen del cache.
    return { ...payload, teams: cached.user.teams };
  }
  const teams = await listTeamsForUser(payload.userId);
  const user: AuthUser = { ...payload, teams };
  hydrateCache.set(payload.userId, { user, expiresAt: now + HYDRATE_TTL_MS });
  return user;
}

// Invalida el cache para un user. Llamar despues de add/remove member
// en el mismo proceso (p.ej. si agregamos admin UI). En prod los CLI
// corren en proceso aparte; la staleness se limita al TTL.
export function invalidateHydrateCache(userId: number): void {
  hydrateCache.delete(userId);
}

export async function login(username: string, password: string): Promise<string | null> {
  const user = await findByUsername(username);
  if (!user) {
    // Dummy compare para equiparar tiempos entre "user no existe" y "password mal".
    // Evita user enumeration via timing.
    await verifyPassword(password, '$2a$12$CwTycUXWue0Thq9StjUM0uJ8.fCSFCnU6H1kJq7wX3dMwCqYl2zRa');
    return null;
  }
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return null;
  const payload: AuthPayload = {
    userId: user.id,
    username: user.username,
    role: user.role,
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

export function verifyToken(token: string): AuthPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (typeof decoded !== 'object' || decoded === null) return null;
    const { userId, username, role } = decoded as Record<string, unknown>;
    if (typeof userId !== 'number' || typeof username !== 'string') return null;
    if (role !== 'admin' && role !== 'member') return null;
    return { userId, username, role };
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
        req.user = await hydrateUser(decoded);
        next();
        return;
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
    req.user = await hydrateUser(decoded);
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
