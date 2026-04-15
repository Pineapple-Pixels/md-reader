// Migration runner embebido — se ejecuta en el startup del server.
// Aplica archivos migrations/NNN_*.sql en orden numerico.
// Tracking en tabla _migrations. Idempotente.

import { readdir, readFile } from 'fs/promises';
import { resolve, join } from 'path';
import { sql } from './db.js';
import { logger } from './logger.js';

const MIGRATIONS_DIR = resolve('migrations');

async function ensureMigrationsTable(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS _migrations (
      id         TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
}

async function appliedMigrations(): Promise<Set<string>> {
  const rows = await sql<{ id: string }[]>`SELECT id FROM _migrations`;
  return new Set(rows.map((r) => r.id));
}

async function listMigrationFiles(): Promise<string[]> {
  const entries = await readdir(MIGRATIONS_DIR);
  return entries.filter((f) => f.endsWith('.sql')).sort();
}

async function applyMigration(file: string): Promise<void> {
  const path = join(MIGRATIONS_DIR, file);
  const content = await readFile(path, 'utf-8');
  logger.info('migrate', `aplicando ${file}...`);
  await sql.begin(async (tx) => {
    await tx.unsafe(content);
    await tx`INSERT INTO _migrations (id) VALUES (${file})`;
  });
  logger.info('migrate', `OK ${file}`);
}

export async function runMigrations(): Promise<void> {
  await ensureMigrationsTable();
  const applied = await appliedMigrations();
  const files = await listMigrationFiles();
  const pending = files.filter((f) => !applied.has(f));

  if (pending.length === 0) {
    logger.info('migrate', 'sin migraciones pendientes');
    return;
  }

  logger.info('migrate', `${pending.length} migracion(es) pendientes`);
  for (const file of pending) {
    await applyMigration(file);
  }
  logger.info('migrate', 'completado');
}
