import { sql } from './db.js';

export type TeamRole = 'admin' | 'member';

export type Team = {
  id: number;
  slug: string;
  name: string;
  createdAt: Date;
};

export type TeamMembership = {
  slug: string;
  name: string;
  role: TeamRole;
};

type TeamRow = {
  id: number;
  slug: string;
  name: string;
  created_at: Date;
};

function toTeam(row: TeamRow): Team {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    createdAt: row.created_at,
  };
}

// Slug valido: lowercase, numeros, guion. Nos lo guardamos ya normalizado para
// que la busqueda sea case-insensitive sin necesidad de LOWER() en cada query.
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

export function isValidSlug(slug: string): boolean {
  return SLUG_RE.test(slug) && slug.length <= 50;
}

export async function findBySlug(orgId: number, slug: string): Promise<Team | null> {
  const rows = await sql<TeamRow[]>`
    SELECT id, slug, name, created_at
    FROM teams
    WHERE LOWER(slug) = LOWER(${slug}) AND org_id = ${orgId}
    LIMIT 1
  `;
  const row = rows[0];
  return row ? toTeam(row) : null;
}

export async function createTeam(orgId: number, params: { slug: string; name: string }): Promise<Team> {
  if (!isValidSlug(params.slug)) {
    throw new Error(`slug invalido: ${params.slug} (solo lowercase, numeros y guion)`);
  }
  const rows = await sql<TeamRow[]>`
    INSERT INTO teams (slug, name, org_id)
    VALUES (${params.slug}, ${params.name}, ${orgId})
    RETURNING id, slug, name, created_at
  `;
  const row = rows[0];
  if (!row) throw new Error('createTeam: insert no devolvio filas');
  return toTeam(row);
}

export async function deleteTeam(orgId: number, slug: string): Promise<boolean> {
  // FK cascada elimina team_members automaticamente.
  const result = await sql`DELETE FROM teams WHERE LOWER(slug) = LOWER(${slug}) AND org_id = ${orgId}`;
  return result.count > 0;
}

export async function listTeams(orgId: number, opts?: { limit?: number; offset?: number }): Promise<{ data: Team[]; total: number }> {
  const countRows = await sql<{ count: string }[]>`SELECT COUNT(*)::text AS count FROM teams WHERE org_id = ${orgId}`;
  const total = Number(countRows[0]?.count ?? '0');
  const limit = opts?.limit ?? total;
  const offset = opts?.offset ?? 0;
  const rows = await sql<TeamRow[]>`
    SELECT id, slug, name, created_at
    FROM teams
    WHERE org_id = ${orgId}
    ORDER BY slug ASC
    LIMIT ${limit} OFFSET ${offset}
  `;
  return { data: rows.map(toTeam), total };
}

// ----- memberships -----

export async function addMember(orgId: number, teamSlug: string, username: string, role: TeamRole = 'member'): Promise<void> {
  const rows = await sql<{ team_id: number; user_id: number }[]>`
    SELECT t.id AS team_id, u.id AS user_id
    FROM teams t
    JOIN org_members m ON m.org_id = t.org_id
    JOIN users u ON u.id = m.user_id
    WHERE LOWER(t.slug) = LOWER(${teamSlug}) AND t.org_id = ${orgId}
      AND LOWER(u.username) = LOWER(${username})
  `;
  const row = rows[0];
  if (!row) throw new Error(`team o user no encontrados: team=${teamSlug} user=${username}`);
  await sql`
    INSERT INTO team_members (team_id, user_id, role)
    VALUES (${row.team_id}, ${row.user_id}, ${role})
    ON CONFLICT (user_id, team_id) DO UPDATE SET role = EXCLUDED.role
  `;
}

export async function removeMember(orgId: number, teamSlug: string, username: string): Promise<boolean> {
  const result = await sql`
    DELETE FROM team_members
    WHERE team_id = (SELECT id FROM teams WHERE LOWER(slug) = LOWER(${teamSlug}) AND org_id = ${orgId})
      AND user_id = (SELECT id FROM users WHERE LOWER(username) = LOWER(${username}))
  `;
  return result.count > 0;
}

// Lista todos los teams a los que pertenece un user, con su rol en cada uno.
// Se consume desde auth.ts para hidratar req.user con los memberships.
/** Teams of one org the user is in; only counts while they are still a member of that org. */
export async function listTeamsForUser(userId: number, orgId: number): Promise<TeamMembership[]> {
  const rows = await sql<{ slug: string; name: string; role: TeamRole }[]>`
    SELECT t.slug, t.name, tm.role
    FROM team_members tm
    JOIN teams t ON t.id = tm.team_id
    JOIN org_members m ON m.user_id = tm.user_id AND m.org_id = t.org_id
    WHERE tm.user_id = ${userId} AND t.org_id = ${orgId}
    ORDER BY t.slug ASC
  `;
  return rows.map((r) => ({ slug: r.slug, name: r.name, role: r.role }));
}

export async function listMembers(orgId: number, teamSlug: string, opts?: { limit?: number; offset?: number }): Promise<{ data: { username: string; role: TeamRole }[]; total: number }> {
  const countRows = await sql<{ count: string }[]>`
    SELECT COUNT(*)::text AS count
    FROM team_members tm
    JOIN teams t ON t.id = tm.team_id
    WHERE LOWER(t.slug) = LOWER(${teamSlug}) AND t.org_id = ${orgId}
  `;
  const total = Number(countRows[0]?.count ?? '0');
  const limit = opts?.limit ?? total;
  const offset = opts?.offset ?? 0;
  const rows = await sql<{ username: string; role: TeamRole }[]>`
    SELECT u.username, tm.role
    FROM team_members tm
    JOIN users u ON u.id = tm.user_id
    JOIN teams t ON t.id = tm.team_id
    WHERE LOWER(t.slug) = LOWER(${teamSlug}) AND t.org_id = ${orgId}
    ORDER BY u.username ASC
    LIMIT ${limit} OFFSET ${offset}
  `;
  return { data: rows.map((r) => ({ username: r.username, role: r.role })), total };
}
