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

export async function findBySlug(slug: string): Promise<Team | null> {
  const rows = await sql<TeamRow[]>`
    SELECT id, slug, name, created_at
    FROM teams
    WHERE LOWER(slug) = LOWER(${slug})
    LIMIT 1
  `;
  const row = rows[0];
  return row ? toTeam(row) : null;
}

export async function createTeam(params: { slug: string; name: string }): Promise<Team> {
  if (!isValidSlug(params.slug)) {
    throw new Error(`slug invalido: ${params.slug} (solo lowercase, numeros y guion)`);
  }
  const rows = await sql<TeamRow[]>`
    INSERT INTO teams (slug, name)
    VALUES (${params.slug}, ${params.name})
    RETURNING id, slug, name, created_at
  `;
  const row = rows[0];
  if (!row) throw new Error('createTeam: insert no devolvio filas');
  return toTeam(row);
}

export async function deleteTeam(slug: string): Promise<boolean> {
  // FK cascada elimina team_members automaticamente.
  const result = await sql`DELETE FROM teams WHERE LOWER(slug) = LOWER(${slug})`;
  return result.count > 0;
}

export async function listTeams(): Promise<Team[]> {
  const rows = await sql<TeamRow[]>`
    SELECT id, slug, name, created_at
    FROM teams
    ORDER BY slug ASC
  `;
  return rows.map(toTeam);
}

// ----- memberships -----

export async function addMember(teamSlug: string, username: string, role: TeamRole = 'member'): Promise<void> {
  // Resolvemos team y user en una sola query para evitar roundtrip + race.
  const rows = await sql<{ team_id: number; user_id: number }[]>`
    SELECT t.id AS team_id, u.id AS user_id
    FROM teams t, users u
    WHERE LOWER(t.slug) = LOWER(${teamSlug})
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

export async function removeMember(teamSlug: string, username: string): Promise<boolean> {
  const result = await sql`
    DELETE FROM team_members
    WHERE team_id = (SELECT id FROM teams WHERE LOWER(slug) = LOWER(${teamSlug}))
      AND user_id = (SELECT id FROM users WHERE LOWER(username) = LOWER(${username}))
  `;
  return result.count > 0;
}

// Lista todos los teams a los que pertenece un user, con su rol en cada uno.
// Se consume desde auth.ts para hidratar req.user con los memberships.
export async function listTeamsForUser(userId: number): Promise<TeamMembership[]> {
  const rows = await sql<{ slug: string; name: string; role: TeamRole }[]>`
    SELECT t.slug, t.name, tm.role
    FROM team_members tm
    JOIN teams t ON t.id = tm.team_id
    WHERE tm.user_id = ${userId}
    ORDER BY t.slug ASC
  `;
  return rows.map((r) => ({ slug: r.slug, name: r.name, role: r.role }));
}

export async function listMembers(teamSlug: string): Promise<{ username: string; role: TeamRole }[]> {
  const rows = await sql<{ username: string; role: TeamRole }[]>`
    SELECT u.username, tm.role
    FROM team_members tm
    JOIN users u ON u.id = tm.user_id
    JOIN teams t ON t.id = tm.team_id
    WHERE LOWER(t.slug) = LOWER(${teamSlug})
    ORDER BY u.username ASC
  `;
  return rows.map((r) => ({ username: r.username, role: r.role }));
}
