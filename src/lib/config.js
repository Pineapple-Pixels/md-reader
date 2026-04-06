import { resolve } from 'path';
import MarkdownIt from 'markdown-it';

export const PUB_DIR = resolve(process.env.PUB_DIR || './pub-docs');
export const PUB_TOKEN = process.env.PUB_TOKEN || '';

export const ADMIN_USER = process.env.ADMIN_USER || 'admin';
export const ADMIN_PASS = process.env.ADMIN_PASS || '';
export const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';

// Fail-fast in produccion si no hay un JWT_SECRET seguro configurado
if (process.env.NODE_ENV === 'production') {
  if (!JWT_SECRET || JWT_SECRET === 'change-me-in-production') {
    throw new Error('JWT_SECRET debe estar configurado con un valor seguro en produccion');
  }
} else if (!JWT_SECRET || JWT_SECRET === 'change-me-in-production') {
  console.warn('[config] JWT_SECRET no esta configurado o usa el valor por defecto. Configuralo antes de ir a produccion.');
}

// html: false para prevenir XSS via markdown embebido
export const md = new MarkdownIt({ html: false, linkify: true, typographer: true });
