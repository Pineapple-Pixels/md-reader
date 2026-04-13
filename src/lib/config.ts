import { resolve } from 'path';
import MarkdownIt from 'markdown-it';
import { sourceLinePlugin } from './md-source-lines.js';
import { logger } from './logger.js';

// Raíz única para todos los scopes (multi-user).
// Layout:
//   storage/users/<userId>/   → docs privados
//   storage/teams/<slug>/     → docs compartidos por team
//   storage/public/           → docs visibles para todos (lectura anónima OK)
export const STORAGE_DIR = resolve(process.env['STORAGE_DIR'] || './storage');

export const ADMIN_USER = process.env['ADMIN_USER'] || 'admin';
export const ADMIN_PASS = process.env['ADMIN_PASS'] || '';
export const JWT_SECRET = process.env['JWT_SECRET'] || 'change-me-in-production';
export const DATABASE_URL = process.env['DATABASE_URL'] || '';

if (!DATABASE_URL) {
  const msg = 'DATABASE_URL no esta configurado. Requerido para login multi-usuario.';
  if (process.env['NODE_ENV'] === 'production') throw new Error(msg);
  logger.warn('config', msg);
}

// Fail-fast en produccion si no hay un JWT_SECRET seguro configurado
if (process.env['NODE_ENV'] === 'production') {
  if (!JWT_SECRET || JWT_SECRET === 'change-me-in-production') {
    throw new Error('JWT_SECRET debe estar configurado con un valor seguro en produccion');
  }
} else if (!JWT_SECRET || JWT_SECRET === 'change-me-in-production') {
  logger.warn('config', 'JWT_SECRET no esta configurado o usa el valor por defecto. Configuralo antes de ir a produccion.');
}

// html: false para prevenir XSS via markdown embebido
export const md = new MarkdownIt({ html: false, linkify: true, typographer: true });
md.use(sourceLinePlugin);
