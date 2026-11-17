import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import { mkdtemp, rm, readFile, writeFile } from 'fs/promises';
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
  let anaId: number;
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
    anaId = anaU.id;
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

  it('should order docs saved at the same instant by name', async () => {
    // Arrange
    const fs = await import('fs/promises');
    const dir = await mkdtemp(join(tmpdir(), 'mdreader-order-'));
    try {
      const when = new Date('2026-01-01T00:00:00Z');
      for (const f of ['c.md', 'a.md', '_b.md']) {
        await fs.writeFile(join(dir, f), f);
        await fs.utimes(join(dir, f), when, when);
      }

      // Act
      const files = await (await import('../src/lib/storage.js')).getFiles(dir);

      // Assert
      expect(files.map((f) => f.name)).toEqual(['_b.md', 'a.md', 'c.md']);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('should list and read versions saved in the legacy by-name layout', async () => {
    // Arrange
    await api(ana, '/push?scope=me', { file: 'viejo/legado.md', content: 'actual' });
    const legacyDir = join(storage, 'orgs', 'default', 'users', String((await db.sql<{ id: number }[]>`SELECT id FROM users WHERE username = 'ana'`)[0]!.id), '.versions', 'legado');
    const id = '2025-01-02T03-04-05-006Z.md';
    await import('fs/promises').then((fs) => fs.mkdir(legacyDir, { recursive: true }).then(() => fs.writeFile(join(legacyDir, id), 'version vieja')));

    // Act
    const versions = (await (await api(ana, '/versions?scope=me&file=viejo/legado.md')).json()) as { id: string }[];
    const old = (await (await api(ana, `/version?scope=me&file=viejo/legado.md&id=${id}`)).json()) as { content: string };

    // Assert
    expect(versions.map((v) => v.id)).toEqual([id]);
    expect(old.content).toBe('version vieja');
  });

  it('should refuse to create a doc over an existing one when createOnly is set', async () => {
    // Arrange
    await api(ana, '/push?scope=me', { file: 'unico.md', content: 'original' });

    // Act
    const res = await api(ana, '/push?scope=me', { file: 'unico.md', content: 'pisado', createOnly: true });
    const fresh = await api(ana, '/push?scope=me', { file: 'nuevo.md', content: 'hola', createOnly: true });

    // Assert
    expect(res.status).toBe(409);
    expect((await pull('me', 'unico.md')).content).toBe('original');
    expect(fresh.status).toBe(200);
  });

  it('should hold every lock of a multi-file operation until it finishes', async () => {
    // Arrange
    const { withFileLock, withFileLocks } = await import('../src/lib/storage.js');
    const order: string[] = [];
    let release!: () => void;
    let started!: () => void;
    const held = new Promise<void>((r) => { release = r; });
    const holding = new Promise<void>((r) => { started = r; });

    // Act
    const multi = withFileLocks(['/x/b', '/x/a'], async () => { order.push('multi start'); started(); await held; order.push('multi end'); });
    await holding;
    const single = withFileLock('/x/b', async () => { order.push('single'); });
    release();
    await Promise.all([multi, single]);

    // Assert
    expect(order).toEqual(['multi start', 'multi end', 'single']);
  });

  it('should serve HTML documents only through the sandboxed frame, with scripts off', async () => {
    // Arrange
    expect((await api(ana, '/push?scope=me', { file: 'demo.html', content: '<h1>Demo</h1>' })).status).toBe(200);

    // Act
    const render = (await (await api(ana, '/render?scope=me&file=demo.html')).json()) as { kind: string; html: string };
    const frame = await api(ana, '/frame?scope=me&file=demo.html');

    // Assert
    expect(render).toMatchObject({ kind: 'html', html: '' });
    expect(frame.status).toBe(200);
    const csp = frame.headers.get('content-security-policy')!;
    expect(csp).toMatch(/^sandbox allow-popups allow-popups-to-escape-sandbox;/);
    expect(csp).toContain("script-src 'none'");
    expect(frame.headers.get('x-content-type-options')).toBe('nosniff');
    expect(await frame.text()).toBe('<h1>Demo</h1>');
    expect((await api(ana, '/frame?scope=me&file=notas.md')).status).toBe(400);
  });

  it('should refuse to upload or save an HTML document that carries JavaScript', async () => {
    // Arrange
    await api(ana, '/push?scope=me', { file: 'limpio.html', content: '<p>uno</p>' });
    const { hash } = await pull('me', 'limpio.html');

    // Act
    const pushed = await api(ana, '/push?scope=me', { file: 'malo.html', content: '<p>x</p><script>fetch("https://x.test")</script>' });
    const saved = await api(ana, '/save?scope=me', { file: 'limpio.html', content: '<button onclick="go()">ir</button>', baseHash: hash });
    const md = await api(ana, '/push?scope=me', { file: 'apunte.md', content: '# Apunte\n\n<script>1</script>' });

    // Assert
    expect(pushed.status).toBe(400);
    expect(await pushed.json()).toEqual({ error: 'El HTML trae JavaScript (etiqueta <script>). Sacalo y volve a subirlo', script: true });
    expect((await api(ana, '/pull?scope=me&file=malo.html')).status).toBe(404);
    expect(saved.status).toBe(400);
    expect(await saved.json()).toMatchObject({ script: true });
    expect((await pull('me', 'limpio.html')).content).toBe('<p>uno</p>');
    expect(md.status).toBe(200);
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

  // ---------- Archive ----------

  const names = async (path: string) => ((await (await api(ana, path)).json()) as { name: string }[]).map((f) => f.name);

  it('should archive a doc out of every list and restore it with its history and comments', async () => {
    // Arrange
    await api(ana, '/push?scope=me', { file: 'archivo/guardar.md', content: '# uno' });
    await api(ana, '/push?scope=me', { file: 'archivo/guardar.md', content: '# dos' });
    await api(ana, '/comments?scope=me', { file: 'archivo/guardar.md', text: 'ojo' });

    // Act
    const archived = await api(ana, '/archive?scope=me', { file: 'archivo/guardar.md' });

    // Assert
    expect(archived.status).toBe(200);
    expect(await names('/docs?scope=me')).not.toContain('archivo/guardar.md');
    const index = (await (await api(ana, '/search-index?scope=me')).json()) as { file: string }[];
    expect(index.map((e) => e.file)).not.toContain('archivo/guardar.md');
    expect(await names('/archived?scope=me')).toContain('archivo/guardar.md');

    // Act
    const restored = await api(ana, '/unarchive?scope=me', { file: 'archivo/guardar.md' });

    // Assert
    expect(restored.status).toBe(200);
    expect((await pull('me', 'archivo/guardar.md')).content).toBe('# dos');
    expect(await names('/archived?scope=me')).not.toContain('archivo/guardar.md');
    expect(await (await api(ana, '/versions?scope=me&file=archivo/guardar.md')).json()).toHaveLength(1);
    const comments = (await (await api(ana, '/comments?scope=me&file=archivo/guardar.md')).json()) as { data: { text: string }[] };
    expect(comments.data.map((c) => c.text)).toEqual(['ojo']);
  });

  it('should archive a whole folder and archive the same name again after restoring it', async () => {
    // Arrange
    await api(ana, '/push?scope=me', { file: 'carpeta/a.md', content: 'a' });
    await api(ana, '/push?scope=me', { file: 'carpeta/sub/b.html', content: '<p>b</p>' });

    // Act
    expect((await api(ana, '/archive?scope=me', { file: 'carpeta' })).status).toBe(200);

    // Assert
    expect((await names('/docs?scope=me')).filter((n) => n.startsWith('carpeta/'))).toEqual([]);
    expect((await names('/archived?scope=me')).filter((n) => n.startsWith('carpeta/')).sort()).toEqual(['carpeta/a.md', 'carpeta/sub/b.html']);

    // Restoring file by file leaves no empty folder behind in the archive, so the name is free again.
    expect((await api(ana, '/unarchive?scope=me', { file: 'carpeta/a.md' })).status).toBe(200);
    expect((await api(ana, '/unarchive?scope=me', { file: 'carpeta/sub/b.html' })).status).toBe(200);
    expect((await api(ana, '/archive?scope=me', { file: 'carpeta' })).status).toBe(200);
    expect((await api(ana, '/unarchive?scope=me', { file: 'carpeta' })).status).toBe(200);
    expect((await names('/docs?scope=me')).filter((n) => n.startsWith('carpeta/')).sort()).toEqual(['carpeta/a.md', 'carpeta/sub/b.html']);
  });

  it('should never overwrite when the archive or the scope already has that name', async () => {
    // Arrange
    await api(ana, '/push?scope=me', { file: 'choque.md', content: 'primero' });
    await api(ana, '/archive?scope=me', { file: 'choque.md' });
    await api(ana, '/push?scope=me', { file: 'choque.md', content: 'segundo' });

    // Act
    const archiveAgain = await api(ana, '/archive?scope=me', { file: 'choque.md' });
    const restore = await api(ana, '/unarchive?scope=me', { file: 'choque.md' });

    // Assert
    expect(archiveAgain.status).toBe(409);
    expect(restore.status).toBe(409);
    expect((await pull('me', 'choque.md')).content).toBe('segundo');
    expect(await names('/archived?scope=me')).toContain('choque.md');
  });

  it('should keep an archived doc comments and history apart from a new doc with the same name', async () => {
    // Arrange
    const comments = async () =>
      ((await (await api(ana, '/comments?scope=me&file=gemelo.md')).json()) as { data: { text: string }[] }).data.map((c) => c.text);
    const versions = async () => ((await (await api(ana, '/versions?scope=me&file=gemelo.md')).json()) as unknown[]).length;
    await api(ana, '/push?scope=me', { file: 'gemelo.md', content: 'v1' });
    await api(ana, '/push?scope=me', { file: 'gemelo.md', content: 'v2' });
    await api(ana, '/comments?scope=me', { file: 'gemelo.md', text: 'del archivado' });
    await api(ana, '/archive?scope=me', { file: 'gemelo.md' });

    // Act
    await api(ana, '/push?scope=me', { file: 'gemelo.md', content: 'nuevo' });
    const newDocComments = await comments();
    const newDocVersions = await versions();
    await api(ana, '/delete?scope=me', { file: 'gemelo.md' }, 'DELETE');
    const restored = await api(ana, '/unarchive?scope=me', { file: 'gemelo.md' });

    // Assert
    expect(newDocComments).toEqual([]);
    expect(newDocVersions).toBe(0);
    expect(restored.status).toBe(200);
    expect((await pull('me', 'gemelo.md')).content).toBe('v2');
    expect(await comments()).toEqual(['del archivado']);
    // v1 from before archiving, plus 'nuevo', which the delete of the new doc kept as its backup.
    const ids = (await (await api(ana, '/versions?scope=me&file=gemelo.md')).json()) as { id: string }[];
    const texts = await Promise.all(ids.map(async (v) =>
      ((await (await api(ana, `/version?scope=me&file=gemelo.md&id=${encodeURIComponent(v.id)}`)).json()) as { content: string }).content));
    expect(texts.sort()).toEqual(['nuevo', 'v1']);
  });

  it('should refuse archiving without write access, unsafe paths and missing docs', async () => {
    expect((await api(luis, '/archive?scope=public', { file: 'x.md' })).status).toBe(403);
    expect((await api(luis, '/archived?scope=public')).status).toBe(403);
    expect((await api(ana, '/archive?scope=me', { file: '../x.md' })).status).toBe(400);
    expect((await api(ana, '/archive?scope=me', { file: '.versions' })).status).toBe(400);
    expect((await api(ana, '/unarchive?scope=me', { file: 'a/../../x.md' })).status).toBe(400);
    expect((await api(ana, '/archive?scope=me', { file: 'no-existe.md' })).status).toBe(404);
    await writeFile(join(storage, 'orgs', 'default', 'users', String(anaId), 'notas.txt'), 'x');
    expect((await api(ana, '/archive?scope=me', { file: 'notas.txt' })).status).toBe(400);
    expect((await api(ana, '/unarchive?scope=me', { file: 'no-existe.md' })).status).toBe(404);
  });
});
