import { execSync } from 'child_process';
import { e2eEnv } from './env';

/** Runs after the web server is up (and has migrated the fresh database). */
export default function globalSetup(): void {
  execSync('npx tsx e2e/seed.ts', { stdio: 'inherit', env: { ...process.env, ...e2eEnv() } });
}
