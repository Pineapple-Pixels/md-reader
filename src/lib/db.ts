import postgres from 'postgres';
import { DATABASE_URL } from './config.js';

// postgres.js maneja pool interno. Exportamos un singleton.
// onnotice silenciado para no llenar logs con "NOTICE" de CREATE IF NOT EXISTS.
export const sql = postgres(DATABASE_URL, {
  onnotice: () => { /* silenciar NOTICE */ },
  // max: 10 por default — suficiente para 15 users.
});

export async function closeDb(): Promise<void> {
  await sql.end({ timeout: 5 });
}
