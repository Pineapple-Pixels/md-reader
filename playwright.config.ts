import { defineConfig, devices } from '@playwright/test';
import { E2E_PORT, e2eEnv } from './e2e/env';

// End-to-end and visual checks against the production build, on a fresh database each run.
// Needs a Postgres server reachable at E2E_DATABASE_URL (see README, "Tests end-to-end").
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: `http://localhost:${E2E_PORT}`,
    viewport: { width: 1280, height: 800 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.01 },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } }],
  webServer: {
    command: 'node e2e/reset-db.mjs && npm run build && node dist/src/index.js',
    url: `http://localhost:${E2E_PORT}/health`,
    env: e2eEnv(),
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
