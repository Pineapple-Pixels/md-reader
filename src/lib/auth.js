import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { ADMIN_USER, ADMIN_PASS, JWT_SECRET, PUB_TOKEN } from './config.js';

const TOKEN_EXPIRY = '7d';
const COOKIE_NAME = 'docs_token';

function safeEqual(a, b) {
  if (!a || !b) return false;
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function login(user, pass) {
  if (ADMIN_PASS && user === ADMIN_USER && pass === ADMIN_PASS) {
    return jwt.sign({ user }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
  }
  return null;
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

export function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (token) {
    const decoded = verifyToken(token);
    if (decoded) {
      req.user = decoded;
      return next();
    }
  }
  res.redirect('/login');
}

export function requireTokenOrAuth(req, res, next) {
  // CLI token auth via header (comparacion en tiempo constante)
  const headerToken = req.headers['x-pub-token'];
  if (headerToken && PUB_TOKEN && safeEqual(headerToken, PUB_TOKEN)) {
    return next();
  }
  // Cookie auth
  const cookie = req.cookies?.[COOKIE_NAME];
  if (cookie) {
    const decoded = verifyToken(cookie);
    if (decoded) {
      req.user = decoded;
      return next();
    }
  }
  res.status(401).json({ error: 'No autorizado' });
}

export { COOKIE_NAME };
