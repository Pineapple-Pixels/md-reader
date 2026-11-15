// Test-only values for the throwaway end-to-end environment; nothing here is a real secret.
export const E2E_PORT = 3600;
export const E2E_DB = 'mdreader_e2e';
export const E2E_STORAGE = '.e2e-storage';
export const ADMIN = { user: 'admin', pass: 'e2e-admin-pass' };
export const BETO = { user: 'beto', pass: 'e2e-beto-pass' };
export const LUZ = { user: 'luz', pass: 'e2e-luz-pass' };

/** Postgres server (maintenance DB) where the e2e database is recreated on every run. */
export const serverUrl = (): string =>
  process.env['E2E_DATABASE_URL'] ?? 'postgres://mdreader:mdreader@localhost:5433/postgres';

export function databaseUrl(): string {
  const url = new URL(serverUrl());
  url.pathname = `/${E2E_DB}`;
  return url.toString();
}

export function e2eEnv(): Record<string, string> {
  return {
    PORT: String(E2E_PORT),
    DATABASE_URL: databaseUrl(),
    STORAGE_DIR: E2E_STORAGE,
    JWT_SECRET: 'e2e-jwt-secret',
    ADMIN_USER: ADMIN.user,
    ADMIN_PASS: ADMIN.pass,
    GOOGLE_CLIENT_ID: '',
    GOOGLE_CLIENT_SECRET: '',
    PUBLIC_URL: '',
  };
}
