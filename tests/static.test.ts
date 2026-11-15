import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import { mkdtemp, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { staticAssets } from '../src/lib/static.js';

describe('staticAssets in production', () => {
  let dir: string;
  let server: Server;
  let base: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'static-test-'));
    await writeFile(join(dir, 'index.html'), '<html></html>');
    await writeFile(join(dir, 'app-abc123.js'), 'x');
    const app = express().use(staticAssets(dir, true));
    server = app.listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    server.close();
    await rm(dir, { recursive: true, force: true });
  });

  // Regression: index.html cached for a year kept browsers on the bundle with the double-login bug.
  it('should revalidate index.html when it is served for /', async () => {
    const res = await fetch(`${base}/`);
    expect(res.headers.get('cache-control')).toBe('no-cache');
  });

  it('should cache hashed assets for a year when they are requested', async () => {
    const res = await fetch(`${base}/app-abc123.js`);
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
  });
});
