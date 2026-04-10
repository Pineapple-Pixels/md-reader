import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { ADMIN_USER, ADMIN_PASS, JWT_SECRET, PUB_TOKEN } from './config.js';

const TOKEN_EXPIRY = '7d';
const COOKIE_NAME = 'docs_token';

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

export function login(user: string, pass: string): string | null {
  if (ADMIN_PASS && user === ADMIN_USER && pass === ADMIN_PASS) {
    return jwt.sign({ user }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
  }
  return null;
}

export function verifyToken(token: string): jwt.JwtPayload | string | null {
  try {
    return jwt.verify(token, JWT_SECRET);
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
