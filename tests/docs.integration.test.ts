import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import { mkdtemp, rm, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import express from 'express';
import cookieParser from 'cookie-parser';
import type { AddressInfo } from 'net';
import type { Server } from 'http';

// Document routes (save/conflicts, history, MDX/HTML, Word, copy to team) on the real /api router,
// against a throwaway database (TEST_DATABASE_URL, needs CREATEDB) and a temp storage dir.
const SERVER_URL = process.env['TEST_DATABASE_URL'];
const DB_NAME = `mdreader_docs_${Date.now()}`;

describe.skipIf(!SERVER_URL)('document routes against Postgres', () => {
  let admin: postgres.Sql;
  let storage: string;
  let server: Server;
  let base: string;
  let ana: string;
  let luis: string;
  let db: typeof import('../src/lib/db.js');

  beforeAll(async () => {
    admin = postgres(SERVER_URL!, { onnotice: () => {} });
    await admin.unsafe(`CREATE DATABASE ${DB_NAME}`);
    const url = new URL(SERVER_URL!);
    url.pathname = `/${DB_NAME}`;
    process.env['DATABASE_URL'] = url.toString();
    storage = await mkdtemp(join(tmpdir(), 'mdreader-docs-'));
    process.env['STORAGE_DIR'] = storage;

    db = await import('../src/lib/db.js');
    await (await import('../src/lib/migrate.js')).runMigrations();
    const orgs = await import('../src/lib/orgs.js');
    const users = await import('../src/lib/users.js');
    const teams = await import('../src/lib/teams.js');
    const { signSession } = await import('../src/lib/auth.js');

    const def = await orgs.requireOrg('default');
    const other = await orgs.createOrg({ slug: 'otra', name: 'Otra' });
    const anaU = await users.createUser({ username: 'ana', password: 'secreto1' });
    const luisU = await users.createUser({ username: 'luis', password: 'secreto1' });
    await orgs.addOrgMember(def.id, anaU.id, 'admin');
    await orgs.addOrgMember(def.id, luisU.id, 'member');
    await orgs.addOrgMember(other.id, anaU.id, 'member');
    await teams.createTeam(def.id, { slug: 'catedra-a', name: 'Catedra A' });
    await teams.createTeam(def.id, { slug: 'catedra-b', name: 'Catedra B' });
    await teams.addMember(def.id, 'catedra-a', 'ana');
    await teams.addMember(def.id, 'catedra-b', 'ana');
    await teams.addMember(def.id, 'catedra-a', 'luis');
    ana = `docs_token=${signSession({ id: anaU.id, username: 'ana' }, def.id)}`;
    luis = `docs_token=${signSession({ id: luisU.id, username: 'luis' }, def.id)}`;

    const app = express().use(cookieParser()).use(express.json());
    app.use('/api', (await import('../src/routes/api.js')).default);
    server = app.listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    server?.close();
    await db?.closeDb();
    await admin.unsafe(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`);
    await admin.end();
    await rm(storage, { recursive: true, force: true });
  });

  function api(cookie: string, path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST') {
    return fetch(`${base}/api${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }
  const pull = async (scope: string, file: string) =>
    (await (await api(ana, `/pull?scope=${scope}&file=${encodeURIComponent(file)}`)).json()) as { content: string; hash: string };

  it('should refuse a save whose base is stale and keep the overwritten text in the history', async () => {
    // Arrange
    await api(ana, '/push?scope=me', { file: 'notas.md', content: 'uno' });
    const { hash } = await pull('me', 'notas.md');
    expect((await api(ana, '/save?scope=me', { file: 'notas.md', content: 'dos', baseHash: hash })).status).toBe(200);

    // Act
    const stale = await api(ana, '/save?scope=me', { file: 'notas.md', content: 'tres', baseHash: hash });
    const forced = await api(ana, '/save?scope=me', { file: 'notas.md', content: 'tres', baseHash: hash, force: true });

    // Assert
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ conflict: true, deleted: false });
    expect(forced.status).toBe(200);
    expect((await pull('me', 'notas.md')).content).toBe('tres');
    const versions = (await (await api(ana, '/versions?scope=me&file=notas.md')).json()) as { id: string }[];
    const contents = await Promise.all(versions.map(async (v) =>
      ((await (await api(ana, `/version?scope=me&file=notas.md&id=${encodeURIComponent(v.id)}`)).json()) as { content: string }).content));
    expect(contents.sort()).toEqual(['dos', 'uno']);
  });

  it('should require baseHash to save and report a deleted document as a conflict', async () => {
    await api(ana, '/push?scope=me', { file: 'borrar.md', content: 'x' });
    const { hash } = await pull('me', 'borrar.md');

    expect((await api(ana, '/save?scope=me', { file: 'borrar.md', content: 'y' })).status).toBe(400);
    await api(ana, '/delete?scope=me', { file: 'borrar.md' }, 'DELETE');
    const res = await api(ana, '/save?scope=me', { file: 'borrar.md', content: 'y', baseHash: hash });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ deleted: true });
  });

  it('should keep separate histories for docs with the same name in different folders and restore one', async () => {
    for (const f of ['a/clase.md', 'b/clase.md']) {
      await api(ana, '/push?scope=me', { file: f, content: `${f} v1` });
      await api(ana, '/push?scope=me', { file: f, content: `${f} v2` });
    }
    const list = async (f: string) => (await (await api(ana, `/versions?scope=me&file=${f}`)).json()) as { id: string }[];
    const [a, b] = [await list('a/clase.md'), await list('b/clase.md')];
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);

    const restored = await api(ana, '/versions/restore?scope=me', { file: 'a/clase.md', id: a[0]!.id });

    expect(restored.status).toBe(200);
    expect((await pull('me', 'a/clase.md')).content).toBe('a/clase.md v1');
    expect((await pull('me', 'b/clase.md')).content).toBe('b/clase.md v2');
    expect(await list('a/clase.md')).toHaveLength(2);
    expect((await api(ana, '/version?scope=me&file=a/clase.md&id=..%2F..%2Fsecret.md')).status).toBe(404);
  });

  it('should serve HTML documents only through the sandboxed frame', async () => {
    await api(ana, '/push?scope=me', { file: 'demo.html', content: '<h1>Demo</h1><script>1</script>' });

    const render = (await (await api(ana, '/render?scope=me&file=demo.html')).json()) as { kind: string; html: string };
    const frame = await api(ana, '/frame?scope=me&file=demo.html');

    expect(render).toMatchObject({ kind: 'html', html: '' });
    expect(frame.status).toBe(200);
    expect(frame.headers.get('content-security-policy')).toMatch(/^sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox;/);
    expect(frame.headers.get('x-content-type-options')).toBe('nosniff');
    expect(await frame.text()).toContain('<script>1</script>');
    expect((await api(ana, '/frame?scope=me&file=notas.md')).status).toBe(400);
  });

  it('should export md and mdx to a Word file', async () => {
    await api(ana, '/push?scope=me', { file: 'informe.mdx', content: "import X from 'x'\n\n# Informe final\n\n- uno\n" });

    const res = await api(ana, '/export/docx?scope=me&file=informe.mdx');
    const buf = Buffer.from(await res.arrayBuffer());

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('wordprocessingml.document');
    expect(res.headers.get('content-disposition')).toContain('informe.docx');
    expect(buf.subarray(0, 2).toString()).toBe('PK');
    expect(buf.includes(Buffer.from('word/document.xml'))).toBe(true);
    expect((await api(ana, '/export/docx?scope=me&file=demo.html')).status).toBe(400);
  });

  it('should copy a doc to another team of the org, record its origin and refuse to overwrite silently', async () => {
    // Arrange
    await api(ana, '/push?scope=team:catedra-a', { file: 'tp/consigna.md', content: '# TP' });

    // Act
    const first = await api(ana, '/share?scope=team:catedra-a', { file: 'tp/consigna.md', to: 'catedra-b' });
    const again = await api(ana, '/share?scope=team:catedra-a', { file: 'tp/consigna.md', to: 'catedra-b' });

    // Assert
    expect(first.status).toBe(200);
    expect(again.status).toBe(409);
    expect(await again.json()).toMatchObject({ conflict: true, files: ['tp/consigna.md'] });
    const render = (await (await api(ana, '/render?scope=team:catedra-b&file=tp/consigna.md')).json()) as { origin: { fromLabel: string; by: string } };
    expect(render.origin).toMatchObject({ fromLabel: 'Catedra A', by: 'ana' });
  });

  it('should overwrite on request and keep the replaced copy in the target history', async () => {
    // Arrange
    await api(ana, '/push?scope=team:catedra-a', { file: 'tp/pisar.md', content: '# Original A' });
    await api(ana, '/push?scope=team:catedra-b', { file: 'tp/pisar.md', content: '# Editada en B' });

    // Act
    const res = await api(ana, '/share?scope=team:catedra-a', { file: 'tp/pisar.md', to: 'catedra-b', overwrite: true });

    // Assert
    expect(res.status).toBe(200);
    const pulled = (await (await api(ana, '/pull?scope=team:catedra-b&file=tp/pisar.md')).json()) as { content: string };
    expect(pulled.content).toBe('# Original A');
    const versions = (await (await api(ana, '/versions?scope=team:catedra-b&file=tp/pisar.md')).json()) as { id: string }[];
    expect(versions).toHaveLength(1);
    const old = (await (await api(ana, `/version?scope=team:catedra-b&file=tp/pisar.md&id=${encodeURIComponent(versions[0]!.id)}`)).json()) as { content: string };
    expect(old.content).toBe('# Editada en B');
  });

  it('should copy whole folders and only into teams the user belongs to', async () => {
    await api(ana, '/push?scope=me', { file: 'curso/1.md', content: '# 1' });
    await api(ana, '/push?scope=me', { file: 'curso/2.html', content: '<p>2</p>' });

    const folder = await api(ana, '/share?scope=me', { file: 'curso', to: 'catedra-a' });
    const notMember = await api(luis, '/share?scope=team:catedra-a', { file: 'curso', to: 'catedra-b' });
    const traversal = await api(ana, '/share?scope=me', { file: '../x', to: 'catedra-a' });

    expect(folder.status).toBe(200);
    expect(((await folder.json()) as { files: string[] }).files.sort()).toEqual(['curso/1.md', 'curso/2.html']);
    expect(notMember.status).toBe(403);
    expect(traversal.status).toBe(400);
    const origin = (await (await api(luis, '/render?scope=team:catedra-a&file=curso/1.md')).json()) as { origin: { fromLabel: string } };
    expect(origin.origin.fromLabel).toBe('Documentos de ana');
  });

  it('should refuse copying from another organization public docs', async () => {
    const pubDir = join(storage, 'orgs', 'otra', 'public');
    await import('fs/promises').then((fs) => fs.mkdir(pubDir, { recursive: true }).then(() => fs.writeFile(join(pubDir, 'x.md'), '# x')));

    const res = await api(ana, '/share?scope=public:otra', { file: 'x.md', to: 'catedra-a' });

    expect(res.status).toBe(403);
    await expect(readFile(join(storage, 'orgs', 'default', 'teams', 'catedra-a', 'x.md'))).rejects.toThrow();
  });

  it('should forget the origin when the copied doc is deleted', async () => {
    // Arrange
    await api(ana, '/push?scope=me', { file: 'olvido/apunte.md', content: '# x' });
    await api(ana, '/share?scope=me', { file: 'olvido', to: 'catedra-b' });
    const origins = () => db.sql`SELECT path FROM doc_origins WHERE scope_id = 'default/team:catedra-b' AND path LIKE 'olvido/%'`;
    expect(await origins()).toHaveLength(1);

    // Act
    await api(ana, '/delete?scope=team:catedra-b', { file: 'olvido' }, 'DELETE');

    // Assert
    expect(await origins()).toHaveLength(0);
  });
});
