import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { JWT_SECRET, PUB_TOKEN } from './config.js';
import { findByUsername, verifyPassword } from './users.js';
import type { UserRole } from './users.js';

const TOKEN_EXPIRY = '7d';
const COOKIE_NAME = 'docs_token';

// Shape del payload JWT. `iat`/`exp` los agrega jsonwebtoken.
export type AuthPayload = {
  userId: number;
  username: string;
  role: UserRole;
};

function safeEqual(a: string, b: string): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// `req.cookies` viene tipado como `any` por @types/cookie-parser; lo centralizamos
// aca para que el resto del codigo trabaje con un tipo concreto.
function readCookie(req: Request, name: string): string | undefined {
  const cookies = req.cookies as Record<string, string | undefined> | undefined;
  return cookies?.[name];
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

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = readCookie(req, COOKIE_NAME);
  if (token) {
    const decoded = verifyToken(token);
    if (decoded) {
      req.user = decoded;
      next();
      return;
    }
  }
  res.redirect('/login');
}

export function requireTokenOrAuth(req: Request, res: Response, next: NextFunction): void {
  // CLI token auth via header (comparacion en tiempo constante)
  const headerToken = req.headers['x-pub-token'];
  if (typeof headerToken === 'string' && PUB_TOKEN && safeEqual(headerToken, PUB_TOKEN)) {
    next();
    return;
  }
  // Cookie auth
  const cookie = readCookie(req, COOKIE_NAME);
  if (cookie) {
    const decoded = verifyToken(cookie);
    if (decoded) {
      req.user = decoded;
      next();
      return;
    }
  }
  res.status(401).json({ error: 'No autorizado' });
}

export { COOKIE_NAME };
