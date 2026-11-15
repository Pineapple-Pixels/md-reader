import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import { readFile } from 'fs/promises';
import express from 'express';
import cookieParser from 'cookie-parser';
import type { AddressInfo } from 'net';

// Runs against a throwaway database created on the server in TEST_DATABASE_URL (needs CREATEDB).
// Example: TEST_DATABASE_URL=postgres://user:pass@localhost:5432/postgres npm test
const SERVER_URL = process.env['TEST_DATABASE_URL'];
const DB_NAME = `mdreader_it_${Date.now()}`;

type Libs = {
  db: typeof import('../src/lib/db.js');
  migrate: typeof import('../src/lib/migrate.js');
  orgs: typeof import('../src/lib/orgs.js');
  users: typeof import('../src/lib/users.js');
  teams: typeof import('../src/lib/teams.js');
  design: typeof import('../src/lib/design.js');
};

describe.skipIf(!SERVER_URL)('organizations against Postgres', () => {
  let admin: postgres.Sql;
  let lib: Libs;
  let orgA: number;
  let orgB: number;

  beforeAll(async () => {
    admin = postgres(SERVER_URL!, { onnotice: () => {} });
    await admin.unsafe(`CREATE DATABASE ${DB_NAME}`);
    const url = new URL(SERVER_URL!);
    url.pathname = `/${DB_NAME}`;
    process.env['DATABASE_URL'] = url.toString();

    // Pre-organization schema and data, as an existing install has it.
    const legacy = postgres(url.toString(), { onnotice: () => {} });
    for (const f of ['001_users.sql', '002_teams.sql', '003_comments.sql']) {
      await legacy.unsafe(await readFile(`migrations/${f}`, 'utf-8'));
    }
    await legacy`INSERT INTO users (username, password_hash, role) VALUES ('admin', 'x', 'admin')`;
    await legacy`INSERT INTO teams (slug, name) VALUES ('catedra', 'Catedra')`;
    await legacy`INSERT INTO team_members (user_id, team_id) SELECT u.id, t.id FROM users u, teams t`;
    await legacy`INSERT INTO comments (scope_id, file, text, author) VALUES ('team:catedra', 'a.md', 'hola', 'admin')`;
    await legacy.end();

    lib = {
      db: await import('../src/lib/db.js'),
      migrate: await import('../src/lib/migrate.js'),
      orgs: await import('../src/lib/orgs.js'),
      users: await import('../src/lib/users.js'),
      teams: await import('../src/lib/teams.js'),
      design: await import('../src/lib/design.js'),
    };
    await lib.migrate.runMigrations();
    orgA = (await lib.orgs.requireOrg('default')).id;
    orgB = (await lib.orgs.createOrg({ slug: 'facu-b', name: 'Facu B', allowedDomains: ['facub.edu'] })).id;
  });

  afterAll(async () => {
    await lib?.db.closeDb();
    await admin.unsafe(`DROP DATABASE IF EXISTS ${DB_NAME}`);
    await admin.end();
  });

  it('should keep existing users, teams and comments in the default org when migrations run', async () => {
    const user = await lib.users.findByUsername('admin');
    expect(await lib.orgs.listUserOrgs(user!.id)).toEqual([{ orgId: orgA, slug: 'default', name: 'Default', role: 'admin' }]);
    expect(await lib.orgs.defaultOrgId(user!.id)).toBe(orgA);
    expect(await lib.teams.listTeamsForUser(user!.id, orgA)).toEqual([{ slug: 'catedra', name: 'Catedra', role: 'member' }]);
    const comments = await lib.db.sql<{ scope_id: string }[]>`SELECT scope_id FROM comments`;
    expect(comments.map((c) => c.scope_id)).toEqual(['default/team:catedra']);
  });

  it('should allow the same team slug in two orgs and keep members apart', async () => {
    await lib.teams.createTeam(orgB, { slug: 'catedra', name: 'Catedra B' });
    const beto = await lib.users.createUser({ username: 'beto', password: 'secreto1' });
    await lib.orgs.addOrgMember(orgB, beto.id, 'admin');
    await lib.teams.addMember(orgB, 'catedra', 'beto');

    expect(await lib.teams.listTeamsForUser(beto.id, orgB)).toEqual([{ slug: 'catedra', name: 'Catedra B', role: 'member' }]);
    expect((await lib.teams.listMembers(orgA, 'catedra')).data.map((m) => m.username)).toEqual(['admin']);
  });

  it('should refuse team membership and admin actions across orgs', async () => {
    await expect(lib.teams.addMember(orgB, 'catedra', 'admin')).rejects.toThrow('no encontrados');
    expect(await lib.orgs.findMember(orgB, 'admin')).toBeNull();
    expect((await lib.orgs.listOrgMembers(orgB)).data.map((u) => u.username)).toEqual(['beto']);
    expect((await lib.teams.listTeams(orgA)).data.map((t) => t.name)).toEqual(['Catedra']);
  });

  it('should let one user belong to several orgs with a role in each', async () => {
    const admin = await lib.users.findByUsername('admin');
    await lib.orgs.addOrgMember(orgB, admin!.id, 'member');

    expect((await lib.orgs.listUserOrgs(admin!.id)).map((o) => [o.slug, o.role])).toEqual([['default', 'admin'], ['facu-b', 'member']]);
    expect(await lib.teams.listTeamsForUser(admin!.id, orgB)).toEqual([]);
    expect((await lib.orgs.findMember(orgB, 'admin'))?.orgCount).toBe(2);

    await lib.orgs.setLastOrg(admin!.id, orgB);
    expect(await lib.orgs.defaultOrgId(admin!.id)).toBe(orgB);

    expect(await lib.orgs.removeOrgMember(orgB, admin!.id)).toBe(true);
    expect(await lib.orgs.defaultOrgId(admin!.id)).toBe(orgA);
  });

  it('should create Google accounts without an org unless invited or admitted by Workspace domain', async () => {
    const gmail = await lib.users.findOrProvisionGoogleUser({ sub: 'g-0', email: 'Lu@gmail.com', name: 'Lu', hd: null });
    expect(gmail).toMatchObject({ username: 'lu@gmail.com', displayName: 'Lu' });
    expect(await lib.orgs.listUserOrgs(gmail.id)).toEqual([]);
    expect(await lib.orgs.defaultOrgId(gmail.id)).toBeNull();

    const personalSchool = await lib.users.findOrProvisionGoogleUser({ sub: 'g-1', email: 'ex@facub.edu', name: null, hd: null });
    expect(await lib.orgs.listUserOrgs(personalSchool.id)).toEqual([]);

    const workspace = await lib.users.findOrProvisionGoogleUser({ sub: 'g-2', email: 'Caro@FacuB.edu', name: 'Caro', hd: 'facub.edu' });
    expect((await lib.orgs.listUserOrgs(workspace.id)).map((o) => [o.slug, o.role])).toEqual([['facu-b', 'member']]);
    const again = await lib.users.findOrProvisionGoogleUser({ sub: 'g-2', email: 'caro@facub.edu', name: null, hd: 'facub.edu' });
    expect(again.id).toBe(workspace.id);
  });

  it('should turn invites into memberships when the invited email signs in with Google', async () => {
    const adminUser = await lib.users.findByUsername('admin');
    expect(await lib.orgs.inviteToOrg(orgA, 'Dani@gmail.com', 'admin', adminUser!.id)).toBe('invited');
    expect(await lib.orgs.inviteToOrg(orgB, 'dani@gmail.com', 'member', adminUser!.id)).toBe('invited');
    expect((await lib.orgs.listInvites(orgA)).map((i) => i.email)).toEqual(['dani@gmail.com']);

    const dani = await lib.users.findOrProvisionGoogleUser({ sub: 'g-3', email: 'dani@gmail.com', name: 'Dani', hd: null });
    expect((await lib.orgs.listUserOrgs(dani.id)).map((o) => [o.slug, o.role])).toEqual([['default', 'admin'], ['facu-b', 'member']]);
    expect(await lib.orgs.listInvites(orgA)).toEqual([]);

    // Inviting an email that already has an account adds it right away.
    const lu = await lib.users.findByUsername('lu@gmail.com');
    expect(await lib.orgs.inviteToOrg(orgB, 'lu@gmail.com', 'member', adminUser!.id)).toBe('added');
    expect((await lib.orgs.listUserOrgs(lu!.id)).map((o) => o.slug)).toEqual(['facu-b']);
  });

  it('should never hand a Google sign-in to a password account that carries the same email', async () => {
    // A password account with an unverified email (as admins could create before migration 007).
    const planted = await lib.users.createUser({ username: 'plantada', password: 'secreto1', email: 'victima@gmail.com' });
    const adminUser = await lib.users.findByUsername('admin');

    expect(await lib.orgs.inviteToOrg(orgA, 'victima@gmail.com', 'member', adminUser!.id)).toBe('invited');
    expect(await lib.orgs.listUserOrgs(planted.id)).toEqual([]);

    const victim = await lib.users.findOrProvisionGoogleUser({ sub: 'g-9', email: 'victima@gmail.com', name: null, hd: null });
    expect(victim.id).not.toBe(planted.id);
    expect((await lib.orgs.listUserOrgs(victim.id)).map((o) => o.slug)).toEqual(['default']);
    const plantedRow = await lib.db.sql<{ google_sub: string | null }[]>`SELECT google_sub FROM users WHERE id = ${planted.id}`;
    expect(plantedRow[0]?.google_sub).toBeNull();
  });

  it('should keep a Google account apart from a local account whose username is that email', async () => {
    await lib.users.createUser({ username: 'colision@gmail.com', password: 'secreto1' });
    const google = await lib.users.findOrProvisionGoogleUser({ sub: 'abc123456', email: 'colision@gmail.com', name: null, hd: null });
    expect(google.username).toBe('colision@gmail.com#123456');
  });

  it('should keep each org document design to itself', async () => {
    const { DEFAULT_DESIGN } = await import('../shared/design.js');
    const red = { ...DEFAULT_DESIGN, colors: { ...DEFAULT_DESIGN.colors, link: '#ff0000' } };
    await lib.design.saveOrgBrand(orgB, 'Facultad B', red);

    expect((await lib.design.getOrgBrand('facu-b'))?.design.colors.link).toBe('#ff0000');
    expect((await lib.design.getOrgBrand('default'))?.design).toEqual(DEFAULT_DESIGN);
  });

  it('should keep app themes private to their owner', async () => {
    const admin = await lib.users.findByUsername('admin');
    const beto = await lib.users.findByUsername('beto');
    const tokens = { base: 'dark' as const, colors: { bg: '#000000', surface: '#111111', text: '#eeeeee', muted: '#888888', accent: '#8b5cf6', border: '#222222' } };
    const theme = await lib.design.createUserTheme(admin!.id, 'Noche', tokens);
    const id = Number(theme!.id.split(':')[1]);

    expect((await lib.design.listUserThemes(beto!.id)).themes).toEqual([]);
    expect(await lib.design.updateUserTheme(beto!.id, id, 'robado', tokens)).toBe(false);
    expect(await lib.design.deleteUserTheme(beto!.id, id)).toBe(false);
    expect(await lib.design.setActiveTheme(beto!.id, theme!.id)).toBe(false);

    expect(await lib.design.setActiveTheme(admin!.id, theme!.id)).toBe(true);
    expect((await lib.design.listUserThemes(admin!.id)).active).toBe(theme!.id);
    expect(await lib.design.deleteUserTheme(admin!.id, id)).toBe(true);
    expect((await lib.design.listUserThemes(admin!.id)).active).toBe('light');
  });

  // ---------- HTTP: the real admin and me routers behind the real auth middleware ----------

  async function withApp<T>(fn: (base: string) => Promise<T>): Promise<T> {
    const app = express().use(cookieParser()).use(express.json());
    app.use('/api/admin', (await import('../src/routes/admin-api.js')).default);
    app.use('/api/me', (await import('../src/routes/me-api.js')).default);
    const server = app.listen(0);
    try {
      return await fn(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    } finally {
      server.close();
    }
  }

  async function sessionFor(username: string, orgId: number | null): Promise<string> {
    const { signSession } = await import('../src/lib/auth.js');
    const u = await lib.users.findByUsername(username);
    return `docs_token=${signSession({ id: u!.id, username: u!.username }, orgId)}`;
  }

  it('should refuse an admin setting a password on a Google account, but allow it on a local one', async () => {
    const boss = await lib.users.createUser({ username: 'jefa-b', password: 'secreto1' });
    await lib.orgs.addOrgMember(orgB, boss.id, 'admin');
    const google = await lib.users.findOrProvisionGoogleUser({ sub: 'g-http', email: 'http@gmail.com', name: null, hd: null });
    expect(await lib.orgs.inviteToOrg(orgB, 'http@gmail.com', 'member', boss.id)).toBe('added');
    const local = await lib.users.createUser({ username: 'local-b', password: 'secreto1' });
    await lib.orgs.addOrgMember(orgB, local.id, 'member');
    const cookie = await sessionFor('jefa-b', orgB);

    await withApp(async (base) => {
      const patch = (who: string) => fetch(`${base}/api/admin/users/${encodeURIComponent(who)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ password: 'tomada123' }),
      });
      expect((await patch('http@gmail.com')).status).toBe(403);
      expect((await patch('local-b')).status).toBe(200);
    });
    const row = await lib.db.sql<{ password_hash: string | null }[]>`SELECT password_hash FROM users WHERE id = ${google.id}`;
    expect(row[0]?.password_hash).toBeNull();
  });

  it('should refuse a local account with an email through the admin API', async () => {
    const cookie = await sessionFor('jefa-b', orgB);
    await withApp(async (base) => {
      const res = await fetch(`${base}/api/admin/users`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ username: 'conmail', password: 'secreto1', email: 'otra@gmail.com' }),
      });
      expect(res.status).toBe(400);
    });
    expect(await lib.users.findByUsername('conmail')).toBeNull();
  });

  it('should end the sessions of a deleted account', async () => {
    await lib.users.createUser({ username: 'fantasma', password: 'secreto1' });
    const cookie = await sessionFor('fantasma', null);
    const { invalidateHydrateCache } = await import('../src/lib/auth.js');
    await withApp(async (base) => {
      const themes = () => fetch(`${base}/api/me/themes`, { headers: { Cookie: cookie } }).then((r) => r.status);
      expect(await themes()).toBe(200);
      const ghost = await lib.users.findByUsername('fantasma');
      await lib.users.deleteUser('fantasma');
      invalidateHydrateCache(ghost!.id);
      expect(await themes()).toBe(401);
    });
  });

  it('should keep a removed member out of domain auto-join until the org invites them again', async () => {
    const who = { sub: 'g-dom', email: 'dom@facub.edu', name: null, hd: 'facub.edu' };
    const user = await lib.users.findOrProvisionGoogleUser(who);
    expect((await lib.orgs.listUserOrgs(user.id)).map((o) => o.slug)).toEqual(['facu-b']);

    await lib.orgs.removeOrgMember(orgB, user.id);
    await lib.users.findOrProvisionGoogleUser(who);
    expect(await lib.orgs.listUserOrgs(user.id)).toEqual([]);

    const boss = await lib.users.findByUsername('jefa-b');
    expect(await lib.orgs.inviteToOrg(orgB, 'dom@facub.edu', 'member', boss!.id)).toBe('added');
    expect((await lib.orgs.listUserOrgs(user.id)).map((o) => o.slug)).toEqual(['facu-b']);
  });

  it('should move an address to the Google identity that verifies it now', async () => {
    const before = await lib.users.findOrProvisionGoogleUser({ sub: 'g-old', email: 'mueve@gmail.com', name: null, hd: null });
    const after = await lib.users.findOrProvisionGoogleUser({ sub: 'g-new', email: 'mueve@gmail.com', name: null, hd: null });
    expect(after.id).not.toBe(before.id);
    expect(after.email).toBe('mueve@gmail.com');
    expect((await lib.users.findById(before.id))?.email).toBeNull();
  });

  it('should turn passwordless placeholder accounts into pending invites in migration 008', async () => {
    const rows = await lib.db.sql<{ id: number }[]>`
      INSERT INTO users (username, email) VALUES ('placeholder@x.com', 'placeholder@x.com') RETURNING id
    `;
    await lib.orgs.addOrgMember(orgA, rows[0]!.id, 'admin');

    await lib.db.sql.unsafe(await readFile('migrations/008_org_removals.sql', 'utf-8'));

    expect(await lib.users.findByUsername('placeholder@x.com')).toBeNull();
    expect((await lib.orgs.listInvites(orgA)).map((i) => [i.email, i.role])).toContainEqual(['placeholder@x.com', 'admin']);
  });
});
