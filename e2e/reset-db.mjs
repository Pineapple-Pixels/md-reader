// Recreates the e2e database and storage before the test server starts (it then migrates and seeds the admin).
import postgres from 'postgres';
import { rm } from 'fs/promises';

const server = process.env.E2E_DATABASE_URL ?? 'postgres://mdreader:mdreader@localhost:5433/postgres';
const sql = postgres(server, { onnotice: () => {}, max: 1 });
try {
  await sql.unsafe('DROP DATABASE IF EXISTS mdreader_e2e WITH (FORCE)');
  await sql.unsafe('CREATE DATABASE mdreader_e2e');
} catch (err) {
  console.error(`[e2e] no se pudo preparar la base en ${new URL(server).host}: ${err.message}`);
  process.exit(1);
} finally {
  await sql.end();
}
await rm('.e2e-storage', { recursive: true, force: true });
