import { ADMIN_USER, ADMIN_PASS } from './config.js';
import { countUsers, createUser } from './users.js';
import { logger } from './logger.js';

// Si la DB arranca vacia y existen ADMIN_USER/ADMIN_PASS en el env,
// seed del admin como user id 1 con role admin.
// Idempotente: no hace nada si ya hay users.
export async function seedAdminIfEmpty(): Promise<void> {
  const n = await countUsers();
  if (n > 0) return;
  if (!ADMIN_USER || !ADMIN_PASS) {
    logger.warn('seed', 'users vacia pero ADMIN_USER/ADMIN_PASS no estan configurados. Crea users con `npm run user:create`.');
    return;
  }
  const user = await createUser({
    username: ADMIN_USER,
    password: ADMIN_PASS,
    role: 'admin',
  });
  logger.info('seed', 'admin creado desde env', { id: user.id, username: user.username });
}
