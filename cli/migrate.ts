#!/usr/bin/env tsx
// Migration runner: aplica archivos migrations/NNN_*.sql en orden numerico.
// Tracking en tabla _migrations. Idempotente — re-ejecuciones no hacen nada.

import { readdir, readFile } from 'fs/promises';
import { resolve, join } from 'path';
import { sql, closeDb } from '../src/lib/db.js';

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
  return entries
    .filter((f) => f.endsWith('.sql'))
    .sort(); // Orden lexicografico — por eso el prefijo NNN_.
}

async function applyMigration(file: string): Promise<void> {
  const path = join(MIGRATIONS_DIR, file);
  const content = await readFile(path, 'utf-8');
  console.log(`[migrate] aplicando ${file}...`);
  // Transaccion: si el SQL falla, no queda registrado como aplicado.
  await sql.begin(async (tx) => {
    await tx.unsafe(content);
    await tx`INSERT INTO _migrations (id) VALUES (${file})`;
  });
  console.log(`[migrate] OK ${file}`);
}

async function main(): Promise<void> {
  await ensureMigrationsTable();
  const applied = await appliedMigrations();
  const files = await listMigrationFiles();

  const pending = files.filter((f) => !applied.has(f));
  if (pending.length === 0) {
    console.log('[migrate] sin migraciones pendientes');
    return;
  }

  console.log(`[migrate] ${pending.length} migracion(es) pendientes`);
  for (const file of pending) {
    await applyMigration(file);
  }
  console.log('[migrate] completado');
}

main()
  .catch((err) => {
    console.error('[migrate] error:', err);
    process.exitCode = 1;
  })
  .finally(() => {
    void closeDb();
  });
